import type Phaser from 'phaser';
import type { Point } from '../logic/joystick';
import { worldTint } from '../logic/worldTint';
import type { FishPhase, FishWeather } from '../logic/worldTint';

// 입력을 막지 않는 저비용 그래픽 효과.
export class WorldTint {
  private readonly graphic: Phaser.GameObjects.Graphics;
  private phase: FishPhase = 'day';
  private weather: FishWeather = 'clear';
  private elapsed = 0;
  private nextDraw = 0;
  private readonly scene: Phaser.Scene;
  private readonly feet: () => Point;
  constructor(scene: Phaser.Scene, feet: () => Point) {
    this.scene = scene; this.feet = feet;
    this.graphic = scene.add.graphics().setDepth(200000);
  }
  debug() { return { phase: this.phase, weather: this.weather, parameters: worldTint(this.phase, this.weather) }; }
  set(phase: FishPhase, weather: FishWeather) { this.phase = phase; this.weather = weather; this.nextDraw = 0; }
  update(delta: number) {
    this.elapsed += Math.min(delta, 100);
    if (this.elapsed < this.nextDraw) return;
    this.nextDraw = this.elapsed + 1000 / 30;
    const tint = worldTint(this.phase, this.weather), g = this.graphic, camera = this.scene.cameras.main;
    const w = camera.width / camera.zoom, h = camera.height / camera.zoom;
    const left = camera.worldView.x, top = camera.worldView.y, p = this.feet();
    g.clear();
// 입력을 막지 않는 저비용 그래픽 효과.
    for (let y = top; y < top + h; y += 4) {
      const height = Math.min(4, top + h - y);
      const dy = y + height / 2 - (p.y - 12);
      const radius = tint.lightRadius;
      const cuts = [left, left + w];
      for (let ring = 1; ring <= 6; ring++) {
        const r = radius * ring / 6;
        if (Math.abs(dy) >= r) continue;
        const half = Math.sqrt(r * r - dy * dy);
        cuts.push(Math.max(left, Math.min(left + w, p.x - half)), Math.max(left, Math.min(left + w, p.x + half)));
      }
      cuts.sort((a, b) => a - b);
      for (let i = 0; i < cuts.length - 1; i++) {
        const a = cuts[i], b = cuts[i + 1];
        const distance = Math.hypot((a + b) / 2 - p.x, dy);
        const light = radius ? Math.min(1, 0.3 + 0.7 * (distance / radius) ** 2) : 1;
        g.fillStyle(tint.color, tint.alpha * light).fillRect(a, y, b - a, height);
      }
    }
    g.lineStyle(1, 0xc4e2ed, 0.5);
    for (let i = 0; i < tint.rainDrops; i++) {
      const x = left + ((i * 43 + this.elapsed * 0.014) % w), y = top + ((i * 29 + this.elapsed * 0.075) % h);
      g.lineBetween(x, y, x - 1, y + 4);
    }
  }
}
