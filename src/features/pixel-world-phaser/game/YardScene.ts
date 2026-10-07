// 앞마당 그림: 기존 마당과 같은 타일·집·나무·울타리·밭·허수아비. 움직임/출구/대화는 WorldScene이 맡는다.
import type Phaser from 'phaser';
import { BED_CELLS, BIG_TREES, FENCE_ROWS, WORLD_COLS, WORLD_HEIGHT, WORLD_ROWS, WORLD_WIDTH, borderTrees, groundTile, toWorldCell } from '../logic/yardWorld';
import { TILE } from '../logic/world';
import { SCARECROW_CELL } from '../../pixel-room/farm/farmModel';
import { WorldScene } from './WorldScene';
import type { WorldContext } from './WorldScene';

export class YardScene extends WorldScene {
  protected readonly background = '#5d8a4a';
  private beds: Phaser.GameObjects.Image[] = [];

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
    this.beds = [];
    this.setBeds(this.ctx.data.beds);
    const scarecrow = toWorldCell(SCARECROW_CELL);
    this.add.image(scarecrow.x * TILE + TILE / 2, (scarecrow.y + 1) * TILE, 'scarecrow').setOrigin(0.5, 1).setDepth((scarecrow.y + 1) * TILE - 1);
  }

  protected worldSize() { return { width: WORLD_WIDTH, height: WORLD_HEIGHT }; }

  refreshData() { this.setBeds(this.ctx.data.beds); }

  private setBeds(images: HTMLImageElement[]) {
    this.beds.forEach(bed => bed.destroy());
    this.beds = [];
    images.forEach((image, index) => {
      const cell = BED_CELLS[index];
      if (!cell) return;
      const key = `bed:${index}:${image.src.length}:${hash(image.src)}`;
      if (!this.textures.exists(key)) this.textures.addImage(key, image);
      this.beds.push(this.add.image(cell.x * TILE, cell.y * TILE, key).setOrigin(0, 0).setDepth((cell.y + 2) * TILE - 3));
    });
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

function hash(text: string): number { let h = 0; for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0; return h >>> 0; }
