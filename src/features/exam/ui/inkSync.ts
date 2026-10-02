import type { ExamClient, InkChangeKind, InkStroke } from '../contract.ts';
import { applyInkEvent, inkDelta } from '../ink/inkReplay.ts';
import { loadInk, loadInkDrafts, saveInkDraft, type InkDraft } from './inkStore.ts';

export interface InkCache {
  legacy(attemptId: string): Promise<Map<string, InkStroke[]>>;
  read(attemptId: string): Promise<Map<string, InkDraft>>;
  write(attemptId: string, questionId: string, draft: InkDraft): Promise<boolean>;
}
const cache: InkCache = { legacy: loadInk, read: loadInkDrafts, write: saveInkDraft };
export type InkSyncStatus = 'loading' | 'saved' | 'pending' | 'saving' | 'failed' | 'conflict';

/** 비상 스위치: VITE_EXAM_INK_SERVER_SYNC=off 로 배포하면 필기는 이 기기에만 남고 서버로 보내지 않는다(다시 켜면 쌓인 필기를 보낸다). */
const SERVER_SYNC_OFF = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_EXAM_INK_SERVER_SYNC === 'off';
/** 자동 저장이 실패하면 5초→10초→…→최대 2분 동안 자동 재시도를 쉰다. 제출·나가기·다시 시도 버튼은 바로 보낸다. */
const BACKOFF_BASE_MS = 5000;
const BACKOFF_MAX_MS = 120000;

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
  private failures = 0;
  private nextTryAt = 0;
  private serverSyncOff: boolean;

  constructor(client: Pick<ExamClient, 'getInk' | 'saveInk'>, attemptId: string,
    notify: () => void = () => {}, storage: InkCache = cache, questionIds?: Set<string>, serverSyncOff = SERVER_SYNC_OFF) {
    this.client = client;
    this.attemptId = attemptId;
    this.notify = notify;
    this.storage = storage;
    this.questionIds = questionIds;
    this.serverSyncOff = serverSyncOff;
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
      // Cache writes may be unavailable in private browsing; do not lose in-memory pending work on retry.
      for (const [id, doc] of this.documents) if (doc.pending) drafts.set(id, doc);
      const next = new Map<string, InkDraft>(remote.map(row => [row.questionId,
        { strokes: row.strokes, baseStrokes: row.strokes, revision: row.revision, pending: false }]));
      let conflict = false;
      for (const [id, cached] of drafts) {
        let local = cached;
        if (this.questionIds && !this.questionIds.has(id)) continue;
        const server = next.get(id);
        if (!discardDrafts && local.pending) {
          const acknowledged = local.upload && remote.find(row => row.questionId === id)?.lastBatchId === local.upload.id;
          if (acknowledged) {
            const sent = new Set(local.upload!.events.map(event => event.id));
            const events = (local.events ?? []).filter(event => !sent.has(event.id));
            if (!events.length) continue;
            local = { ...local, revision: server!.revision, baseStrokes: server!.strokes, upload: undefined, events, legacyImport: false };
          }
          // Old drafts had no operation log. Import them as a clearly labelled restored state.
          if (!local.events?.length && !local.upload) {
            if (JSON.stringify(server?.strokes) === JSON.stringify(local.strokes)) continue;
            local = { ...local, events: [inkDelta(server?.strokes ?? [], local.strokes, 'restore')] };
          }
          if ((server?.revision ?? 0) !== local.revision) conflict = true;
          next.set(id, { ...local, baseStrokes: local.baseStrokes ?? server?.strokes ?? [] });
        }
      }
      for (const [id, strokes] of legacy) {
        if (this.questionIds && !this.questionIds.has(id)) continue;
        // A clean draft or empty server document is a tombstone: never resurrect erased legacy ink.
        if (!discardDrafts && !next.has(id) && !drafts.has(id) && strokes.length) {
          next.set(id, { strokes, baseStrokes: [], revision: 0, pending: true, legacyImport: true, events: [inkDelta([], strokes, 'restore')] });
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

  change(questionId: string, strokes: InkStroke[], kind: InkChangeKind = 'draw') {
    if (!this.ready || this.status === 'conflict') return;
    const previous = this.documents.get(questionId);
    const event = inkDelta(previous?.strokes ?? [], strokes, kind);
    if (!event.added.length && !event.removed.length) return;
    const draft = { ...previous, strokes,
      revision: previous?.revision ?? 0, pending: true, events: [...(previous?.events ?? []), event] };
    this.documents.set(questionId, draft);
    this.persist(questionId, draft); // every completed stroke, not only after debounce
    this.status = 'pending';
    this.notify();
  }

  /** background: 자동 저장(디바운스·주기 재시도). 최근에 실패했으면 백오프 동안 서버에 보내지 않는다. */
  flush(options: { background?: boolean } = {}): Promise<boolean> {
    if (this.saving) return this.saving;
    if (!this.ready || this.status === 'conflict') return Promise.resolve(false);
    if (options.background && Date.now() < this.nextTryAt) return Promise.resolve(false);
    if (this.serverSyncOff) return Promise.resolve(true); // 이 기기(IndexedDB)에는 획마다 이미 저장돼 있다.
    this.saving = this.flushNow().finally(() => { this.saving = null; });
    return this.saving;
  }

  private async flushNow(): Promise<boolean> {
    this.status = 'saving';
    this.notify();
    try {
      while (this.pending) {
        const [id, draft] = [...this.documents].find(([, doc]) => doc.pending)!;
        const eventsToSend = [];
        let bytes = 0;
        for (const event of draft.events ?? []) {
          const size = new TextEncoder().encode(JSON.stringify(event)).length;
          if (eventsToSend.length && (eventsToSend.length >= 64 || bytes + size > 4 * 1024 * 1024)) break;
          eventsToSend.push(event); bytes += size;
        }
        const upload = draft.upload ?? { id: crypto.randomUUID(), strokes: eventsToSend.reduce(applyInkEvent, draft.baseStrokes ?? []),
          events: eventsToSend, revision: draft.revision, legacyImport: draft.legacyImport };
        if (!draft.upload) {
          const uploading = { ...draft, upload };
          this.documents.set(id, uploading);
          this.persist(id, uploading);
        }
        // Persist the exact batch before sending. Retries reuse it even if new strokes arrive meanwhile.
        await this.cacheWrites;
        const revision = await this.client.saveInk(this.attemptId, id, upload.strokes, upload.revision,
          upload.legacyImport, upload.events, upload.id);
        const latest = this.documents.get(id)!;
        const sent = new Set(upload.events.map(event => event.id));
        const events = (latest.events ?? []).filter(event => !sent.has(event.id));
        const saved = { ...latest, revision, baseStrokes: upload.strokes, pending: events.length > 0, events, upload: undefined, legacyImport: false };
        this.documents.set(id, saved);
        this.persist(id, saved);
      }
      await this.cacheWrites;
      this.failures = 0;
      this.nextTryAt = 0;
      this.status = 'saved';
      this.notify();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      this.status = /EXAM_INK_CONFLICT|EXAM_INK_SUBMITTED/.test(message) ? 'conflict' : 'failed';
      if (this.status === 'conflict') this.ready = false;
      else {
        this.failures++;
        this.nextTryAt = Date.now() + Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (this.failures - 1));
      }
      this.notify();
      return false;
    }
  }
}
