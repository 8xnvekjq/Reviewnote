import { PlazaShopDialog } from './shop/PlazaShopDialog';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { FURNITURE, ROOM_HEIGHT, ROOM_WIDTH, defaultState, findSpawn, isCellFree, loadRoom, placeFurniture, planWalk, removeFurniture, storageKey, validateRoom } from './model';
import type { Cell, FurnitureType, Placement, RoomState, StorageLike } from './model';
import { AvatarSprite, DoormatSprite, FurnitureSprite } from './sprites';
import type { PixelItem } from './shop/types';
import { usePixelShop } from './usePixelShop';
import { ShopPanel, Wardrobe } from './shop/CustomizationPanel';
import Plaza from './plaza/Plaza';
import FrontYard from './yard/FrontYard';
import { Companion } from './pet/Companion';
import { isPetId } from './pet/petKinds';
import { roomDogWorld } from './pet/dogWorld';
import { usePet } from './pet/usePet';
import { fetchPixelFurniturePlacement, savePixelRoomLayout } from '../../utils/pixelShop';
import './pixel-room.css';

export type Direction = 'Front' | 'Back' | 'Left' | 'Right';
const directions: Record<Direction, Cell> = { Front: { x: 0, y: 1 }, Back: { x: 0, y: -1 }, Left: { x: -1, y: 0 }, Right: { x: 1, y: 0 } };
const keys: Record<string, Direction> = { ArrowDown: 'Front', s: 'Front', ArrowUp: 'Back', w: 'Back', ArrowLeft: 'Left', a: 'Left', ArrowRight: 'Right', d: 'Right' };
const names: Record<FurnitureType, string> = { bed: '포근한 침대', desk: '나무 책상', chair: '작은 의자', bookshelf: '나의 책장', plant: '초록 화분', decoration: '작은 장식', roundtable: '레이스 원형 테이블', television: '레트로 TV 장식장', aquarium: '작은 바다 수조', globe: '여행자의 지구본', tallplant: '키 큰 초록 식물', floorlamp: '격자 갓 스탠드' };
const cells = Array.from({ length: ROOM_WIDTH * ROOM_HEIGHT }, (_, i) => ({ x: i % ROOM_WIDTH, y: Math.floor(i / ROOM_WIDTH) }));
type WalkStep = { cell: Cell; direction: Direction };
type Panel = 'clothes' | 'furniture';

// Three small scenes share the existing fade/transition lock; only Plaza owns realtime.
type Location = 'room' | 'yard' | 'plaza';

// The room's one door: bottom row, center-ish. Reaching this cell (by tap-to-move, keyboard, or
// the D-pad — anything that ends in setActor) is the only way into the plaza now; there is no
// fallback toggle. ROOM_SPAWN_FROM_YARD is one cell "in front of" the door, facing 'Back' — away
// from the door, deeper into the room — so arriving reads as continuing the walk you were already
// on, not turning around to face the door you just came through.
const ROOM_DOOR: Cell = { x: 4, y: 7 };
const ROOM_SPAWN_FROM_YARD: { cell: Cell; direction: Direction } = { cell: { x: 4, y: 6 }, direction: 'Back' };
// Furniture can never cover the door or its landing cell — otherwise a fully-decorated room could
// wall off the only way to the plaza (model.ts's canPlace has no door concept, so this is enforced
// here instead, client-side, without touching that file's tested contract).
const RESERVED_ROOM_CELLS: Cell[] = [ROOM_DOOR, ROOM_SPAWN_FROM_YARD.cell];
function coversReservedCell(type: FurnitureType, position: Cell): boolean {
  const size = FURNITURE[type];
  return RESERVED_ROOM_CELLS.some(cell => cell.x >= position.x && cell.x < position.x + size.width && cell.y >= position.y && cell.y < position.y + size.height);
}

// Full-screen fade timing (see .pr-transition-overlay in pixel-room.css). DOOR_FADE_MS must match
// that rule's CSS transition duration — the setTimeout below is how JS knows the cover fade has
// visually finished before it swaps `location` and mounts the destination. PRESENCE_HEAD_START_MS
// is extra time spent fully covered before revealing, so the plaza's realtime channel (mounted the
// instant the screen goes opaque) has a head start on receiving presence-sync before anyone can see
// an empty plaza.
const DOOR_FADE_MS = 260;
const PRESENCE_HEAD_START_MS = 140;

function stepDirection(from: Cell, to: Cell): Direction {
  if (to.x > from.x) return 'Right';
  if (to.x < from.x) return 'Left';
  return to.y > from.y ? 'Front' : 'Back';
}
function browserStorage(): StorageLike | undefined { try { return window.localStorage; } catch { return undefined; } }
// 장착 칭호/말투/테마는 새 프로필을 만들지 않고 기존 equipped state를 재사용한다. 단, 이 파일은
// gachaCatalog/aiVoiceCheers를 직접 import하지 않는다 — 그 모듈은 App.tsx(항상 로드됨)에도 이미
// 쓰이는데, 지연 로드되는 이 Pixel Room 청크에서 다시 import하면 번들러가 두 진입점 모두에 코드를
// 포함시켜 메인 번들이 커진다(실측: gzip +5KB). 그래서 App.tsx가 이미 계산해둔 결과값(문구/배지
// 스타일/색상)만 plain prop으로 받는다 — 전체 앱 테마(applyThemeColor)는 여기서 절대 호출하지 않는다.
interface Props {
  userId?: string; displayName?: string; onExit: () => void;
  title?: string; titleBadgeStyle?: string; titleBadgeIcon?: string;
  themePrimary?: string; themeAccent?: string;
  onSpeak?: () => string;
  // Pixel World Phase 1 — 학생이 다른 화면에서 이미 보는 그 포인트 잔액을 그대로 받아서 보여준다
  // (여기서 새로 계산하지 않음). 구매 성공 시 서버가 돌려준 새 잔액을 그대로 올려보내서, 앱
  // 전체에서 쓰는 잔액 표시가 Pixel Room 밖에서도 즉시 맞아떨어지게 한다.
  pointsBalance?: number;
  onPixelPurchase?: (newBalance: number) => void;
}

/** Keyed at the identity boundary: even a direct A → B switch starts from B's snapshot. */
export default function PixelRoom(props: Props) {
  const { userId, onExit } = props;
  if (!userId?.trim()) return <section className="pr-login"><p>로그인 후 내 방에 들어올 수 있어요.</p><button className="rn-button rn-button-secondary" onClick={onExit}>← Reviewnote</button></section>;
  return <RoomForUser key={userId} {...props} userId={userId} />;
}

function RoomForUser({ userId, onExit, themePrimary, themeAccent, onSpeak, pointsBalance = 0, onPixelPurchase }: Props & { userId: string }) {
  const pet = usePet(userId);
  // Orchestrator state (Phase 2A rework): which screen is showing, the transition overlay, and a
  // sessionId generated ONCE per component lifetime (not per plaza visit) — see Plaza.tsx's own
  // comment on why a stable id matters for Presence's dedup. Everything below this remains the
  // room's own state; the plaza owns its own movement state entirely inside Plaza.tsx.
  const [location, setLocation] = useState<Location>('room');
  const [yardFrom, setYardFrom] = useState<'room' | 'plaza'>('room');
  const [sessionId] = useState(() => crypto.randomUUID());
  const [overlayActive, setOverlayActive] = useState(false);
  const transitionLockRef = useRef(false);

  const [room, setRoom] = useState(defaultState());
  const [actor, setActor] = useState(() => findSpawn(defaultState()) ?? { x: 0, y: 7 });
  const [direction, setDirection] = useState<Direction>('Front');
  const [frame, setFrame] = useState(0);
  const [held, setHeld] = useState<Direction | null>(null);
  const [walkQueue, setWalkQueue] = useState<WalkStep[]>([]);
  const [decorating, setDecorating] = useState(false);
  const [panel, setPanel] = useState<Panel>('clothes');
  const [plazaShopOpen, setPlazaShopOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dpadOpen, setDpadOpen] = useState(false);
  const [selected, setSelected] = useState<FurnitureType | null>(null);
  const [message, setMessage] = useState('방의 바닥을 누르면 그 자리로 걸어가요.');
  // 가구 배치는 이제 서버가 기준(pixel_furniture_placement) — roomReady는 그 최초 로드(+필요하면
  // 레거시 localStorage 1회 이전)가 끝났는지를 나타낸다. storageError는 그 로드나 이후 저장이
  // 실패했을 때만 채워진다(로컬 저장소 접근 불가 자체는 더 이상 에러가 아님 — 그냥 서버 기준으로
  // 시작할 뿐).
  const [roomReady, setRoomReady] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [speech, setSpeech] = useState('');
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const board = useRef<HTMLDivElement>(null);
  const speechTimer = useRef<number | undefined>(undefined);
  const shop = usePixelShop(userId, pointsBalance, onPixelPurchase);
  const ownedFurnitureTypes = useMemo(() => new Set(shop.catalog.filter(item => item.category === 'furniture' && shop.ownedIds.has(item.itemId)).map(item => item.assetKey as FurnitureType)), [shop.catalog, shop.ownedIds]);
  // Legacy local placements cannot grant ownership or leave invisible obstacles.
  const activeRoom = useMemo(() => ({ ...room, furniture: room.furniture.filter(item => ownedFurnitureTypes.has(item.type)) }), [room, ownedFurnitureTypes]);

  // 서버가 기준인 가구 배치 최초 로드. shop.ready가 되는 순간 딱 한 번만 실행(ref로 가드) — 그
  // 시점의 shop.catalog로 item_id<->assetKey를 매핑한다(usePixelShop이 즉시 정적 PIXEL_CATALOG로
  // 초기화해 두므로 네트워크 전에도 이미 채워져 있다). 서버에 아직 아무 행도 없으면(신규 유저 또는
  // 이 기능 출시 전 로컬에만 저장해 둔 유저) 레거시 localStorage를 한 번만 읽어 소유한 가구만
  // 서버로 이전한다 — 이전 시도 여부는 기기별 마커로 기록해서 다시 비운 방을 매번 되살리지 않는다.
  const roomLoadStartedRef = useRef(false);
  useEffect(() => {
    if (!shop.ready || roomLoadStartedRef.current) return;
    roomLoadStartedRef.current = true;
    let cancelled = false;
    const furnitureCatalog = shop.catalog.filter(item => item.category === 'furniture');
    const typeByItemId = new Map(furnitureCatalog.map(item => [item.itemId, item.assetKey as FurnitureType]));
    const itemIdByType = new Map(furnitureCatalog.map(item => [item.assetKey as FurnitureType, item.itemId]));

    function applyLoadedFurniture(furniture: Placement[]) {
      const loaded = validateRoom({ version: 1, avatar: defaultState().avatar, furniture });
      if (!loaded) return;
      setRoom(loaded);
      setActor(previous => (isCellFree(loaded, previous) ? previous : findSpawn(loaded) ?? previous));
    }

    (async () => {
      try {
        const rows = await fetchPixelFurniturePlacement(userId);
        if (cancelled) return;
        if (rows.length > 0) {
          const furniture = rows
            .map(row => { const type = typeByItemId.get(row.itemId); return type ? { type, x: row.x, y: row.y } : null; })
            .filter((item): item is Placement => item !== null);
          applyLoadedFurniture(furniture);
          return;
        }

        const storage = browserStorage();
        // v2: 이전 배포의 마이그레이션 로직이 소유권을 확인하지 않고 통째로 실패해도 이 마커를
        // 찍는 버그가 있었다(바로 위 고침) — 그 버그를 이미 겪은 계정은 v1 마커가 이미 찍혀 있어
        // 재시도를 막고 있으므로, 키 자체를 올려서 이 고침이 배포되는 순간 자연스럽게 한 번 더
        // 재시도하게 한다. v1 마커는 그냥 죽은 키로 남지만 지울 필요는 없다.
        const migratedKey = `${storageKey(userId)}:migrated:v2`;
        if (storage?.getItem(migratedKey)) return; // already attempted (or confirmed empty) before
        const legacy = loadRoom(userId, storage);
        // room state was never itself pruned when ownership changed (only the derived activeRoom
        // was, for rendering) — so legacy.state.furniture can genuinely contain types the user no
        // longer (or never actually) owns. itemIdByType.has(...) only checks "is this a real
        // furniture type", not ownership — filtering on that alone let an unowned leftover sink
        // the whole RPC call (all-or-nothing on ownership), which silently emptied the room and
        // still marked migration done. Filter to shop.ownedIds here so only what's truly owned
        // is ever sent.
        const ownedLegacy = legacy.ok
          ? legacy.state.furniture.filter(item => {
              const itemId = itemIdByType.get(item.type);
              return !!itemId && shop.ownedIds.has(itemId);
            })
          : [];
        if (ownedLegacy.length > 0) {
          const placements = ownedLegacy.map(item => ({ itemId: itemIdByType.get(item.type)!, x: item.x, y: item.y }));
          const result = await savePixelRoomLayout(placements);
          if (cancelled) return;
          if (result.ok) {
            applyLoadedFurniture(ownedLegacy);
          } else {
            // Don't lose the migration attempt silently: show the legacy layout for this session
            // anyway (nothing was saved server-side, so a later real edit will persist it) and
            // don't mark "migrated" — next load retries instead of losing it for good.
            applyLoadedFurniture(ownedLegacy);
            setStorageError(result.message || '이전 가구 배치를 서버로 옮기지 못했어요. 가구를 다시 놓으면 저장돼요.');
            return;
          }
        }
        storage?.setItem(migratedKey, '1');
      } catch {
        if (!cancelled) setStorageError('가구 배치를 불러오지 못했어요. 새로고침 후 다시 시도해 주세요.');
      } finally {
        if (!cancelled) setRoomReady(true);
      }
    })();
    return () => { cancelled = true; };
    // 의도적으로 shop.catalog/shop.ownedIds는 deps에서 뺀다 — 이 effect는 shop.ready가 처음 true가
    // 되는 그 순간의 값을 클로저로 한 번만 읽는 "딱 한 번" 로더(roomLoadStartedRef가 재실행을
    // 막음)다. usePixelShop은 카탈로그를 ready와 별개의 독립된 요청으로 나중에 갱신하는데
    // (fetchPixelCatalog는 Promise.all 밖에 있음), 그 값을 deps에 넣으면 ready가 true가 된 직후
    // 카탈로그가 도착하는 순간 이 effect가 통째로 재실행되면서 clean-up이 먼저 실행되어 진행 중이던
    // 클로저의 cancelled를 true로 만들어 버렸다 — roomLoadStartedRef 때문에 새 실행은 즉시
    // no-op이고, 원래 실행은 cancelled 체크 때문에 finally의 setRoomReady(true)조차 건너뛰어서
    // roomReady가 영원히 false로 남았다("보유 정보를 불러온 뒤 배치할 수 있어요"가 계속 뜨던 원인).
    // shop.ownedIds는 ready와 같은 배치에서 함께 설정되므로 굳이 deps에 없어도 최초 실행 시점엔
    // 이미 최신값이고, shop.catalog가 아직 서버 응답 전이라도 정적 PIXEL_CATALOG 기본값 자체가
    // 이미 완전한 목록이라 기능적으로 문제없다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shop.ready, userId]);

  // Walks the fade overlay to full opacity, swaps `location` (mounting the destination while the
  // screen is fully covered — see the DOOR_FADE_MS/PRESENCE_HEAD_START_MS comment above), then
  // fades back out. `transitionLockRef` blocks re-entry for the whole sequence so a double door
  // hit (e.g. re-triggering right as the fade starts) can't stack two transitions.
  function transitionTo(next: Location) {
    if (transitionLockRef.current || next === location) return;
    transitionLockRef.current = true;
    setHeld(null);
    setWalkQueue([]);
    setOverlayActive(true);
    window.setTimeout(() => {
      if (next === 'room') { setActor(ROOM_SPAWN_FROM_YARD.cell); setDirection(ROOM_SPAWN_FROM_YARD.direction); }
      if (next === 'yard') setYardFrom(location === 'plaza' ? 'plaza' : 'room');
      setLocation(next);
      window.setTimeout(() => {
        setOverlayActive(false);
        transitionLockRef.current = false;
      }, PRESENCE_HEAD_START_MS);
    }, DOOR_FADE_MS);
  }

  // Reaching the room door — fires from ANY movement path that ends in setActor (held-key tick,
  // tap-to-walk queue, D-pad), since they all funnel through the same `actor` state watched here.
  // Guarded against firing on the very first render: if a fully-decorated room's default spawn
  // (model.ts's findSpawn, unrelated to and untouched by this rework) ever happened to land
  // exactly on the door cell, we don't want mounting the room to instantly teleport into the
  // plaza — only a real step onto the door should.
  const skipDoorCheckRef = useRef(true);
  useEffect(() => {
    if (skipDoorCheckRef.current) { skipDoorCheckRef.current = false; return; }
    if (location !== 'room' || decorating) return;
    if (actor.x === ROOM_DOOR.x && actor.y === ROOM_DOOR.y) transitionTo('yard');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actor, location, decorating]);

  async function handlePurchase(item: PixelItem) {
    if (purchasingId) return;
    setPurchasingId(item.itemId);
    const outcome = await shop.purchase(item);
    setPurchasingId(null);
    if (!outcome.ok) {
      setMessage(outcome.reason === 'insufficient_balance' ? '포인트가 조금 부족해요. 복습을 더 하면 모을 수 있어요.'
        : outcome.reason === 'already_owned' ? '이미 보유한 아이템이에요.'
        : outcome.message || '구매를 처리하지 못했어요. 잠시 후 다시 시도해 주세요.');
      return;
    }
    if (item.category === 'avatar') {
      setMessage(outcome.equipFailed
        ? `${item.displayName} 구매 완료! 장착은 실패해서 옷 탭에서 다시 시도해 주세요.`
        : `${item.displayName} 구매 완료! 바로 갈아입었어요.`);
      return;
    }
    if (item.category === 'pet') {
      const ok = isPetId(item.itemId) && await pet.activate(item.itemId);
      setMessage(ok ? `${item.displayName} 친구가 우리 집에 왔어요!` : '구매 완료! 펫 탭에서 함께 살기를 다시 눌러 주세요.');
      return;
    }
    if (location !== 'room') { setMessage(`${item.displayName} 구매 완료! 집의 가구 보관함에서 놓을 수 있어요.`); return; }
    const type = item.assetKey as FurnitureType;
    enterDecorating();
    setSelected(type);
    setMessage(`${item.displayName} 구매 완료! 원하는 칸을 눌러서 놓아 주세요.`);
  }

  // "장착"의 서버 소스: 무엇을 입고 있는지는 이 localStorage RoomState가 아니라 서버(Worker A의
  // 구매/장착 RPC, usePixelShop이 조회)가 정한다. shop.equipped가 곧 렌더링에 쓰는
  // PublicAvatarAppearance다 — 로컬 room.avatar.shirt는 더 이상 렌더링에 관여하지 않는다.

  // 장착 테마는 전체 앱 테마(applyThemeColor)를 건드리지 않고, room 안 CSS 변수로만 좁혀서 반영한다.
  const roomStyle = themePrimary ? ({ '--pr-theme-primary': themePrimary, '--pr-theme-accent': themeAccent || themePrimary } as CSSProperties) : undefined;

  function speak() {
    if (!onSpeak) return;
    window.clearTimeout(speechTimer.current);
    setSpeech(onSpeak());
    speechTimer.current = window.setTimeout(() => setSpeech(''), 3200);
  }
  useEffect(() => () => window.clearTimeout(speechTimer.current), []);

  // 서버가 기준 — 실패하면 화면과 서버가 갈라지지 않도록 낙관적 갱신을 되돌린다(이전엔 항상
  // 성공하는 localStorage 저장이라 되돌릴 필요가 없었지만, 이제는 네트워크 저장이라 실패할 수 있음).
  //
  // next.furniture를 소유한 것만 걸러서 보낸다 — "가구 치우기" 버튼은 removeFurniture(room, ...)로
  // 필터 전 원본 room을 그대로 쓰므로(선택한 것 하나만 빼고 나머지는 그대로), room에 남아있던
  // 과거의 미소유 잔여 항목(activeRoom은 렌더링에서만 걸러내고 room 자체는 한 번도 정리한 적이
  // 없었음)이 같이 실려가면 서버가 배치 전체를 통째로 거부해서(RPC는 all-or-nothing) 정작 방금
  // 치우려던 아이템조차 안 치워지는 문제가 있었다. 여기서 걸러 두면 그 문제가 재발하지 않고, room
  // 상태도 이 저장을 계기로 자연스럽게 정리된다.
  function persist(next: RoomState) {
    const previous = room;
    const cleaned: RoomState = { ...next, furniture: next.furniture.filter(item => ownedFurnitureTypes.has(item.type)) };
    setRoom(cleaned);
    const itemIdByType = new Map(shop.catalog.filter(item => item.category === 'furniture').map(item => [item.assetKey as FurnitureType, item.itemId]));
    const placements = cleaned.furniture
      .map(item => { const itemId = itemIdByType.get(item.type); return itemId ? { itemId, x: item.x, y: item.y } : null; })
      .filter((placement): placement is { itemId: string; x: number; y: number } => placement !== null);
    savePixelRoomLayout(placements).then(result => {
      if (!result.ok) { setRoom(previous); setStorageError(result.message); }
      else setStorageError('');
    });
  }
  // Leaving the room stops room movement immediately (not just on the next tick), so no stray
  // timer keeps stepping the actor while the room card isn't even shown.
  useEffect(() => { if (location !== 'room') { setHeld(null); setWalkQueue([]); } }, [location]);

  // A single timer runs only during input. No animation loop remains after exit/blur.
  useEffect(() => {
    if (!held || decorating || location !== 'room') return;
    function step() {
      const delta = directions[held!];
      setActor(previous => {
        const next = { x: previous.x + delta.x, y: previous.y + delta.y };
        return isCellFree(activeRoom, next) ? next : previous;
      });
      setFrame(previous => (previous + 1) % 4);
    }
    step();
    const timer = window.setInterval(step, 170);
    const stop = () => setHeld(null);
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', stop);
    return () => { clearInterval(timer); window.removeEventListener('blur', stop); document.removeEventListener('visibilitychange', stop); };
  }, [held, decorating, location, activeRoom]);

  // Tap-to-walk consumes one precomputed step per tick; re-fires itself as walkQueue shrinks by
  // one each render, so it self-terminates without a manual interval to tear down mid-walk.
  useEffect(() => {
    if (walkQueue.length === 0 || decorating || held || location !== 'room') return;
    const [next, ...rest] = walkQueue;
    const timer = window.setTimeout(() => {
      setActor(previous => isCellFree(activeRoom, next.cell) ? next.cell : previous);
      setDirection(next.direction);
      setFrame(previous => (previous + 1) % 4);
      setWalkQueue(rest);
    }, 170);
    const stop = () => setWalkQueue([]);
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', stop);
    return () => { clearTimeout(timer); window.removeEventListener('blur', stop); document.removeEventListener('visibilitychange', stop); };
  }, [walkQueue, decorating, held, location, activeRoom]);

  function begin(next: Direction) { setWalkQueue([]); setDirection(next); setHeld(next); }
  function walkTo(target: Cell) {
    if (decorating || (target.x === actor.x && target.y === actor.y)) return;
    const path = planWalk(activeRoom, actor, target);
    if (path.length === 0) { setMessage('그 칸에는 갈 수 없어요. 가구가 없는 바닥을 눌러 주세요.'); return; }
    const steps: WalkStep[] = [];
    let from = actor;
    for (const cell of path) { steps.push({ cell, direction: stepDirection(from, cell) }); from = cell; }
    setHeld(null);
    setWalkQueue(steps);
  }
  // 꾸미기 모드에 진입/재진입할 때마다 시트를 가구 탭으로 열어 catalog가 바로 보이게 하고,
  // 나갈 때는 방을 다시 꽉 채워 보여주기 위해 시트도 함께 접는다.
  function enterDecorating() { setDecorating(true); setHeld(null); setWalkQueue([]); setPanel('furniture'); setSheetOpen(true); }
  function exitDecorating(nextMessage: string) { setDecorating(false); setSelected(null); setSheetOpen(false); setMessage(nextMessage); }
  function chooseCell(cell: Cell) {
    if (!decorating) { board.current?.focus({ preventScroll: true }); walkTo(cell); return; }
    if (!shop.ready || shop.loadError || !roomReady) { setMessage('보유 정보를 불러온 뒤 배치할 수 있어요.'); return; }
    if (selected && !ownedFurnitureTypes.has(selected)) { setSelected(null); return; }
    if (!selected) {
      const item = activeRoom.furniture.find(item => cell.x >= item.x && cell.x < item.x + FURNITURE[item.type].width && cell.y >= item.y && cell.y < item.y + FURNITURE[item.type].height);
      if (item) { setSelected(item.type); setMessage(`${names[item.type]}: 새 칸을 누르면 이동해요.`); }
      else setMessage('아래에서 놓을 가구를 먼저 골라 주세요.');
      return;
    }
    if (coversReservedCell(selected, cell)) { setMessage('문 앞 칸에는 가구를 놓을 수 없어요.'); return; }
    const next = placeFurniture(activeRoom, selected, cell, actor);
    if (!next) { setMessage('가구와 캐릭터가 없는, 방 안의 빈 공간을 골라 주세요.'); return; }
    persist(next);
    exitDecorating(`${names[selected]} 배치 완료! 이제 방을 누르면 그 자리로 걸어가요.`);
  }
  const placed = selected && room.furniture.some(item => item.type === selected);
  function explainShop() { setSheetOpen(false); setMessage('새 아이템은 광장 오른쪽의 작은 상점에서 만나요. 카펫을 지나 마당 → 광장으로 걸어가세요.'); }
  function openPanel(next: Panel) { setSheetOpen(open => !(open && panel === next)); setPanel(next); }
  return <section className="pr-shell" aria-label="Pixel Room" style={roomStyle}>
    <h1 className="sr-only">나만의 Pixel Room</h1>
    {/* Full-screen fade — the ONLY transition between room and plaza (Phase 2A rework). While this
       is opaque, `location` has already swapped and the destination is mounted underneath it, so
       the plaza's realtime connection gets a head start before anyone can see it (see
       transitionTo above). Sits above the toolbar too, on purpose. */}
    <div className={`pr-transition-overlay${overlayActive ? ' pr-transition-active' : ''}`} aria-hidden="true" />
    <header className="pr-toolbar">
      <button className="rn-button rn-button-ghost" onClick={onExit}>← Reviewnote</button>
      {location === 'room' && <button className={`rn-button rn-button-compact ${decorating ? 'rn-button-primary' : 'rn-button-secondary'}`} aria-pressed={decorating} onClick={() => {
        if (decorating) exitDecorating('방을 누르면 그 자리로 걸어가요.');
        else { enterDecorating(); setMessage('가구를 고르고 방의 원하는 칸을 눌러 주세요.'); }
      }}>{decorating ? '꾸미기 완료' : '꾸미기'}</button>}
    </header>
    {location === 'room' && storageError && <p className="pr-storage-error" role="alert">{storageError}</p>}
    {location === 'plaza' && <Plaza equippedAppearance={shop.equipped} onOpenShop={() => { setMessage('마음에 드는 것을 골라 보세요. 펫은 집과 마당에서 만나요.'); setPlazaShopOpen(true); }} userId={userId} sessionId={sessionId} onReachEntrance={() => transitionTo('yard')} />}
    {location === 'plaza' && plazaShopOpen && <PlazaShopDialog onClose={() => setPlazaShopOpen(false)}><p role="status">{message}</p><ShopPanel shop={shop} pet={pet} room={activeRoom} busy={!!purchasingId} setMessage={setMessage} onPurchase={handlePurchase} canPlace={false} onPlace={() => {}} /></PlazaShopDialog>}
    {location === 'yard' && <FrontYard from={yardFrom} appearance={shop.equipped} userId={userId} activePet={pet.ready && !pet.error && pet.active && shop.ownedIds.has(pet.active) ? pet.active : null} onExit={transitionTo} />}
    {location === 'room' && <div className={`pr-room-frame ${decorating ? 'pr-decorating' : ''}`}>
      <div className="pr-wall" aria-hidden="true"><div className="pr-window"><i /><i /><i /><i /></div><span>HOME, SWEET HOME</span></div>
      <div className="pr-stage">
        <div ref={board} className={`pr-board ${decorating ? 'pr-board-edit' : ''}`} tabIndex={0} role="group" aria-label="내 방. 바닥을 눌러 이동하거나 방향키/WASD로 이동. 아래쪽 카펫을 지나면 집 앞으로 나가요." aria-describedby="pr-instructions"
          onKeyDown={event => {
            if (event.target !== event.currentTarget || decorating || event.altKey || event.ctrlKey || event.metaKey) return;
            const next = keys[event.key.length === 1 ? event.key.toLowerCase() : event.key];
            if (next) { event.preventDefault(); if (!event.repeat) begin(next); }
          }} onKeyUp={event => {
            const next = keys[event.key.length === 1 ? event.key.toLowerCase() : event.key];
            if (next && event.target === event.currentTarget) { event.preventDefault(); if (held === next) setHeld(null); }
          }} onBlur={() => setHeld(null)}>
          <div className="pr-grid">{cells.map(cell => <button key={`${cell.x}-${cell.y}`} type="button" tabIndex={decorating ? 0 : -1} aria-label={`${cell.x + 1}열 ${cell.y + 1}행에 배치`} onClick={() => chooseCell(cell)} />)}</div>
          {/* 출입구 카펫 — 가구가 아니라 항상 고정인 바닥 장식(구매/소유/배치 대상 아님). 문 칸을
             중심으로 좌우 반 칸씩 걸쳐 놓아 실제 러그 자산의 가로로 넓은 비율(48x32)이 작아 보이지
             않게 한다 — z-index를 항상 0(가구/캐릭터보다 아래)으로 고정해서, 옆 칸에 가구가 놓여도
             카펫 위에 자연스럽게 덮여서 시각적으로 절대 튀지 않는다(배치 금지 규칙 자체는
             RESERVED_ROOM_CELLS 그대로 유지 — 문 칸만 막는다). pointer-events:none이라
             (.pr-furniture와 동일 처리) 눌러도 그대로 아래 바닥 칸 버튼이 반응해서 자연스럽게 문
             쪽으로 걸어간다. */}
          <div className="pr-doormat" style={{ left: `${(ROOM_DOOR.x - 0.5) * 10}%`, top: `${ROOM_DOOR.y * 12.5}%`, width: '20%', height: '12.5%' }}><DoormatSprite /></div>
          {activeRoom.furniture.map(item => <div key={item.type} data-furniture={item.type} className={`pr-furniture ${selected === item.type ? 'pr-selected' : ''}`} style={{ left: `${item.x * 10}%`, top: `${item.y * 12.5}%`, width: `${FURNITURE[item.type].width * 10}%`, height: `${FURNITURE[item.type].height * 12.5}%`, zIndex: item.y + FURNITURE[item.type].height }}><FurnitureSprite type={item.type} /></div>)}
          {roomReady && shop.ready && !shop.loadError && pet.ready && !pet.error && pet.active && shop.ownedIds.has(pet.active) && <Companion pet={pet.active} key={`${pet.active}:${JSON.stringify(activeRoom.furniture)}`} world={roomDogWorld(activeRoom, actor)} paused={decorating} />}
          <button type="button" className="pr-actor" data-x={actor.x} data-y={actor.y} data-direction={direction} data-shirt={shop.equipped.top ?? 'default'} style={{ left: `${actor.x * 10 - 6}%`, bottom: `${(ROOM_HEIGHT - actor.y - 1) * 12.5}%`, zIndex: actor.y + 1, pointerEvents: decorating ? 'none' : 'auto' }} tabIndex={decorating ? -1 : 0} onClick={event => { event.stopPropagation(); speak(); }} aria-label={`내 캐릭터, ${actor.x + 1}열 ${actor.y + 1}행. 눌러서 말 걸어보기`}>
            {speech && <span className="pr-bubble" role="status">{speech}</span>}
            <span className="pr-shadow" /><AvatarSprite direction={direction} frame={held || walkQueue.length > 0 ? frame : 0} walking={!!held || walkQueue.length > 0} appearance={shop.equipped} />
          </button>
        </div>
      </div>
      <div className="pr-threshold" aria-hidden="true" />
      {!decorating && <div className="pr-dpad-dock">
        {dpadOpen && <div className="pr-controls" aria-label="캐릭터 이동">{(['Back', 'Left', 'Front', 'Right'] as Direction[]).map(next => <button key={next} className={`pr-direction pr-direction-${next}`} aria-label={`${{ Back: '위', Front: '아래', Left: '왼쪽', Right: '오른쪽' }[next]}로 이동`} onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); begin(next); }} onPointerUp={() => setHeld(null)} onPointerCancel={() => setHeld(null)} onLostPointerCapture={() => setHeld(null)} onBlur={() => setHeld(null)} onClick={event => {
          if (event.detail !== 0) return;
          setWalkQueue([]); setDirection(next); const delta = directions[next];
          setActor(previous => { const cell = { x: previous.x + delta.x, y: previous.y + delta.y }; return isCellFree(activeRoom, cell) ? cell : previous; });
        }}>{ { Back: '↑', Front: '↓', Left: '←', Right: '→' }[next]}</button>)}</div>}
        <button type="button" className="pr-dpad-toggle" aria-pressed={dpadOpen} onClick={() => setDpadOpen(open => !open)} aria-label={dpadOpen ? '방향키 숨기기' : '방향키로 이동하기'}>⛶</button>
      </div>}
    </div>}
    {location === 'room' && <div className="pr-below-room"><p id="pr-instructions" className="pr-instructions" role="status">{message}</p></div>}
    {location === 'room' && <div className="pr-sheet">
      <div className="pr-sheet-trigger">
        <button aria-pressed={sheetOpen && panel === 'clothes'} aria-expanded={sheetOpen && panel === 'clothes'} aria-controls="pr-sheet-panel" onClick={() => openPanel('clothes')}>옷</button>
        <button aria-pressed={sheetOpen && panel === 'furniture'} aria-expanded={sheetOpen && panel === 'furniture'} aria-controls="pr-sheet-panel" onClick={() => openPanel('furniture')}>가구 <small>{ownedFurnitureTypes.size}</small></button>
      </div>
      {sheetOpen && <div className={`pr-sheet-panel pr-panel-${panel}`} id="pr-sheet-panel">
        {/* Visual-only duplicate: the live region that actually announces changes stays the one
           in .pr-below-room (always mounted) — this one is just here because the sheet panel
           visually covers that region while open, per Codex review finding #10. */}
        <p className="pr-sheet-status" aria-hidden="true">{message}</p>
        {panel === 'clothes' ? <Wardrobe shop={shop} busy={!!purchasingId} setMessage={setMessage} onShop={explainShop} />
          : <>
            <p className="pr-tool-hint">{decorating ? '가구를 선택 → 방의 칸을 터치. 배치한 가구도 다시 옮길 수 있어요.' : '꾸미기를 켜면 가구를 놓고 옮길 수 있어요.'}</p>
            {ownedFurnitureTypes.size === 0
              ? <div className="pr-shop-empty"><p>아직 보유한 가구가 없어요.</p><button type="button" className="rn-button rn-button-secondary" onClick={explainShop}>광장 상점 안내</button></div>
              : <div className="pr-catalog">{(Object.keys(FURNITURE) as FurnitureType[]).filter(type => ownedFurnitureTypes.has(type)).map(type => <button key={type} aria-pressed={selected === type} onClick={() => { enterDecorating(); setSelected(selected === type ? null : type); setMessage(`${names[type]}: 원하는 칸을 눌러 주세요.`); }}><span className="pr-catalog-art"><FurnitureSprite type={type} /></span><strong>{names[type]}</strong><small>{room.furniture.some(item => item.type === type) ? '배치 중' : '보유 1개'}</small></button>)}</div>}
            {placed && <button className="rn-button rn-button-secondary pr-remove" onClick={() => { persist(removeFurniture(room, selected)); exitDecorating(`${names[selected]}을 보관함으로 돌려놓았어요. 이제 방을 누르면 그 자리로 걸어가요.`); }}>선택한 가구 치우기</button>}
          </>}


      </div>}
    </div>}
  </section>;
}
