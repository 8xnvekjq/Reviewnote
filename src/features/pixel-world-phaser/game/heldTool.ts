// 손에 든 도구(낚싯대·잠자리채)를 캐릭터 옆에 작게 그린다. 내 캐릭터와 친구 캐릭터가 같이 쓴다.
// 잠자리채는 휘두르기 그림(assets/bugs/net-swing.png)의 첫 장면을 그대로 써서 모양을 맞춘다.
// 낚싯대는 자세가 셋: 들고 다님(carry) · A를 누르는 동안 뒤로 젖힘(windup) · 던진 뒤 앞으로 내밂(cast).
import Phaser from 'phaser';
import type { Facing } from '../logic/joystick';
import { heldToolFromTag, heldToolPose } from '../logic/heldTool';
import type { HeldToolMode } from '../logic/heldTool';
import netSwingUrl from '../assets/bugs/net-swing.png';

export type HeldToolKind = 'rod' | 'net';
export interface HeldToolSpec { kind: HeldToolKind; color: number }
export type { HeldToolMode } from '../logic/heldTool';
export { rodTip } from '../logic/heldTool';
type Pt = { x: number; y: number };
const LINE_DARK = 0x3a2416, GRIP = 0x5b3a22, REEL = 0x9aa3a8, FISH_LINE = 0xece3ca;
const NET_KEY = 'bug:net-swing';
/** 휘두르기 그림 첫 장면(32×32)에서 손잡이 끝 위치. */
const NET_GRIP = { x: 7.5, y: 16 };

export class HeldTool {
  private readonly scene: Phaser.Scene;
  private readonly g: Phaser.GameObjects.Graphics;
  private net?: Phaser.GameObjects.Sprite;
  private key = '';
  constructor(scene: Phaser.Scene) {
    this.scene = scene; this.g = scene.add.graphics();
    ensureNetTexture(scene);
  }
  /** tool이 없거나 hidden(잠자리채를 휘두르는 중)이면 숨긴다. depth는 캐릭터 깊이(발 y). */
  update(tool: HeldToolSpec | null | undefined, x: number, y: number, facing: Facing, depth: number, alpha = 1, mode: HeldToolMode = 'carry', hidden = false) {
    if (!tool || hidden) { this.g.setVisible(false); this.net?.setVisible(false); return; }
    const pose = heldToolPose(facing, tool.kind === 'net' ? 'carry' : mode);
    const z = depth + (pose.behind ? -0.2 : 0.2);
    if (tool.kind === 'net') {
      this.g.setVisible(false);
      if (!this.net && this.scene.textures.exists(NET_KEY)) this.net = this.scene.add.sprite(0, 0, NET_KEY, 0);
      if (!this.net) return;
      const flip = facing === 'Left';
      this.net.setVisible(true).setFlipX(flip).setOrigin((flip ? 32 - NET_GRIP.x : NET_GRIP.x) / 32, NET_GRIP.y / 32)
        .setPosition(Math.round(x + pose.hand.x), Math.round(y + pose.hand.y)).setDepth(z).setAlpha(alpha);
      return;
    }
    this.net?.setVisible(false);
    this.g.setVisible(true).setPosition(Math.round(x), Math.round(y)).setDepth(z).setAlpha(alpha);
    const key = `${tool.color}:${facing}:${mode}`;
    if (key === this.key) return;
    this.key = key;
    drawRod(this.g.clear(), pose.hand, pose.tip, tool.color, mode === 'carry');
  }
  destroy() { this.g.destroy(); this.net?.destroy(); }
}

/** 가는 낚싯대: 손잡이 · 릴 · 점점 가늘어지는 대 · 끝에서 늘어진 줄과 찌(들고 다닐 때만). */
function drawRod(g: Phaser.GameObjects.Graphics, hand: Pt, tip: Pt, color: number, slack: boolean) {
  const at = (t: number) => ({ x: hand.x + (tip.x - hand.x) * t, y: hand.y + (tip.y - hand.y) * t });
  const butt = { x: hand.x - (tip.x - hand.x) * 0.12, y: hand.y - (tip.y - hand.y) * 0.12 };
  const grip = at(0.22), mid = at(0.6);
  g.lineStyle(2, GRIP, 1).lineBetween(butt.x, butt.y, grip.x, grip.y);
  g.lineStyle(1.5, color, 1).lineBetween(grip.x, grip.y, mid.x, mid.y);
  g.lineStyle(1, color, 1).lineBetween(mid.x, mid.y, tip.x, tip.y);
  g.fillStyle(LINE_DARK, 0.9).fillRect(Math.round(grip.x) - 1, Math.round(grip.y), 2, 2);
  g.fillStyle(REEL, 1).fillRect(Math.round(grip.x) - 1, Math.round(grip.y), 1, 1);
  g.fillStyle(0xf3ead2, 1).fillRect(Math.round(tip.x), Math.round(tip.y), 1, 1);
  if (slack) {
    g.lineStyle(1, FISH_LINE, 0.8).lineBetween(tip.x, tip.y, tip.x + 1, tip.y + 6);
    g.fillStyle(0xd8584a, 1).fillRect(Math.round(tip.x), Math.round(tip.y + 6), 2, 2); // 작은 찌
  }
}

function ensureNetTexture(scene: Phaser.Scene) {
  if (scene.textures.exists(NET_KEY)) return;
  const image = new Image();
  image.onload = () => {
    if (scene.textures.exists(NET_KEY) || !scene.sys?.isActive()) return;
    const texture = scene.textures.addImage(NET_KEY, image);
    if (texture) for (let i = 0; i < 4; i++) texture.add(i, 0, i * 32, 0, 32, 32);
  };
  image.src = netSwingUrl;
}

/** 친구 캐릭터의 도구: 받은 표시(state.tool)대로 아바타 옆에 그린다. 곰을 타면 감춘다. */
export function updatePeerTool(scene: Phaser.Scene, f: { tool?: HeldTool; sprite?: Phaser.GameObjects.Sprite; state: { tool?: string; riding?: boolean; pet?: string | null; direction: Facing } }, feet: Pt, mode: HeldToolMode = 'carry', hidden = false) {
  const spec = f.sprite && !(f.state.riding === true && f.state.pet === 'pet_bear') ? heldToolFromTag(f.state.tool) : null;
  if (!spec && !f.tool) return;
  f.tool ??= new HeldTool(scene);
  f.tool.update(spec, feet.x, feet.y, f.state.direction, f.sprite?.depth ?? feet.y, f.sprite?.alpha ?? 1, mode, hidden);
}
