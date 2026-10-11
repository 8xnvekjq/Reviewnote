import type Phaser from 'phaser';
import type { Point, Facing } from '../logic/joystick';
import type { Grid } from '../logic/world';
import { facingDelta } from '../logic/world';
import { advanceBugPath, bugThreat, createBugPath, emptyRoamingBug, removeRoamingBug, stepFleeOffset, stepRoamingBug } from '../logic/bugGame';
import type { BugPath } from '../logic/bugGame';
import { BUG_CATALOG } from '../logic/bugCatalog';
import type { NetSwingPayload } from '../logic/bugCatalog';
import type { BugWorld, WorldBug } from '../ui/bugAdapter';
import { DIZZY_MS, dizzyEyes, netHits } from '../logic/netHit';

// 셸과 장면의 연결은 이 작은 방문별 컨트롤러로만 한다. 장면 종료 시 반드시 제거한다.
const active = new Map<string, Dragonflies>();
export const dragonfliesFor = (scene: string | null) => scene ? active.get(scene) : undefined;
/** 서버 맵 잠자리를 쓸 예정이면(어댑터에 world가 있으면) 예전 방식 잠자리를 아예 띄우지 않는다 — 떴다 사라지지 않게. */
let worldExpected = false;
export const expectBugWorld = (on: boolean) => { worldExpected = on; };
const sheets = import.meta.glob('../assets/bugs/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
/** 맵의 잠자리 목록 받기(서버). 'unsupported'면 서버가 아직 옛 버전 → 예전처럼 종류 없이 난다. */
export type BugWorldFetcher = () => Promise<BugWorld | null | 'unsupported'>;
/** 맵 잠자리 목록을 다시 받는 간격(ms) — 다른 친구가 잡은 잠자리가 사라지고 새 잠자리가 나타난다. */
const WORLD_REFRESH_MS = 5000;
type Dizzy = { until: number; eyes: Phaser.GameObjects.Graphics; stars: Phaser.GameObjects.Graphics };
/** 서버가 정한 잠자리 한 마리: 씨앗 경로(모든 화면 같음) + 도망으로 비켜 난 거리(이 화면만). */
type WorldEntry = { bug: WorldBug; path: BugPath; offset: Point; pos: Point | null; image: Phaser.GameObjects.Sprite };
export class Dragonflies {
  /** 서버가 없을 때(시험 하네스 등)의 예전 방식: 화면마다 2마리가 따로 난다. */
  private bugs = [emptyRoamingBug(), emptyRoamingBug()];
  private images: Phaser.GameObjects.Sprite[] = [];
  private fetcher?: BugWorldFetcher;
  private fetching = false;
  private lastFetch = -Infinity;
  /** 서버 시각 − 내 시각(ms). */
  private clockOffset = 0;
  private world = new Map<string, WorldEntry>();
  private peers = new Map<string, Point>();
  private peerFacing = new Map<string, Facing>();
  private seen = new Map<string, number>();
  private dizzy = new Map<string, Dizzy>();
  private alive = true;
  private feet: Point = { x: 0, y: 0 };
  private direction: Facing = 'Front';
  private swungIndex = -1;
  private swungId: string | undefined;
  /** 휘두르는 중(그림 4장 ≈ 280ms) — 그동안 손에 든 잠자리채를 감춘다. 'self' = 나, 그 밖은 친구 sessionId. */
  private swingUntil = new Map<string, number>();
  /** 맵에 들어온 시각 — 서버 연결 전 잠깐은 예전 방식 잠자리를 띄우지 않는다. */
  private bornAt: number;
  /** 서버 맵 잠자리를 기다리는 중(옛 서버로 밝혀지면 false). */
  private waitForWorld: boolean;
  private scene: Phaser.Scene;
  private grid: Grid;
  constructor(scene: Phaser.Scene, grid: Grid, id: string) {
    this.scene = scene; this.grid = grid; this.bornAt = scene.time.now; this.waitForWorld = worldExpected;
    active.set(id, this);
    if (!scene.textures.exists('bug-fallback')) {
      const c = document.createElement('canvas'); c.width = 16; c.height = 16;
      const g = c.getContext('2d')!;
      g.fillStyle = '#f5e5bc'; g.fillRect(2, 5, 12, 2); g.fillRect(3, 9, 10, 2);
      g.fillStyle = '#bc493d'; g.fillRect(7, 3, 2, 11);
      g.fillStyle = '#483c36'; g.fillRect(6, 2, 4, 2);
      scene.textures.addCanvas('bug-fallback', c);
    }
    this.images = this.bugs.map(() => this.makeImage());
    this.loadSheet('dragonflies', 16, 16, 20);
    this.loadSheet('net-swing', 32, 32, 4);
    scene.events.once('shutdown', () => {
      this.alive = false; this.peers.clear(); this.seen.clear();
      for (const d of this.dizzy.values()) { d.eyes.destroy(); d.stars.destroy(); }
      this.dizzy.clear(); this.world.clear();
      if (active.get(id) === this) active.delete(id);
    });
  }
  private makeImage() { return this.scene.add.sprite(0, 0, 'bug-fallback').setDepth(9990).setVisible(false); }
  private loadSheet(name: string, width: number, height: number, frames: number) {
    const url = sheets[`../assets/bugs/${name}.png`], key = 'bug:' + name;
    if (!url || this.scene.textures.exists(key)) return;
    const image = new Image();
    image.onload = () => {
      if (!this.alive || this.scene.textures.exists(key)) return;
      const texture = this.scene.textures.addImage(key, image);
      if (texture) for (let i = 0; i < frames; i++) texture.add(i, 0, i % 4 * width, Math.floor(i / 4) * height, width, height);
    };
    image.src = url;
  }
  /** 맵 잠자리를 서버에서 받아 오게 한다(광장·강가는 모두 같은 잠자리, 마당은 내 잠자리). */
  setWorld(fetcher: BugWorldFetcher | undefined) {
    this.fetcher = fetcher;
    if (fetcher) { this.bugs = this.bugs.map(() => emptyRoamingBug()); this.images.forEach(i => i.setVisible(false)); this.lastFetch = -Infinity; }
  }
  private fetchWorld(time: number) {
    const fetcher = this.fetcher;
    if (!fetcher || this.fetching) return;
    this.fetching = true; this.lastFetch = time;
    void fetcher().catch(() => null).then(result => {
      this.fetching = false;
      if (!this.alive) return;
      if (result === 'unsupported') { this.fetcher = undefined; this.waitForWorld = false; return; }
      if (result) this.reconcile(result);
    });
  }
  /** 서버 목록에 맞춘다: 잡혔거나 떠난 잠자리는 지우고, 새 잠자리는 나타난 뒤 지금까지의 경로를 계산해 띄운다. */
  private reconcile(world: BugWorld) {
    this.clockOffset = world.serverNow - Date.now();
    const ids = new Set(world.bugs.map(b => b.spawnId));
    for (const [id, e] of this.world) if (!ids.has(id)) { e.image.destroy(); this.world.delete(id); }
    for (const bug of world.bugs) if (!this.world.has(bug.spawnId))
      this.world.set(bug.spawnId, { bug, path: createBugPath(bug.seed), offset: { x: 0, y: 0 }, pos: null, image: this.makeImage() });
  }
  private frame(image: Phaser.GameObjects.Sprite, row: number, time: number, fast: boolean) {
    if (this.scene.textures.exists('bug:dragonflies')) image.setTexture('bug:dragonflies', row * 4 + Math.floor(time / (fast ? 50 : 100)) % 4);
    else image.setScale(1, .8 + Math.sin(time / 65) * .2);
  }
  update(time: number, delta: number, feet: Point, direction: Facing) {
    this.feet = feet; this.direction = direction;
    if (this.fetcher) {
      if (time - this.lastFetch >= WORLD_REFRESH_MS) this.fetchWorld(time);
      const people = [feet, ...this.peers.values()], now = Date.now() + this.clockOffset;
      for (const [id, e] of this.world) {
        if (now >= e.bug.leaveAt) { e.image.destroy(); this.world.delete(id); continue; }
        const base = advanceBugPath(e.path, this.grid, Math.max(0, now - e.bug.bornAt));
        if (!base) { e.pos = null; e.image.setVisible(false); continue; }
        // 별3 이상: 사람이 다가오면 그 화면에서 Z자로 비켜 난다(아무도 없으면 천천히 경로로 돌아온다).
        const at = { x: base.x + e.offset.x, y: base.y + e.offset.y };
        const threat = e.bug.stars >= 3 ? bugThreat(at, people) : null;
        if (e.bug.stars >= 3) e.offset = stepFleeOffset(e.offset, base, threat, time, delta, this.grid);
        e.pos = { x: base.x + e.offset.x, y: base.y + e.offset.y };
        e.image.setVisible(true).setPosition(e.pos.x, e.pos.y);
        this.frame(e.image, Math.max(0, BUG_CATALOG.findIndex(b => b.id === e.bug.bugId)), time, !!threat);
      }
    } else if (!this.waitForWorld && time - this.bornAt >= 1500) {
      this.bugs = this.bugs.map((bug, i) => {
        const next = stepRoamingBug(bug, this.grid, time, delta), image = this.images[i];
        image.setVisible(!!next.position);
        if (next.position) { image.setPosition(next.position.x, next.position.y); this.frame(image, 0, time, false); }
        return next;
      });
    }
    this.drawDizzy(time);
  }
  private get flying(): { id: string | number; pos: Point; bugId: string | null }[] {
    return this.fetcher
      ? [...this.world].flatMap(([id, e]) => e.pos ? [{ id, pos: e.pos, bugId: e.bug.bugId as string }] : [])
      : this.bugs.flatMap((b, i) => b.position ? [{ id: i, pos: b.position, bugId: null }] : []);
  }
  /** 지금 날고 있는 잠자리(디버그·시험용). */
  get positions(): Point[] { return this.flying.map(f => ({ ...f.pos })); }
  get kindsDebug() { return this.flying.map(f => ({ ...f.pos, bugId: f.bugId })); }
  isSwinging(id: string) { return (this.swingUntil.get(id) ?? -1) > this.scene.time.now; }
  private within(pos: Point) { return Math.hypot(pos.x - this.feet.x, pos.y - this.feet.y) <= 24; }
  get nearby() { return this.flying.some(f => this.within(f.pos)); }
  /** 마지막으로 휘두른 맵 잠자리 id(그 잠자리로 잡기를 시작한다). */
  get swungSpawn() { return this.swungId; }
  /** 잠자리 근처가 아니어도 휘두른다(허공). 범위 안 친구는 어지러워진다. */
  swing(): Facing {
    const hit = this.flying.filter(f => this.within(f.pos)).sort((a, b) => Math.hypot(a.pos.x - this.feet.x, a.pos.y - this.feet.y) - Math.hypot(b.pos.x - this.feet.x, b.pos.y - this.feet.y))[0];
    this.swungId = typeof hit?.id === 'string' ? hit.id : undefined;
    this.swungIndex = typeof hit?.id === 'number' ? hit.id : -1;
    this.swingUntil.set('self', this.scene.time.now + 300);
    this.drawSwing(this.feet, this.direction);
    for (const id of netHits(this.feet, this.direction, this.peers)) this.makeDizzy(id);
    return this.direction;
  }
  /** 잡았거나(서버가 그 잠자리를 가졌다) 이미 없는 잠자리 — 이 화면에서 지운다. */
  caught() {
    if (this.swungId) { this.world.get(this.swungId)?.image.destroy(); this.world.delete(this.swungId); this.swungId = undefined; return; }
    const index = this.swungIndex; this.swungIndex = -1;
    if (index >= 0) { this.bugs[index] = removeRoamingBug(this.scene.time.now); this.images[index].setVisible(false); }
  }
  setPeers(spots: Map<string, Point>, selfId: string, facings?: Map<string, Facing>) {
    this.peers = new Map([...spots].filter(([id]) => id !== selfId));
    if (facings) this.peerFacing = facings;
    for (const id of this.seen.keys()) if (!this.peers.has(id)) this.seen.delete(id);
  }
  peerSwing(payload: NetSwingPayload) {
    const spot = this.peers.get(payload.sessionId);
    if (!spot || payload.at <= (this.seen.get(payload.sessionId) ?? -Infinity)) return;
    this.seen.set(payload.sessionId, payload.at); this.swingUntil.set(payload.sessionId, this.scene.time.now + 300); this.drawSwing(spot, payload.direction);
    // 친구가 휘두른 채에 나나 다른 친구가 맞으면 어지러워진다.
    const others = new Map([...this.peers].filter(([id]) => id !== payload.sessionId));
    others.set('self', this.feet);
    for (const id of netHits(spot, payload.direction, others)) this.makeDizzy(id);
  }
  /** 어지러운 사람 목록(디버그·시험용). */
  get dizzyIds() { return [...this.dizzy.keys()]; }
  private makeDizzy(id: string) {
    const current = this.dizzy.get(id);
    if (current) { current.until = this.scene.time.now + DIZZY_MS; return; }
    this.dizzy.set(id, { until: this.scene.time.now + DIZZY_MS, eyes: this.scene.add.graphics(), stars: this.scene.add.graphics() });
  }
  /** x.x 눈과 머리 위를 도는 별. */
  private drawDizzy(time: number) {
    for (const [id, d] of this.dizzy) {
      const at = id === 'self' ? this.feet : this.peers.get(id);
      if (!at || time >= d.until) { d.eyes.destroy(); d.stars.destroy(); this.dizzy.delete(id); continue; }
      const facing = id === 'self' ? this.direction : this.peerFacing.get(id) ?? 'Front';
      d.eyes.clear().setPosition(Math.round(at.x), Math.round(at.y)).setDepth(at.y + 0.5).fillStyle(0x2b1a10, 1);
      for (const e of dizzyEyes(facing)) for (const [x, y] of [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]]) d.eyes.fillRect(e.x + x, e.y + y, 1, 1);
      d.stars.clear().setPosition(Math.round(at.x), Math.round(at.y) - 34).setDepth(99990);
      for (let k = 0; k < 3; k++) {
        const a = time / 260 + k * Math.PI * 2 / 3, sx = Math.cos(a) * 8, sy = Math.sin(a) * 3;
        d.stars.fillStyle(0xffe066, 1).fillRect(Math.round(sx) - 1, Math.round(sy), 3, 1).fillRect(Math.round(sx), Math.round(sy) - 1, 1, 3);
        d.stars.fillStyle(0xfff6c8, 1).fillRect(Math.round(sx), Math.round(sy), 1, 1);
      }
    }
  }
  private drawSwing(feet: Point, direction: Facing) {
    const d = facingDelta(direction), angle = Math.atan2(d.y, d.x);
    const x = feet.x + d.x * 15, y = feet.y - 12 + d.y * 15;
    if (this.scene.textures.exists('bug:net-swing')) {
      const sprite = this.scene.add.sprite(x, y, 'bug:net-swing', 0).setRotation(angle).setDepth(9992);
      let frame = 0;
      this.scene.time.addEvent({ delay: 70, repeat: 3, callback: () => { frame++; if (frame >= 4) sprite.destroy(); else sprite.setFrame(frame); } });
    } else {
      const g = this.scene.add.graphics().setPosition(x, y).setRotation(angle).setDepth(9992);
      g.lineStyle(2, 0xf8e7b9, .9).beginPath().arc(0, 0, 14, -1.2, 1.2).strokePath();
      g.lineStyle(1, 0xa87847).lineBetween(-14, 0, 2, 0);
      g.lineStyle(1, 0xf8e7b9, .6).strokeEllipse(5, 0, 16, 22);
      this.scene.tweens.add({ targets: g, alpha: 0, rotation: angle + .8, duration: 280, onComplete: () => g.destroy() });
    }
  }
}
