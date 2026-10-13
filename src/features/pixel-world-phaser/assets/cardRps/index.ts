import cards from './cards.png';
import table from './table.png';
import glow from './glow.png';
import clash from './clash.png';
import faces from './faces.png';
import duelBubble from './duel-bubble.png';
import mouseDealer from './mouse-dealer.png';
import cardTableProp from './card-table-prop.png';
import ruleSign from './rule-sign.png';
import rules1 from './rules-1.webp';
import rules2 from './rules-2.webp';

export const cardRpsAssets = { cards, table, glow, clash, faces, duelBubble, mouseDealer, cardTableProp, ruleSign, rules1, rules2 } as const;
export const CARD_W = 32;
export const CARD_H = 44;
export const CARD_COLUMNS = 4;
export const CARD_ROWS = { player: 0, opponent: 1 } as const;
export const CARD_ORDER = ['rock', 'scissors', 'paper', 'back'] as const;
export const CLASH_FRAME_W = 32;
export const CLASH_FRAME_H = 32;
export const CLASH_FRAMES = 4;
export const FACE_W = 24;
export const FACE_H = 16;
export const FACE_ORDER = ['lose', 'win', 'draw'] as const;
export const DUEL_BUBBLE_W = 16;
export const DUEL_BUBBLE_H = 16;
export const DUEL_BUBBLE_ORDER = ['rock', 'scissors', 'paper'] as const;
export const MOUSE_DEALER_W = 32;
export const MOUSE_DEALER_H = 40;
export const MOUSE_DEALER_COLUMNS = 4;
export const MOUSE_DEALER_ROWS = { idle: 0, win: 1, lose: 2, shuffle: 3 } as const;

// ── 경기 화면용 고해상도 그림(hd/, scripts/art/card_rps_hd.py 로 만듦) ──
import hdRoom from './hd/room.webp';
import hdCards from './hd/cards.png';
import hdCheese from './hd/cheese.png';
import hdFx from './hd/fx.png';
import hdLayout from './hd/layout.json';

export const cardRpsHd = { room: hdRoom, cards: hdCards, cheese: hdCheese, fx: hdFx } as const;
/** 방 그림 크기(무대 논리 좌표). layout.json 의 값도 이 좌표계. */
export const HD_ROOM_W = 1600;
export const HD_ROOM_H = 1000;
export const HD_LAYOUT = hdLayout;
/** cards.png: 4×2칸(192×256), 열 = 바위·가위·보·뒷면, 행 0 = 나(파랑), 1 = 상대(빨강). */
export const HD_CARD_W = 192;
export const HD_CARD_H = 256;
/** cheese.png: 384×384 다섯 칸, 아래 끝이 칸 바닥(탁자 가장자리). */
export const HD_CHEESE_SIZE = 384;
export const HD_CHEESE_ORDER = ['idle', 'lose', 'win', 'draw', 'shuffle'] as const;
/** fx.png: 256×256 두 칸 — 0 맞붙음 폭발, 1 승리 후광. */
export const HD_FX_SIZE = 256;
