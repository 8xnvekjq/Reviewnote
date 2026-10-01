// 문항별 필기를 IndexedDB 에 저장(키: attemptId + questionId). 서버엔 올리지 않는다.
// IndexedDB 가 없거나(사생활 보호 모드 등) 실패해도 풀이는 계속돼야 하므로 모든 함수가 조용히 실패한다.
import type { InkStroke } from '../contract.ts';

const DB_NAME = 'reviewnote-exam-ink';
const STORE = 'strokes';
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise(resolve => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
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
  return new Promise(resolve => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).openCursor(IDBKeyRange.bound(prefix, `${prefix}￿`));
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) { resolve(result); return; }
        const questionId = String(cursor.key).slice(prefix.length);
        if (Array.isArray(cursor.value)) result.set(questionId, cursor.value as InkStroke[]);
        cursor.continue();
      };
      req.onerror = () => resolve(result);
    } catch {
      resolve(result);
    }
  });
}
