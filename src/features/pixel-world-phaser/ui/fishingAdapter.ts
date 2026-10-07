// 낚시(강가의 하루) 서버 연결의 고정 계약. 모양은 docs/pixel-world/FISHING_SPEC.md를 따른다.
// 실제 Supabase 구현(createFishingAdapter)은 서버 작업에서 이 파일에 채운다.
export type FishPhase = 'morning' | 'day' | 'evening' | 'night';
export type FishWeather = 'clear' | 'cloudy' | 'rain';
export type FishRarity = 'common' | 'uncommon' | 'rare' | 'legendary';
export type FishShadow = 'S' | 'M' | 'L';
export type BitePattern = 'quick' | 'double' | 'long';
export interface FishAlbumEntry { speciesId: string; count: number; bestCm: number; firstAt: string }
export interface FishingState { kstDate: string; phase: FishPhase; weather: FishWeather; remaining: number; sparkleShadow: number | null; pigeonHint: string | null; album: FishAlbumEntry[] }
export type CastStart = { ok: true; castId: string; shadow: FishShadow; biteDelayMs: number; pattern: BitePattern; hint: 'sparkle' | null } | { ok: false; reason: 'budget' | 'pending' | 'error' };
export type CastFinish = { ok: true; landed: true; speciesId: string; lengthCm: number; rarity: FishRarity; isNew: boolean; isBig: boolean; isPersonalBest: boolean; remaining: number } | { ok: true; landed: false } | { ok: false };
export interface ClassFishBoard { rows: { speciesId: string; lengthCm: number; animal: string; caughtAt: string }[]; classSpecies: number }
export interface FishingAdapter { state(): Promise<FishingState>; start(pet: string | null): Promise<CastStart>; finish(castId: string, landed: boolean): Promise<CastFinish>; board(): Promise<ClassFishBoard> }
/** 관리자 시험용 시계·날씨 덮어쓰기(관리자만 서버가 받아 준다). */
export interface FishingOverride { clock?: string; weather?: FishWeather }
