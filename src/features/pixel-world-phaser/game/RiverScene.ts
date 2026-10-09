import type Phaser from 'phaser';
import type { Point } from '../logic/joystick';
import { RIVER_COLS, RIVER_ROWS, TURTLE, FISHBOARD, inDock, riverWater, bankEdge, RIVER_DECORATIONS, BANK_SPOTS, canCastFrom, nearestBankSpot } from '../logic/riverWorld';
import { cellCenter, facingDelta, facingToward } from '../logic/world';
import { worldTint } from '../logic/worldTint';
import { preloadFishing, fishingFrames } from './sceneAssets';
import { createFishingFx, preloadFishingFx } from './fishingFx';
import type { FishingEffects } from './fishingFx';
import type { FishingGame } from '../logic/fishingGame';
import { RiverPeers } from './riverPeers';
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
  private pendingCast: { index: 0 | 1 | 2; spot: Point } | null = null;
  private waterFrame = -1;
  private lampPhase = '';
  private waterStars: Phaser.GameObjects.Graphics | null = null;
  private lampGlow: Phaser.GameObjects.Graphics | null = null;
  private fx: FishingEffects | null = null;
  /** 강가 친구들(실시간). 그리기는 riverPeers.ts가 맡는다. */
  readonly peers = { current: null as RiverPeers | null };
  constructor(ctx: WorldContext) { super('river', ctx); }
  preload() { preloadFishing(this); preloadFishingFx(this); }
  init(data: { entry?: string } | undefined) { super.init(data); this.ready = false; this.shadows = []; this.water = []; this.pendingCast = null; this.waterFrame = -1; this.lampPhase = ''; }
  protected drawWorld() {
    fishingFrames(this);
    const g = this.add.graphics().setDepth(-1000);
    g.fillStyle(0x6c9858).fillRect(0, 0, RIVER_COLS * 16, RIVER_ROWS * 16);
    for (let y = 0; y < RIVER_ROWS; y++) for (let x = 0; x < RIVER_COLS; x++) {
      const dock = inDock({ x, y }), wet = riverWater({ x, y });
      if (this.textures.exists('fishing:river-tiles') && (wet || dock || x === bankEdge(y) - 1)) {
        const image = this.add.image(x * 16 + 8, y * 16 + 8, 'fishing:river-tiles', wet ? 'water0' : dock ? '5' : '3').setDepth(-999);
        // 둑 타일(bank-edge-top)은 '위 풀·아래 물' 그림이라, 강이 동쪽에 세로로 흐르는 이 장면에서는 풀이 서쪽을 보게 돌린다.
        if (!wet && !dock) image.setAngle(-90);
        if (wet) this.water.push(image);
      } else {
        g.fillStyle(wet ? 0x448ca3 : dock ? 0xb9905b : x === bankEdge(y) - 1 ? 0xc6be86 : 0x6c9858).fillRect(x * 16, y * 16, 16, 16);
        if (wet && (x + y) % 3 === 0) g.fillStyle(0x80bdc9, 0.5).fillRect(x * 16 + 3, y * 16 + 8, 8, 1);
        if (dock) g.fillStyle(0x735536).fillRect(x * 16, y * 16 + 14, 16, 1);
      }
    }
    // 길과 서쪽 출구 표식.
    g.fillStyle(0xc6b98c).fillRect(32, 176, 96, 16);
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
    // 이번 주 물고기 랭킹 푯말 — 마당 안내판처럼 글씨를 써서 무엇인지 바로 알 수 있게.
    const b = cellCenter(FISHBOARD), board = this.add.graphics().setDepth(b.y);
    board.fillStyle(0x775535).fillRect(b.x - 2, b.y - 8, 4, 16).fillRect(b.x - 16, b.y - 27, 3, 20).fillRect(b.x + 13, b.y - 27, 3, 20);
    board.fillStyle(0x62452d).fillRect(b.x - 19, b.y - 32, 38, 21);
    board.fillStyle(0xf0d8a4).fillRect(b.x - 17, b.y - 30, 34, 17);
    board.fillStyle(0xe2b13c).fillRect(b.x - 4, b.y - 35, 8, 4);
    this.add.text(b.x, b.y - 21.5, '이번 주\n물고기 랭킹', { fontFamily: 'sans-serif', fontSize: '6px', fontStyle: 'bold', color: '#382918', align: 'center', lineSpacing: -1, resolution: 4 }).setOrigin(.5).setDepth(b.y + 1);
    this.drawDecorations();
    this.waterStars = this.add.graphics().setDepth(-898);
    // 조명은 기존 야간 틴트 위에 작은 빛만 더한다.
    this.lampGlow = this.add.graphics().setDepth(200001);
    this.ready = true; this.setShadows(this.desired);
    // 찌·줄·물보라 효과. 닻(anchor)은 매번 지금 위치를 읽도록 getter로 넘긴다. 장면이 끝나면 fishingFx가 스스로 정리한다.
    const scene = this;
    this.fx = createFishingFx(this, { get castFrom() { return scene.castFrom; }, shadowPoint: index => scene.shadowPoint(index) });
    this.peers.current = new RiverPeers(this, this.spec.solid);
    this.events.once('shutdown', () => { this.ready = false; this.shadows = []; this.water = []; this.fx = null; this.pendingCast = null; this.waterStars = null; this.lampGlow = null; this.peers.current?.clear(); this.peers.current = null; });
  }
  private drawDecorations() {
    if (!this.textures.exists('town')) this.textures.addSpriteSheet('town', this.ctx.assets.town, { frameWidth: 16, frameHeight: 16 });
    const town = this.textures.get('town');
    if (!town.has('tree')) town.add('tree', 0, 64, 0, 16, 32);
    for (const d of RIVER_DECORATIONS) {
      const p = cellCenter(d.cell), depth = riverWater(d.cell) ? -950 : p.y;
      const image = (key: string, frame?: string | number) => this.add.image(p.x, p.y + 8, key, frame).setOrigin(0.5, 1).setDepth(depth);
      if (d.kind === 'tree') image('town', 'tree').setScale(2);
      else if (d.kind === 'bush') image('town', 28);
      else if (d.kind === 'fence') for (let i = 0; i < (d.width ?? 1); i++) this.add.image((d.cell.x + i) * 16, d.cell.y * 16, 'town', i === 0 ? 80 : 82).setOrigin(0).setDepth(depth);
      else if (d.kind === 'reeds' || d.kind === 'rock') image('fishing:river-tiles', d.kind === 'reeds' ? '6' : '8');
      else if (d.kind === 'lily') image('fishing:lily-small');
      else if (d.kind === 'lily-flower') image('fishing:lily-flower');
      else if (d.kind === 'sandbar') {
        const g = this.add.graphics().setDepth(-951), x = d.cell.x * 16, y = d.cell.y * 16;
        g.fillStyle(0x527c89).fillRect(x - 2, y + 5, 52, 12);
        g.fillStyle(0xe0c395).fillRect(x, y + 2, 48, 12).fillRect(x + 6, y, 36, 16);
        g.fillStyle(0xfff1d2).fillRect(x + 8, y + 3, 24, 2);
      } else if (d.kind === 'bench') {
        const g = this.add.graphics().setDepth(depth), x = d.cell.x * 16, y = d.cell.y * 16;
        g.fillStyle(0x805b3e).fillRect(x + 2, y + 2, 28, 7);
        g.fillStyle(0xb88b52).fillRect(x, y + 9, 32, 4);
        g.fillStyle(0x684a33).fillRect(x + 4, y + 13, 3, 3).fillRect(x + 25, y + 13, 3, 3);
      } else image(`fishing:${d.kind}`);
    }
  }
  setShadows(shadows: FishShadow[]) {
    this.desired = shadows.slice(0, 3).map(s => ({ ...s }));
    if (!this.ready) return;
    if (this.pendingCast && !this.desired.some(s => s.index === this.pendingCast?.index)) this.cancelWalk();
    for (const shadow of this.shadows) { shadow.body.destroy(); shadow.sparkle?.destroy(); }
    this.shadows = this.desired.filter((s, i, all) => all.findIndex(other => other.index === s.index) === i).map(data => {
      const p = this.shadowPoint(data.index), sizes = { S: [16, 8], M: [24, 12], L: [32, 14] }, size = sizes[data.size];
      const body = this.textures.exists('fishing:fish-shadow') ? this.add.image(p.x, p.y, 'fishing:fish-shadow', data.size) : this.add.ellipse(p.x, p.y, size[0], size[1], 0x193d49, 0.65);
      // 그림 원본은 불투명(이진 알파)이라 화면에서 반투명하게 깐다(ART.md 권장 0.35 안팎).
      body.setDepth(-900); if ('setTint' in body) body.setAlpha(0.4);
      return { data, body, sparkle: data.sparkle ? this.add.graphics().setDepth(-899) : undefined };
    });
  }
  /** useFishing이 매 프레임 넘겨주는 낚시 상태로 찌·줄·물보라를 그린다. */
  fishingFx(game: FishingGame, index: number, now: number) { if (this.ready) this.fx?.update(game, index, now); }
  get castFrom(): Point { const d = facingDelta(this.facing); return { x: this.feet.x + d.x * 9, y: this.feet.y - 14 + d.y * 4 }; }
  shadowPoint(index: number): Point {
    const t = (this.time?.now ?? 0) / 1000;
    return { x: (index === 1 ? 13 : 9.5) * 16 + Math.sin(t * 0.28 + index * 2) * 9, y: [144, 183, 230][index] + Math.cos(t * 0.21 + index) * 6 };
  }
  private tapShadow(index: 0 | 1 | 2) {
    if (this.ctx.controls.frozen || this.snapshot().transitioning) return;
    this.cancelWalk();
    const shadow = this.shadowPoint(index);
    if (canCastFrom(this.feet, shadow)) { this.castShadow(index); return; }
    const spot = nearestBankSpot(shadow, this.feet);
    if (!spot) return;
    super.walkToWorld(cellCenter(spot));
    this.pendingCast = { index, spot: cellCenter(spot) };
  }
  private castShadow(index: 0 | 1 | 2) {
    this.cancelWalk(); this.facing = facingToward(this.feet, this.shadowPoint(index));
    this.playAvatar(false, 1); this.ctx.hooks.onShadowTap?.(index);
  }
  cancelWalk() { this.pendingCast = null; super.cancelWalk(); }
  walkToWorld(point: Point) { this.pendingCast = null; super.walkToWorld(point); }
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
    if (this.pendingCast && !this.ctx.controls.frozen) {
      const pending = this.pendingCast;
      // 거의 도착하면 물가 자리에 딱 맞춰 세운 뒤 던진다(걷기를 멈추면 1~2px 앞에 서 있던 것). 친구 화면의 줄도 이 자리에서 시작한다.
      if (Math.hypot(this.feet.x - pending.spot.x, this.feet.y - pending.spot.y) < 2) {
        this.feet = { ...pending.spot };
        this.castShadow(pending.index);
      }
    }
    this.peers.current?.update(time, this.feet);
    const clock = this.worldClock(), tint = worldTint(clock.phase, clock.weather);
    const frame = Math.floor(time / 650) % 3;
    if (frame !== this.waterFrame) {
      this.waterFrame = frame;
      for (const image of this.water) image.setFrame(`water${frame}`);
      const stars = this.waterStars;
      stars?.clear().fillStyle(0xfff1d2, clock.weather === 'rain' ? 0.25 : 0.6);
      for (const [i, p] of [{ x: 12, y: 8 }, { x: 16, y: 12 }, { x: 11, y: 15 }, { x: 21, y: 9 }, { x: 18, y: 18 }].entries()) {
        if ((i + frame) % 3 === 0) continue;
        const c = cellCenter(p); stars?.fillRect(c.x, c.y - 2, 1, 5).fillRect(c.x - 2, c.y, 5, 1);
      }
    }
    if (this.lampPhase !== clock.phase) {
      this.lampPhase = clock.phase;
      const glow = this.lampGlow; glow?.clear();
      if (clock.phase === 'night' || clock.phase === 'evening') {
        const lamp = cellCenter(RIVER_DECORATIONS.find(d => d.kind === 'lamp')!.cell);
        glow?.fillStyle(0xffd778, 0.07).fillCircle(lamp.x, lamp.y - 18, 25);
        glow?.fillStyle(0xffe99a, 0.16).fillCircle(lamp.x, lamp.y - 18, 12);
        glow?.fillStyle(0xfff1d2, 0.8).fillRect(lamp.x - 2, lamp.y - 21, 4, 5);
      }
    }
    for (const s of this.shadows) {
      const p = this.shadowPoint(s.data.index); s.body.setPosition(p.x, p.y);
      // 그림자 그림은 시간대 화면 색(덮개)이 이미 어둡게 하므로 따로 물들이지 않는다. 도형 대체만 색을 바꾼다.
      if (!('setTint' in s.body)) s.body.setFillStyle(tint.shadowColor, clock.phase === 'night' ? 0.9 : 0.65);
      if (s.sparkle) { const g = s.sparkle; g.clear().fillStyle(0xffe99a, 0.6 + Math.sin(time / 350) * 0.3); g.fillRect(p.x - 1, p.y - 9, 2, 6).fillRect(p.x - 3, p.y - 7, 6, 2); }
    }
  }
  snapshot() {
    const debug = super.snapshot();
    const screen = (p: Point) => ({ x: (p.x - debug.camera.x) * debug.cssZoom, y: (p.y - debug.camera.y) * debug.cssZoom });
    const shadows = this.shadows.map(s => ({ ...s.data, point: screen(s.body) }));
    // 브라우저 테스트가 탭할 수 있도록 그림자 위치를 targets['shadow:0..2']로도 내보낸다(숨기면 사라짐).
    const targets = { ...debug.targets, ...Object.fromEntries(shadows.map(s => [`shadow:${s.index}`, s.point])) };
    return { ...debug, targets, shadows, castFrom: this.castFrom, pendingCast: this.pendingCast,
      bankSpots: BANK_SPOTS.map(cellCenter), decorations: RIVER_DECORATIONS,
      waterBounds: { left: bankEdge(9) * 16, right: RIVER_COLS * 16, top: 0, bottom: RIVER_ROWS * 16 },
      ...(this.peers.current?.snapshot() ?? { classmates: [], bubbles: [], sparkles: [] }) };
  }
}
