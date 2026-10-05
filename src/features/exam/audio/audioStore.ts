import type { SolutionAudioUpload } from '../contract.ts';

export interface AudioDraft extends SolutionAudioUpload {
  ownerId: string;
  chunks: number;
  endedAt: number;
  state: 'recording' | 'pending';
}
export interface AudioStore {
  put(draft: AudioDraft): Promise<void>;
  append(draft: AudioDraft, blob: Blob): Promise<void>;
  list(ownerId: string): Promise<AudioDraft[]>;
  blob(draft: AudioDraft): Promise<Blob>;
  remove(draft: AudioDraft): Promise<void>;
}

let database: Promise<IDBDatabase> | undefined;
function open() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('rn-exam-solution-audio-v1', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('clips', { keyPath: 'id' });
      req.result.createObjectStore('chunks', { keyPath: ['id', 'index'] });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { database = undefined; reject(req.error); };
  });
  return database;
}
async function write(action: (tx: IDBTransaction) => void) {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['clips', 'chunks'], 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('음성을 기기에 저장하지 못했어요.'));
    action(tx);
  });
}
async function readAll<T>(name: string, range?: IDBKeyRange): Promise<T[]> {
  const db = await open();
  return await new Promise((resolve, reject) => {
    const req = db.transaction(name).objectStore(name).getAll(range);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
const chunkRange = (id: string) => IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]);

export const audioStore: AudioStore = {
  put: draft => write(tx => { tx.objectStore('clips').put(draft); }),
  append: (draft, blob) => write(tx => {
    tx.objectStore('chunks').put({ id: draft.id, index: draft.chunks - 1, blob });
    tx.objectStore('clips').put(draft);
  }),
  async list(ownerId) { return (await readAll<AudioDraft>('clips')).filter(draft => draft.ownerId === ownerId); },
  async blob(draft) {
    const rows = await readAll<{ blob: Blob }>('chunks', chunkRange(draft.id));
    return new Blob(rows.map(row => row.blob), { type: draft.mime });
  },
  remove: draft => write(tx => {
    tx.objectStore('clips').delete(draft.id);
    tx.objectStore('chunks').delete(chunkRange(draft.id));
  }),
};
