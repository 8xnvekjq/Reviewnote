// 모든 걸어 다니는 장면(앞마당·방, 다음은 광장·밭)의 공통 바탕. 플레이어 이동/충돌/달리기, 카메라 따라가기,
// A 대상 "!" 표시, 탭해서 걷기, 따라오는 펫, 출구를 밟으면 화면을 어둡게 했다가 다음 장면으로 넘어가기까지
// 여기서 한 번에 처리한다. 하위 장면은 drawWorld()로 그림만 그린다(어디가 막혔는지·출구·입구는
// logic/scenes.ts의 장면 정의가 정한다). 입력은 공유 객체(ControlState)를 매 프레임 읽기만 한다.
import Phaser from 'phaser';
import { PET_INTERACTIONS } from '../../pixel-room/pet/petInteraction';
import { facesPet, reactionFrame } from '../logic/petReaction';
import { BED_CELLS } from '../logic/yardWorld';
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
/** 테스트용(?petWander=0): 마당·방에서도 예전처럼 따라오게 한다. */
const PET_ALWAYS_FOLLOWS = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('petWander') === '0';
/** 장면 전환 때 어두워졌다/밝아지는 시간(ms). 기존 Pixel World의 문 페이드(260ms)와 비슷하게. */
export const FADE_MS = 240;
const FADE_RGB = [24, 16, 12] as const;
/** 달릴 때만 발뒤꿈치에서 흙먼지가 이만큼(월드 px) 갈 때마다 피어오른다. 걸을 때는 없다. */
const DUST_STEP = 11;
const REDUCED_MOTION = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

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
  plazaStall?: HTMLImageElement;
}
export interface Prompt { id: string; verb: string }
export interface WorldEvents {
  /** 바라보는 상호작용 대상이 바뀔 때만 호출(매 프레임 아님). */
  onPrompt(prompt: Prompt | null): void;
  /** A(또는 탭해서 걷기 도착)로 말 걸기/살펴보기 → 셸이 대화창을 연다. */
  onTalk(id: string): void;
  /** A로 게임 안 창(상점/옷장 등)을 여는 대상. 셸이 처리한다. */
  onPanel(panel: string): void;
  onPetMessage?(message: string): void;
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
  avatarKey: string; petId: PetId | null;
  scene: SceneId; transitioning: boolean;
  x: number; y: number; facing: Facing; moving: boolean; running: boolean; prompt: string | null;
  pet: { x: number; y: number } | null;
  bedTextures?: string[];
  petReaction: string | null;
  petFrame: number | null;
  petFlipX: boolean;
  /** 지금 떠 있는 달리기 흙먼지 조각 수(테스트용 — 걷기 0, 다 사라지면 0). */
  dust: number;
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
  private reaction: { start: number; until: number; kind: 'feed' | 'pet'; quiet?: boolean } | null = null;
  private wander: { target: { x: number; y: number } | null; nextAt: number } = { target: null, nextAt: 0 };
  private bang!: Phaser.GameObjects.Image;
  protected feet: Point = { x: 0, y: 0 };
  protected facing: Facing = 'Front';
  private moving = false;
  private running = false;
  private dust = new Set<Phaser.GameObjects.Image>();
  private dustDistance = 0;
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
    this.pet = null; this.petSheet = null; this.petFollow = null; this.reaction = null;
    this.moving = false; this.running = false; this.path = []; this.pathTarget = null;
    this.prompt = null; this.animKey = ''; this.transitioning = false; this.exitArmed = false;
    this.dust = new Set(); this.dustDistance = 0;
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
    // 흙먼지 조각과 tween은 장면이 내려갈 때 함께 지워진다 — 목록만 비운다.
    const gone = () => { this.scale.off('resize', this.applyZoom, this); this.dust.clear(); this.ctx.onSceneGone(this); };
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
    if (!textures.exists('run-dust')) textures.addCanvas('run-dust', drawDust());
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

  /** Shared assets persist across visits; replace only the active scene's sprite. */
  refreshAppearance() {
    this.ensureSharedTextures();
    this.player.setTexture(this.ctx.assets.avatar.key, 0);
    this.animKey = '';
    this.playAvatar(this.moving, this.running ? RUN_SPEED / WALK_SPEED : 1);
  }

  refreshPet() {
    this.pet?.destroy();
    this.pet = null; this.petSheet = null; this.petFollow = null;
    if (this.ctx.assets.pet) this.addPet(this.ctx.assets.pet.id);
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
    // The shopkeeper waits for A after the player arrives facing the stall.
    if (item.action.kind !== 'panel' || item.action.panel !== 'shop') this.act(item);
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
    let moved = 0;
    if (vx || vy) {
      const before = this.feet;
      this.feet = moveFeet(before, vx * dt, vy * dt, solid);
      moved = Math.hypot(this.feet.x - before.x, this.feet.y - before.y);
      this.facing = facingFor(vx, vy, this.facing);
      // 벽에 정면으로 막혀 제자리면 걷는 시늉도 멈춘다(제자리 걸음 방지).
      this.moving = Math.hypot(this.feet.x - before.x, this.feet.y - before.y) > 0.05 * speedScale;
      if (!this.moving && this.path.length) this.cancelWalk();
    } else this.moving = false;
    this.running = this.moving && run;
    if (this.transitioning) return; // 도착하자마자 문으로 들어간 경우
    // 달리기 흙먼지: 막 달리기 시작하면 곧바로 한 번, 그 뒤 DUST_STEP마다. 걷거나 멈추면 다시 센다.
    if (this.running) {
      this.dustDistance += moved;
      if (this.dustDistance >= DUST_STEP) { this.dustDistance = 0; this.kickDust(vx, vy); }
    } else this.dustDistance = DUST_STEP * 0.7;
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

  /** 발뒤꿈치(가는 방향 반대쪽)에 흙먼지 세 조각. 캐릭터보다 뒤에 그리고, 다 흐려지면 스스로 지운다. */
  private kickDust(vx: number, vy: number) {
    if (REDUCED_MOTION) return;
    const length = Math.hypot(vx, vy) || 1, bx = -vx / length, by = -vy / length;
    const x = this.feet.x + bx * 4, y = this.feet.y + by * 2 - 1;
    ([[-3, 0, -4, 0], [3, 0, 4, 30], [0, -2, 0, 60]] as const).forEach(([ox, oy, dx, delay]) => {
      const puff = this.add.image(Math.round(x + ox), Math.round(y + oy), 'run-dust').setDepth(this.feet.y - 1);
      this.dust.add(puff);
      this.tweens.add({
        targets: puff, x: puff.x + dx + bx * 3, y: puff.y - 4, alpha: 0, scale: 0.5, duration: 420, delay, ease: 'Quad.easeOut',
        onComplete: () => { this.dust.delete(puff); puff.destroy(); },
      });
    });
  }

  private playAvatar(walking: boolean, timeScale: number) {
    const key = `${this.ctx.assets.avatar.key}:${walking ? 'Walk' : 'Idle'}_${this.facing}`;
    if (key !== this.animKey) { this.player.play(key); this.animKey = key; }
    this.player.anims.timeScale = timeScale;
  }

  // 펫이 고개를 돌려 기존 시트의 먹기/앉기/짖기 동작을 보여 준다.
  reactPet(kind: 'feed' | 'pet') {
    const pet = this.pet, id = this.ctx.assets.pet?.id;
    if (!pet || !id || this.reaction || Math.hypot(pet.x - this.feet.x, pet.y - this.feet.y) > 34) return;
    this.cancelWalk();
    this.reaction = { kind, start: this.time.now, until: this.time.now + PET_INTERACTIONS[id].ms };
    pet.anims.stop(); pet.setFlipX(this.feet.x > pet.x);
    this.ctx.hooks.onPetMessage?.(kind === 'feed' ? PET_INTERACTIONS[id].start : '친구를 다정하게 쓰다듬었어요.');
    this.facing = facingToward(this.feet, pet); this.playAvatar(false, 1);
    if (kind === 'feed') this.treatFx(id, pet);
    else this.sparkles(pet.x, pet.y - 20, 0xf477a6);
    this.time.delayedCall(1400, () => { if (this.pet === pet && this.reaction) this.sparkles(pet.x, pet.y - 24, 0xf477a6); });
  }
  private treatFx(id: PetId, pet: Phaser.GameObjects.Sprite) {
    const side = pet.flipX ? 1 : -1;
    const prop = this.add.graphics().setPosition(pet.x + side * 12, pet.y - 8).setDepth(99999);
    if (id === 'pet_dog') {
      prop.fillStyle(0xfbf1dc).fillRect(-4, -1, 8, 2).fillRect(-5, -2, 2, 4).fillRect(3, -2, 2, 4);
    } else if (id === 'pet_bear') {
      prop.fillStyle(0xe59a2f).fillRect(-4, -2, 8, 6);
      prop.fillStyle(0x7a4a22).fillRect(-3, -4, 6, 2);
      prop.fillStyle(0xfff1c1).fillRect(-1, 0, 2, 2);
    } else {
      prop.fillStyle(id === 'pet_duck' ? 0xe2a75a : 0xb8893f);
      for (let i = 0; i < 5; i++) prop.fillRect((i % 3) * 3 - 3, Math.floor(i / 3) * 3, id === 'pet_duck' ? 2 : 1, 2);
    }
    this.tweens.add({ targets: prop, x: pet.x + side * 4, alpha: 0, duration: id === 'pet_duck' || id === 'pet_pigeon' ? 1900 : 600, onComplete: () => prop.destroy() });
  }
  farmFx(index: number, action: string) {
    if (this.spec.id !== 'yard') return;
    const cell = BED_CELLS[index]; if (!cell) return;
    this.sparkles((cell.x + 1) * TILE, (cell.y + 1) * TILE, action === 'water' ? 0x83d9fa : 0xffdf75);
  }
  private sparkles(x: number, y: number, color: number) {
    if (color === 0xf477a6) {
      const key = 'pet-heart';
      if (!this.textures.exists(key)) {
        const canvas = document.createElement('canvas'); canvas.width = 9; canvas.height = 8;
        const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#f477a6';
        ['01100110', '11111111', '11111111', '01111110', '00111100', '00011000'].forEach((row, y) => [...row].forEach((pixel, x) => { if (pixel === '1') ctx.fillRect(x, y, 1, 1); }));
        this.textures.addCanvas(key, canvas);
      }
      for (let i = 0; i < 3; i++) {
        const heart = this.add.image(x + (i - 1) * 10, y - i * 4, key).setDepth(99999);
        this.tweens.add({ targets: heart, y: heart.y - 18, alpha: 0, duration: 1000, onComplete: () => heart.destroy() });
      }
      return;
    }
    for (let i = 0; i < 6; i++) {
      const dot = this.add.rectangle(x + (i - 3) * 3, y, 3, 3, color).setDepth(99999);
      this.tweens.add({ targets: dot, y: y - 12 - i * 2, x: dot.x + (i - 3) * 3, alpha: 0, duration: 650, onComplete: () => dot.destroy() });
    }
  }
  private petTarget(): Interactable | null {
    const pet = this.pet;
    if (!pet || this.reaction || !facesPet(this.feet, this.facing, pet)) return null;
    return { id: 'pet', cell: cellOf(pet), label: '친구', verb: '놀아주기', action: { kind: 'panel', panel: 'pet' }, bang: { x: pet.x, y: pet.y - 30 } };
  }
  private wanderPet(pet: Phaser.GameObjects.Sprite, sheet: PetSheet, deltaMs: number) {
    const now = this.time.now, solid = this.spec.solid, key = pet.texture.key;
    if (!this.wander.target) {
      pet.play(key + ':idle', true); pet.setDepth(pet.y);
      if (now < this.wander.nextAt) return;
      if (Math.random() < 0.35 && this.ctx.assets.pet) {
        // 혼자 노는 동작(짖기·쪼기·손 흔들기 등) — 알림 문구는 띄우지 않는다.
        this.reaction = { start: now, until: now + 1600, kind: Math.random() < 0.5 ? 'feed' : 'pet', quiet: true };
        this.wander.nextAt = now + 1600 + 2000 + Math.random() * 3000;
        return;
      }
      for (let i = 0; i < 12; i++) {
        const t = { x: pet.x + (Math.random() - 0.5) * TILE * 8, y: pet.y + (Math.random() - 0.5) * TILE * 6 };
        const size = this.worldSize();
        if (t.x < TILE || t.y < TILE || t.x > size.width - TILE || t.y > size.height - TILE || feetBlocked(t, solid)) continue;
        this.wander.target = t; break;
      }
      this.wander.nextAt = now + 2000 + Math.random() * 4000;
      return;
    }
    const dx = this.wander.target.x - pet.x, dy = this.wander.target.y - pet.y, distance = Math.hypot(dx, dy);
    const step = Math.min(distance, RUN_SPEED * 0.45 * sheet.pace * Math.min(deltaMs, 50) / 1000);
    const next = distance > 1 ? moveFeet({ x: pet.x, y: pet.y }, dx / distance * step, dy / distance * step, solid) : { x: pet.x, y: pet.y };
    const moved = Math.hypot(next.x - pet.x, next.y - pet.y);
    if (distance <= 2 || moved < step * 0.3) { this.wander.target = null; this.wander.nextAt = now + 1500 + Math.random() * 3000; return; }
    pet.setPosition(next.x, next.y);
    if (Math.abs(dx) > 4) pet.setFlipX(sheet.facesLeft ? dx > 0 : dx < 0);
    pet.play(key + ':walk', true); pet.setDepth(pet.y);
  }
  private updatePet(deltaMs: number) {
    const pet = this.pet, sheet = this.petSheet;
    if (!pet || !sheet) return;
    if (!this.petFollow) return;
    if (this.reaction && this.ctx.assets.pet) {
      if (this.time.now < this.reaction.until) {
        pet.setFrame(reactionFrame(this.ctx.assets.pet.id, this.time.now - this.reaction.start, this.reaction.kind));
        pet.setDepth(pet.y); return;
      }
      if (!this.reaction.quiet) this.ctx.hooks.onPetMessage?.(this.reaction.kind === 'feed' ? PET_INTERACTIONS[this.ctx.assets.pet.id].result : '친구가 기분 좋아 보여요!');
      this.reaction = null; this.petFollow = createPetFollowState(pet);
    }
    // 가만히 서서 바라보는 친구는 뒤로 돌아가지 않는다. A를 누를 시간을 준다.
    if (this.ctx.controls.frozen || (!this.moving && facesPet(this.feet, this.facing, pet))) { pet.play(pet.texture.key + ':idle', true); return; }
    // 광장에서만 따라온다. 집과 마당에서는 혼자 돌아다니며 가끔 짖거나 쪼거나 손을 흔든다.
    if (this.spec.id !== 'plaza' && !PET_ALWAYS_FOLLOWS) { this.wanderPet(pet, sheet, deltaMs); return; }
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
    const item = this.moving && this.path.length ? null : (facedInteractable(this.feet, this.facing, this.spec.interactables) ?? this.petTarget());
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
      avatarKey: this.player.texture.key, petId: this.pet ? this.ctx.assets.pet?.id ?? null : null,
      dust: this.dust.size,
      petReaction: this.reaction?.kind ?? null, petFrame: this.pet ? Number(this.pet.frame.name) : null, petFlipX: this.pet?.flipX ?? false,
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

/** 달리기 흙먼지 한 조각(3×3 도트, 예전 Pixel World 발자국 먼지 색). */
function drawDust(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 3; canvas.height = 3;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fbf3df'; ctx.fillRect(0, 0, 3, 2);
  ctx.fillStyle = '#d9c39a'; ctx.fillRect(0, 2, 3, 1);
  return canvas;
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
