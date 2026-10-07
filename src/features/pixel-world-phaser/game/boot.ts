// Phaser 게임 시작/정리. game/ 아래 파일만 phaser를 import한다 — GameShell이 이 파일을 동적 import로
// 불러서 앱 첫 번들에는 Phaser가 들어가지 않는다. 입력(조이스틱/버튼/키보드)과 HUD는 React(DOM) 쪽이
// 맡고, 장면들은 공유 객체(ControlState)를 매 프레임 읽기만 한다 → 프레임마다 React가 다시 그려지는 일이 없다.
//
// 캔버스는 기기 픽셀 해상도로 만들고 CSS로 화면 크기에 맞춘다(logic/layout.ts canvasSize). 그래서
// 안드로이드 폰처럼 기기 픽셀 비율이 2.625배여도 카메라 배율(정수, 기기 픽셀 기준)만큼 도트가 고르게 보인다.
import Phaser from 'phaser';
import { canvasSize } from '../logic/layout';
import { FIRST_SCENE } from '../logic/scenes';
import type { SceneId } from '../logic/scenes';
import type { Placement } from '../../pixel-room/model';
import type { ControlState } from '../controls';
import { RoomScene } from './RoomScene';
import { YardScene } from './YardScene';
import { PlazaScene } from './PlazaScene';
import type { PlazaPlayerState } from '../../pixel-room/plaza/types';
import type { WorldAssets, WorldContext, WorldDebug, WorldEvents, WorldScene } from './WorldScene';

export type { Prompt, WorldAssets, WorldDebug, WorldEvents } from './WorldScene';

export interface WorldGameHandle {
  destroy(): void;
  setActive(active: boolean): void;
  /** 게임 프레임 기준 CSS 좌표를 탭 → 그 자리까지 걸어간다. */
  walkToScreen(x: number, y: number): void;
  cancelWalk(): void;
  /** A 버튼: 바라보는 대상과 상호작용(말 걸기/살펴보기/문으로 들어가기). */
  interact(): void;
  reactPet(kind: 'feed' | 'pet'): void;
  farmFx(index: number, action: string): void;
  setAppearance(avatar: WorldAssets['avatar']): void;
  setPet(pet: WorldAssets['pet']): void;
  setBeds(images: HTMLImageElement[]): void;
  /** 방 가구 배치(서버 값). 방에 있으면 바로 다시 그린다. */
  setFurniture(furniture: readonly Placement[]): void;
  getFurniture(): Placement[];
  setRoomPlacing(active: boolean): void;
  roomEditPoint(x: number, y: number): ReturnType<RoomScene['editPoint']> | null;
  /** 지금 장면. 전환 중 잠깐은 직전 장면. */
  scene(): SceneId;
  setExhibit(show: boolean): void;
  setClassmates(players: PlazaPlayerState[], reactions: Record<string, string>, selfId: string): void;
  debug(): WorldDebug;
}
export interface WorldStart {
  assets: WorldAssets;
  beds: HTMLImageElement[];
  furniture: readonly Placement[];
}

export function startWorldGame(parent: HTMLElement, start: WorldStart, controls: ControlState, events: WorldEvents): Promise<WorldGameHandle> {
  return new Promise(resolve => {
    const measure = () => canvasSize(parent.clientWidth || 1, parent.clientHeight || 1, window.devicePixelRatio || 1);
    let size = measure();
    let active: WorldScene | null = null;
    let last: WorldDebug | null = null;
    let lastScene: SceneId = FIRST_SCENE;
    let resolved = false;
    const ctx: WorldContext = {
      assets: start.assets, controls, hooks: events,
      data: { furniture: start.furniture, beds: start.beds },
      view: { ratio: size.ratio },
      onSceneReady: scene => {
        active = scene;
        lastScene = scene.scene.key as SceneId;
        if (!resolved) { resolved = true; resolve(handle); }
      },
      onSceneGone: scene => {
        if (active !== scene) return;
        last = scene.snapshot();
        active = null;
      },
    };
    const yard = new YardScene(ctx);
    const room = new RoomScene(ctx);
    const plaza = new PlazaScene(ctx);
    const ordered = FIRST_SCENE === 'room' ? [room, yard, plaza] : [yard, room, plaza];
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      backgroundColor: '#3f6b3a',
      pixelArt: true,
      roundPixels: true,
      banner: false,
      // 입력은 DOM HUD가 맡는다. Phaser가 터치를 가로채거나 AudioContext를 만들지 않게 끈다.
      input: { keyboard: false, mouse: false, touch: false, gamepad: false },
      audio: { noAudio: true },
      disableContextMenu: true,
      // 크기는 여기서 직접 맞춘다(기기 픽셀). 캔버스 CSS 크기는 gameShell.css가 부모에 꽉 채운다.
      scale: { mode: Phaser.Scale.NONE, width: size.width, height: size.height },
      fps: { target: 60, smoothStep: true },
      scene: ordered,
    });

    // 크기/회전/브라우저 확대(기기 픽셀 비율 변화) → 캔버스 해상도 다시 맞추기. 장면은 scale 'resize'로 카메라 배율을 다시 잡는다.
    const fit = () => {
      const next = measure();
      if (next.width === size.width && next.height === size.height && next.ratio === size.ratio) return;
      size = next;
      ctx.view.ratio = next.ratio;
      game.scale.resize(next.width, next.height);
    };
    const observer = new ResizeObserver(fit);
    observer.observe(parent);
    window.addEventListener('resize', fit);

    const handle: WorldGameHandle = {
      getFurniture: () => ctx.data.furniture.map(item => ({ ...item })),
      setRoomPlacing: on => { if (active === room) room.setRoomPlacing(on); },
      roomEditPoint: (x, y) => active === room ? room.editPoint(x, y) : null,
      destroy: () => {
        observer.disconnect();
        window.removeEventListener('resize', fit);
        active = null;
        game.destroy(true);
      },
      setActive: on => { if (on) game.loop.wake(); else game.loop.sleep(); },
      walkToScreen: (x, y) => active?.walkToScreen(x, y),
      cancelWalk: () => active?.cancelWalk(),
      interact: () => active?.interact(),
      reactPet: kind => active?.reactPet(kind),
      farmFx: (index, action) => active?.farmFx(index, action),
      setAppearance: avatar => {
        ctx.assets.avatar = avatar;
        active?.refreshAppearance();
      },
      setPet: pet => {
        ctx.assets.pet = pet;
        active?.refreshPet();
      },
      setBeds: images => {
        ctx.data.beds = images;
        if (active?.scene.key === 'yard') active.refreshData();
      },
      setFurniture: furniture => {
        ctx.data.furniture = furniture;
        if (active?.scene.key === 'room') active.refreshData();
      },
      scene: () => lastScene,
      setExhibit: show => { if (active instanceof PlazaScene) active.setExhibit(show); },
      setClassmates: (players, reactions, selfId) => { if (active instanceof PlazaScene) active.setClassmates(players, reactions, selfId); },
      debug: () => (active ? active.snapshot() : { ...(last as WorldDebug), transitioning: true }),
    };
  });
}
