// 광장 머리 위 말풍선(인사·한마디 공용). 글은 Phaser Text로만 그린다(HTML로 넣지 않는다).
// 같은 사람의 새 말(stamp가 바뀜)은 이전 풍선을 바로 바꾸고, 목록에서 빠진 풍선은 천천히 흐려지며 사라진다.
import type Phaser from 'phaser';
import { CLOUD_PAD_Y, cloudMask } from '../logic/cloudBubble';

export interface PlazaBubble { text: string; stamp: number }
type Shown = { stamp: number; text: string; face: string; box: Phaser.GameObjects.Container; height: number; fading: boolean };

const FONT = 'Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
const COLORS = ['', '#fff9ec', '#5b3926', '#ecdcc0'];
/** 글 줄 너비 후보(월드 px). 짧은 말은 한 줄, 길면 두 줄까지 넓혀 본다. */
const WRAPS = [72, 100, 128];
const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
export const BUBBLE_FADE_MS = 1000;

export class PlazaBubbles {
  private shown = new Map<string, Shown>();
  private readonly scene: Phaser.Scene;
  constructor(scene: Phaser.Scene) { this.scene = scene; }

  /** 매 프레임: 원하는 풍선 목록과 사람들 발 위치, 그리고 사람마다 동물 얼굴(풍선 위 가장자리에 붙는다). */
  update(wanted: Record<string, PlazaBubble>, spots: ReadonlyMap<string, { x: number; y: number }>, faces: ReadonlyMap<string, string> = new Map()) {
    for (const [id, shown] of this.shown) {
      const want = wanted[id];
      if (!spots.has(id) || (want && (want.stamp !== shown.stamp || want.text !== shown.text))) { this.drop(id); continue; }
      if (!want && !shown.fading) this.fade(id, shown);
    }
    for (const [id, want] of Object.entries(wanted)) {
      if (!spots.has(id) || this.shown.has(id)) continue;
      this.shown.set(id, this.make(want, faces.get(id) ?? ''));
    }
    for (const [id, shown] of this.shown) {
      const spot = spots.get(id)!;
      // 꼬리 끝이 머리 바로 위(발에서 31px 위)에 오게.
      shown.box.setPosition(Math.round(spot.x - shown.box.width / 2), Math.round(spot.y - 31 - shown.height));
    }
  }
  /** 장면이 내려갈 때: 그림과 tween은 장면이 함께 지우므로 기억만 비운다. */
  clear() { this.shown.clear(); }
  /** 테스트용: 지금 머리 위에 떠 있는 글과 투명도. */
  snapshot() { return [...this.shown].map(([id, s]) => ({ id, text: s.text, face: s.face, alpha: Math.round(s.box.alpha * 100) / 100 })); }

  private drop(id: string) {
    const shown = this.shown.get(id);
    if (!shown) return;
    this.scene.tweens.killTweensOf(shown.box);
    shown.box.destroy();
    this.shown.delete(id);
  }
  private fade(id: string, shown: Shown) {
    shown.fading = true;
    this.scene.tweens.add({ targets: shown.box, alpha: 0, duration: BUBBLE_FADE_MS, ease: 'Sine.easeIn', onComplete: () => { if (this.shown.get(id) === shown) this.drop(id); } });
  }
  private make(want: PlazaBubble, face: string): Shown {
    const label = this.scene.add.text(0, 0, want.text, {
      fontSize: '7px', fontFamily: FONT, fontStyle: 'bold', color: '#4f3a28', align: 'center', resolution: 6,
      wordWrap: { width: WRAPS[0], useAdvancedWrap: true },
    });
    for (const width of WRAPS) {
      label.setWordWrapWidth(width, true);
      if (label.getWrappedText(want.text).length <= 2) break;
    }
    const lines = label.getWrappedText(want.text);
    if (lines.length > 2) label.setText(lines[0] + '\n' + Array.from(lines[1].trimEnd()).slice(0, -1).join('') + '…');
    const textW = Math.ceil(label.width), textH = Math.ceil(label.height);
    const key = `pw-cloud:${textW}x${textH}`;
    if (!this.scene.textures.exists(key)) this.scene.textures.addCanvas(key, drawCloud(textW, textH));
    const mask = cloudMask(textW, textH);
    const image = this.scene.add.image(0, 0, key).setOrigin(0);
    label.setOrigin(.5, 0).setPosition(Math.round(mask.width / 2), CLOUD_PAD_Y - 1);
    // 얼굴은 풍선 윗선 가운데에 반쯤 걸쳐 얹는다 — 풍선 크기·글 자리는 그대로(글 영역이 줄지 않게).
    const parts: Phaser.GameObjects.GameObject[] = [image, label];
    if (face) parts.push(this.scene.add.text(Math.round(mask.width / 2), 0, face, { fontFamily: EMOJI_FONT, fontSize: '9px', resolution: 8 }).setOrigin(.5, .5));
    const box = this.scene.add.container(0, 0, parts).setDepth(100001).setSize(mask.width, mask.height);
    return { stamp: want.stamp, text: want.text, face, box, height: mask.height, fading: false };
  }
}

function drawCloud(textW: number, textH: number): HTMLCanvasElement {
  const mask = cloudMask(textW, textH);
  const canvas = document.createElement('canvas');
  canvas.width = mask.width; canvas.height = mask.height;
  const g = canvas.getContext('2d')!;
  for (let y = 0; y < mask.height; y++) for (let x = 0; x < mask.width; x++) {
    const v = mask.cells[y * mask.width + x];
    if (!v) continue;
    g.fillStyle = COLORS[v]; g.fillRect(x, y, 1, 1);
  }
  return canvas;
}
