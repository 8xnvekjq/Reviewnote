// 손에 든 도구(낚싯대·잠자리채)를 캐릭터 옆에 작게 그린다. 내 캐릭터와 친구 캐릭터가 같이 쓴다.
import Phaser from 'phaser';
import type { Facing } from '../logic/joystick';
import { heldToolFromTag } from '../logic/heldTool';

export type HeldToolKind = 'rod' | 'net';
export interface HeldToolSpec { kind: HeldToolKind; color: number }
const NET_STICK = 0x9b6a3c, NET_HOOP = 0xf3ead2, LINE_DARK = 0x3a2416;

/** 손 위치(발 기준)와 도구가 뻗는 방향. 위를 볼 때는 몸 뒤라 캐릭터보다 먼저 그린다. */
export function heldToolPose(facing: Facing) {
  switch (facing) {
    case 'Left': return { hand: { x: -6, y: -11 }, tip: { x: -12, y: -26 }, behind: false };
    case 'Right': return { hand: { x: 6, y: -11 }, tip: { x: 12, y: -26 }, behind: false };
    case 'Back': return { hand: { x: -6, y: -12 }, tip: { x: -9, y: -28 }, behind: true };
    default: return { hand: { x: 6, y: -11 }, tip: { x: 9, y: -27 }, behind: false };
  }
}

export class HeldTool {
  private readonly g: Phaser.GameObjects.Graphics;
  private key = '';
  constructor(scene: Phaser.Scene) { this.g = scene.add.graphics(); }
  /** tool이 없으면 숨긴다. depth는 캐릭터 깊이(발 y). */
  update(tool: HeldToolSpec | null | undefined, x: number, y: number, facing: Facing, depth: number, alpha = 1) {
    if (!tool) { this.g.setVisible(false); return; }
    const pose = heldToolPose(facing);
    this.g.setVisible(true).setPosition(Math.round(x), Math.round(y)).setDepth(depth + (pose.behind ? -0.2 : 0.2)).setAlpha(alpha);
    const key = `${tool.kind}:${tool.color}:${facing}`;
    if (key === this.key) return;
    this.key = key;
    const { hand, tip } = pose, g = this.g;
    g.clear();
    if (tool.kind === 'rod') {
      g.lineStyle(3, LINE_DARK, 0.55).lineBetween(hand.x, hand.y, tip.x, tip.y);
      g.lineStyle(2, tool.color, 1).lineBetween(hand.x, hand.y, tip.x, tip.y);
      g.fillStyle(LINE_DARK, 1).fillRect(hand.x - 1, hand.y - 1, 2, 3); // 손잡이
      g.fillStyle(0xf3ead2, 1).fillRect(tip.x - 0.5, tip.y - 0.5, 1, 1);
    } else {
      // 막대 끝(tip 쪽)에 둥근 테와 그물.
      const len = Math.hypot(tip.x - hand.x, tip.y - hand.y), ux = (tip.x - hand.x) / len, uy = (tip.y - hand.y) / len;
      const cx = tip.x + ux * 1.5, cy = tip.y + uy * 1.5;
      g.lineStyle(3, LINE_DARK, 0.5).lineBetween(hand.x, hand.y, tip.x, tip.y);
      g.lineStyle(2, NET_STICK, 1).lineBetween(hand.x, hand.y, tip.x, tip.y);
      g.fillStyle(NET_HOOP, 0.45).fillCircle(cx, cy, 5);
      g.lineStyle(1, LINE_DARK, 0.45).lineBetween(cx - 4, cy, cx + 4, cy).lineBetween(cx, cy - 4, cx, cy + 4);
      g.lineStyle(1.5, NET_HOOP, 1).strokeCircle(cx, cy, 5);
    }
  }
  destroy() { this.g.destroy(); }
}

/** 친구 캐릭터의 도구: 받은 표시(state.tool)대로 아바타 옆에 그린다. 곰을 타면 감춘다. */
export function updatePeerTool(scene: Phaser.Scene, f: { tool?: HeldTool; sprite?: Phaser.GameObjects.Sprite; state: { tool?: string; riding?: boolean; pet?: string | null; direction: Facing } }, feet: { x: number; y: number }) {
  const spec = f.sprite && !(f.state.riding === true && f.state.pet === 'pet_bear') ? heldToolFromTag(f.state.tool) : null;
  if (!spec && !f.tool) return;
  f.tool ??= new HeldTool(scene);
  f.tool.update(spec, feet.x, feet.y, f.state.direction, f.sprite?.depth ?? feet.y, f.sprite?.alpha ?? 1);
}
