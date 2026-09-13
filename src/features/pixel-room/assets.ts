// Original CC0 atlases. See docs/pixel-room-assets.md for provenance and geometry.
import sheet0 from './assets/character/Character_Idle_Back-Sheet.png';
import sheet1 from './assets/character/Character_Idle_Front-Sheet.png';
import sheet2 from './assets/character/Character_Idle_Left-Sheet.png';
import sheet3 from './assets/character/Character_Idle_Right-Sheet.png';
import sheet4 from './assets/character/Character_Walk_Back-Sheet.png';
import sheet5 from './assets/character/Character_Walk_Front-Sheet.png';
import sheet6 from './assets/character/Character_Walk_Left-Sheet.png';
import sheet7 from './assets/character/Character_Walk_Right-Sheet.png';
import sheet8 from './assets/character/Clothing_Bottoms_Idle_Back-Sheet.png';
import sheet9 from './assets/character/Clothing_Bottoms_Idle_Front-Sheet.png';
import sheet10 from './assets/character/Clothing_Bottoms_Idle_Left-Sheet.png';
import sheet11 from './assets/character/Clothing_Bottoms_Idle_Right-Sheet.png';
import sheet12 from './assets/character/Clothing_Bottoms_Walk_Back-Sheet.png';
import sheet13 from './assets/character/Clothing_Bottoms_Walk_Front-Sheet.png';
import sheet14 from './assets/character/Clothing_Bottoms_Walk_Left-Sheet.png';
import sheet15 from './assets/character/Clothing_Bottoms_Walk_Right-Sheet.png';
import sheet16 from './assets/character/Clothing_Shoes_Idle_Back-Sheet.png';
import sheet17 from './assets/character/Clothing_Shoes_Idle_Front-Sheet.png';
import sheet18 from './assets/character/Clothing_Shoes_Idle_Left-Sheet.png';
import sheet19 from './assets/character/Clothing_Shoes_Idle_Right-Sheet.png';
import sheet20 from './assets/character/Clothing_Shoes_Walk_Back-Sheet.png';
import sheet21 from './assets/character/Clothing_Shoes_Walk_Front-Sheet.png';
import sheet22 from './assets/character/Clothing_Shoes_Walk_Left-Sheet.png';
import sheet23 from './assets/character/Clothing_Shoes_Walk_Right-Sheet.png';
import sheet24 from './assets/character/Clothing_Top_Idle_Back-Sheet.png';
import sheet25 from './assets/character/Clothing_Tops_Idle_Front-Sheet.png';
import sheet26 from './assets/character/Clothing_Tops_Idle_Left-Sheet.png';
import sheet27 from './assets/character/Clothing_Tops_Idle_Right-Sheet.png';
import sheet28 from './assets/character/Clothing_Tops_Walk_Back-Sheet.png';
import sheet29 from './assets/character/Clothing_Tops_Walk_Front-Sheet.png';
import sheet30 from './assets/character/Clothing_Tops_Walk_Left-Sheet.png';
import sheet31 from './assets/character/Clothing_Tops_Walk_Right-Sheet.png';
import sheet32 from './assets/character/Eyes_Idle_Front-Sheet.png';
import sheet33 from './assets/character/Eyes_Idle_Left-Sheet.png';
import sheet34 from './assets/character/Eyes_Idle_Right-Sheet.png';
import sheet35 from './assets/character/Eyes_Walk_Front-Sheet.png';
import sheet36 from './assets/character/Eyes_Walk_Left-Sheet.png';
import sheet37 from './assets/character/Eyes_Walk_Right-Sheet.png';
import sheet38 from './assets/character/Hair_Idle_Back-Sheet.png';
import sheet39 from './assets/character/Hair_Idle_Front-Sheet.png';
import sheet40 from './assets/character/Hair_Idle_Left-Sheet.png';
import sheet41 from './assets/character/Hair_Idle_Right-Sheet.png';
import sheet42 from './assets/character/Hair_Walk_Back-Sheet.png';
import sheet43 from './assets/character/Hair_Walk_Front-Sheet.png';
import sheet44 from './assets/character/Hair_Walk_Left-Sheet.png';
import sheet45 from './assets/character/Hair_Walk_Right-Sheet.png';
import interior from './assets/interior/source-17655392.png';
import decorations from './assets/interior/source-17737185.png';
import type { PixelAvatarSlot } from './shop/types';

export type AvatarAnimation = 'Idle' | 'Walk';
export type AvatarDirection = 'Front' | 'Back' | 'Left' | 'Right';
export interface AvatarLayers { body: string; tops: string; bottoms: string; shoes: string; hair: string; eyes: string }

export const avatarSheets: Record<AvatarAnimation, Record<AvatarDirection, AvatarLayers>> = {
  Idle: {
    Front: { body: sheet1, tops: sheet25, bottoms: sheet9, shoes: sheet17, hair: sheet39, eyes: sheet32 },
    Back: { body: sheet0, tops: sheet24, bottoms: sheet8, shoes: sheet16, hair: sheet38, eyes: '' },
    Left: { body: sheet2, tops: sheet26, bottoms: sheet10, shoes: sheet18, hair: sheet40, eyes: sheet33 },
    Right: { body: sheet3, tops: sheet27, bottoms: sheet11, shoes: sheet19, hair: sheet41, eyes: sheet34 },
  },
  Walk: {
    Front: { body: sheet5, tops: sheet29, bottoms: sheet13, shoes: sheet21, hair: sheet43, eyes: sheet35 },
    Back: { body: sheet4, tops: sheet28, bottoms: sheet12, shoes: sheet20, hair: sheet42, eyes: '' },
    Left: { body: sheet6, tops: sheet30, bottoms: sheet14, shoes: sheet22, hair: sheet44, eyes: sheet36 },
    Right: { body: sheet7, tops: sheet31, bottoms: sheet15, shoes: sheet23, hair: sheet45, eyes: sheet37 },
  },
};

export const avatarGeometry = { frameWidth: 32, frameHeight: 32, frames: 4, sheetWidth: 128 } as const;

// assetKey -> sheet row, per equip slot (PixelAvatarSlot from the Phase 1 shared contract).
// Row 0 is always today's default look for every slot (top 'default' plus the only row ever
// drawn for bottom/shoes/hair/eyes so far), so an unrecognized or unset assetKey/slot safely
// falls back to row 0 in sprites.tsx's rowForSlot() rather than throwing. itemId is NOT the key
// here — PixelItem.assetKey is (per shop/types.ts), matching model.ts's legacy SHIRTS values for
// 'top' so the pre-Phase-1 local shirt picker keeps working unchanged.
//
// Row-count audit (2026-09-13, decoded real PNG pixels — see worker report for full detail):
// every sheet below has far more pre-drawn rows than are wired up here. Candidates for a future
// PIXEL_CATALOG expansion (Integration Lead decides, per shop/catalog.ts's note — not added here):
//   top:    29 rows total. Rows 0-20 = 21 distinct colors (one sleeve style); rows 21-28 = the
//           same first 8 colors redrawn in a second (sleeveless/cropped) style. Only 0/1/2 wired.
//   bottom: 14 rows total. Rows 0-7 = 8 colors (style A); rows 8-13 = 6 colors, different
//           silhouette (style B, denim/sweatpants-like). None wired (always row 0).
//   shoes:  10 rows total. Rows 0-4 and 5-9 = the same 5 colors in two shoe silhouettes.
//           None wired (always row 0).
//   hair:   25 rows total = 5 hairstyles x 5 colors each (brown/ginger/blonde/black/gray,
//           consistent per style). None wired (always row 0).
//   eyes:    4 rows total = 4 eye colors. None wired (always row 0).
//   body:    5 rows total = 5 skin tones. Not a PixelAvatarSlot in the v1 contract (no catalog
//            slot for skin tone) — left at row 0, not part of this mapping.
// All rows within each sheet were byte-compared and are genuinely distinct art (no blank/
// duplicate padding rows found in the samples checked).
export const AVATAR_ROW_BY_SLOT: Record<PixelAvatarSlot, Record<string, number>> = {
  top: { default: 0, sage: 1, blue: 2 },
  bottom: {},
  shoes: {},
  hair: {},
  eyes: {},
};

export interface FurnitureArt { src: string; x: number; y: number; width: number; height: number; sheetWidth: number; sheetHeight: number }
export const furnitureArt: Record<string, FurnitureArt> = {
  bed: { src: interior, x: 0, y: 32, width: 32, height: 48, sheetWidth: 256, sheetHeight: 256 },
  desk: { src: interior, x: 128, y: 128, width: 48, height: 32, sheetWidth: 256, sheetHeight: 256 },
  chair: { src: interior, x: 128, y: 48, width: 16, height: 32, sheetWidth: 256, sheetHeight: 256 },
  bookshelf: { src: interior, x: 176, y: 80, width: 16, height: 48, sheetWidth: 256, sheetHeight: 256 },
  plant: { src: decorations, x: 112, y: 48, width: 16, height: 32, sheetWidth: 128, sheetHeight: 128 },
  decoration: { src: decorations, x: 96, y: 0, width: 32, height: 32, sheetWidth: 128, sheetHeight: 128 },
};
