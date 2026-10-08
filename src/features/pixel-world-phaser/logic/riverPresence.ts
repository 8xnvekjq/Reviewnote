// 강가 실시간 — 광장과 같은 presence/이동/인사/한마디 프로토콜을 강가 전용 채널에서 쓴다.
// 여기에는 그 위에 얹는 "낚시 상태" broadcast(저장하지 않는 순간 상태)의 모양·검사·속도 제한·받는 쪽 상태만 둔다.
// React도 Phaser도 import하지 않는다(node --test로 바로 시험).
import type { Point } from './joystick';
import type { FishingPhase } from './fishingGame';
import type { FishRarity } from '../ui/fishingAdapter';
import { RIVER_COLS, RIVER_ROWS } from './riverWorld';
import { fishById } from './fishCatalog';
import type { PresenceBounds } from '../../pixel-room/plaza/presenceProtocol';
import { continuousPayload, continuousPosition } from '../../pixel-room/plaza/presenceProtocol';

/** 광장('pixel-world-plaza')과 다른 이름 — 구형 광장 화면은 이 채널을 모르므로 아무 영향이 없다. */
export const RIVER_CHANNEL_NAME = 'pixel-world-river';
export const RIVER_BOUNDS: PresenceBounds = { width: RIVER_COLS, height: RIVER_ROWS };
/** 강가는 카메라 여백 없이 장면 칸 좌표를 그대로 보낸다. */
export const riverPayload = (feet: Point) => continuousPayload(feet, 0, RIVER_BOUNDS);
export function riverFeet(p: Parameters<typeof continuousPosition>[0]): Point {
  const q = continuousPosition(p, RIVER_BOUNDS);
  return { x: (q.x + .5) * 16, y: (q.y + .5) * 16 };
}

export const FISH_EVENT = 'fish';
/** 친구 화면에 보이는 낚시 단계. idle = 낚싯줄 없음. */
export type RiverFishPhase = 'idle' | 'casting' | 'waiting' | 'bite' | 'reeling' | 'landed' | 'escaped';
const PHASES: readonly RiverFishPhase[] = ['idle', 'casting', 'waiting', 'bite', 'reeling', 'landed', 'escaped'];
export const activeFishPhase = (phase: RiverFishPhase) => phase === 'casting' || phase === 'waiting' || phase === 'bite' || phase === 'reeling';

/** useFishing → 강가 실시간 연결점(어댑터). useFishing은 이 모양만 알면 된다. 좌표 변환·전송·속도 제한은 RiverBridge가 맡는다. */
export type RiverFishReport =
  | { phase: 'casting'; shadow: number }
  | { phase: 'waiting' | 'bite' | 'reeling' | 'escaped' | 'idle' }
  | { phase: 'landed'; speciesId: string; lengthCm: number };
export type RiverFishReporter = (report: RiverFishReport) => void;

/** 지금 낚시 미니게임(logic/fishingGame.ts)의 단계 → 친구에게 보낼 단계. 결과가 서버에서 오기 전인 'landed'는 '끌어올리는 중'이다.
 *  TODO(릴 단계): 새 릴(감기) 미니게임이 들어오면 감기 시작 순간에 { phase: 'reeling' }을 보내고, 여기 'landed' 매핑은 그 단계로 옮긴다. */
export function fishReportForGamePhase(phase: FishingPhase): RiverFishReport | null {
  switch (phase) {
    case 'waiting': case 'bite': return { phase };
    case 'landed': return { phase: 'reeling' };
    case 'tooEarly': case 'missed': return { phase: 'escaped' };
    case 'cancelled': return { phase: 'idle' };
    default: return null; // casting은 그림자 번호가 필요해서 useFishing이 직접 보낸다. idle은 보낼 일이 없다.
  }
}

/** 전송 모양. 이름·계정 같은 개인 정보는 없다(sessionId는 탭마다 새로 만든 무작위 값). */
export interface RiverFishEvent {
  sessionId: string;
  seq: number;
  phase: RiverFishPhase;
  /** casting(필수)·waiting·bite·reeling: 찌가 떨어지는 장면 좌표(px). */
  target?: Point;
  /** landed만: 도감에 있는 물고기와 그 범위 안의 길이. */
  speciesId?: string;
  lengthCm?: number;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const LENGTH_SLACK = 0.05;

/** 장면 안의 점만 받는다(강가 크기 밖이나 NaN은 버림). */
export function parseTarget(raw: unknown): Point | null {
  if (!isObj(raw) || !finite(raw.x) || !finite(raw.y)) return null;
  if (raw.x < 0 || raw.y < 0 || raw.x > RIVER_COLS * 16 || raw.y > RIVER_ROWS * 16) return null;
  return { x: Math.round(raw.x * 10) / 10, y: Math.round(raw.y * 10) / 10 };
}
/** 도감에 있는 물고기, 그 종의 최소~최대 길이 안(소수 한 자리)만 받는다. */
export function parseCatch(speciesId: unknown, lengthCm: unknown): { speciesId: string; lengthCm: number } | null {
  if (typeof speciesId !== 'string' || speciesId.length > 40 || !finite(lengthCm)) return null;
  const fish = fishById(speciesId);
  if (!fish || lengthCm < fish.minCm - LENGTH_SLACK || lengthCm > fish.maxCm + LENGTH_SLACK) return null;
  return { speciesId: fish.id, lengthCm: Math.round(lengthCm * 10) / 10 };
}

/** 받은 payload를 하나하나 확인해 화이트리스트 필드만 남긴다. 이상하면 null. */
export function parseFishEvent(raw: unknown): RiverFishEvent | null {
  if (!isObj(raw)) return null;
  const { sessionId, seq, phase } = raw;
  if (typeof sessionId !== 'string' || sessionId.length < 1 || sessionId.length > 128) return null;
  if (!finite(seq) || !Number.isInteger(seq) || seq < 0) return null;
  if (typeof phase !== 'string' || !(PHASES as readonly string[]).includes(phase)) return null;
  const event: RiverFishEvent = { sessionId, seq, phase: phase as RiverFishPhase };
  if (activeFishPhase(event.phase) && raw.target !== undefined) {
    const target = parseTarget(raw.target);
    if (!target) return null;
    event.target = target;
  }
  if (event.phase === 'casting' && !event.target) return null;
  if (event.phase === 'landed') {
    const caught = parseCatch(raw.speciesId, raw.lengthCm);
    if (!caught) return null;
    Object.assign(event, caught);
  }
  return event;
}

/** 보내는 쪽: 어댑터 보고 + 찌 좌표 → 전송 payload. 보낼 수 없는 보고(도감 밖 물고기 등)는 null. */
export function buildFishEvent(sessionId: string, seq: number, report: RiverFishReport, target: Point | null): RiverFishEvent | null {
  const event: RiverFishEvent = { sessionId, seq, phase: report.phase };
  if (report.phase === 'casting') {
    const point = target && parseTarget(target);
    if (!point) return null;
    event.target = point;
  } else if (report.phase === 'landed') {
    const caught = parseCatch(report.speciesId, report.lengthCm);
    if (!caught) return null;
    Object.assign(event, caught);
  }
  return parseFishEvent(event);
}

// ── 속도 제한(토큰 통) ─────────────────────────────────────────────────────────
// 보통 한 번 던지면 4~6개(던짐·기다림·입질·끌어올림·결과)가 몇 초에 걸쳐 나간다. 몰아서 오는 것은 막는다.
export interface FishBucket { tokens: number; at: number }
export const FISH_SEND_LIMIT = { capacity: 6, refillMs: 300 };
export const FISH_RECEIVE_LIMIT = { capacity: 8, refillMs: 250 };
export function takeFishToken(bucket: FishBucket | undefined, now: number, limit = FISH_RECEIVE_LIMIT): { ok: boolean; bucket: FishBucket } {
  const start = bucket ?? { tokens: limit.capacity, at: now };
  const tokens = Math.min(limit.capacity, start.tokens + Math.max(0, now - start.at) / limit.refillMs);
  return tokens >= 1 ? { ok: true, bucket: { tokens: tokens - 1, at: now } } : { ok: false, bucket: { tokens, at: now } };
}

// ── 받는 쪽 상태 ──────────────────────────────────────────────────────────────
export interface PeerCatch { speciesId: string; name: string; lengthCm: number; rarity: FishRarity; at: number }
export interface PeerFishing { phase: RiverFishPhase; target: Point | null; since: number; seq: number; catch: PeerCatch | null }
export interface RiverFishStore { peers: Map<string, PeerFishing>; buckets: Map<string, FishBucket> }
export const createRiverFishStore = (): RiverFishStore => ({ peers: new Map(), buckets: new Map() });
/** 낚싯줄이 걸린 채 소식이 끊기면(탭이 멈춤 등) 이 시간 뒤 치운다. */
export const FISH_ACTIVE_MAX_MS = 45_000;
/** 결과(잡음/놓침) 뒤 찌를 치우기까지. */
export const FISH_RESULT_MS = 1_200;
/** 머리 위 "붕어 23.4cm!" 구름이 보이는 시간. */
export const CATCH_BUBBLE_MS = 4_000;
const MAX_TRACKED = 64;

/** 받은 낚시 소식 하나를 반영한다. 모르는 사람(명단 밖)·속도 초과·옛 순번은 버리고 같은 store를 돌려준다. */
export function applyFishEvent(store: RiverFishStore, raw: unknown, now: number, roster: { has(id: string): boolean }): RiverFishStore {
  const event = parseFishEvent(raw);
  if (!event || !roster.has(event.sessionId)) return store;
  const previous = store.peers.get(event.sessionId);
  if (previous && event.seq <= previous.seq) return store;
  if (!store.buckets.has(event.sessionId) && store.buckets.size >= MAX_TRACKED) return store;
  const gate = takeFishToken(store.buckets.get(event.sessionId), now);
  const buckets = new Map(store.buckets).set(event.sessionId, gate.bucket);
  if (!gate.ok) return { peers: store.peers, buckets };
  const target = event.target ?? (event.phase === 'casting' ? null : previous && activeFishPhase(previous.phase) ? previous.target : null);
  let caught = previous?.catch ?? null;
  if (event.phase === 'landed') {
    const fish = fishById(event.speciesId!)!;
    caught = { speciesId: fish.id, name: fish.name, lengthCm: event.lengthCm!, rarity: fish.rarity, at: now };
  }
  const next: PeerFishing = { phase: event.phase, target: activeFishPhase(event.phase) || event.phase === 'landed' || event.phase === 'escaped' ? target : null, since: now, seq: event.seq, catch: caught };
  return { peers: new Map(store.peers).set(event.sessionId, next), buckets };
}

/** 시간이 지난 결과·끊긴 줄·떠난 사람을 치운다. 바뀐 게 없으면 같은 store를 돌려준다(React 재렌더 방지). */
export function expireFishStore(store: RiverFishStore, now: number, roster: { has(id: string): boolean }): RiverFishStore {
  let changed = false;
  const peers = new Map<string, PeerFishing>();
  for (const [id, peer] of store.peers) {
    if (!roster.has(id)) { changed = true; continue; }
    let next = peer;
    if ((activeFishPhase(peer.phase) && now - peer.since > FISH_ACTIVE_MAX_MS) || ((peer.phase === 'landed' || peer.phase === 'escaped') && now - peer.since > FISH_RESULT_MS)) next = { ...next, phase: 'idle', target: null };
    if (next.catch && now - next.catch.at > CATCH_BUBBLE_MS) next = { ...next, catch: null };
    if (next !== peer) changed = true;
    if (next.phase === 'idle' && !next.catch && now - next.since > 60_000) { changed = true; continue; }
    peers.set(id, next);
  }
  const buckets = new Map([...store.buckets].filter(([id]) => roster.has(id)));
  if (buckets.size !== store.buckets.size) changed = true;
  return changed ? { peers, buckets } : store;
}

/** 머리 위 구름 글. 숫자는 소수 한 자리. */
export const catchBubbleText = (c: Pick<PeerCatch, 'name' | 'lengthCm'>) => `${c.name} ${c.lengthCm.toFixed(1)}cm!`;
/** 희귀·전설 물고기는 모두에게 작은 반짝임을 보여 준다. */
export const celebratesCatch = (rarity: FishRarity) => rarity === 'rare' || rarity === 'legendary';

/** Phaser 쪽에 넘기는 친구 낚시 모양(그리기에 필요한 것만). */
export interface RiverPeerFishing { phase: RiverFishPhase; target: Point | null; since: number; sparkleAt: number | null }
export function peerFishingView(store: RiverFishStore): Record<string, RiverPeerFishing> {
  const out: Record<string, RiverPeerFishing> = {};
  for (const [id, p] of store.peers) out[id] = { phase: p.phase, target: p.target, since: p.since, sparkleAt: p.catch && celebratesCatch(p.catch.rarity) ? p.catch.at : null };
  return out;
}
