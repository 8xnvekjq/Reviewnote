// 잠자리 잡기 공통 약속(2026-10-11). 무엇이 걸릴지는 서버가 정한다(start_bug_catch).
// 잠자리채(tool_net)를 사야 잡을 수 있다. 광장·마당·낚시터에 가끔 날아다닌다(장면마다 동시에 1~2마리, 잡거나 사라지면 30~60초 뒤 다시).
import type { FishRarity } from '../ui/fishingAdapter';

export type BugId = 'dragonfly_red' | 'dragonfly_wheat' | 'damselfly' | 'dragonfly_king' | 'dragonfly_gold';
export interface BugSpecies { id: BugId; name: string; rarity: FishRarity; stars: number; points: number; xp: number; weight: number }
/** 시트 assets/bugs/dragonflies.png 의 줄 순서와 같다(한 줄 = 날갯짓 4칸, 칸 16×16 → 시트 64×80). */
export const BUG_CATALOG: readonly BugSpecies[] = [
  { id: 'dragonfly_red', name: '고추잠자리', rarity: 'common', stars: 1, points: 2, xp: 5, weight: 50 },
  { id: 'dragonfly_wheat', name: '밀잠자리', rarity: 'uncommon', stars: 2, points: 3, xp: 10, weight: 28 },
  { id: 'damselfly', name: '실잠자리', rarity: 'rare', stars: 3, points: 6, xp: 25, weight: 14 },
  { id: 'dragonfly_king', name: '왕잠자리', rarity: 'legendary', stars: 4, points: 15, xp: 60, weight: 6 },
  { id: 'dragonfly_gold', name: '황금 잠자리', rarity: 'mythic', stars: 5, points: 40, xp: 120, weight: 2 },
];
export const bugById = (id: string) => BUG_CATALOG.find(b => b.id === id);
/** 잠자리채 상점 아이템(광장 상점, 150P). 카탈로그 category 'tool', slot 'tool'. */
export const NET_ITEM_ID = 'tool_net';
export const NET_PRICE = 150;
/** 미니게임: 한 판 10초. 서버는 시작 후 0.6초 전 성공·15초 넘은 결과를 받지 않는다. */
export const BUG_GAME_MS = 10_000;
/** 실시간: 잠자리채 휘두르기 broadcast 이벤트(광장·강가 채널). 마당은 혼자라 보내지 않는다. */
export const NET_SWING_EVENT = 'net-swing';
export interface NetSwingPayload { sessionId: string; direction: 'Front' | 'Back' | 'Left' | 'Right'; at: number }
