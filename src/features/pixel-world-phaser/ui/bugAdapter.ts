// 잠자리 서버 계약(2026-10-11). 실제 Supabase 구현·모의 어댑터는 서버 워커가 이 파일에 채운다.
import type { BugId } from '../logic/bugCatalog';
import type { GamePointsResult } from '../logic/gamePoints';
import type { XpGain } from './fishingAdapter';

export interface BugAlbumEntry { bugId: BugId; count: number; firstAt: string }
export interface BugState { netOwned: boolean; album: BugAlbumEntry[] }
export type BugStart = { ok: true; catchId: string; bugId: BugId; difficulty: number } | { ok: false; reason: 'no_net' | 'pending' | 'error' };
export type BugFinish = { ok: true; caught: true; bugId: BugId; isNew: boolean; xpGain?: XpGain; points?: GamePointsResult } | { ok: true; caught: false } | { ok: false };
export interface BugAdapter {
  state(): Promise<BugState>;
  /** scene: 'yard' | 'plaza' | 'river' — 어디서 잡았는지 기록용. */
  start(scene: string): Promise<BugStart>;
  finish(catchId: string, caught: boolean): Promise<BugFinish>;
}
