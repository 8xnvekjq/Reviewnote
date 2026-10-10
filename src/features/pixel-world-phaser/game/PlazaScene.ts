import { updatePeerCompanion, peerCompanionSnapshot } from './peerCompanion';
import type { PetFollowState } from '../logic/petFollow';
// 광장 그림과 친구들. 구독 생명주기는 React PlazaBridge가 맡는다.
import type Phaser from 'phaser';
import { SCENERY } from '../../pixel-room/plaza/plazaLayout';
import type { PlazaPlayerState } from '../../pixel-room/plaza/types';
import { AVATAR_POSES, AVATAR_FRAMES_PER_POSE } from '../logic/avatarPlan';
import { plazaGroundTile, PLAZA_MARGIN, PLAZA_EXIT, plazaBorderGap } from '../logic/plazaWorld';
import { PET_SHEETS } from '../logic/petSheets';
import { composeAvatar } from './avatarTexture';
import { loadPetSheet, loadBed } from './sceneAssets';
import { PlazaBubbles } from './plazaBubbles';
import type { PlazaBubble } from './plazaBubbles';
import { WorldScene } from './WorldScene';
import type { WorldContext } from './WorldScene';

type Friend = { follow?: PetFollowState; sprite?: Phaser.GameObjects.Sprite; pet?: Phaser.GameObjects.Sprite; look: string; petId: string | null; loading: boolean; state: PlazaPlayerState };
export class PlazaScene extends WorldScene {
  protected readonly background = '#5d8a4a';
  private friends = new Map<string, Friend>();
  private bubbles: PlazaBubbles | null = null;
  private wantedBubbles: Record<string, PlazaBubble> = {};
  private selfId = '';
  private exhibit: Phaser.GameObjects.Image | null = null;
  private exhibitWanted = false;
  constructor(ctx: WorldContext) { super('plaza', ctx); }
  protected drawWorld() {
    this.exhibit = null; this.exhibitWanted = false;
    this.friends = new Map(); this.bubbles = new PlazaBubbles(this); this.wantedBubbles = {};
    const canvas = document.createElement('canvas'); canvas.width = 416; canvas.height = 352;
    const g = canvas.getContext('2d')!; g.imageSmoothingEnabled = false;
    const tile = (id: number, x: number, y: number, w = 16, h = 16) => g.drawImage(this.ctx.assets.town, id % 12 * 16, Math.floor(id / 12) * 16, 16, 16, x, y, w, h);
    for (let y = 0; y < 22; y++) for (let x = 0; x < 26; x++) tile(plazaGroundTile(x - 5, y - 5), x * 16, y * 16);
    if (!this.textures.exists('plaza-ground')) this.textures.addCanvas('plaza-ground', canvas);
    this.add.image(0, 0, 'plaza-ground').setOrigin(0).setDepth(-1000);
    // 열린 잔디와 막힌 지도 경계를 구별하는 나무 줄.
    if (!this.textures.exists('plaza-border-tree')) {
      const c = document.createElement('canvas'); c.width = 16; c.height = 32;
      const p = c.getContext('2d')!; p.imageSmoothingEnabled = false;
      p.drawImage(this.ctx.assets.town, 64, 0, 16, 32, 0, 0, 16, 32);
      this.textures.addCanvas('plaza-border-tree', c);
    }
    for (let y = 0; y < 22; y++) for (let x = 0; x < 26; x++) {
      if (x !== 0 && y !== 0 && x !== 25 && y !== 21) continue;
      if (plazaBorderGap(x, y)) continue;
      this.add.image(x * 16 + 8, (y + 1) * 16, 'plaza-border-tree').setOrigin(.5, 1).setDepth((y + 1) * 16 - 2);
    }
    SCENERY.forEach((s, index) => {
      const c = document.createElement('canvas'); c.width = s.w * 16; c.height = s.h * 16;
      const p = c.getContext('2d')!; p.imageSmoothingEnabled = false;
      const rect = (color: string, x: number, y: number, w: number, h: number) => { p.fillStyle = color; p.fillRect(x, y, w, h); };
      if (s.kind === 'shop' && this.ctx.assets.plazaStall) {
        p.drawImage(this.ctx.assets.plazaStall, 0, 0, c.width, c.height);
        // 카운터 안의 상점지기. A 대상은 가판대 앞 세 칸에서 닿는다.
        rect('#e8b68b', 22, 26, 6, 7); rect('#584335', 22, 25, 6, 2);
        rect('#3b352f', 23, 29, 1, 1); rect('#3b352f', 26, 29, 1, 1);
        rect('#759477', 20, 33, 10, 5);
      }
      else if (s.kind === 'tree' || s.kind === 'well') p.drawImage(this.ctx.assets.town, s.kind === 'tree' ? 64 : 128, s.kind === 'tree' ? 0 : 112, 16, 32, 0, 0, c.width, c.height);
      else if (s.kind === 'bush') p.drawImage(this.ctx.assets.town, 64, 32, 16, 16, 0, 0, 16, 16);
      else if (s.kind === 'fence') for (let i = 0; i < s.w; i++) { const id = i === 0 ? 80 : i === s.w - 1 ? 82 : 81; p.drawImage(this.ctx.assets.town, id % 12 * 16, Math.floor(id / 12) * 16, 16, 16, i * 16, 0, 16, 16); }
      else if (s.kind === 'bench') { rect('#805b3e', 2, 2, 28, 7); rect('#b88b52', 0, 9, 32, 4); rect('#684a33', 4, 13, 3, 3); rect('#684a33', 25, 13, 3, 3); }
      else if (s.kind === 'notice') { rect('#805b3e', 13, 14, 6, 18); rect('#b88b52', 0, 0, 32, 5); rect('#805b3e', 2, 5, 28, 20); rect('#f6e7bc', 5, 8, 22, 14); for (let y = 11; y < 20; y += 4) rect('#a38963', 8, y, 15, 1); }
      else if (s.kind === 'podium') { rect('#b3a180', 4, 26, 24, 6); rect('#ead7ae', 1, 24, 30, 4); }
      const key = 'plaza-scenery:' + index;
      if (!this.textures.exists(key)) this.textures.addCanvas(key, c);
      this.add.image((s.x + 5) * 16, (s.y + 5) * 16, key).setOrigin(0).setDepth((s.footprint.y + 5 + s.footprint.h) * 16 - 2);
    });
    const hint = this.add.text((PLAZA_EXIT.x + .5) * 16, (PLAZA_EXIT.y + .5) * 16, '↓', { fontSize: '12px', color: '#fff4ce' }).setOrigin(.5).setDepth(-900);
    this.tweens.add({ targets: hint, alpha: .35, y: hint.y + 3, duration: 850, yoyo: true, repeat: -1 });
    const clear = () => { this.friends.clear(); this.bubbles?.clear(); this.bubbles = null; };
    this.events.once('shutdown', clear);
  }
  setExhibit(show: boolean) {
    this.exhibitWanted = show;
    if (!show) { this.exhibit?.destroy(); this.exhibit = null; return; }
    if (this.exhibit) return;
    void Promise.resolve().then(() => loadBed({ stage: 'ripe', moisture: 'normal' })).then(image => {
      if (!this.scene.isActive() || !this.exhibitWanted || this.exhibit) return;
      if (!this.textures.exists('plaza-tomato')) this.textures.addImage('plaza-tomato', image);
      this.exhibit = this.add.image(160, 136, 'plaza-tomato').setDisplaySize(24, 24).setOrigin(.5, 1).setDepth(143);
    }).catch(() => {});
  }
  /** bubbles: 머리 위 말풍선(인사·한마디). 목록에서 빠지면 장면이 천천히 흐리게 지운다. */
  setClassmates(players: PlazaPlayerState[], bubbles: Record<string, PlazaBubble>, selfId: string) {
    this.wantedBubbles = bubbles; this.selfId = selfId;
    const ids = new Set(players.map(p => p.sessionId));
    for (const [id, f] of this.friends) if (!ids.has(id)) { f.sprite?.destroy(); f.pet?.destroy(); this.friends.delete(id); }
    for (const p of players) {
      let f = this.friends.get(p.sessionId);
      if (!f) { f = { look: '', petId: null, loading: false, state: p }; this.friends.set(p.sessionId, f); }
      f.state = p;
      const look = composeAvatar(p.appearance);
      if (f.look !== look.key && !f.loading) {
        f.loading = true;
        const friend = f;
        void look.canvas.then(canvas => {
          if (!this.scene.isActive() || this.friends.get(p.sessionId) !== friend) return;
          if (!this.textures.exists(look.key)) {
            const texture = this.textures.addCanvas(look.key, canvas);
            if (texture) for (let i = 0; i < 32; i++) texture.add(i, 0, i % 4 * 32, Math.floor(i / 4) * 32, 32, 32);
          }
          friend.sprite?.destroy(); friend.sprite = this.add.sprite(0, 0, look.key).setOrigin(.5, 31 / 32);
          friend.look = look.key;
          AVATAR_POSES.forEach((pose, index) => {
            const key = look.key + ':' + pose;
            if (!this.anims.exists(key)) this.anims.create({ key, repeat: -1, frameRate: 8, frames: (pose.startsWith('Walk') ? [0, 1, 2, 3] : [0]).map(frame => ({ key: look.key, frame: index * AVATAR_FRAMES_PER_POSE + frame })) });
          });
        }).catch(() => {}).finally(() => { friend.loading = false; });
      }
      const petId = p.pet ?? null;
      if (f.petId !== petId) {
        f.petId = petId; f.pet?.destroy(); f.pet = undefined; f.follow = undefined;
        const friend = f;
        if (petId) void loadPetSheet(petId).then(source => {
          if (!this.scene.isActive() || this.friends.get(p.sessionId) !== friend || friend.petId !== petId) return;
          const key = 'plaza-pet:' + petId, sheet = PET_SHEETS[petId];
          if (!this.textures.exists(key)) {
            const texture = source instanceof HTMLCanvasElement ? this.textures.addCanvas(key, source) : this.textures.addImage(key, source);
            if (texture) for (let r = 0; r < sheet.rows; r++) for (let c = 0; c < sheet.columns; c++) texture.add(r * sheet.columns + c, 0, c * sheet.cell, r * sheet.cell, sheet.cell, sheet.cell);
          }
          friend.pet = this.add.sprite(0, 0, key).setOrigin(.5, sheet.footY / sheet.cell);
        }).catch(() => {});
      }
    }
  }
  update(time: number, delta: number) {
    super.update(time, delta);
    const spots = new Map<string, { x: number; y: number }>([[this.selfId, this.feet]]);
    for (const [id, f] of this.friends) {
      const p = f.state, feet = { x: (p.x + PLAZA_MARGIN + .5) * 16, y: (p.y + PLAZA_MARGIN + .5) * 16 };
      spots.set(id, feet);
      updatePeerCompanion(f, feet, time, delta, this.spec.solid);
    }
    this.bubbles?.update(this.wantedBubbles, spots);
  }
  snapshot() {
    return { ...super.snapshot(), classmates: [...this.friends].map(([id, f]) => ({ id, x: f.state.x, y: f.state.y, rendered: !!f.sprite, pet: !!f.pet, ...peerCompanionSnapshot(f) })),
      reactions: Object.keys(this.wantedBubbles), bubbles: this.bubbles?.snapshot() ?? [] };
  }
}
