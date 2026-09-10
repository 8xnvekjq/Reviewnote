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
// Row numbers are zero based. Tops 0/1/2 are the red/green/blue short-sleeve variations.
export const avatarTopRows = { red: 0, green: 1, blue: 2 } as const;

export interface FurnitureArt { src: string; x: number; y: number; width: number; height: number; sheetWidth: number; sheetHeight: number }
export const furnitureArt: Record<string, FurnitureArt> = {
  bed: { src: interior, x: 0, y: 32, width: 32, height: 48, sheetWidth: 256, sheetHeight: 256 },
  desk: { src: interior, x: 128, y: 128, width: 48, height: 32, sheetWidth: 256, sheetHeight: 256 },
  chair: { src: interior, x: 128, y: 48, width: 16, height: 32, sheetWidth: 256, sheetHeight: 256 },
  bookshelf: { src: interior, x: 176, y: 80, width: 16, height: 48, sheetWidth: 256, sheetHeight: 256 },
  plant: { src: decorations, x: 112, y: 48, width: 16, height: 32, sheetWidth: 128, sheetHeight: 128 },
  decoration: { src: decorations, x: 96, y: 0, width: 32, height: 32, sheetWidth: 128, sheetHeight: 128 },
};
