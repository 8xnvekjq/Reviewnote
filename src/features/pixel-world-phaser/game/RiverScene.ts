import { SECRET_SPOTS, SECRET_SPOT_RADIUS, secretSpotAt, rememberSecretSpot } from '../logic/hotspots';
import { canFishWhileRiding } from '../logic/petRide';
import type Phaser from 'phaser';
import { rodTip } from './heldTool';
import type { HeldToolMode } from './heldTool';
import type { Point } from '../logic/joystick';
import { RIVER_COLS, RIVER_ROWS, DOCK, TURTLE, FISHBOARD, inDock, riverWater, bankEdge, RIVER_DECORATIONS } from '../logic/riverWorld';
import { cellCenter, facingDelta, facedInteractable } from '../logic/world';
import { castPower, HOTSPOTS, HOTSPOT_RADIUS } from '../logic/hotspots';
import { castLanding, canChargeCast } from '../logic/castThrow';
import type { FishingState } from '../ui/fishingAdapter';
import { preloadFishing, fishingFrames } from './sceneAssets';
import { createFishingFx, preloadFishingFx } from './fishingFx';
import type { FishingEffects } from './fishingFx';
import type { FishingGame } from '../logic/fishingGame';
import { RiverPeers } from './riverPeers';
import { WorldScene } from './WorldScene';
import type { WorldContext } from './WorldScene';

export class RiverScene extends WorldScene {
  protected readonly background = '#578d78';
  private secretVisual: Phaser.GameObjects.Graphics | null = null;
  private secretMarker: Phaser.GameObjects.Text | null = null;
  get mountedDuck(): boolean { return this.ctx.riding && canFishWhileRiding(this.ctx.assets.pet?.id); }
  private spots: FishingState['spots'];
  /** 포인트별 그림과 지금 그려 둔 남은 물고기 수(1마리 낚을 때마다 그림자가 하나씩 줄어든다). */
  private spotVisuals = new Map<number, { g: Phaser.GameObjects.Graphics; fish: { body: Phaser.GameObjects.Image | Phaser.GameObjects.Ellipse; x: number; y: number; phase: number }[]; left: number }>();
  private chargeAt: number | null = null;
  private preview: Phaser.GameObjects.Graphics | null = null;
  private water: Phaser.GameObjects.Image[] = [];
  private ready = false;
  private waterFrame = -1;
  private lampPhase = '';
  private waterStars: Phaser.GameObjects.Graphics | null = null;
  private lampGlow: Phaser.GameObjects.Graphics | null = null;
  private fx: FishingEffects | null = null;
  private fishingCollision = false;
  protected collisionFishing() { return this.fishingCollision; }
  protected collisionObstacles() { return this.peers.current?.collisionObstacles() ?? []; }
  protected collisionCompanions() { return this.peers.current?.collisionCompanions() ?? []; }
  /** 강가 친구들(실시간). 그리기는 riverPeers.ts가 맡는다. */
  readonly peers = { current: null as RiverPeers | null };
  constructor(ctx: WorldContext) { super('river', ctx); }
  preload() { preloadFishing(this); preloadFishingFx(this); }
  init(data: { entry?: string } | undefined) { super.init(data); this.fishingCollision = false; this.ready = false; this.spotVisuals = new Map(); this.chargeAt = null; this.water = [];  this.waterFrame = -1; this.lampPhase = ''; }
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
    // 늘어난 부두의 가장자리와 기둥도 기존 판자와 같은 색으로 그린다.
    const dockEdges = this.add.graphics().setDepth(-998);
    for (let y = DOCK.top; y <= DOCK.bottom; y++) for (let x = DOCK.left; x <= DOCK.right; x++) {
      if (!inDock({ x, y })) continue;
      dockEdges.fillStyle(0x735536);
      if (riverWater({ x, y: y - 1 })) dockEdges.fillRect(x * 16, y * 16, 16, 1);
      if (riverWater({ x, y: y + 1 })) dockEdges.fillRect(x * 16, y * 16 + 15, 16, 1);
      if (riverWater({ x: x + 1, y })) dockEdges.fillRect(x * 16 + 15, y * 16, 1, 16);
    }
    for (const x of [12, DOCK.right]) for (const y of [DOCK.top * 16, (DOCK.top + 1) * 16 - 4]) {
      dockEdges.fillStyle(0x735536).fillRect(x * 16 + 11, y, 4, 4);
      dockEdges.fillStyle(0xd3a46b).fillRect(x * 16 + 12, y, 2, 1);
    }
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
    this.secretVisual = this.add.graphics().setDepth(-900);
    this.secretMarker = this.add.text(0, 0, '?', { fontSize: '12px', color: '#fff2ac' }).setOrigin(.5).setDepth(10004).setVisible(false);
    this.waterStars = this.add.graphics().setDepth(-898);
    // 조명은 기존 야간 틴트 위에 작은 빛만 더한다.
    this.lampGlow = this.add.graphics().setDepth(200001);
    this.ready = true; this.setHotspots(this.spots);
    this.preview = this.add.graphics().setDepth(10003);
    // 찌와 줄은 날아간 착지점에 그린다.
    const scene = this;
    this.fx = createFishingFx(this, { get castFrom() { return scene.lineFrom; } });
    this.peers.current = new RiverPeers(this, this.spec.solid);
    this.events.once('shutdown', () => { this.ready = false; this.spotVisuals = new Map(); this.chargeAt = null; this.water = []; this.fx = null; this.preview = null; this.secretVisual = null; this.secretMarker = null;  this.waterStars = null; this.lampGlow = null; this.peers.current?.clear(); this.peers.current = null; });
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
  setHotspots(spots: FishingState['spots']) {
    this.spots = spots;
    if (!this.ready) return;
    for (const spot of HOTSPOTS) {
      const state = spots?.find(s => s.id === spot.id);
      const active = spots === undefined || (!!state && state.active && state.left > 0);
      const left = Math.max(1, Math.min(3, state?.left ?? 3));
      const shown = this.spotVisuals.get(spot.id);
      if (active && shown?.left !== left) {
        shown?.g.destroy(); shown?.fish.forEach(f => f.body.destroy());
        const g = this.add.graphics().setDepth(-902), p = cellCenter(spot.cell);
        g.fillStyle(0x9ee5d2, .09).fillCircle(p.x, p.y, HOTSPOT_RADIUS);
        g.lineStyle(1, 0xb9eadd, .5).strokeCircle(p.x, p.y, HOTSPOT_RADIUS);
        // 남은 마리 수만큼 물고기 그림자(처음 3마리, 낚을 때마다 하나씩 사라진다) — 예전 헤엄치던 그림자 그림 그대로.
        const fish = ([[-8, -6, 'M'], [6, 3, 'S'], [-3, 10, 'M']] as const).slice(0, left).map(([dx, dy, size], i) => {
          const x = p.x + dx, y = p.y + dy;
          const body = this.textures.exists('fishing:fish-shadow')
            ? this.add.image(x, y, 'fishing:fish-shadow', size).setDepth(-901).setFlipX(i % 2 === 1)
            : this.add.ellipse(x, y, size === 'M' ? 24 : 16, size === 'M' ? 12 : 8, 0x193d49, .65).setDepth(-901);
          return { body, x, y, phase: spot.id * 1.7 + i * 2.1 };
        });
        this.spotVisuals.set(spot.id, { g, fish, left });
      } else if (!active && shown) {
        this.spotVisuals.delete(spot.id);
        this.tweens.add({ targets: [shown.g, ...shown.fish.map(f => f.body)], alpha: 0, duration: 450, onComplete: () => { shown.g.destroy(); shown.fish.forEach(f => f.body.destroy()); } });
      }
    }
  }
  fishingFx(game: FishingGame, point: Point, now: number) { this.fishingCollision = ['casting', 'waiting', 'bite', 'reeling'].includes(game.phase); if (this.ready) this.fx?.update(game, point, now); }
  get castFrom(): Point { const d = facingDelta(this.facing); return { x: this.feet.x + d.x * 9, y: this.feet.y - 14 + d.y * 4 }; }
  /** 낚싯줄이 나가는 곳: 낚싯대를 들었으면 내민 낚싯대 끝, 맨손이면 손(예전 castFrom). 찌가 떨어지는 곳은 그대로 castFrom 기준. */
  get lineFrom(): Point { if (this.mountedDuck) return this.castFrom; return this.ctx.heldTool?.kind === 'rod' ? rodTip(this.feet, this.facing, 'cast') : this.castFrom; }
  protected heldToolMode(): HeldToolMode { return this.chargeAt !== null ? 'windup' : this.fishingCollision ? 'cast' : 'carry'; }
  get canCast() { return !this.ctx.controls.frozen && !super.snapshot().transitioning && !facedInteractable(this.feet, this.facing, this.spec.interactables) && canChargeCast(this.feet, this.facing, this.mountedDuck); }
  beginCast(): boolean {
    if (!this.canCast || this.chargeAt !== null) return false;
    // 낚시 시작: 곰·강아지는 내리고 비둘기는 땅에 내려앉는다. 오리는 탄 채로 낚시한다(안전한 땅이 없으면 시작하지 않음).
    if (!this.prepareFishingRide()) return false;
    this.cancelWalk(); this.chargeAt = performance.now(); return true;
  }
  releaseCast(cancelled = false): Point | null {
    if (this.chargeAt === null) return null;
    const power = castPower(performance.now() - this.chargeAt);
    this.chargeAt = null; this.preview?.clear();
    return !cancelled && this.canCast ? castLanding(this.castFrom, this.facing, power) : null;
  }
  update(time: number, delta: number) {
    super.update(time, delta);
    this.drawSecretSpots(time);

    if (this.chargeAt !== null) {
      if (!this.canCast) this.releaseCast(true);
      else {
        // 떨어질 자리는 보여 주지 않는다(맞히는 재미, 2026-10 선생님 의견) — 힘 막대만.
        const power = castPower(performance.now() - this.chargeAt), g = this.preview;
        g?.clear();
        g?.fillStyle(0x263f45, .9).fillRect(this.feet.x - 13, this.feet.y - 36, 26, 5);
        g?.fillStyle(0xffd46b).fillRect(this.feet.x - 12, this.feet.y - 35, 24 * power, 3);
      }
    }
    for (const [id, visual] of this.spotVisuals) {
      visual.g.setAlpha(.85 + Math.sin(time / 900 + id) * .15);
      // 원 안에서 천천히 오가며 헤엄친다(가는 방향으로 몸을 돌린다).
      for (const f of visual.fish) {
        const dx = Math.sin(time / 1400 + f.phase) * 4;
        f.body.setPosition(f.x + dx, f.y + Math.sin(time / 1100 + f.phase) * 1.5);
        if ('setFlipX' in f.body) f.body.setFlipX(Math.cos(time / 1400 + f.phase) < 0);
      }
    }
    this.peers.current?.update(time, this.feet, delta, this.ctx.face ?? '🐶');
    this.spacePets(delta);
    const clock = this.worldClock();
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
  }
  private drawSecretSpots(time: number) {
    const g = this.secretVisual;
    if (!g) return;
    g.clear();
    for (const [i, spot] of SECRET_SPOTS.entries()) {
      const p = cellCenter(spot.cell);
      if (i === 0) {
        for (let arm = 0; arm < 3; arm++) {
          g.lineStyle(1, 0xb0dbd8, .45).beginPath();
          for (let n = 0; n <= 20; n++) {
            const a = n / 5 + time / 1800 + arm * Math.PI * 2 / 3, r = 2 + n / 1.8;
            const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r * .55;
            if (n === 0) g.moveTo(x, y); else g.lineTo(x, y);
          }
          g.strokePath();
        }
      } else if (i === 1) {
        // Ruined pillars are decoration only; every tile remains river water.
        g.fillStyle(0x193c50, .4).fillEllipse(p.x, p.y, 36, 20);
        for (const dx of [-22, 22]) {
          g.fillStyle(0x596c70).fillRect(p.x + dx - 4, p.y - 15, 8, 16);
          g.fillStyle(0x91a0a1).fillRect(p.x + dx - 5, p.y - 16, 5, 3);
          g.lineStyle(1, 0x344b54).lineBetween(p.x + dx, p.y - 11, p.x + dx - 2, p.y - 5);
        }
      } else {
        g.fillStyle(0x547761).fillEllipse(p.x + 24, p.y, 15, 7);
        for (let reed = 0; reed < 5; reed++) {
          const x = p.x + 19 + reed * 2, sway = Math.sin(time / 600 + reed) * 2;
          g.lineStyle(1, 0x83aa67).lineBetween(x, p.y, x + sway, p.y - 9 - reed % 3);
          g.fillStyle(0xb8a176).fillRect(x + sway, p.y - 11 - reed % 3, 1, 3);
        }
      }
      const bubble = (time / 2500 + i * .3) % 1;
      if (bubble < .35) g.lineStyle(1, 0xc0e8df, .4 * (1 - bubble / .35)).strokeCircle(p.x + 6, p.y - bubble * 15, 1 + bubble * 8);
      if (Math.hypot(this.feet.x - p.x, this.feet.y - p.y) < 64) rememberSecretSpot(spot.id);
    }
    const inside = this.mountedDuck && secretSpotAt(this.feet);
    this.secretMarker?.setVisible(!!inside).setPosition(this.feet.x, this.feet.y - 42 + Math.sin(time / 400) * 2);
  }
  snapshot() {
    const debug = super.snapshot();
    return { ...debug, castFrom: this.castFrom, mountedDuck: this.mountedDuck, secretSpots: SECRET_SPOTS, secretSpotRadius: SECRET_SPOT_RADIUS, canCast: this.canCast, charging: this.chargeAt !== null,
      hotspots: HOTSPOTS.filter(s => this.spots === undefined || this.spots.some(v => v.id === s.id && v.active)), decorations: RIVER_DECORATIONS,
      waterBounds: { left: bankEdge(9) * 16, right: RIVER_COLS * 16, top: 0, bottom: RIVER_ROWS * 16 },
      ...(this.peers.current?.snapshot() ?? { classmates: [], bubbles: [], sparkles: [] }) };
  }
}
