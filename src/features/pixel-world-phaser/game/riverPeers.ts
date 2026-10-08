// 강가의 친구들: 아바타·펫(광장과 같은 그림), 머리 위 구름 말풍선, 친구의 낚싯줄·찌·입질 "!"·희귀 물고기 반짝임.
// 강가 장면의 지형 코드와 섞지 않으려고 따로 둔다. RiverScene은 만들 때 한 번, 매 프레임 update 한 번만 부른다.
// 글(말풍선)은 Phaser Text로만 그린다(HTML로 넣지 않는다). 구독 생명주기는 React RiverBridge가 맡는다.
import type Phaser from 'phaser';
import type { PlazaPlayerState } from '../../pixel-room/plaza/types';
import type { PetId } from '../../pixel-room/pet/petKinds';
import { AVATAR_POSES, AVATAR_FRAMES_PER_POSE } from '../logic/avatarPlan';
import { facingDelta, feetBlocked } from '../logic/world';
import type { SolidFn } from '../logic/world';
import { PET_SHEETS, petFollowSpot } from '../logic/petSheets';
import type { Point } from '../logic/joystick';
import { riverFeet } from '../logic/riverPresence';
import type { RiverPeerFishing } from '../logic/riverPresence';
import { composeAvatar } from './avatarTexture';
import { loadPetSheet } from './sceneAssets';
import { PlazaBubbles } from './plazaBubbles';
import type { PlazaBubble } from './plazaBubbles';

type Line = { line: Phaser.GameObjects.Graphics; bobber: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle; bang: Phaser.GameObjects.Text };
type Friend = {
  sprite?: Phaser.GameObjects.Sprite; pet?: Phaser.GameObjects.Sprite; look: string; petId: PetId | null; loading: boolean; state: PlazaPlayerState;
  fishing?: Line; lastPhase: RiverPeerFishing['phase'];
};
/** 던진 찌가 날아가는 시간(친구 화면 기준, 대략). */
const CAST_FLIGHT_MS = 400;
const SPARKLE_MS = 1600;

export class RiverPeers {
  private friends = new Map<string, Friend>();
  private bubbles: PlazaBubbles;
  private wantedBubbles: Record<string, PlazaBubble> = {};
  private fishing: Record<string, RiverPeerFishing> = {};
  private sparkles = new Map<string, { at: number; g: Phaser.GameObjects.Graphics }>();
  private selfId = '';
  private readonly scene: Phaser.Scene;
  private readonly solid: SolidFn;
  constructor(scene: Phaser.Scene, solid: SolidFn) {
    this.scene = scene; this.solid = solid;
    this.bubbles = new PlazaBubbles(scene);
  }

  /** 친구 명단(부드럽게 보간된 좌표)과 말풍선. 명단에서 빠진 친구는 바로 지운다. */
  set(players: PlazaPlayerState[], bubbles: Record<string, PlazaBubble>, selfId: string) {
    this.wantedBubbles = bubbles; this.selfId = selfId;
    const ids = new Set(players.map(p => p.sessionId));
    for (const id of [...this.friends.keys()]) if (!ids.has(id)) this.remove(id);
    for (const p of players) {
      let f = this.friends.get(p.sessionId);
      if (!f) { f = { look: '', petId: null, loading: false, state: p, lastPhase: 'idle' }; this.friends.set(p.sessionId, f); }
      f.state = p;
      this.ensureAvatar(p.sessionId, f);
      this.ensurePet(p.sessionId, f, p.pet ?? null);
    }
  }
  /** 친구(와 나)의 낚시 상태. 내 낚싯줄은 장면의 fishingFx가 그리므로 여기선 나의 반짝임만 쓴다. */
  setFishing(fishing: Record<string, RiverPeerFishing>) { this.fishing = fishing; }

  update(time: number, selfFeet: Point) {
    const now = Date.now();
    const spots = new Map<string, Point>([[this.selfId, selfFeet]]);
    for (const [id, f] of this.friends) {
      const p = f.state, feet = riverFeet(p);
      spots.set(id, feet);
      if (f.sprite) {
        f.sprite.setPosition(feet.x, feet.y).setDepth(feet.y);
        const anim = f.look + ':' + (p.moving ? 'Walk_' : 'Idle_') + p.direction;
        if (f.sprite.anims.currentAnim?.key !== anim) f.sprite.play(anim);
      }
      if (f.pet && p.pet) {
        const wanted = petFollowSpot(feet, p.direction), spot = feetBlocked(wanted, this.solid) ? feet : wanted;
        const sheet = PET_SHEETS[p.pet], a = p.moving ? sheet.walk : sheet.idle;
        f.pet.setPosition(spot.x, spot.y).setDepth(spot.y).setFrame(a.row * sheet.columns + a.frames[Math.floor(time / a.frameMs) % a.frames.length]);
      }
      this.drawLine(f, feet, this.fishing[id], now, time);
    }
    for (const [id, view] of Object.entries(this.fishing)) {
      const spot = spots.get(id);
      if (spot && view.sparkleAt !== null && now - view.sparkleAt < SPARKLE_MS) this.sparkle(id, spot, view.sparkleAt, now);
    }
    for (const [id, s] of this.sparkles) {
      const spot = spots.get(id);
      if (!spot || now - s.at >= SPARKLE_MS || this.fishing[id]?.sparkleAt !== s.at) { s.g.destroy(); this.sparkles.delete(id); }
    }
    this.bubbles.update(this.wantedBubbles, spots);
  }

  /** 장면이 내려갈 때: 그림은 장면이 함께 지우므로 기억만 비운다. */
  clear() { this.friends.clear(); this.sparkles.clear(); this.bubbles.clear(); this.fishing = {}; this.wantedBubbles = {}; }

  snapshot() {
    return {
      classmates: [...this.friends].map(([id, f]) => ({ id, x: f.state.x, y: f.state.y, rendered: !!f.sprite, pet: !!f.pet,
        fishing: f.fishing?.bobber.visible ? { phase: f.lastPhase, bobber: { x: Math.round(f.fishing.bobber.x), y: Math.round(f.fishing.bobber.y) }, bang: f.fishing.bang.visible } : null })),
      bubbles: this.bubbles.snapshot(),
      sparkles: [...this.sparkles.keys()],
    };
  }

  private remove(id: string) {
    const f = this.friends.get(id);
    if (!f) return;
    f.sprite?.destroy(); f.pet?.destroy();
    if (f.fishing) { f.fishing.line.destroy(); f.fishing.bobber.destroy(); f.fishing.bang.destroy(); }
    this.friends.delete(id);
  }
  private ensureAvatar(id: string, f: Friend) {
    const look = composeAvatar(f.state.appearance);
    if (f.look === look.key || f.loading) return;
    f.loading = true;
    void look.canvas.then(canvas => {
      if (!this.scene.scene.isActive() || this.friends.get(id) !== f) return;
      if (!this.scene.textures.exists(look.key)) {
        const texture = this.scene.textures.addCanvas(look.key, canvas);
        if (texture) for (let i = 0; i < 32; i++) texture.add(i, 0, i % 4 * 32, Math.floor(i / 4) * 32, 32, 32);
      }
      f.sprite?.destroy(); f.sprite = this.scene.add.sprite(0, 0, look.key).setOrigin(.5, 31 / 32);
      f.look = look.key;
      AVATAR_POSES.forEach((pose, index) => {
        const key = look.key + ':' + pose;
        if (!this.scene.anims.exists(key)) this.scene.anims.create({ key, repeat: -1, frameRate: 8, frames: (pose.startsWith('Walk') ? [0, 1, 2, 3] : [0]).map(frame => ({ key: look.key, frame: index * AVATAR_FRAMES_PER_POSE + frame })) });
      });
    }).catch(() => {}).finally(() => { f.loading = false; });
  }
  private ensurePet(id: string, f: Friend, petId: PetId | null) {
    if (f.petId === petId) return;
    f.petId = petId; f.pet?.destroy(); f.pet = undefined;
    if (!petId) return;
    void loadPetSheet(petId).then(source => {
      if (!this.scene.scene.isActive() || this.friends.get(id) !== f || f.petId !== petId) return;
      const key = 'plaza-pet:' + petId, sheet = PET_SHEETS[petId];
      if (!this.scene.textures.exists(key)) {
        const texture = source instanceof HTMLCanvasElement ? this.scene.textures.addCanvas(key, source) : this.scene.textures.addImage(key, source);
        if (texture) for (let r = 0; r < sheet.rows; r++) for (let c = 0; c < sheet.columns; c++) texture.add(r * sheet.columns + c, 0, c * sheet.cell, r * sheet.cell, sheet.cell, sheet.cell);
      }
      f.pet = this.scene.add.sprite(0, 0, key).setOrigin(.5, sheet.footY / sheet.cell);
    }).catch(() => {});
  }
  /** 친구의 낚싯줄. 던짐은 짧게 날아가고, 기다림은 살짝 출렁, 입질은 찌가 잠기고 "!"가 뜬다. */
  private drawLine(f: Friend, feet: Point, view: RiverPeerFishing | undefined, now: number, time: number) {
    const showing = !!view && !!view.target && (view.phase === 'casting' || view.phase === 'waiting' || view.phase === 'bite' || view.phase === 'reeling');
    if (!showing) {
      if (f.fishing) { f.fishing.line.clear(); f.fishing.bobber.setVisible(false); f.fishing.bang.setVisible(false); }
      if (view && f.lastPhase !== view.phase) this.result(view, f.lastPhase);
      f.lastPhase = view?.phase ?? 'idle';
      return;
    }
    const line = f.fishing ?? (f.fishing = this.makeLine());
    const d = facingDelta(f.state.direction), from = { x: feet.x + d.x * 9, y: feet.y - 14 + d.y * 4 }, to = view.target!;
    const progress = view.phase === 'casting' ? Math.max(0, Math.min(1, (now - view.since) / CAST_FLIGHT_MS)) : 1;
    const x = from.x + (to.x - from.x) * progress;
    const y = from.y + (to.y - from.y) * progress - Math.sin(progress * Math.PI) * 24
      + (view.phase === 'bite' ? 4 : view.phase === 'reeling' ? Math.sin(time / 60) * 1.5 : view.phase === 'waiting' ? Math.sin(time / 360) * 0.5 : 0);
    line.line.clear().lineStyle(1, 0xece3ca, 0.7).lineBetween(from.x, from.y, x, y);
    line.bobber.setVisible(true).setPosition(x, y);
    if ('setFrame' in line.bobber) (line.bobber as Phaser.GameObjects.Sprite).setFrame(view.phase === 'bite' ? 2 : 0);
    line.bang.setPosition(feet.x, feet.y - 40).setVisible(view.phase === 'bite');
    f.lastPhase = view.phase;
  }
  private makeLine(): Line {
    const line = this.scene.add.graphics().setDepth(9990);
    const bobber = this.scene.textures.exists('fishing-bobber') ? this.scene.add.sprite(0, 0, 'fishing-bobber') : this.scene.add.rectangle(0, 0, 4, 6, 0xf8e6b5).setStrokeStyle(1, 0xcc5144);
    bobber.setDepth(9991).setVisible(false);
    const bang = this.scene.add.text(0, 0, '!', { fontFamily: 'monospace', fontSize: '14px', color: '#ffdf73', stroke: '#48392e', strokeThickness: 2 }).setOrigin(0.5).setDepth(100000).setVisible(false);
    return { line, bobber, bang };
  }
  /** 결과 순간: 잡으면 물보라 없이 물고기가 튀어 오르고, 놓치면 작은 물보라. */
  private result(view: RiverPeerFishing, previous: RiverPeerFishing['phase']) {
    if (!view.target || (previous !== 'bite' && previous !== 'reeling' && previous !== 'waiting' && previous !== 'casting')) return;
    const to = view.target;
    if (view.phase !== 'landed' && view.phase !== 'escaped') return;
    const splash = this.scene.add.ellipse(to.x, to.y, 12, 5).setStrokeStyle(1, 0xe6f5f0).setDepth(9991);
    this.scene.tweens.add({ targets: splash, scaleX: 2, scaleY: 2, alpha: 0, duration: 360, onComplete: () => splash.destroy() });
  }
  private sparkle(id: string, spot: Point, at: number, now: number) {
    let s = this.sparkles.get(id);
    if (!s || s.at !== at) { s?.g.destroy(); s = { at, g: this.scene.add.graphics().setDepth(100000) }; this.sparkles.set(id, s); }
    const t = (now - at) / SPARKLE_MS, g = s.g.clear();
    // 머리 둘레를 도는 별 다섯 개. 끝으로 갈수록 흐려진다.
    for (let i = 0; i < 5; i++) {
      const angle = t * Math.PI * 2 + i * (Math.PI * 2 / 5), r = 12 + t * 6;
      const x = Math.round(spot.x + Math.cos(angle) * r), y = Math.round(spot.y - 24 + Math.sin(angle) * r * 0.6);
      g.fillStyle(i % 2 ? 0xfff2a8 : 0xffd45c, 1 - t);
      g.fillRect(x - 1, y - 3, 2, 6).fillRect(x - 3, y - 1, 6, 2);
    }
  }
}
