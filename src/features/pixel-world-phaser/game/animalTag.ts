import type Phaser from 'phaser';
import { userAnimalFace } from '../../../utils/animalFace';

/** 발밑 표찰. 탑승 때는 곰 발 아래에 두고 깊이는 인물의 발 좌표를 따른다. */
export function createAnimalTag(scene: Phaser.Scene) {
  // 이모지에 테두리·그림자를 씌우면 색이 죽고 작아 보인다 — 연한 바탕 위에 원래 색 그대로.
  return scene.add.text(0, 0, '', { fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif', fontSize: '20px',
    backgroundColor: 'rgba(255, 246, 226, 0.82)', padding: { x: 3, y: 1 } }).setOrigin(.5, 0).setResolution(3);
}
export function updateAnimalTag(tag: Phaser.GameObjects.Text, feet: { x: number; y: number }, face: string, riding = false) {
  // 정수 배율로 확대되는 도트 인물과 달리 표찰은 화면에서 늘 20px로 유지한다.
  const ratio = tag.scene.game.scale.width / (tag.scene.game.canvas.clientWidth || tag.scene.game.scale.width);
  const zoom = tag.scene.cameras.main.zoom / ratio;
  if (tag.text !== face) tag.setText(face);
  tag.setScale(1 / zoom).setPosition(Math.round(feet.x), Math.round(feet.y) + (riding ? 4 : 2)).setDepth(feet.y + .2);
}
export function peerAnimalFace(state: { sessionId: string; face?: string }) { return userAnimalFace(state.sessionId, state.face); }
export function animalTagSnapshot(tag?: Phaser.GameObjects.Text) {
  return tag ? { face: tag.text, x: tag.x, y: tag.y, depth: tag.depth, visible: tag.visible } : null;
}
