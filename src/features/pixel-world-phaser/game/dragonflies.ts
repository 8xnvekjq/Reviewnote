import type Phaser from 'phaser';
import type { Point, Facing } from '../logic/joystick';
import type { Grid } from '../logic/world';
import { facingDelta } from '../logic/world';
import { bugThreat, emptyRoamingBug, removeRoamingBug, stepRoamingBug } from '../logic/bugGame';
import { BUG_CATALOG } from '../logic/bugCatalog';
import type { NetSwingPayload } from '../logic/bugCatalog';
import type { BugSpawn } from '../ui/bugAdapter';
import { DIZZY_MS, dizzyEyes, netHits } from '../logic/netHit';

// 셸과 장면의 연결은 이 작은 방문별 컨트롤러로만 한다. 장면 종료 시 반드시 제거한다.
const active = new Map<string, Dragonflies>();
export const dragonfliesFor = (scene: string | null) => scene ? active.get(scene) : undefined;
const sheets = import.meta.glob('../assets/bugs/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
/** 새 잠자리 받기(서버가 종류를 정한다). release: 그 자리의 이전 잠자리. */
export type BugSpawner = (release?: string, holding?: string[]) => Promise<BugSpawn | null | 'unsupported'>;
type Dizzy = { until: number; eyes: Phaser.GameObjects.Graphics; stars: Phaser.GameObjects.Graphics };
export class Dragonflies {
  private bugs = [emptyRoamingBug(), emptyRoamingBug()];
  /** 자리마다 서버가 정한 잠자리(spawner가 없으면 늘 null — 예전처럼 종류 없이 난다). */
  private kinds: (BugSpawn | null)[] = [null, null];
  /** 한 번에 하나만 받아 온다(두 자리가 같은 잠자리를 돌려받지 않게). */
  private requesting = false;
  /** 맵에 들어온 시각 — 서버 연결 전 잠깐은 종류 없는 잠자리를 띄우지 않는다. */
  private bornAt: number;
  private releases: (string | undefined)[] = [undefined, undefined];
  private spawner?: BugSpawner;
  private images: Phaser.GameObjects.Sprite[] = [];
  private peers = new Map<string, Point>();
  private peerFacing = new Map<string, Facing>();
  private seen = new Map<string, number>();
  private dizzy = new Map<string, Dizzy>();
  private alive = true;
  private feet: Point = { x: 0, y: 0 };
  private direction: Facing = 'Front';
  private swungIndex = -1;
  /** 휘두르는 중(그림 4장 ≈ 280ms) — 그동안 손에 든 잠자리채를 감춘다. 'self' = 나, 그 밖은 친구 sessionId. */
  private swingUntil = new Map<string, number>();
  private scene: Phaser.Scene;
  private grid: Grid;
  constructor(scene: Phaser.Scene, grid: Grid, id: string) {
    this.scene = scene; this.grid = grid; this.bornAt = scene.time.now;
    active.set(id, this);
    if (!scene.textures.exists('bug-fallback')) {
      const c = document.createElement('canvas'); c.width = 16; c.height = 16;
      const g = c.getContext('2d')!;
      g.fillStyle = '#f5e5bc'; g.fillRect(2, 5, 12, 2); g.fillRect(3, 9, 10, 2);
      g.fillStyle = '#bc493d'; g.fillRect(7, 3, 2, 11);
      g.fillStyle = '#483c36'; g.fillRect(6, 2, 4, 2);
      scene.textures.addCanvas('bug-fallback', c);
    }
    this.images = this.bugs.map(() => scene.add.sprite(0, 0, 'bug-fallback').setDepth(9990).setVisible(false));
    this.loadSheet('dragonflies', 16, 16, 20);
    this.loadSheet('net-swing', 32, 32, 4);
    scene.events.once('shutdown', () => {
      this.alive = false; this.peers.clear(); this.seen.clear();
      for (const d of this.dizzy.values()) { d.eyes.destroy(); d.stars.destroy(); }
      this.dizzy.clear();
      if (active.get(id) === this) active.delete(id);
    });
  }
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
  /** 서버에서 잠자리 종류를 받아 오게 한다(없으면 예전처럼 종류 없이 난다). */
  setSpawner(spawner: BugSpawner | undefined) {
    this.spawner = spawner;
    // 연결 전에 종류 없이 나타난 잠자리는 거두고 서버가 정한 잠자리로 다시 띄운다.
    if (spawner) this.bugs = this.bugs.map((bug, i) => this.kinds[i] ? bug : emptyRoamingBug());
  }
  private request(i: number) {
    const spawner = this.spawner;
    if (!spawner || this.requesting) return;
    this.requesting = true;
    const holding = this.kinds.flatMap(k => k ? [k.spawnId] : []);
    void spawner(this.releases[i], holding).catch(() => null).then(kind => {
      this.requesting = false;
      if (!this.alive) return;
      if (kind === 'unsupported') { this.spawner = undefined; return; } // 서버가 아직 옛 버전 → 예전처럼 종류 없이
      if (kind) { this.kinds[i] = kind; this.releases[i] = undefined; }
      else this.bugs[i] = { ...this.bugs[i], nextAt: this.scene.time.now + 5000 }; // 20초 제한·가득 참 → 조금 뒤 다시
    });
  }
  update(time: number, delta: number, feet: Point, direction: Facing) {
    this.feet = feet; this.direction = direction;
    const people = [feet, ...this.peers.values()];
    this.bugs = this.bugs.map((bug, i) => {
      const image = this.images[i];
      // 종류를 받기 전에는 나타나지 않는다. 연결 전 1.5초도 기다린다(종류 없이 떴다가 사라지지 않게).
      if (!bug.position && !this.spawner && time - this.bornAt < 1500) { image.setVisible(false); return bug; }
      if (!bug.position && this.spawner && !this.kinds[i]) {
        if (time >= bug.nextAt) this.request(i);
        image.setVisible(false);
        return bug;
      }
      const kind = this.kinds[i];
      const threat = kind && kind.stars >= 3 && bug.position ? bugThreat(bug.position, people) : null;
      const next = stepRoamingBug(bug, this.grid, time, delta, Math.random, threat);
      if (bug.position && !next.position) { this.releases[i] = kind?.spawnId; this.kinds[i] = null; } // 날아가 버림
      image.setVisible(!!next.position);
      if (next.position) {
        image.setPosition(next.position.x, next.position.y);
        const row = Math.max(0, BUG_CATALOG.findIndex(b => b.id === kind?.bugId));
        if (this.scene.textures.exists('bug:dragonflies')) image.setTexture('bug:dragonflies', row * 4 + Math.floor(time / (threat ? 50 : 100)) % 4);
        else image.setScale(1, .8 + Math.sin(time / 65) * .2);
      }
      return next;
    });
    this.drawDizzy(time);
  }
  /** 지금 날고 있는 잠자리(디버그·시험용). */
  get positions(): Point[] { return this.bugs.flatMap(b => b.position ? [{ ...b.position }] : []); }
  get kindsDebug() { return this.bugs.flatMap((b, i) => b.position ? [{ ...b.position, bugId: this.kinds[i]?.bugId ?? null }] : []); }
  isSwinging(id: string) { return (this.swingUntil.get(id) ?? -1) > this.scene.time.now; }
  get nearby() { return this.bugs.some(b => b.position && Math.hypot(b.position.x - this.feet.x, b.position.y - this.feet.y) <= 24); }
  /** 마지막으로 휘두른 잠자리의 서버 종류 id(있으면 그 잠자리로 잡기를 시작한다). */
  get swungSpawn() { return this.swungIndex >= 0 ? this.kinds[this.swungIndex]?.spawnId : undefined; }
  /** 잠자리 근처가 아니어도 휘두른다(허공). 범위 안 친구는 어지러워진다. */
  swing(): Facing {
    this.swungIndex = this.bugs.findIndex(b => b.position && Math.hypot(b.position.x - this.feet.x, b.position.y - this.feet.y) <= 24);
    this.swingUntil.set('self', this.scene.time.now + 300);
    this.drawSwing(this.feet, this.direction);
    for (const id of netHits(this.feet, this.direction, this.peers)) this.makeDizzy(id);
    return this.direction;
  }
  /** 잡았거나(서버가 그 잠자리를 썼다) 사라졌다 — 그 자리를 비운다. */
  caught() {
    const index = this.swungIndex; this.swungIndex = -1;
    if (index >= 0) { this.bugs[index] = removeRoamingBug(this.scene.time.now); this.kinds[index] = null; this.images[index].setVisible(false); }
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
