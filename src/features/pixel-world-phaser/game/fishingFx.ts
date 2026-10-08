import { rodDisplay } from '../../pixel-room/shop/rods';
import type Phaser from 'phaser';
import type { Point } from '../logic/joystick';
import type { FishingGame } from '../logic/fishingGame';

export interface FishingAnchors { castFrom: Point; shadowPoint(index: number): Point }
export interface FishingEffects { update(game: FishingGame, index: number, now: number): void; clear(): void; destroy(): void }
const sheets = import.meta.glob('../assets/fishing/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
// RiverScene.preload에서 호출한다. 누락된 그림은 도형으로 대신한다.
export function preloadFishingFx(scene: Phaser.Scene) {
  for (const [name, width, height] of [['bobber', 8, 8], ['splash', 16, 16], ['fish-icons', 16, 16]] as const) {
    const url = sheets[`../assets/fishing/${name}.png`];
    if (url && !scene.textures.exists(`fishing-${name}`)) scene.load.spritesheet(`fishing-${name}`, url, { frameWidth: width, frameHeight: height });
  }
}
export function createFishingFx(scene: Phaser.Scene, anchors: FishingAnchors): FishingEffects {
  const line = scene.add.graphics().setDepth(10000);
  const bobber = scene.textures.exists('fishing-bobber') ? scene.add.sprite(0, 0, 'fishing-bobber') : scene.add.rectangle(0, 0, 4, 6, 0xf8e6b5).setStrokeStyle(1, 0xcc5144);
  bobber.setDepth(10001).setVisible(false);
  const bang = scene.add.text(0, 0, '!', { fontFamily: 'monospace', fontSize: '14px', color: '#ffdf73', stroke: '#48392e', strokeThickness: 2 }).setOrigin(0.5).setDepth(10002).setVisible(false);
  let previous: FishingGame['phase'] = 'idle';
  const transient = new Set<Phaser.GameObjects.GameObject>();
  const tweens = new Set<Phaser.Tweens.Tween>();
  const retire = (object: Phaser.GameObjects.GameObject) => { transient.delete(object); object.destroy(); };
  const clear = () => {
    line.clear(); bobber.setVisible(false); bang.setVisible(false);
    for (const tween of tweens) tween.remove();
    tweens.clear();
    for (const object of transient) { scene.tweens.killTweensOf(object); object.destroy(); }
    transient.clear(); previous = 'idle';
  };
  const update = (game: FishingGame, index: number, now: number) => {
    const from = anchors.castFrom, to = anchors.shadowPoint(index);
    if (game.phase === 'casting' || game.phase === 'waiting' || game.phase === 'bite') {
      const progress = Math.max(0, Math.min(1, (now - game.startedAt) / Math.max(1, game.castDurationMs)));
      const x = from.x + (to.x - from.x) * progress;
      const y = from.y + (to.y - from.y) * progress - Math.sin(progress * Math.PI) * 24 + (game.phase === 'bite' ? 4 : game.nibble >= 0 ? 2 : game.phase === 'waiting' ? Math.sin(now / 360) * 0.5 : 0);
      line.clear().lineStyle(1, rodDisplay(game.cast?.rod).color, 0.85).lineBetween(from.x, from.y, x, y);
      bobber.setVisible(true).setPosition(x, y);
      if ('setFrame' in bobber) (bobber as Phaser.GameObjects.Sprite).setFrame(game.phase === 'bite' ? 2 : game.nibble >= 0 ? 1 : 0);
      bang.setPosition(from.x, from.y - 18).setVisible(game.phase === 'bite');
    } else if (game.phase === 'reeling') {
      // 릴을 감는 동안: 팽팽한 줄, 물에 잠긴 찌가 파르르 떤다(친구 화면의 riverPeers와 같은 느낌).
      const x = to.x + Math.sin(now / 45) * 1.5, y = to.y + 3 + Math.cos(now / 60);
      line.clear().lineStyle(1, rodDisplay(game.cast?.rod).color, 0.95).lineBetween(from.x, from.y, x, y);
      bobber.setVisible(true).setPosition(x, y);
      if ('setFrame' in bobber) (bobber as Phaser.GameObjects.Sprite).setFrame(2);
      bang.setVisible(false);
    } else { line.clear(); bobber.setVisible(false); bang.setVisible(false); }
    if (game.phase === 'bite' && previous !== 'bite') {
      const splash = scene.textures.exists('fishing-splash') ? scene.add.sprite(to.x, to.y, 'fishing-splash') : scene.add.ellipse(to.x, to.y, 12, 5).setStrokeStyle(1, 0xe6f5f0);
      splash.setDepth(10001); transient.add(splash);
      const tween = scene.tweens.add({ targets: splash, scaleX: 2, scaleY: 2, alpha: 0, duration: 360, onUpdate: tween => {
        if ('setFrame' in splash) (splash as Phaser.GameObjects.Sprite).setFrame(Math.min(3, Math.floor(tween.progress * 4)));
      }, onComplete: () => { tweens.delete(tween); retire(splash); } });
      tweens.add(tween);
    }
    if (game.phase === 'landed' && previous !== 'landed') {
      const fish = scene.textures.exists('fishing-fish-icons') ? scene.add.sprite(to.x, to.y, 'fishing-fish-icons') : scene.add.ellipse(to.x, to.y, 10, 5, 0xe9cf7b);
      fish.setDepth(10002); transient.add(fish);
      const arc = { t: 0 };
      const tween = scene.tweens.add({ targets: arc, t: 1, duration: 650, onUpdate: () => fish.setPosition(to.x + (from.x - to.x) * arc.t, to.y + (from.y - to.y) * arc.t - Math.sin(arc.t * Math.PI) * 36), onComplete: () => { tweens.delete(tween); retire(fish); } });
      tweens.add(tween);
    }
    previous = game.phase;
  };
  const destroy = () => { clear(); line.destroy(); bobber.destroy(); bang.destroy(); scene.events.off('shutdown', destroy); };
  scene.events.once('shutdown', destroy);
  return { update, clear, destroy };
}
