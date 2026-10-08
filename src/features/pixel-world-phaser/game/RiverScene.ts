import type Phaser from 'phaser';
import type { Point } from '../logic/joystick';
import { WATER_X, RIVER_COLS, RIVER_ROWS, TURTLE, FISHBOARD, inDock } from '../logic/riverWorld';
import { cellCenter, facingDelta } from '../logic/world';
import { worldTint, fallbackWorldTime } from '../logic/worldTint';
import { preloadFishing, fishingFrames } from './sceneAssets';
import { WorldScene } from './WorldScene';
import type { WorldContext } from './WorldScene';

export interface FishShadow { index: 0 | 1 | 2; size: 'S' | 'M' | 'L'; sparkle: boolean }
type ShadowVisual = { data: FishShadow; body: Phaser.GameObjects.Image | Phaser.GameObjects.Ellipse; sparkle?: Phaser.GameObjects.Graphics };
export class RiverScene extends WorldScene {
  protected readonly background = '#578d78';
  private shadows: ShadowVisual[] = [];
  private desired: FishShadow[] = [];
  private water: Phaser.GameObjects.Image[] = [];
  private ready = false;
  constructor(ctx: WorldContext) { super('river', ctx); }
  preload() { preloadFishing(this); }
  init(data: { entry?: string } | undefined) { super.init(data); this.ready = false; this.shadows = []; this.water = []; }
  protected drawWorld() {
    fishingFrames(this);
    const g = this.add.graphics().setDepth(-1000);
    g.fillStyle(0x6c9858).fillRect(0, 0, RIVER_COLS * 16, RIVER_ROWS * 16);
    for (let y = 0; y < RIVER_ROWS; y++) for (let x = 0; x < RIVER_COLS; x++) {
      const dock = inDock({ x, y }), wet = x >= WATER_X && !dock;
      if (this.textures.exists('fishing:river-tiles') && (wet || dock || x === WATER_X - 1)) {
        const image = this.add.image(x * 16, y * 16, 'fishing:river-tiles', wet ? 'water0' : dock ? '5' : '3').setOrigin(0).setDepth(-999);
        if (wet) this.water.push(image);
      } else {
        g.fillStyle(wet ? 0x448ca3 : dock ? 0xb9905b : x === WATER_X - 1 ? 0xc6be86 : 0x6c9858).fillRect(x * 16, y * 16, 16, 16);
        if (wet && (x + y) % 3 === 0) g.fillStyle(0x80bdc9, 0.5).fillRect(x * 16 + 3, y * 16 + 8, 8, 1);
        if (dock) g.fillStyle(0x735536).fillRect(x * 16, y * 16 + 14, 16, 1);
      }
    }
    // 길과 서쪽 출구 표식.
    g.fillStyle(0xc6b98c).fillRect(32, 176, 176, 16);
    g.fillStyle(0xffecc4).fillRect(34, 181, 10, 3).fillRect(34, 179, 3, 7);
    const t = cellCenter(TURTLE);
    if (this.textures.exists('fishing:turtle')) {
      if (!this.anims.exists('fishing:turtle-idle')) this.anims.create({ key: 'fishing:turtle-idle', frames: [0, 1, 2, 3].map(i => ({ key: 'fishing:turtle', frame: `idle${i}` })), frameRate: 3, repeat: -1 });
      this.add.sprite(t.x, t.y + 8, 'fishing:turtle', 'idle0').setOrigin(0.5, 1).setDepth(t.y).play('fishing:turtle-idle');
    } else {
      const turtle = this.add.graphics().setDepth(t.y);
      turtle.fillStyle(0x3f6843).fillRect(t.x - 9, t.y - 12, 18, 18);
      turtle.fillStyle(0x94bd71).fillRect(t.x - 5, t.y - 19, 10, 9).fillRect(t.x - 11, t.y + 3, 6, 4).fillRect(t.x + 5, t.y + 3, 6, 4);
      turtle.fillStyle(0x293b36).fillRect(t.x - 4, t.y - 17, 3, 3).fillRect(t.x + 1, t.y - 17, 3, 3);
      turtle.fillStyle(0xdf966a).fillRect(t.x - 6, t.y - 9, 12, 3);
    }
    const b = cellCenter(FISHBOARD), board = this.add.graphics().setDepth(b.y);
    board.fillStyle(0x775535).fillRect(b.x - 2, b.y - 9, 4, 16).fillRect(b.x - 12, b.y - 18, 24, 14);
    board.fillStyle(0xf0d8a4).fillRect(b.x - 10, b.y - 16, 20, 10);
    board.fillStyle(0x448ca3).fillRect(b.x - 5, b.y - 13, 9, 4).fillRect(b.x + 4, b.y - 14, 3, 6);
    for (let y = 4; y < 19; y += 3) {
      if (y >= 10 && y <= 12) continue;
      if (this.textures.exists('fishing:river-tiles')) this.add.image(14 * 16, y * 16, 'fishing:river-tiles', '6').setOrigin(0).setDepth(y * 16);
      else g.fillStyle(0x3f7150).fillRect(14 * 16 + 2, y * 16, 2, 13).fillRect(14 * 16 + 7, y * 16 + 3, 2, 10);
    }
    this.ready = true; this.setShadows(this.desired);
    this.events.once('shutdown', () => { this.ready = false; this.shadows = []; this.water = []; });
  }
  setShadows(shadows: FishShadow[]) {
    this.desired = shadows.slice(0, 3).map(s => ({ ...s }));
    if (!this.ready) return;
    for (const shadow of this.shadows) { shadow.body.destroy(); shadow.sparkle?.destroy(); }
    this.shadows = this.desired.filter((s, i, all) => all.findIndex(other => other.index === s.index) === i).map(data => {
      const p = this.shadowPoint(data.index), sizes = { S: [16, 8], M: [24, 12], L: [32, 14] }, size = sizes[data.size];
      const body = this.textures.exists('fishing:fish-shadow') ? this.add.image(p.x, p.y, 'fishing:fish-shadow', data.size) : this.add.ellipse(p.x, p.y, size[0], size[1], 0x193d49, 0.65);
      body.setDepth(-900);
      return { data, body, sparkle: data.sparkle ? this.add.graphics().setDepth(-899) : undefined };
    });
  }
  get castFrom(): Point { const d = facingDelta(this.facing); return { x: this.feet.x + d.x * 9, y: this.feet.y - 14 + d.y * 4 }; }
  shadowPoint(index: number): Point {
    const t = (this.time?.now ?? 0) / 1000;
    return { x: (index === 1 ? 20 : 18) * 16 + Math.sin(t * 0.28 + index * 2) * 9, y: [144, 183, 230][index] + Math.cos(t * 0.21 + index) * 6 };
  }
  private tapShadow(index: 0 | 1 | 2) {
    if (this.ctx.controls.frozen || this.snapshot().transitioning) return;
    this.cancelWalk(); this.facing = 'Right'; this.ctx.hooks.onShadowTap?.(index);
  }
  walkToScreen(x: number, y: number) {
    const camera = this.cameras.main, ratio = this.ctx.view.ratio;
    const p = { x: camera.worldView.x + x * ratio / camera.zoom, y: camera.worldView.y + y * ratio / camera.zoom };
    const hit = this.shadows.find(s => Math.abs(s.body.x - p.x) <= Math.max(12, s.body.width / 2 + 4) && Math.abs(s.body.y - p.y) <= 12);
    if (hit) { this.tapShadow(hit.data.index); return; }
    super.walkToScreen(x, y);
  }
  interact() {
    if (this.facing === 'Right') {
      const nearest = this.shadows.filter(s => s.body.x > this.feet.x && Math.hypot(s.body.x - this.feet.x, s.body.y - this.feet.y) <= 80).sort((a, b) => Math.hypot(a.body.x - this.feet.x, a.body.y - this.feet.y) - Math.hypot(b.body.x - this.feet.x, b.body.y - this.feet.y))[0];
      if (nearest) { this.tapShadow(nearest.data.index); return; }
    }
    super.interact();
  }
  update(time: number, delta: number) {
    super.update(time, delta);
    const clock = this.ctx.worldTime ?? fallbackWorldTime(), tint = worldTint(clock.phase, clock.weather);
    for (const image of this.water) image.setFrame(`water${Math.floor(time / 650) % 3}`);
    for (const s of this.shadows) {
      const p = this.shadowPoint(s.data.index); s.body.setPosition(p.x, p.y);
      if ('setTint' in s.body) s.body.setTint(tint.shadowColor); else s.body.setFillStyle(tint.shadowColor, clock.phase === 'night' ? 0.9 : 0.65);
      if (s.sparkle) { const g = s.sparkle; g.clear().fillStyle(0xffe99a, 0.6 + Math.sin(time / 350) * 0.3); g.fillRect(p.x - 1, p.y - 9, 2, 6).fillRect(p.x - 3, p.y - 7, 6, 2); }
    }
  }
  snapshot() {
    const debug = super.snapshot();
    const screen = (p: Point) => ({ x: (p.x - debug.camera.x) * debug.cssZoom, y: (p.y - debug.camera.y) * debug.cssZoom });
    return { ...debug, shadows: this.shadows.map(s => ({ ...s.data, point: screen(s.body) })), castFrom: this.castFrom };
  }
}
