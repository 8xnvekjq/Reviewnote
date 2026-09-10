/** Local-only room data. Storage is injected so no account or browser global is implicit. */
export const ROOM_WIDTH = 10;
export const ROOM_HEIGHT = 8;
export const FURNITURE = {
  bed: { width: 2, height: 3 },
  desk: { width: 3, height: 1 },
  chair: { width: 1, height: 1 },
  bookshelf: { width: 1, height: 1 },
  plant: { width: 1, height: 1 },
  decoration: { width: 2, height: 1 },
} as const;
export const SHIRTS = ['default', 'blue', 'sage'] as const;
export const HATS = ['none'] as const;
export type FurnitureType = keyof typeof FURNITURE;
export type Cell = { x: number; y: number };
export type Placement = Cell & { type: FurnitureType };
export type RoomState = {
  version: 1;
  avatar: { id: 'base'; shirt: typeof SHIRTS[number]; hat: typeof HATS[number] };
  furniture: Placement[];
};
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export type LoadResult = { ok: true; state: RoomState } | { ok: false; state: RoomState; error: string };
export type SaveResult = { ok: true } | { ok: false; error: string };

export function defaultState(): RoomState {
  return { version: 1, avatar: { id: 'base', shirt: 'default', hat: 'none' }, furniture: [] };
}

export function storageKey(userId: string): string {
  if (typeof userId !== 'string' || !userId.trim()) throw new Error('사용자 계정을 확인해 주세요.');
  return `pixelRoom:${encodeURIComponent(userId)}:v1`;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function knownFurniture(value: unknown): value is FurnitureType {
  return typeof value === 'string' && Object.hasOwn(FURNITURE, value);
}
function inside(cell: Cell): boolean {
  return Number.isInteger(cell.x) && Number.isInteger(cell.y)
    && cell.x >= 0 && cell.y >= 0 && cell.x < ROOM_WIDTH && cell.y < ROOM_HEIGHT;
}
function covers(item: Placement, cell: Cell): boolean {
  const size = FURNITURE[item.type];
  return cell.x >= item.x && cell.x < item.x + size.width
    && cell.y >= item.y && cell.y < item.y + size.height;
}
function overlaps(a: Placement, b: Placement): boolean {
  const sa = FURNITURE[a.type], sb = FURNITURE[b.type];
  return a.x < b.x + sb.width && a.x + sa.width > b.x
    && a.y < b.y + sb.height && a.y + sa.height > b.y;
}

/** Existing placement of this type is excluded: each owned item can be moved, never duplicated. */
export function canPlace(state: RoomState, type: FurnitureType, position: Cell, actor?: Cell): boolean {
  if (!knownFurniture(type) || !inside(position)) return false;
  const size = FURNITURE[type];
  if (position.x + size.width > ROOM_WIDTH || position.y + size.height > ROOM_HEIGHT) return false;
  const candidate: Placement = { type, ...position };
  if (actor && covers(candidate, actor)) return false;
  return !state.furniture.some(item => item.type !== type && overlaps(candidate, item));
}

export function placeFurniture(state: RoomState, type: FurnitureType, position: Cell, actor?: Cell): RoomState | null {
  if (!canPlace(state, type, position, actor)) return null;
  return { ...state, avatar: { ...state.avatar }, furniture: [
    ...state.furniture.filter(item => item.type !== type).map(item => ({ ...item })),
    { type, x: position.x, y: position.y },
  ] };
}
export function removeFurniture(state: RoomState, type: FurnitureType): RoomState {
  return { ...state, avatar: { ...state.avatar }, furniture: state.furniture.filter(item => item.type !== type).map(item => ({ ...item })) };
}
export function isCellFree(state: RoomState, cell: Cell): boolean {
  return inside(cell) && !state.furniture.some(item => covers(item, cell));
}
export function findSpawn(state: RoomState): Cell | null {
  // Start near the door, then choose a deterministic free square without random persistence.
  for (let y = ROOM_HEIGHT - 1; y >= 0; y--) {
    for (let x = 0; x < ROOM_WIDTH; x++) {
      if (isCellFree(state, { x, y })) return { x, y };
    }
  }
  return null;
}

/** Greedy Manhattan walk, not a pathfinder: each step takes whichever axis still has
 * distance left (larger axis first) and is free, otherwise tries the other axis, otherwise
 * stops with whatever prefix it managed — good enough for a small mostly-open room with a
 * handful of furniture footprints, without a BFS/A* dependency. Empty/blocked target -> []. */
export function planWalk(state: RoomState, from: Cell, to: Cell): Cell[] {
  if (!isCellFree(state, to)) return [];
  const path: Cell[] = [];
  let current = from;
  const maxSteps = ROOM_WIDTH + ROOM_HEIGHT;
  for (let i = 0; i < maxSteps && (current.x !== to.x || current.y !== to.y); i++) {
    const dx = to.x - current.x;
    const dy = to.y - current.y;
    const candidates: Cell[] = [];
    const stepX = { x: current.x + Math.sign(dx), y: current.y };
    const stepY = { x: current.x, y: current.y + Math.sign(dy) };
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (dx !== 0) candidates.push(stepX);
      if (dy !== 0) candidates.push(stepY);
    } else {
      if (dy !== 0) candidates.push(stepY);
      if (dx !== 0) candidates.push(stepX);
    }
    const next = candidates.find(cell => isCellFree(state, cell));
    if (!next) break; // blocked — return the partial path walked so far
    path.push(next);
    current = next;
  }
  return path;
}

/** Reject a whole corrupt snapshot rather than silently deleting individual possessions. */
export function validateRoom(value: unknown): RoomState | null {
  if (!record(value) || value.version !== 1 || !record(value.avatar)) return null;
  const avatar = value.avatar;
  if (avatar.id !== 'base' || !SHIRTS.some(id => id === avatar.shirt) || !HATS.some(id => id === avatar.hat)) return null;
  if (!Array.isArray(value.furniture) || value.furniture.length > Object.keys(FURNITURE).length) return null;
  const state = defaultState();
  state.avatar = { id: 'base', shirt: avatar.shirt as RoomState['avatar']['shirt'], hat: avatar.hat as RoomState['avatar']['hat'] };
  for (const item of value.furniture) {
    if (!record(item) || !knownFurniture(item.type) || typeof item.x !== 'number' || typeof item.y !== 'number') return null;
    if (state.furniture.some(placed => placed.type === item.type)) return null;
    const position = { x: item.x, y: item.y };
    if (!canPlace(state, item.type, position)) return null;
    state.furniture.push({ type: item.type, ...position });
  }
  return state;
}

export function loadRoom(userId: string, storage?: StorageLike): LoadResult {
  try {
    const key = storageKey(userId);
    if (!storage) return { ok: false, state: defaultState(), error: '이 기기에서 방 저장소를 사용할 수 없어요.' };
    const raw = storage.getItem(key);
    if (raw === null) return { ok: true, state: defaultState() };
    // A room with only six placements is tiny. Bound parsing of damaged/unrelated data.
    if (raw.length > 16_384) return { ok: false, state: defaultState(), error: '저장된 방 데이터가 너무 커서 불러오지 못했어요.' };
    const state = validateRoom(JSON.parse(raw));
    return state ? { ok: true, state } : { ok: false, state: defaultState(), error: '저장된 방 데이터를 확인할 수 없어요.' };
  } catch {
    return { ok: false, state: defaultState(), error: '방을 불러오지 못했어요. 기기의 저장소 설정을 확인해 주세요.' };
  }
}
export function saveRoom(userId: string, state: RoomState, storage?: StorageLike): SaveResult {
  try {
    const key = storageKey(userId);
    if (!storage) return { ok: false, error: '이 기기에서 방 저장소를 사용할 수 없어요.' };
    const normalized = validateRoom(state);
    if (!normalized) return { ok: false, error: '방 배치를 확인한 뒤 다시 저장해 주세요.' };
    storage.setItem(key, JSON.stringify(normalized));
    return { ok: true };
  } catch {
    return { ok: false, error: '방을 저장하지 못했어요. 기기의 저장 공간이나 저장소 설정을 확인해 주세요.' };
  }
}
