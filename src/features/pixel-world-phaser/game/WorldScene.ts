// 모든 걸어 다니는 장면(앞마당·방, 다음은 광장·밭)의 공통 바탕. 플레이어 이동/충돌/달리기, 카메라 따라가기,
// A 대상 "!" 표시, 탭해서 걷기, 따라오는 펫, 출구를 밟으면 화면을 어둡게 했다가 다음 장면으로 넘어가기까지
// 여기서 한 번에 처리한다. 하위 장면은 drawWorld()로 그림만 그린다(어디가 막혔는지·출구·입구는
// logic/scenes.ts의 장면 정의가 정한다). 입력은 공유 객체(ControlState)를 매 프레임 읽기만 한다.
import Phaser from 'phaser';
import { cameraCenterAxis, cameraZoom } from '../logic/layout';
import { facingFor } from '../logic/joystick';
import type { Facing, Point } from '../logic/joystick';
import { AVATAR_FRAMES_PER_POSE, AVATAR_POSES } from '../logic/avatarPlan';
import { PET_SHEETS, petFollowSpot } from '../logic/petSheets';
import type { PetSheet } from '../logic/petSheets';
import { createPetFollowState, stepPetFollow } from '../logic/petFollow';
import type { PetFollowState } from '../logic/petFollow';
import type { PetId } from '../../pixel-room/pet/petKinds';
import { TILE, cellCenter, cellOf, coversCell, facedInteractable, facingToward, feetBlocked, moveFeet, nearestCellCenter, nearestOpenCell, planPath } from '../logic/world';
import type { Interactable } from '../logic/world';
import { buildScene, entrySpawn, exitAt, exitById, exitCells } from '../logic/scenes';
import type { SceneData, SceneExit, SceneId, SceneSpec } from '../logic/scenes';
import type { ControlState } from '../controls';
import type { Placement } from '../../pixel-room/model';

/** 걷기/달리기 속도(월드 px/초). 16px 칸 기준 약 3.5칸/6칸. */
export const WALK_SPEED = 56;
export const RUN_SPEED = 96;
/** 장면 전환 때 어두워졌다/밝아지는 시간(ms). 기존 Pixel World의 문 페이드(260ms)와 비슷하게. */
export const FADE_MS = 240;
const FADE_RGB = [24, 16, 12] as const;

export interface WorldAssets {
  town: HTMLImageElement;
  interior: HTMLImageElement;
  /** 방 바닥/벽 아틀라스(floors-walls). */
  floors: HTMLImageElement;
  /** 가구 아틀라스들(furnitureArt.src → 이미지). */
  furniture: ReadonlyMap<string, HTMLImageElement>;
  avatar: { key: string; canvas: HTMLCanvasElement };
  pet: { id: PetId; source: HTMLImageElement | HTMLCanvasElement } | null;
  scarecrow: HTMLImageElement;
}
export interface Prompt { id: string; verb: string }
export interface WorldEvents {
  /** 바라보는 상호작용 대상이 바뀔 때만 호출(매 프레임 아님). */
  onPrompt(prompt: Prompt | null): void;
  /** A(또는 탭해서 걷기 도착)로 말 걸기/살펴보기 → 셸이 대화창을 연다. */
  onTalk(id: string): void;
  /** A로 게임 안 창(상점/옷장 등)을 여는 대상. 셸이 처리한다. */
  onPanel(panel: string): void;
  /** 장면에 들어왔을 때(첫 장면 포함) — 장면 이름 알림용. */
  onScene(id: SceneId, title: string): void;
}
/** 장면들이 함께 쓰는 것(장면이 바뀌어도 그대로): 그림, 입력, 셸 연결, 서버 데이터, 화면 비율. */
export interface WorldContext {
  assets: WorldAssets;
  controls: ControlState;
  hooks: WorldEvents;
  data: { furniture: readonly Placement[]; beds: HTMLImageElement[] } & SceneData;
  /** 캔버스 기기 픽셀 / CSS px. */
  view: { ratio: number };
  /** 장면이 만들어지거나 내려갈 때 boot가 "지금 장면"을 기억하게. */
  onSceneReady(scene: WorldScene): void;
  onSceneGone(scene: WorldScene): void;
}
export interface WorldDebug {
  scene: SceneId; transitioning: boolean;
  x: number; y: number; facing: Facing; moving: boolean; running: boolean; prompt: string | null;
  pet: { x: number; y: number } | null;
  /** 카메라 배율(기기 픽셀/월드 px)과 CSS px 기준 배율, 캔버스 기기 픽셀 비율. */
  zoom: number; cssZoom: number; ratio: number;
  camera: { x: number; y: number }; fps: number; renderer: string; pathLength: number;
  /** 테스트용: 상호작용 대상/출구의 화면(CSS px) 위치. */
  targets: Record<string, Point>;
  exits: Record<string, Point>;
}

export abstract class WorldScene extends Phaser.Scene {
  protected spec!: SceneSpec;
  protected player!: Phaser.GameObjects.Sprite;
  private shadow!: Phaser.GameObjects.Ellipse;
  private pet: Phaser.GameObjects.Sprite | null = null;
  private petSheet: PetSheet | null = null;
  private petFollow: PetFollowState | null = null;
  private bang!: Phaser.GameObjects.Image;
  protected feet: Point = { x: 0, y: 0 };
  protected facing: Facing = 'Front';
  private moving = false;
  private running = false;
  private path: Point[] = [];
  private pathTarget: string | null = null;
  private prompt: Interactable | null = null;
  private camCenter: Point = { x: 0, y: 0 };
  private animKey = '';
  private entry: string | undefined;
  private transitioning = false;
  /** 출구 위에서 시작하면(그럴 일은 없지만) 한 번 벗어나야 출구가 작동한다 — 들어오자마자 튕겨 나가지 않게. */
  private exitArmed = false;

  protected readonly ctx: WorldContext;
  /** 장면 바깥(맵 밖이 보일 때) 색. */
  protected abstract readonly background: string;

  constructor(key: SceneId, ctx: WorldContext) {
    super(key);
    this.ctx = ctx;
  }

  /** 같은 장면 인스턴스가 다시 시작될 때마다 불린다 — 이전 방문의 상태를 모두 비운다. */
  init(data: { entry?: string } | undefined) {
    this.entry = data?.entry;
    this.pet = null; this.petSheet = null; this.petFollow = null;
    this.moving = false; this.running = false; this.path = []; this.pathTarget = null;
    this.prompt = null; this.animKey = ''; this.transitioning = false; this.exitArmed = false;
  }

  /** 맵 그림(바닥·벽·소품). spec은 이미 준비돼 있다. */
  protected abstract drawWorld(): void;
  /** 월드 전체 크기(px) — 카메라가 맵 밖을 보이지 않게 자를 때. */
  protected worldSize(): { width: number; height: number } { return { width: this.spec.cols * TILE, height: this.spec.rows * TILE }; }

  create() {
    this.spec = buildScene(this.scene.key as SceneId, this.ctx.data);
    const spawn = entrySpawn(this.spec, this.entry);
    this.feet = spawn.feet; this.facing = spawn.facing;
    this.ensureSharedTextures();
    this.drawWorld();

    this.shadow = this.add.ellipse(this.feet.x, this.feet.y, 14, 5, 0x453d29, 0.22);
    this.player = this.add.sprite(this.feet.x, this.feet.y, this.ctx.assets.avatar.key, 0).setOrigin(0.5, 31 / 32);
    this.playAvatar(false, 1);
    if (this.ctx.assets.pet) this.addPet(this.ctx.assets.pet.id);
    this.bang = this.add.image(0, 0, 'bang').setOrigin(0.5, 1).setVisible(false).setDepth(100000);
    this.tweens.add({ targets: this.bang, scaleY: { from: 1, to: 1.15 }, duration: 380, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.exitArmed = !exitAt(this.spec, this.feet);

    const camera = this.cameras.main;
    camera.setBackgroundColor(this.background);
    camera.setRoundPixels(true);
    this.applyZoom();
    this.scale.on('resize', this.applyZoom, this);
    const gone = () => { this.scale.off('resize', this.applyZoom, this); this.ctx.onSceneGone(this); };
    this.events.once('shutdown', gone);
    this.events.once('destroy', gone);
    camera.fadeIn(FADE_MS, ...FADE_RGB);
    this.ctx.hooks.onPrompt(null);
    this.ctx.hooks.onScene(this.spec.id, this.spec.title);
    this.ctx.onSceneReady(this);
  }

  /** 장면이 바뀌어도 한 번만 만드는 텍스처/애니메이션(아바타·펫·"!"). 텍스처/애니메이션은 게임 전체 공용. */
  private ensureSharedTextures() {
    const { textures, anims } = this;
    if (!textures.exists('bang')) textures.addCanvas('bang', drawBang());
    const { key, canvas } = this.ctx.assets.avatar;
    if (!textures.exists(key)) {
      const texture = textures.addCanvas(key, canvas);
      if (texture) for (let i = 0; i < AVATAR_POSES.length * AVATAR_FRAMES_PER_POSE; i++) {
        texture.add(i, 0, (i % AVATAR_FRAMES_PER_POSE) * 32, Math.floor(i / AVATAR_FRAMES_PER_POSE) * 32, 32, 32);
      }
    }
    AVATAR_POSES.forEach((pose, index) => {
      if (anims.exists(`${key}:${pose}`)) return;
      const frames = pose.startsWith('Walk') ? [0, 1, 2, 3] : [0];
      anims.create({ key: `${key}:${pose}`, repeat: -1, frameRate: 8, frames: frames.map(frame => ({ key, frame: index * AVATAR_FRAMES_PER_POSE + frame })) });
    });
  }

  private addPet(id: PetId) {
    const source = this.ctx.assets.pet?.source;
    const sheet = PET_SHEETS[id];
    const key = `pet:${id}`;
    if (!this.textures.exists(key) && source) {
      const texture = source instanceof HTMLCanvasElement ? this.textures.addCanvas(key, source) : this.textures.addImage(key, source);
      if (texture) for (let r = 0; r < sheet.rows; r++) for (let c = 0; c < sheet.columns; c++) texture.add(r * sheet.columns + c, 0, c * sheet.cell, r * sheet.cell, sheet.cell, sheet.cell);
    }
    if (!this.textures.exists(key)) return;
    for (const [name, anim] of [['walk', sheet.walk], ['idle', sheet.idle]] as const) {
      if (this.anims.exists(`${key}:${name}`)) continue;
      this.anims.create({ key: `${key}:${name}`, repeat: -1, frameRate: 1000 / anim.frameMs, frames: anim.frames.map(frame => ({ key, frame: anim.row * sheet.columns + frame })) });
    }
    const spot = petFollowSpot(this.feet, this.facing);
    const start = feetBlocked(spot, this.spec.solid) ? { ...this.feet } : spot;
    this.petSheet = sheet;
    this.petFollow = createPetFollowState(start);
    this.pet = this.add.sprite(start.x, start.y, key, sheet.idle.row * sheet.columns).setOrigin(0.5, sheet.footY / sheet.cell);
    this.pet.play(`${key}:idle`);
  }

  private applyZoom() {
    const camera = this.cameras.main;
    const ratio = this.ctx.view.ratio;
    camera.setZoom(cameraZoom(this.scale.width / ratio, this.scale.height / ratio, ratio));
    this.camCenter = { x: this.feet.x, y: this.feet.y - 12 };
    this.positionCamera(1);
  }

  // ── 장면 데이터가 바뀜(방 가구 배치 새로고침 등) ──
  /** 장면 정의를 다시 만들고, 혹시 플레이어 발밑이 막혔으면 가장 가까운 빈 칸으로 옮긴다. */
  protected rebuildSpec() {
    this.spec = buildScene(this.spec.id, this.ctx.data);
    if (feetBlocked(this.feet, this.spec.solid)) {
      const cell = nearestOpenCell(cellOf(this.feet), this.spec, exitCells(this.spec));
      if (cell) this.feet = cellCenter(cell);
    }
    this.cancelWalk();
    this.updatePrompt(true);
  }
  /** 셸이 서버 데이터를 새로 받았을 때. 장면마다 필요한 것만 다시 그린다. */
  refreshData() { /* 기본: 할 일 없음 */ }

  // ── 탭해서 걷기 ──
  walkToWorld(point: Point) {
    if (this.transitioning) return;
    const target = cellOf(point);
    const item = this.spec.interactables.find(entry => coversCell(entry, target)) ?? null;
    const path = planPath(cellOf(this.feet), target, this.spec, exitCells(this.spec));
    this.path = path.map(cellCenter);
    this.pathTarget = item?.id ?? null;
    if (!path.length && item) this.arrive(item.id);
  }
  /** 게임 프레임 기준 CSS 좌표 → 캔버스(기기 픽셀) 좌표 → 월드. */
  walkToScreen(x: number, y: number) {
    const ratio = this.ctx.view.ratio;
    const world = this.cameras.main.getWorldPoint(x * ratio, y * ratio);
    this.walkToWorld({ x: world.x, y: world.y });
  }
  cancelWalk() { this.path = []; this.pathTarget = null; }

  private arrive(id: string) {
    const item = this.spec.interactables.find(entry => entry.id === id);
    if (!item) return;
    this.facing = facingToward(this.feet, nearestCellCenter(item, this.feet));
    this.playAvatar(false, 1);
    this.updatePrompt();
    this.act(item);
  }
  /** A 버튼: 지금 바라보는 대상과 상호작용. */
  interact() {
    if (this.transitioning || this.ctx.controls.frozen || !this.prompt) return;
    this.act(this.prompt);
  }
  private act(item: Interactable) {
    const { action } = item;
    if (action.kind === 'talk') this.ctx.hooks.onTalk(item.id);
    else if (action.kind === 'panel') this.ctx.hooks.onPanel(action.panel);
    else { const exit = exitById(this.spec, action.exit); if (exit) this.leave(exit); }
  }

  // ── 장면 넘어가기: 어두워짐 → 다음 장면 시작(그 장면이 밝아지며 나타남) ──
  private leave(exit: SceneExit) {
    if (this.transitioning) return;
    this.transitioning = true;
    this.cancelWalk();
    this.moving = false; this.running = false;
    this.playAvatar(false, 1);
    this.bang.setVisible(false);
    this.prompt = null;
    this.ctx.hooks.onPrompt(null);
    const camera = this.cameras.main;
    camera.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      // Phaser가 shutdown에서 카메라를 지우기 전에 마지막 상태를 보관한다.
      this.ctx.onSceneGone(this);
      this.scene.start(exit.to.scene, { entry: exit.to.entry });
    });
    camera.fadeOut(FADE_MS, ...FADE_RGB);
  }

  update(_time: number, deltaMs: number) {
    if (this.transitioning) { this.updatePet(deltaMs); return; }
    const dt = Math.min(deltaMs, 50) / 1000;
    const { stick, run, frozen } = this.ctx.controls;
    const solid = this.spec.solid;
    let vx = 0, vy = 0, speedScale = 0;
    if (frozen) this.cancelWalk();
    else if (stick.magnitude > 0) {
      this.cancelWalk();
      const speed = run ? RUN_SPEED : WALK_SPEED;
      vx = stick.x * speed; vy = stick.y * speed;
      speedScale = stick.magnitude * (run ? RUN_SPEED / WALK_SPEED : 1);
    } else if (this.path.length) {
      const next = this.path[0];
      const dx = next.x - this.feet.x, dy = next.y - this.feet.y;
      const distance = Math.hypot(dx, dy);
      const speed = run ? RUN_SPEED : WALK_SPEED;
      if (distance <= speed * dt) {
        this.feet = { ...next };
        this.path.shift();
        if (!this.path.length && this.pathTarget) { const id = this.pathTarget; this.pathTarget = null; this.arrive(id); }
      } else { vx = dx / distance * speed; vy = dy / distance * speed; }
      speedScale = run ? RUN_SPEED / WALK_SPEED : 1;
    }
    const wasMoving = this.moving;
    if (vx || vy) {
      const before = this.feet;
      this.feet = moveFeet(before, vx * dt, vy * dt, solid);
      this.facing = facingFor(vx, vy, this.facing);
      // 벽에 정면으로 막혀 제자리면 걷는 시늉도 멈춘다(제자리 걸음 방지).
      this.moving = Math.hypot(this.feet.x - before.x, this.feet.y - before.y) > 0.05 * speedScale;
      if (!this.moving && this.path.length) this.cancelWalk();
    } else this.moving = false;
    this.running = this.moving && run;
    if (this.transitioning) return; // 도착하자마자 문으로 들어간 경우
    if (this.moving || wasMoving || this.animKey === '') this.playAvatar(this.moving, Math.max(0.6, speedScale));
    this.player.setPosition(Math.round(this.feet.x), Math.round(this.feet.y)).setDepth(this.feet.y);
    this.shadow.setPosition(Math.round(this.feet.x), Math.round(this.feet.y)).setDepth(this.feet.y - 0.5);
    this.updatePet(deltaMs);
    // 출구를 밟으면 넘어간다(들어오자마자 출구 위였다면 한 번 벗어난 뒤부터).
    const exit = exitAt(this.spec, this.feet);
    if (!exit) this.exitArmed = true;
    else if (this.exitArmed) { this.leave(exit); return; }
    this.updatePrompt();
    this.positionCamera(dt);
  }

  private playAvatar(walking: boolean, timeScale: number) {
    const key = `${this.ctx.assets.avatar.key}:${walking ? 'Walk' : 'Idle'}_${this.facing}`;
    if (key !== this.animKey) { this.player.play(key); this.animKey = key; }
    this.player.anims.timeScale = timeScale;
  }

  private updatePet(deltaMs: number) {
    const pet = this.pet, sheet = this.petSheet;
    if (!pet || !sheet) return;
    if (!this.petFollow) return;
    const solid = this.spec.solid;
    const result = stepPetFollow(this.petFollow, { x: pet.x, y: pet.y }, this.feet,
      this.facing, sheet, deltaMs, RUN_SPEED, {
        move: (from, dx, dy) => moveFeet(from, dx, dy, solid),
        blocked: point => feetBlocked(point, solid),
      });
    this.petFollow = result.state;
    pet.setPosition(result.position.x, result.position.y).setFlipX(result.state.flipX);
    const animation = `${pet.texture.key}:${result.walking ? 'walk' : 'idle'}`;
    if (pet.anims.currentAnim?.key !== animation) pet.play(animation);
    pet.setDepth(pet.y);
  }

  private updatePrompt(force = false) {
    const item = this.moving && this.path.length ? null : facedInteractable(this.feet, this.facing, this.spec.interactables);
    if (item) this.bang.setPosition(item.bang.x, item.bang.y).setVisible(true);
    else this.bang.setVisible(false);
    if (force || item?.id !== this.prompt?.id) {
      this.prompt = item;
      this.ctx.hooks.onPrompt(item ? { id: item.id, verb: item.verb } : null);
    }
  }

  private positionCamera(dt: number) {
    const camera = this.cameras.main;
    const target = { x: this.feet.x, y: this.feet.y - 12 };
    const t = Math.min(1, dt * 8);
    this.camCenter = { x: this.camCenter.x + (target.x - this.camCenter.x) * t, y: this.camCenter.y + (target.y - this.camCenter.y) * t };
    const viewW = camera.width / camera.zoom, viewH = camera.height / camera.zoom;
    const world = this.worldSize();
    camera.centerOn(cameraCenterAxis(this.camCenter.x, viewW, world.width), cameraCenterAxis(this.camCenter.y, viewH, world.height));
  }

  snapshot(): WorldDebug {
    const camera = this.cameras.main;
    const ratio = this.ctx.view.ratio;
    const screen = (p: Point): Point => ({ x: Math.round((p.x - camera.worldView.x) * camera.zoom / ratio), y: Math.round((p.y - camera.worldView.y) * camera.zoom / ratio) });
    return {
      scene: this.spec.id, transitioning: this.transitioning,
      x: Math.round(this.feet.x * 10) / 10, y: Math.round(this.feet.y * 10) / 10, facing: this.facing, moving: this.moving, running: this.running,
      prompt: this.prompt?.id ?? null, pet: this.pet ? { x: Math.round(this.pet.x), y: Math.round(this.pet.y) } : null,
      zoom: camera.zoom, cssZoom: Math.round(camera.zoom / ratio * 1000) / 1000, ratio: Math.round(ratio * 1000) / 1000,
      camera: { x: Math.round(camera.scrollX), y: Math.round(camera.scrollY) }, fps: Math.round(this.game.loop.actualFps),
      renderer: this.game.renderer.type === Phaser.WEBGL ? 'webgl' : 'canvas', pathLength: this.path.length,
      targets: Object.fromEntries(this.spec.interactables.map(item => [item.id, screen(cellCenter(item.cell))])),
      exits: Object.fromEntries(this.spec.exits.map(exit => [exit.id, screen(cellCenter(exit.cells[0]))])),
    };
  }
}

/** 말풍선 "!" (9×12 도트) — 상호작용 가능 표시. */
function drawBang(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 9; canvas.height = 12;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#5b3926'; ctx.fillRect(1, 0, 7, 10); ctx.fillRect(0, 1, 9, 8); ctx.fillRect(3, 10, 3, 1); ctx.fillRect(4, 11, 1, 1);
  ctx.fillStyle = '#fff4d9'; ctx.fillRect(1, 1, 7, 8); ctx.fillRect(4, 9, 1, 1);
  ctx.fillStyle = '#d2463a'; ctx.fillRect(4, 2, 1, 4); ctx.fillRect(4, 7, 1, 1);
  return canvas;
}
