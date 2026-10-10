import type Phaser from 'phaser';
import type { Point, Facing } from '../logic/joystick';
import type { Grid } from '../logic/world';
import { facingDelta } from '../logic/world';
import { emptyRoamingBug, removeRoamingBug, stepRoamingBug } from '../logic/bugGame';
import type { NetSwingPayload } from '../logic/bugCatalog';

// 셸과 장면의 연결은 이 작은 방문별 컨트롤러로만 한다. 장면 종료 시 반드시 제거한다.
const active = new Map<string, Dragonflies>();
export const dragonfliesFor = (scene: string | null) => scene ? active.get(scene) : undefined;
const sheets = import.meta.glob('../assets/bugs/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export class Dragonflies {
  private bugs = [emptyRoamingBug(), emptyRoamingBug()];
  private images: Phaser.GameObjects.Sprite[] = [];
  private peers = new Map<string, Point>();
  private seen = new Map<string, number>();
  private alive = true;
  private feet: Point = { x: 0, y: 0 };
  private direction: Facing = 'Front';
  private swungIndex = -1;
  private scene: Phaser.Scene;
  private grid: Grid;
  constructor(scene: Phaser.Scene, grid: Grid, id: string) {
    this.scene = scene; this.grid = grid;
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
  update(time: number, delta: number, feet: Point, direction: Facing) {
    this.feet = feet; this.direction = direction;
    this.bugs = this.bugs.map((bug, i) => {
      const next = stepRoamingBug(bug, this.grid, time, delta), image = this.images[i];
      image.setVisible(!!next.position);
      if (next.position) {
        image.setPosition(next.position.x, next.position.y);
        if (this.scene.textures.exists('bug:dragonflies')) image.setTexture('bug:dragonflies', Math.floor(time / 100) % 4);
        else image.setScale(1, .8 + Math.sin(time / 65) * .2);
      }
      return next;
    });
  }
  get nearby() { return this.bugs.some(b => b.position && Math.hypot(b.position.x - this.feet.x, b.position.y - this.feet.y) <= 24); }
  swing(): Facing {
    this.swungIndex = this.bugs.findIndex(b => b.position && Math.hypot(b.position.x - this.feet.x, b.position.y - this.feet.y) <= 24);
    this.drawSwing(this.feet, this.direction); return this.direction;
  }
  caught() {
    const index = this.swungIndex; this.swungIndex = -1;
    if (index >= 0) { this.bugs[index] = removeRoamingBug(this.scene.time.now); this.images[index].setVisible(false); }
  }
  setPeers(spots: Map<string, Point>, selfId: string) {
    this.peers = new Map([...spots].filter(([id]) => id !== selfId));
    for (const id of this.seen.keys()) if (!this.peers.has(id)) this.seen.delete(id);
  }
  peerSwing(payload: NetSwingPayload) {
    const spot = this.peers.get(payload.sessionId);
    if (!spot || payload.at <= (this.seen.get(payload.sessionId) ?? -Infinity)) return;
    this.seen.set(payload.sessionId, payload.at); this.drawSwing(spot, payload.direction);
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
