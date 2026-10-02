import type { ExamClient, InkStroke } from '../contract.ts';
import { loadInk, loadInkDrafts, saveInkDraft, type InkDraft } from './inkStore.ts';

export interface InkCache {
  legacy(attemptId: string): Promise<Map<string, InkStroke[]>>;
  read(attemptId: string): Promise<Map<string, InkDraft>>;
  write(attemptId: string, questionId: string, draft: InkDraft): Promise<boolean>;
}
const cache: InkCache = { legacy: loadInk, read: loadInkDrafts, write: saveInkDraft };
export type InkSyncStatus = 'loading' | 'saved' | 'pending' | 'saving' | 'failed' | 'conflict';

/** One serialized writer per attempt. Revisions are never guessed or advanced on a failed request. */
export class InkSync {
  documents = new Map<string, InkDraft>();
  status: InkSyncStatus = 'loading';
  ready = false;
  generation = 0;
  private saving: Promise<boolean> | null = null;
  private loading: Promise<void> | null = null;
  private cacheWrites: Promise<unknown> = Promise.resolve();
  private client: Pick<ExamClient, 'getInk' | 'saveInk'>;
  private attemptId: string;
  private notify: () => void;
  private storage: InkCache;
  private questionIds?: Set<string>;

  constructor(client: Pick<ExamClient, 'getInk' | 'saveInk'>, attemptId: string,
    notify: () => void = () => {}, storage: InkCache = cache, questionIds?: Set<string>) {
    this.client = client;
    this.attemptId = attemptId;
    this.notify = notify;
    this.storage = storage;
    this.questionIds = questionIds;
  }

  get strokes() { return new Map([...this.documents].map(([id, doc]) => [id, doc.strokes])); }
  get pending() { return [...this.documents.values()].some(doc => doc.pending); }
  private persist(id: string, draft: InkDraft) {
    this.cacheWrites = this.cacheWrites.then(() => this.storage.write(this.attemptId, id, draft)).catch(() => false);
  }

  load(discardDrafts = false): Promise<void> {
    if (this.loading) return this.loading;
    this.loading = this.loadNow(discardDrafts).finally(() => { this.loading = null; });
    return this.loading;
  }

  private async loadNow(discardDrafts: boolean) {
    this.ready = false;
    this.status = 'loading';
    this.notify();
    try {
      if (this.saving) await this.saving;
      await this.cacheWrites;
      // Authenticate the attempt BEFORE reading/importing any old local data.
      const remote = await this.client.getInk(this.attemptId);
      const [drafts, legacy] = await Promise.all([this.storage.read(this.attemptId), this.storage.legacy(this.attemptId)]);
      const next = new Map<string, InkDraft>(remote.map(row => [row.questionId,
        { strokes: row.strokes, revision: row.revision, pending: false }]));
      let conflict = false;
      for (const [id, local] of drafts) {
        if (this.questionIds && !this.questionIds.has(id)) continue;
        const server = next.get(id);
        if (!discardDrafts && local.pending) {
          if (JSON.stringify(server?.strokes) === JSON.stringify(local.strokes)) continue; // lost acknowledgement
          if ((server?.revision ?? 0) !== local.revision) conflict = true;
          next.set(id, local);
        }
      }
      for (const [id, strokes] of legacy) {
        if (this.questionIds && !this.questionIds.has(id)) continue;
        // A clean draft or empty server document is a tombstone: never resurrect erased legacy ink.
        if (!discardDrafts && !next.has(id) && !drafts.has(id) && strokes.length) {
          next.set(id, { strokes, revision: 0, pending: true, legacyImport: true });
        }
      }
      if (discardDrafts) {
        for (const id of new Set([...drafts.keys(), ...legacy.keys()])) {
          if (!next.has(id)) next.set(id, { strokes: [], revision: 0, pending: false });
        }
      }
      this.documents = next;
      for (const [id, doc] of next) this.persist(id, doc);
      this.ready = !conflict;
      this.generation++;
      this.status = conflict ? 'conflict' : this.pending ? 'pending' : 'saved';
    } catch {
      this.status = 'failed';
    }
    this.notify();
  }

  change(questionId: string, strokes: InkStroke[]) {
    if (!this.ready || this.status === 'conflict') return;
    const draft = { ...this.documents.get(questionId), strokes,
      revision: this.documents.get(questionId)?.revision ?? 0, pending: true };
    this.documents.set(questionId, draft);
    this.persist(questionId, draft); // every completed stroke, not only after debounce
    this.status = 'pending';
    this.notify();
  }

  flush(): Promise<boolean> {
    if (this.saving) return this.saving;
    if (!this.ready || this.status === 'conflict') return Promise.resolve(false);
    this.saving = this.flushNow().finally(() => { this.saving = null; });
    return this.saving;
  }

  private async flushNow(): Promise<boolean> {
    this.status = 'saving';
    this.notify();
    try {
      while (this.pending) {
        const [id, draft] = [...this.documents].find(([, doc]) => doc.pending)!;
        const revision = await this.client.saveInk(this.attemptId, id, draft.strokes, draft.revision, draft.legacyImport);
        const latest = this.documents.get(id)!;
        const saved = { ...latest, revision, pending: latest !== draft, legacyImport: false };
        this.documents.set(id, saved);
        this.persist(id, saved);
      }
      await this.cacheWrites;
      this.status = 'saved';
      this.notify();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      this.status = /EXAM_INK_CONFLICT|EXAM_INK_SUBMITTED/.test(message) ? 'conflict' : 'failed';
      if (this.status === 'conflict') this.ready = false;
      this.notify();
      return false;
    }
  }
}
