import type { SceneId } from './scenes';

/** 집·마당에서는 자유롭게 놀고, 함께하는 강가·광장에서는 주인을 따라온다. */
export function petMode(scene: SceneId, disableRoaming = false): 'roam' | 'follow' {
  return !disableRoaming && (scene === 'yard' || scene === 'room') ? 'roam' : 'follow';
}
