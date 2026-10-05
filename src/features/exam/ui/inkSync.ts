import type { ExamClient, InkChangeKind, InkReplayEvent, InkStroke } from '../contract.ts';
import { applyInkEvent, inkDelta, inkIdsHash } from '../ink/inkReplay.ts';
import { loadInk, loadInkDrafts, saveInkDraft, type InkDraft } from './inkStore.ts';

export interface InkCache {
  legacy(attemptId: string): Promise<Map<string, InkStroke[]>>;
  read(attemptId: string): Promise<Map<string, InkDraft>>;
  write(attemptId: string, questionId: string, draft: InkDraft): Promise<boolean>;
}
const cache: InkCache = { legacy: loadInk, read: loadInkDrafts, write: saveInkDraft };
/** rejected: 남은 미저장 필기가 모두 서버가 다시 보내도 받을 수 없다고 거절한 문항뿐(예: 너무 큼). 이 기기에는 남아 있다. */
export type InkSyncStatus = 'loading' | 'saved' | 'pending' | 'saving' | 'failed' | 'conflict' | 'rejected';

/** 비상 스위치: VITE_EXAM_INK_SERVER_SYNC=off 로 배포하면 필기는 이 기기에만 남고 서버로 보내지 않는다(다시 켜면 쌓인 필기를 보낸다). */
const SERVER_SYNC_OFF = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_EXAM_INK_SERVER_SYNC === 'off';
/** 자동 저장이 실패하면 5초→10초→…→최대 2분 동안 자동 재시도를 쉰다. 제출·나가기·다시 시도 버튼은 바로 보낸다. */
const BACKOFF_BASE_MS = 5000;
const BACKOFF_MAX_MS = 120000;
/**
 * 같은 요청을 다시 보내도 결과가 바뀌지 않는 거절(서버 트랜잭션은 롤백돼 batch가 남지 않는다).
 * 2026-10-05 장애: 문항 필기가 2MiB를 넘자 EXAM_INK_TOO_LARGE인 같은 batch를 끝없이 다시 보냈다.
 * 이런 문항은 그 문항이 다시 바뀌거나 학생이 '다시 시도'를 누를 때까지 보내지 않고, 다음 batch는 압축해서 보낸다(compactEdits).
 */
const PERMANENT_REJECTION = /EXAM_INK_TOO_LARGE|EXAM_REPLAY_TOO_LARGE|EXAM_INK_INVALID|EXAM_REPLAY_INVALID|EXAM_QUESTION_NOT_FOUND/;
/**
 * 서버는 저장마다 문항 필기 전체를 다시 쓴다(비용 ∝ 문항 크기). 큰 문항은 자동 저장 간격을 늘린다:
 * 1MB까지는 디바운스(5초)만, 그 위로는 1MB당 10초, 최대 30초. 제출·나가기·화면 숨김은 바로 보낸다.
 */
const SPACING_PER_MB_MS = 10000;
const SPACING_MAX_MS = 30000;
const BYTES_PER_POINT = 60; // 운영 데이터 평균 57바이트/점(JSON)
const sizeCache = new WeakMap<InkStroke[], number>();
export function estimateInkBytes(strokes: InkStroke[]): number {
  let bytes = sizeCache.get(strokes);
  if (bytes == null) {
    bytes = 2;
    for (const stroke of strokes) bytes += 120 + stroke.points.length * BYTES_PER_POINT;
    sizeCache.set(strokes, bytes);
  }
  return bytes;
}
/**
 * 거절된 문항의 쌓인 edit들을 '서버 필기(base) → 지금 필기' 한 건으로 바꾼다. 서버는 edit마다 중간 결과의 크기·획 수를
 * 검사하므로, 큰 필기 뒤에 지운 edit가 있어도 앞부분에서 계속 거절된다(64개·4MiB 분할 경계, 2000획 중간 초과).
 * 서버에 닿지 못한 중간 과정은 재생에서 한 단계로 합쳐진다. 남는 것이 없으면(base와 같음) undefined.
 */
export function compactEdits(base: InkStroke[], strokes: InkStroke[], edits: InkReplayEvent[]): InkReplayEvent | undefined {
  const last = edits.at(-1);
  const delta = inkDelta(base, strokes, 'draw', last?.at);
  if (!delta.added.length && !delta.removed.length) return undefined;
  delta.kind = !delta.added.length ? 'erase' : !delta.removed.length ? 'draw' : last?.kind ?? 'draw';
  return delta;
}
export function autoSaveSpacingMs(strokes: InkStroke[]): number {
  const mb = estimateInkBytes(strokes) / (1024 * 1024);
  return mb <= 1 ? 0 : Math.min(SPACING_MAX_MS, Math.round(mb * SPACING_PER_MB_MS));
}

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
  /** 문항 id → 서버 거절 코드(PERMANENT_REJECTION). */
  readonly rejected = new Map<string, string>();
  private lastSentAt = new Map<string, number>();
  /** Called after each successful server save of one question (Live broadcast acknowledgement only; the request is unchanged). */
  onSaved?: (questionId: string, revision: number, eventIds: string[]) => void;

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
  /** 미저장 필기가 남았는데 전부 거절된 문항뿐인지(제출 때 학생에게 묻는다). */
  get onlyRejectedPending() {
    const pending = [...this.documents].filter(([, doc]) => doc.pending);
    return pending.length > 0 && pending.every(([id]) => this.rejected.has(id));
  }
  private persist(id: string, draft: InkDraft) {
    this.cacheWrites = this.cacheWrites.then(() => this.storage.write(this.attemptId, id, draft)).catch(() => false);
  }

  /** background: 자동 재시도. 최근 실패했으면 백오프 동안 서버에 묻지 않는다(불러오기 실패도 10초마다 응시 전체를 다시 불렀다). */
  load(discardDrafts = false, options: { background?: boolean } = {}): Promise<void> {
    if (this.loading) return this.loading;
    if (options.background && Date.now() < this.nextTryAt) return Promise.resolve();
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
      this.failures = 0;
      this.nextTryAt = 0;
      this.status = conflict ? 'conflict' : this.restingStatus();
    } catch {
      this.status = 'failed';
      this.backOff();
    }
    this.notify();
  }

  /** Returns the id of the recorded edit, or undefined when nothing will be saved. */
  change(questionId: string, strokes: InkStroke[], kind: InkChangeKind = 'draw'): string | undefined {
    if (!this.ready || this.status === 'conflict') return undefined;
    const previous = this.documents.get(questionId);
    const event = inkDelta(previous?.strokes ?? [], strokes, kind);
    if (!event.added.length && !event.removed.length) return undefined;
    this.rejected.delete(questionId); // 바뀐 필기(예: 일부 지움)로 다시 해 본다.
    const draft = { ...previous, strokes,
      revision: previous?.revision ?? 0, pending: true, events: [...(previous?.events ?? []), event] };
    this.documents.set(questionId, draft);
    this.persist(questionId, draft); // every completed stroke, not only after debounce
    this.status = 'pending';
    this.notify();
    return event.id;
  }

  /** background: 자동 저장(디바운스·주기 재시도). 최근에 실패했으면 백오프 동안 서버에 보내지 않는다. */
  flush(options: { background?: boolean } = {}): Promise<boolean> {
    // 진행 중인 저장에 합류. 자동 저장은 그 결과로 충분하지만, 명시 저장(제출·나가기·화면 숨김)은 그 저장이 간격 때문에
    // 남긴 변경까지 끝난 뒤 이어서 보낸다(writer는 계속 하나: 끝난 뒤 다시 flush를 거친다).
    if (this.saving) return options.background ? this.saving : this.saving.then(() => this.flush(options));
    if (!this.ready || this.status === 'conflict') return Promise.resolve(false);
    if (options.background && Date.now() < this.nextTryAt) return Promise.resolve(false);
    if (this.serverSyncOff) return Promise.resolve(true); // 이 기기(IndexedDB)에는 획마다 이미 저장돼 있다.
    this.saving = this.flushNow(options.background ?? false).finally(() => { this.saving = null; });
    return this.saving;
  }

  /** '다시 시도': 거절된 문항도 한 번 더 보낸다. */
  retryRejected(): Promise<boolean> {
    this.rejected.clear();
    return this.flush();
  }

  private restingStatus(): InkSyncStatus {
    return !this.pending ? 'saved' : this.onlyRejectedPending ? 'rejected' : 'pending';
  }

  private backOff() {
    this.failures++;
    this.nextTryAt = Date.now() + Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (this.failures - 1));
  }

  /** 다음에 보낼 문항. 거절된 문항은 건너뛰고, 자동 저장이면 큰 문항의 저장 간격을 지킨다(이미 보낸 batch의 재전송은 예외). */
  private nextToSend(background: boolean): [string, InkDraft] | undefined {
    const now = Date.now();
    return [...this.documents].find(([id, doc]) => doc.pending && !this.rejected.has(id)
      && (!background || doc.upload != null || now - (this.lastSentAt.get(id) ?? 0) >= autoSaveSpacingMs(doc.strokes)));
  }

  private async flushNow(background: boolean): Promise<boolean> {
    this.status = 'saving';
    this.notify();
    try {
      for (let next = this.nextToSend(background); next; next = this.nextToSend(background)) {
        const [id, draft] = next;
        const sentStrokes = draft.strokes; // 거절 응답이 올 때 이 뒤로 바뀌었는지 본다.
        let upload = draft.upload;
        if (!upload) {
          let events = draft.events ?? [];
          let covers: string[] | undefined;
          if (draft.compact) {
            const compacted = compactEdits(draft.baseStrokes ?? [], draft.strokes, events);
            if (!compacted) { // 지워서 서버 필기와 같아졌다: 보낼 것이 없다.
              const clean = { ...draft, events: [], pending: false, compact: undefined, covers: undefined };
              this.documents.set(id, clean);
              this.persist(id, clean);
              this.rejected.delete(id);
              continue;
            }
            covers = [...draft.covers ?? [], ...events.map(event => event.id)]; // 다시 압축해도 원래 edit id를 잃지 않는다
            events = [compacted];
          }
          const eventsToSend = [];
          let bytes = 0;
          for (const event of events) {
            const size = new TextEncoder().encode(JSON.stringify(event)).length;
            if (eventsToSend.length && (eventsToSend.length >= 64 || bytes + size > 4 * 1024 * 1024)) break;
            eventsToSend.push(event); bytes += size;
          }
          upload = { id: crypto.randomUUID(), strokes: eventsToSend.reduce(applyInkEvent, draft.baseStrokes ?? []),
            events: eventsToSend, revision: draft.revision, legacyImport: draft.legacyImport, ...(covers ? { covers } : {}) };
          // 압축한 경우 events도 바꿔 둔다: 이 batch가 저장되면 그 뒤에 생긴 edit만 남는다.
          const uploading = { ...draft, events, upload, ...(covers ? { covers } : {}) };
          this.documents.set(id, uploading);
          this.persist(id, uploading);
        }
        // Persist the exact batch before sending. Retries reuse it even if new strokes arrive meanwhile.
        await this.cacheWrites;
        // 서버에는 바뀐 내용(events)과 결과 획 id 해시만 보낸다. 옛 버전이 남긴 upload도 같은 batch 그대로 다시 보낸다.
        let revision: number;
        this.lastSentAt.set(id, Date.now()); // 거절돼도 간격을 센다(큰 문항을 계속 고쳐 쓰면 매번 다시 거절되므로).
        try {
          revision = await this.client.saveInk(this.attemptId, id, { revision: upload.revision,
            legacyImport: upload.legacyImport ?? false, events: upload.events, batchId: upload.id, idsHash: await inkIdsHash(upload.strokes) });
        } catch (error) {
          const code = (error instanceof Error ? error.message : '').match(PERMANENT_REJECTION)?.[0];
          if (!code) throw error;
          // 서버에 남은 것이 없으니 이 batch는 버리고, 다음 batch는 지금 필기 기준으로 압축해 보낸다.
          // 멈추는(rejected) 것은 '지금 필기 한 건'이 거절됐을 때뿐이다. 중간 과정만 컸거나(압축하면 통과할 수 있다)
          // 요청 중에 학생이 고쳤다면(예: 지움) 바로 다시 해 본다(자동 저장이면 큰 문항 간격은 지킨다).
          const latest = this.documents.get(id)!;
          const wholeState = upload.covers != null || (upload.events.length === 1 && (draft.events?.length ?? 0) === 1);
          if (wholeState && latest.strokes === sentStrokes) this.rejected.set(id, code);
          const dropped = { ...latest, upload: undefined, compact: true };
          this.documents.set(id, dropped);
          this.persist(id, dropped);
          continue;
        }
        const latest = this.documents.get(id)!;
        const sent = new Set(upload.events.map(event => event.id));
        const events = (latest.events ?? []).filter(event => !sent.has(event.id));
        const saved = { ...latest, revision, baseStrokes: upload.strokes, pending: events.length > 0, events, upload: undefined, legacyImport: false, compact: undefined, covers: undefined };
        this.documents.set(id, saved);
        this.persist(id, saved);
        try { this.onSaved?.(id, revision, [...upload.events.map(event => event.id), ...upload.covers ?? []]); } catch { /* Live only */ }
      }
      await this.cacheWrites;
      this.failures = 0;
      this.nextTryAt = 0;
      this.status = this.restingStatus();
      this.notify();
      return !this.pending;
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      this.status = /EXAM_INK_CONFLICT|EXAM_INK_SUBMITTED/.test(message) ? 'conflict' : 'failed';
      if (this.status === 'conflict') this.ready = false;
      else this.backOff();
      this.notify();
      return false;
    }
  }
}
