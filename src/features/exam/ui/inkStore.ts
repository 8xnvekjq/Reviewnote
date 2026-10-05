// IndexedDB is a recovery cache. Server revisions protect edits made on other devices.
// IndexedDB 가 없거나(사생활 보호 모드 등) 실패해도 풀이는 계속돼야 하므로 모든 함수가 조용히 실패한다.
import { decodeInkPayload } from '../ink/inkCodec.ts';
import type { InkReplayEvent, InkStroke } from '../contract.ts';

const DB_NAME = 'reviewnote-exam-ink';
const STORE = 'strokes';
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise(resolve => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return; }
      const req = indexedDB.open(DB_NAME, 2);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
        if (!req.result.objectStoreNames.contains('drafts')) req.result.createObjectStore('drafts');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

export function inkKey(attemptId: string, questionId: string): string {
  return `${attemptId}::${questionId}`;
}

export interface InkUpload {
  id: string;
  /** 이 batch를 적용한 결과(로컬 상태용, 서버로는 id 해시만 보낸다). 옛 버전이 남긴 upload도 같은 모양이다. */
  strokes: InkStroke[];
  events: InkReplayEvent[];
  revision: number;
  legacyImport?: boolean;
  /** 압축 batch(compact)가 대신한 원래 edit id들(Live 저장 확인용). */
  covers?: string[];
  /** 이 batch가 큰 구형 baseline을 신형으로 다시 썼는지. 재시도에도 유지한다. */
  reencoded?: boolean;
}
export interface InkDraft {
  strokes: InkStroke[]; revision: number; pending: boolean; legacyImport?: boolean;
  events?: InkReplayEvent[];
  upload?: InkUpload;
  baseStrokes?: InkStroke[];
  /** 서버가 영구 거절한 문항: 다음 batch는 쌓인 events 대신 baseStrokes → strokes 한 건으로 보낸다(지운 결과가 서버에 닿도록). */
  compact?: boolean;
  /** 압축으로 사라진 원래 edit id(저장되면 Live에 확인으로 보낸다). */
  covers?: string[];
}

export async function loadInkDrafts(attemptId: string): Promise<Map<string, InkDraft>> {
  const db = await openDb();
  const result = new Map<string, InkDraft>();
  if (!db) return result;
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction('drafts', 'readonly');
      const prefix = `${attemptId}::`;
      const req = tx.objectStore('drafts').openCursor(IDBKeyRange.bound(prefix, `${prefix}\uffff`));
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        // 손상된 압축 필기를 빈 초안으로 간주해 덮어쓰지 않는다. InkSync가 불러오기 실패로 처리한다.
        try { result.set(String(cursor.key).slice(prefix.length), decodeInkPayload<InkDraft>(cursor.value, 'cache')); }
        catch (error) { reject(error); return; }
        cursor.continue();
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () => resolve(result);
    } catch { resolve(result); }
  });
}

export async function saveInkDraft(attemptId: string, questionId: string, draft: InkDraft): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  return new Promise(resolve => {
    try {
      const tx = db.transaction('drafts', 'readwrite');
      tx.objectStore('drafts').put(draft, inkKey(attemptId, questionId));
      tx.oncomplete = () => resolve(true);
      tx.onerror = tx.onabort = () => resolve(false);
    } catch { resolve(false); }
  });
}

export async function saveInk(attemptId: string, questionId: string, strokes: InkStroke[]): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  return new Promise(resolve => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      if (strokes.length === 0) store.delete(inkKey(attemptId, questionId));
      else store.put(strokes, inkKey(attemptId, questionId));
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/** 시도 하나의 문항별 필기 전부. 실패하면 빈 Map. */
export async function loadInk(attemptId: string): Promise<Map<string, InkStroke[]>> {
  const result = new Map<string, InkStroke[]>();
  const db = await openDb();
  if (!db) return result;
  const prefix = `${attemptId}::`;
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).openCursor(IDBKeyRange.bound(prefix, `${prefix}￿`));
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) { resolve(result); return; }
        const questionId = String(cursor.key).slice(prefix.length);
        try { if (Array.isArray(cursor.value)) result.set(questionId, decodeInkPayload<InkStroke[]>(cursor.value, 'cache')); }
        catch (error) { reject(error); return; }
        cursor.continue();
      };
      req.onerror = () => resolve(result);
    } catch {
      resolve(result);
    }
  });
}
