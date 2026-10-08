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
import { RiverScene } from './RiverScene';
import type { FishShadow } from './RiverScene';
import type { FishPhase, FishWeather } from '../logic/worldTint';
import type { Point } from '../logic/joystick';
import type { FishingOverride } from '../ui/fishingAdapter';
import type { FishingGame } from '../logic/fishingGame';
import type { PlazaPlayerState } from '../../pixel-room/plaza/types';
import type { PlazaBubble } from './plazaBubbles';
import type { RiverPeerFishing } from '../logic/riverPresence';
import type { WorldAssets, WorldContext, WorldDebug, WorldEvents, WorldScene } from './WorldScene';

export type { Prompt, WorldAssets, WorldDebug, WorldEvents } from './WorldScene';

export interface WorldGameHandle {
  setShadows(shadows: FishShadow[]): void;
  setWorldTime(phase: FishPhase, weather: FishWeather): void;
  readonly castFrom: Point | null;
  shadowPoint(index: number): Point | null;
  /** 낚시 상태(찌·줄·물보라)를 강가 장면에 전달. 다른 장면에서는 무시한다. */
  fishingFx(game: FishingGame, index: number, now: number): void;
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
  /** 광장·강가의 친구들. 다른 장면에서는 무시한다. */
  setClassmates(players: PlazaPlayerState[], bubbles: Record<string, PlazaBubble>, selfId: string): void;
  /** 강가 친구(와 나)의 낚시 모습. 강가가 아니면 무시한다. */
  setRiverFishing(fishing: Record<string, RiverPeerFishing>): void;
  debug(): WorldDebug;
}
export interface WorldStart {
  assets: WorldAssets;
  beds: HTMLImageElement[];
  furniture: readonly Placement[];
  /** 관리자 시험용 시각·날씨(?pwClock/?pwWeather). 학생에게는 넘기지 않는다. */
  clockOverride?: FishingOverride;
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
      assets: start.assets, controls, hooks: events, clockOverride: start.clockOverride,
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
    const river = new RiverScene(ctx);
    const ordered = FIRST_SCENE === 'room' ? [room, yard, plaza, river] : [yard, room, plaza, river];
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
    let pendingSize: ReturnType<typeof measure> | null = null;
    let resizeFrame: number | null = null;
    let resizedThisFrame = false;
    const flushSize = () => {
      const next = pendingSize;
      pendingSize = null;
      if (!next) return;
      if (next.width === size.width && next.height === size.height && next.ratio === size.ratio) return;
      size = next;
      ctx.view.ratio = next.ratio;
      game.scale.resize(next.width, next.height);
      // 버퍼를 비운 콜백 안에서 바로 그린다. 업데이트를 생략해 잠든 루프와 게임 시간은 유지한다.
      const renderer = game.renderer;
      renderer.preRender();
      game.events.emit(Phaser.Core.Events.PRE_RENDER, renderer, game.loop.time, 0);
      game.scene.render(renderer);
      renderer.postRender();
      game.events.emit(Phaser.Core.Events.POST_RENDER, renderer, game.loop.time, 0);
      resizedThisFrame = true;
    };
    const scheduleSize = () => {
      if (resizeFrame !== null) return;
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = null;
        resizedThisFrame = false;
        flushSize();
        if (resizedThisFrame) scheduleSize();
      });
    };
    const fit = () => { pendingSize = measure(); scheduleSize(); };
    const observer = new ResizeObserver(() => {
      pendingSize = measure();
      // 관찰자는 rAF 뒤에 호출된다. 첫 변경은 페인트 전에 처리하고 같은 프레임의 나머지는 합친다.
      if (!resizedThisFrame) flushSize();
      scheduleSize();
    });
    observer.observe(parent);
    window.addEventListener('resize', fit);

    const handle: WorldGameHandle = {
      setShadows: shadows => river.setShadows(shadows),
      setWorldTime: (phase, weather) => { ctx.worldTime = { phase, weather, at: Date.now() }; active?.setWorldTime(phase, weather); },
      get castFrom() { return active === river ? river.castFrom : null; },
      shadowPoint: index => active === river && index >= 0 && index <= 2 ? river.shadowPoint(index) : null,
      fishingFx: (game, index, now) => { if (active === river) river.fishingFx(game, index, now); },
      getFurniture: () => ctx.data.furniture.map(item => ({ ...item })),
      setRoomPlacing: on => { if (active === room) room.setRoomPlacing(on); },
      roomEditPoint: (x, y) => active === room ? room.editPoint(x, y) : null,
      destroy: () => {
        observer.disconnect();
        window.removeEventListener('resize', fit);
        if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
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
      setClassmates: (players, bubbles, selfId) => {
        if (active instanceof PlazaScene) active.setClassmates(players, bubbles, selfId);
        else if (active === river) river.peers.current?.set(players, bubbles, selfId);
      },
      setRiverFishing: fishing => { if (active === river) river.peers.current?.setFishing(fishing); },
      debug: () => (active ? active.snapshot() : { ...(last as WorldDebug), transitioning: true }),
    };
  });
}
