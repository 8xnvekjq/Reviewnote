// 내 방 그림: 기존 방(CSS)과 같은 느낌 — 베이지 벽 + 창문, 밝은 나무 마루, 아래 가운데 문 매트 — 을
// 원본 interior 아틀라스(floors-walls / furniture / small-items)에서 잘라 그린다. 가구는 학생이 서버에
// 저장한 배치를 그린다. 움직임/충돌/출구/대화는 WorldScene이 맡는다.
import type Phaser from 'phaser';
import { furnitureArt } from '../../pixel-room/assets';
import type { Placement } from '../../pixel-room/model';
import { ROOM_HEIGHT, ROOM_WIDTH } from '../../pixel-room/model';
import { roomPoint } from '../logic/roomEditing';
import { cellOf } from '../logic/world';
import { ROOM_COLS, ROOM_DOOR, ROOM_ROWS, ROOM_WALL, furnitureSprite, roomToWorld, sanitizeFurniture } from '../logic/roomWorld';
import { TILE } from '../logic/world';
import { WorldScene } from './WorldScene';
import type { WorldContext } from './WorldScene';

export class RoomScene extends WorldScene {
  protected readonly background = '#2b1d16';
  private furniture: Phaser.GameObjects.Image[] = [];

  private grid: Phaser.GameObjects.Graphics | null = null;

  constructor(ctx: WorldContext) { super('room', ctx); }

  protected drawWorld() {
    if (!this.textures.exists('room-bg')) this.textures.addCanvas('room-bg', this.drawRoom());
    this.add.image(0, 0, 'room-bg').setOrigin(0, 0).setDepth(-1000);
    this.furniture = [];
    this.grid = null;
    this.drawFurniture();
  }

  /** 서버에서 가구 배치가 새로 왔을 때: 충돌/살펴보기 대상도 같이 다시 만든다. */
  refreshData() {
    this.rebuildSpec();
    this.drawFurniture();
  }

  /** 바닥 안내선만 표시한다. 가구는 저장 성공 후에만 바꾼다. */
  setRoomPlacing(active: boolean) {
    this.setPlacingActors(active);
    this.grid?.destroy(); this.grid = null;
    if (!active) return;
    const grid = this.add.graphics().setDepth(99998);
    grid.lineStyle(0.5, 0xfff4d9, 0.45);
    for (let x = 0; x <= ROOM_WIDTH; x++) grid.lineBetween((x + 1) * TILE, 2 * TILE, (x + 1) * TILE, (2 + ROOM_HEIGHT) * TILE);
    for (let y = 0; y <= ROOM_HEIGHT; y++) grid.lineBetween(TILE, (y + 2) * TILE, (ROOM_WIDTH + 1) * TILE, (y + 2) * TILE);
    this.grid = grid;
  }

  editPoint(x: number, y: number) {
    // CSS 크기와 캔버스 크기를 축별로 변환한다. 소수 DPR의 반올림도 반영한다.
    const rect = this.game.canvas.getBoundingClientRect();
    const world = this.cameras.main.getWorldPoint(x * this.scale.width / rect.width, y * this.scale.height / rect.height);
    const actor = cellOf(this.feet);
    return { point: roomPoint(world), actor: { x: actor.x - 1, y: actor.y - 2 } };
  }

  private drawFurniture() {
    this.furniture.forEach(image => image.destroy());
    this.furniture = sanitizeFurniture(this.ctx.data.furniture).map(item => {
      const key = this.furnitureTexture(item);
      const sprite = furnitureSprite(item);
      // 아래 끝 기준 깊이 — 가구 뒤(위쪽 칸)에 서면 가려지고, 앞(아래 칸)에 서면 앞에 보인다.
      return this.add.image(sprite.x, sprite.bottom, key).setOrigin(0, 1).setDisplaySize(sprite.width, sprite.height).setDepth(sprite.bottom - 1);
    });
  }

  /** 가구 종류별로 아틀라스에서 한 번만 잘라 텍스처로 만든다. */
  private furnitureTexture(item: Placement): string {
    const key = `furniture:${item.type}`;
    if (this.textures.exists(key)) return key;
    const art = furnitureArt[item.type];
    const sheet = this.ctx.assets.furniture.get(art.src);
    const canvas = document.createElement('canvas');
    canvas.width = art.width; canvas.height = art.height;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    if (sheet) ctx.drawImage(sheet, art.x, art.y, art.width, art.height, 0, 0, art.width, art.height);
    this.textures.addCanvas(key, canvas);
    return key;
  }

  /** 벽·바닥·문턱·매트를 캔버스 한 장으로(가구와 무관해서 한 번만 그린다). */
  private drawRoom(): HTMLCanvasElement {
    const width = ROOM_COLS * TILE, height = ROOM_ROWS * TILE;
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const floors = this.ctx.assets.floors;
    const right = (ROOM_COLS - 1) * TILE, bottom = (ROOM_ROWS - 1) * TILE;
    // 옆벽/아래 문턱: 기존 방 테두리 나무색.
    ctx.fillStyle = '#8a6653'; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#6f4f3d'; ctx.fillRect(TILE - 2, 0, 2, height); ctx.fillRect(right, 0, 2, height);
    // 윗벽(2칸): floors-walls 아틀라스의 베이지 회벽 — 위 몰딩 9px + 벽면 18px + 걸레받이 5px.
    for (let col = 1; col < ROOM_COLS - 1; col++) {
      const sx = 17 + (col % 3) * 16, dx = col * TILE;
      ctx.drawImage(floors, sx, 16, 16, 9, dx, 0, 16, 9);
      ctx.drawImage(floors, sx, 25, 16, 18, dx, 9, 16, 18);
      ctx.drawImage(floors, sx, 75, 16, 5, dx, 27, 16, 5);
    }
    // 창문(기존 CSS 창문과 같은 색): 나무 틀 + 4칸 유리.
    const wx = TILE + 24, wy = 4;
    ctx.fillStyle = '#b4a083'; ctx.fillRect(wx + 2, wy + 2, 24, 20);
    ctx.fillStyle = '#94785a'; ctx.fillRect(wx, wy, 24, 20);
    for (let i = 0; i < 4; i++) {
      const px = wx + 3 + (i % 2) * 9, py = wy + 3 + Math.floor(i / 2) * 7;
      ctx.fillStyle = '#d4e9df'; ctx.fillRect(px, py, 8, 6);
      ctx.fillStyle = '#a9d4dc'; ctx.fillRect(px, py, 5, 6); ctx.fillRect(px + 5, py, 1, 3);
    }
    // 바닥: 밝은 나무 마루(아틀라스의 밝은 판자, 8px 주기라 16px 타일로 이음매 없이 반복).
    for (let row = ROOM_WALL; row < ROOM_ROWS - 1; row++) for (let col = 1; col < ROOM_COLS - 1; col++) {
      ctx.drawImage(floors, 225, 32, 16, 16, col * TILE, row * TILE, TILE, TILE);
    }
    // 벽과 바닥 사이 그늘 한 줄.
    ctx.fillStyle = 'rgba(90,60,40,.25)'; ctx.fillRect(TILE, ROOM_WALL * TILE, right - TILE, 2);
    // 아래 문턱 + 문 칸은 밝게 트인 출입구.
    const door = roomToWorld(ROOM_DOOR);
    ctx.fillStyle = '#987052'; ctx.fillRect(TILE, bottom, right - TILE, TILE);
    ctx.fillStyle = '#b68c63'; ctx.fillRect(TILE, bottom, right - TILE, 2);
    ctx.fillStyle = '#d7b889'; ctx.fillRect(door.x * TILE, bottom, TILE, TILE);
    // 문 매트 — 기존 방과 같은 러그(48×32)를 문 칸 가운데 2칸 너비로, 아래 끝 맞춤.
    const mat = this.ctx.assets.interior;
    ctx.drawImage(mat, 48, 144, 48, 32, (door.x - 0.5) * TILE, (door.y + 1) * TILE - 21, 32, 21);
    return canvas;
  }
}
