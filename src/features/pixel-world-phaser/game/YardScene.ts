// 앞마당 그림: 기존 마당과 같은 타일·집·나무·울타리·허수아비, 그리고 오른쪽 아래 텃밭(울타리 + 칸마다 흙·작물).
// 움직임/출구/대화는 WorldScene이 맡는다. 텃밭에서는 바라보는(또는 서 있는) 칸에 테두리를 그리고 셸에 알린다.
import type Phaser from 'phaser';
import { BIG_TREES, FENCE_ROWS, GARDEN_AREA, KIOSK, MARGIN, RIVER_SIGN, RIVER_EXIT, GATE, WORLD_COLS, WORLD_HEIGHT, WORLD_ROWS, WORLD_WIDTH, borderTrees, gardenIndexAtWorld, gardenTarget, gardenWorldCell, groundTile, nearGarden, toWorldCell } from '../logic/yardWorld';
import { TILE, cellCenter, cellOf, facingToward } from '../logic/world';
import type { Point } from '../logic/joystick';
import { SCARECROW_CELL } from '../../pixel-room/farm/farmModel';
import { GARDEN_INDEXES, isGardenGate } from '../../pixel-room/farm/gardenModel';
import type { GardenLook } from '../../pixel-room/farm/gardenModel';
import { cropTextureKey } from '../logic/gardenSprites';
import { ensureGardenTextures, fenceKey } from './gardenArt';

const isGardenFenceGap = (x: number, y: number) => isGardenGate({ x: x - MARGIN, y: y - MARGIN });
import { WorldScene } from './WorldScene';
import type { WorldContext } from './WorldScene';

const REDUCED_MOTION = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export class YardScene extends WorldScene {
  protected readonly background = '#5d8a4a';
  private gardenImages: Phaser.GameObjects.Image[] = [];
  private gardenKeys: string[] = [];
  private cursor!: Phaser.GameObjects.Graphics;
  private garden: { near: boolean; target: number | null; cursor: boolean } = { near: false, target: null, cursor: false };

  constructor(ctx: WorldContext) { super('yard', ctx); }

  protected drawWorld() {
    const { textures } = this;
    if (!textures.exists('town')) {
      const town = textures.addSpriteSheet('town', this.ctx.assets.town, { frameWidth: 16, frameHeight: 16 });
      town?.add('tree', 0, 64, 0, 16, 32);
    }
    if (!textures.exists('yard-ground')) textures.addCanvas('yard-ground', this.drawGround());
    if (!textures.exists('house')) textures.addCanvas('house', this.drawHouse());
    if (!textures.exists('scarecrow')) textures.addImage('scarecrow', this.ctx.assets.scarecrow);

    this.add.image(0, 0, 'yard-ground').setOrigin(0, 0).setDepth(-1000);
    // 집(타일 3×3을 2배로 — 기존 마당과 같은 크기/위치). 깊이는 집 아래 끝 — 문 칸을 밟으면 집 뒤로 쏙 들어간다.
    const houseCell = toWorldCell({ x: 3, y: 1 });
    this.add.image(houseCell.x * TILE, houseCell.y * TILE, 'house').setOrigin(0, 0).setScale(2).setDepth((houseCell.y + 6) * TILE);
    for (const tree of borderTrees()) this.add.image(tree.x * TILE + TILE / 2, tree.y * TILE, 'town', 'tree').setOrigin(0.5, 1).setDepth(tree.y * TILE - 2);
    for (const tree of BIG_TREES) {
      const cell = toWorldCell(tree);
      this.add.image(cell.x * TILE, cell.y * TILE, 'town', 'tree').setOrigin(0, 0).setScale(2).setDepth((cell.y + 4) * TILE - 2);
    }
    for (const row of FENCE_ROWS) [80, 81, 81, 82].forEach((frame, i) => {
      const cell = toWorldCell({ x: 10 + i, y: row });
      this.add.image(cell.x * TILE, cell.y * TILE, 'town', frame).setOrigin(0, 0).setDepth((cell.y + 1) * TILE - 4);
    });
    ensureGardenTextures(textures);
    this.drawGardenFence();
    this.cursor = this.add.graphics().setDepth(-400);
    this.gardenImages = []; this.gardenKeys = [];
    this.garden = { near: false, target: null, cursor: false };
    this.setGarden(this.ctx.data.garden);
    // 관리자 마당에만: 문 오른쪽의 관리자 자판기(조각 현황·날씨 관리).
    if (this.ctx.data.admin) {
      if (!textures.exists('kiosk')) textures.addCanvas('kiosk', drawKiosk());
      const kiosk = this.add.image(KIOSK.x * TILE + TILE / 2, (KIOSK.y + 1) * TILE, 'kiosk').setOrigin(0.5, 1).setDepth((KIOSK.y + 1) * TILE - 1);
      this.tweens.add({ targets: kiosk, alpha: { from: 1, to: .92 }, duration: 1200, yoyo: true, repeat: -1 });
    }
    const scarecrow = toWorldCell(SCARECROW_CELL);
    this.add.image(scarecrow.x * TILE + TILE / 2, (scarecrow.y + 1) * TILE, 'scarecrow').setOrigin(0.5, 1).setDepth((scarecrow.y + 1) * TILE - 1);
    // 작은 나무 안내판과 출구의 반짝이는 화살표.
    const sx = RIVER_SIGN.x * TILE, sy = RIVER_SIGN.y * TILE;
    this.add.rectangle(sx + 8, sy + 9, 3, 14, 0x795132).setDepth(sy + 15);
    this.add.rectangle(sx + 8, sy + 1, 46, 11, 0x62452d).setDepth(sy + 16);
    this.add.rectangle(sx + 8, sy, 44, 9, 0xc99a61).setDepth(sy + 17);
    this.add.text(sx + 8, sy, '강가 (낚시터) →', { fontFamily: 'sans-serif', fontSize: '6px', color: '#382918', resolution: 4 }).setOrigin(.5).setDepth(sy + 18);
    const hint = this.add.text((RIVER_EXIT.x + .5) * TILE, (RIVER_EXIT.y + .5) * TILE, '→', { fontSize: '13px', color: '#fff2b9', stroke: '#946e38', strokeThickness: 1 }).setOrigin(.5).setDepth(-900);
    const gateHint = this.add.text((GATE.x + .5) * TILE, (GATE.y + .5) * TILE, '↓', { fontSize: '13px', color: '#fff2b9', stroke: '#946e38', strokeThickness: 1 }).setOrigin(.5).setDepth(-900);
    this.tweens.add({ targets: gateHint, alpha: .35, y: gateHint.y + 3, duration: 850, yoyo: true, repeat: -1 });
    this.tweens.add({ targets: hint, alpha: .35, x: hint.x + 3, duration: 850, yoyo: true, repeat: -1 });
  }

  protected worldSize() { return { width: WORLD_WIDTH, height: WORLD_HEIGHT }; }

  refreshData() { this.setGarden(this.ctx.data.garden); }

  snapshot() {
    const points = Object.fromEntries(GARDEN_INDEXES.map(index => [index, this.screenPoint(cellCenter(gardenWorldCell(index)))]));
    return { ...super.snapshot(), garden: { ...this.garden, cells: [...this.gardenKeys], points } };
  }

  /** 텃밭 울타리: 둘레 칸마다 기둥 + 옆 울타리 칸 쪽으로 가로대. 윗줄 가운데 두 칸은 드나드는 문으로 비운다. */
  private drawGardenFence() {
    const { x: x0, y: y0, cols, rows } = GARDEN_AREA;
    const fenced = (x: number, y: number) => x >= x0 && y >= y0 && x < x0 + cols && y < y0 + rows
      && (x === x0 || y === y0 || x === x0 + cols - 1 || y === y0 + rows - 1) && !isGardenFenceGap(x, y);
    for (let y = y0; y < y0 + rows; y++) for (let x = x0; x < x0 + cols; x++) {
      if (!fenced(x, y)) continue;
      const key = fenceKey({ n: fenced(x, y - 1), e: fenced(x + 1, y), s: fenced(x, y + 1), w: fenced(x - 1, y) });
      this.add.image(x * TILE, y * TILE, key).setOrigin(0, 0).setDepth((y + 1) * TILE - 4);
    }
  }

  /** 칸마다 흙(간 흙: 마름/젖음)·작물·스프링클러를 다시 놓는다. 모습이 하나도 안 바뀌었으면 그대로 둔다. */
  private setGarden(look: GardenLook | undefined) {
    const cells = look?.cells ?? [];
    const keys = cells.map(cell => [cell.soil === 'tilled' ? (cell.wet ? 'garden:soil:wet' : 'garden:soil:dry') : '',
      cell.sprinkler ? 'garden:sprinkler' : '', cell.crop ? cropTextureKey(cell.crop.type, cell.crop.stage, cell.crop.late) : ''].join('|'));
    if (keys.length === this.gardenKeys.length && keys.every((key, i) => key === this.gardenKeys[i])) return;
    this.gardenImages.forEach(image => image.destroy());
    this.gardenImages = [];
    cells.forEach((cell, i) => {
      const at = gardenWorldCell(cell.index);
      const [soilKey, sprinklerKey, cropKey] = keys[i].split('|');
      if (soilKey) this.gardenImages.push(this.add.image(at.x * TILE, at.y * TILE, soilKey).setOrigin(0, 0).setDepth(-500));
      const bottom = (at.y + 1) * TILE - 1;
      for (const key of [sprinklerKey, cropKey]) if (key) {
        this.gardenImages.push(this.add.image(at.x * TILE + TILE / 2, bottom, key).setOrigin(0.5, 1).setDepth(bottom - 2));
      }
    });
    this.gardenKeys = keys;
  }

  /** 도구 막대를 띄울지(텃밭 가까이), 어느 칸에 쓸지 — 바뀔 때만 셸에 알린다. 도구를 골랐으면 그 칸에 테두리. */
  protected afterStep() {
    const near = nearGarden(cellOf(this.feet));
    const target = near ? gardenTarget(this.feet, this.facing) : null;
    const cursor = target !== null && !!this.ctx.gardenTool;
    if (near === this.garden.near && target === this.garden.target && cursor === this.garden.cursor) return;
    this.cursor.clear();
    if (cursor) {
      const at = gardenWorldCell(target!);
      this.cursor.lineStyle(1, 0xfff4d9, 0.95).strokeRect(at.x * TILE + 0.5, at.y * TILE + 0.5, TILE - 1, TILE - 1);
      this.cursor.fillStyle(0xfff4d9, 0.18).fillRect(at.x * TILE + 1, at.y * TILE + 1, TILE - 2, TILE - 2);
    }
    const changed = near !== this.garden.near || target !== this.garden.target;
    this.garden = { near, target, cursor };
    if (changed) this.ctx.hooks.onGarden?.({ near, target });
  }
  /** 도구를 고른 채 밭 칸을 찍으면 그 칸 앞(또는 그 칸 위)에서 쓴다. */
  protected tapTarget(cell: Point): string | null {
    if (!this.ctx.gardenTool) return null;
    const index = gardenIndexAtWorld(cell);
    return index === null ? null : `garden:${index}`;
  }
  protected arriveTap(id: string) {
    const index = Number(id.split(':')[1]);
    if (!id.startsWith('garden:') || !Number.isInteger(index)) return;
    const at = gardenWorldCell(index), here = cellOf(this.feet);
    if (here.x !== at.x || here.y !== at.y) this.facing = facingToward(this.feet, cellCenter(at));
    this.playAvatar(false, 1);
    this.afterStep();
    this.ctx.hooks.onGardenUse?.(index);
  }
  protected petAvoid(point: Point) { return gardenIndexAtWorld(cellOf(point)) !== null; }

  /** 도구를 쓴 뒤: 흙먼지·물방울·새싹 반짝임. 수확이면 열매가 톡 튀어 올랐다가 캐릭터(가방) 쪽으로 쏙 들어간다. */
  gardenFx(index: number, action: string, crop?: string) {
    if (this.spec.id !== 'yard') return;
    const at = gardenWorldCell(index);
    const x = at.x * TILE + TILE / 2, y = at.y * TILE + TILE / 2;
    if (action !== 'harvest') {
      this.sparkles(x, y + 4, action === 'water' ? 0x83d9fa : action === 'till' ? 0xc2986a : action.startsWith('plant') ? 0x70a747 : 0xdfe6ea);
      return;
    }
    const pop = this.add.image(x, y - 4, `garden:pop:${crop === 'strawberry' ? 'strawberry' : 'tomato'}`).setScale(2).setDepth(99999);
    if (REDUCED_MOTION) { this.time.delayedCall(500, () => pop.destroy()); return; }
    this.tweens.add({ targets: pop, y: y - 20, duration: 220, ease: 'Quad.easeOut', onComplete: () => {
      this.tweens.add({ targets: pop, x: this.feet.x, y: this.feet.y - 14, scale: 0.6, alpha: 0.2, duration: 320, ease: 'Quad.easeIn', onComplete: () => pop.destroy() });
    } });
  }

  private drawGround(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = WORLD_WIDTH; canvas.height = WORLD_HEIGHT;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const town = this.ctx.assets.town;
    for (let y = 0; y < WORLD_ROWS; y++) for (let x = 0; x < WORLD_COLS; x++) {
      const id = groundTile(x, y);
      ctx.drawImage(town, (id % 12) * 16, Math.floor(id / 12) * 16, 16, 16, x * TILE, y * TILE, TILE, TILE);
    }
    // 문 앞 매트 — 기존 마당과 같은 interior 러그(48×32)를 2×1칸 상자에 비율 유지로 넣는다.
    const mat = toWorldCell({ x: 5.5, y: 7 });
    ctx.drawImage(this.ctx.assets.interior, 48, 144, 48, 32, mat.x * TILE + 4, mat.y * TILE, 24, 16);
    return canvas;
  }

  private drawHouse(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = 48; canvas.height = 48;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    [52, 53, 54, 64, 65, 66, 84, 86, 84].forEach((id, i) => {
      ctx.drawImage(this.ctx.assets.town, (id % 12) * 16, Math.floor(id / 12) * 16, 16, 16, (i % 3) * 16, Math.floor(i / 3) * 16, 16, 16);
    });
    return canvas;
  }
}

/** 16×26 픽셀 자판기: 보라 몸통, 유리창 속 음료 3단, 위에 지식의 조각 간판, 아래 꺼내는 구멍. */
function drawKiosk(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 16; canvas.height = 26;
  const c = canvas.getContext('2d')!;
  const px = (x: number, y: number, w: number, h: number, color: string) => { c.fillStyle = color; c.fillRect(x, y, w, h); };
  px(1, 4, 14, 22, '#2a1450');            // 테두리
  px(2, 5, 12, 20, '#5a2aa8');            // 몸통
  px(2, 5, 1, 20, '#7c4ddb');             // 왼쪽 빛
  px(3, 7, 7, 11, '#c9e6ff');             // 유리창
  ['#e05a5a', '#ecbe40', '#5aa0e0'].forEach((color, row) => {
    for (let i = 0; i < 3; i++) px(4 + i * 2, 8 + row * 3, 1, 2, color);
    px(3, 10 + row * 3, 7, 1, '#8fb3d6');
  });
  px(11, 7, 2, 6, '#3b1678');             // 버튼판
  px(11, 8, 2, 1, '#ecbe40'); px(11, 10, 2, 1, '#e6d6ff');
  px(11, 14, 2, 2, '#ecbe40');            // 동전 넣는 곳
  px(3, 20, 10, 3, '#1b0c36');            // 꺼내는 구멍
  px(1, 25, 14, 1, '#1b0c36');
  // 간판: 작은 조각 아이콘
  px(5, 0, 6, 5, '#2a1450'); px(6, 1, 4, 3, '#e6d6ff');
  px(7, 1, 2, 1, '#a878f0'); px(7, 2, 1, 1, '#e6d6ff'); px(8, 2, 1, 1, '#5a2aa8'); px(7, 3, 2, 1, '#8a52e0');
  return canvas;
}
