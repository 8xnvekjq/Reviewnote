// Phaser 앞마당 장면. 이 파일만 phaser를 import한다 — GameShell이 동적 import로 불러서 앱 첫 번들에는
// Phaser가 들어가지 않는다. 입력(조이스틱/버튼/키보드)과 HUD는 React(DOM) 쪽이 맡고, 여기서는
// 공유 객체(ControlState)를 매 프레임 읽기만 한다 → 프레임마다 React가 다시 그려지는 일이 없다.
import Phaser from 'phaser';
import { cameraCenterAxis, cameraZoom } from '../logic/layout';
import { facingFor } from '../logic/joystick';
import type { Facing, Point } from '../logic/joystick';
import { AVATAR_FRAMES_PER_POSE, AVATAR_POSES } from '../logic/avatarPlan';
import { PET_SHEETS, petFollowSpot } from '../logic/petSheets';
import type { PetSheet } from '../logic/petSheets';
import type { PetId } from '../../pixel-room/pet/petKinds';
import {
  BED_CELLS, BIG_TREES, FENCE_ROWS, INTERACTABLES, SPAWN, TILE, WORLD_COLS, WORLD_HEIGHT, WORLD_ROWS, WORLD_WIDTH,
  borderTrees, cellCenter, cellOf, facedInteractable, facingToward, feetBlocked, groundTile, moveFeet, planPath, toWorldCell,
} from '../logic/yardWorld';
import type { InteractableId } from '../logic/yardWorld';
import type { ControlState } from '../controls';
import { SCARECROW_CELL } from '../../pixel-room/farm/farmModel';

/** 걷기/달리기 속도(월드 px/초). 16px 칸 기준 약 3.5칸/6칸. */
export const WALK_SPEED = 56;
export const RUN_SPEED = 96;

export interface YardAssets {
  town: HTMLImageElement;
  interior: HTMLImageElement;
  avatar: { key: string; canvas: HTMLCanvasElement };
  pet: { id: PetId; source: HTMLImageElement | HTMLCanvasElement } | null;
  scarecrow: HTMLImageElement;
  beds: HTMLImageElement[];
}
export interface YardEvents {
  /** 바라보는 상호작용 대상이 바뀔 때만 호출(매 프레임 아님). */
  onPrompt(target: InteractableId | null): void;
  /** 탭해서 걷기로 대상 앞에 도착했을 때. */
  onArrive(target: InteractableId): void;
}
export interface YardDebug {
  x: number; y: number; facing: Facing; moving: boolean; running: boolean; prompt: InteractableId | null;
  pet: { x: number; y: number } | null; zoom: number; camera: { x: number; y: number }; fps: number; renderer: string; pathLength: number;
  /** 테스트용: 상호작용 대상의 화면(CSS px) 위치. */
  targets: Record<InteractableId, Point>;
}
export interface YardGameHandle {
  destroy(): void;
  setActive(active: boolean): void;
  /** 게임 프레임 기준 CSS 좌표를 탭 → 그 자리까지 걸어간다. */
  walkToScreen(x: number, y: number): void;
  cancelWalk(): void;
  setBeds(images: HTMLImageElement[]): void;
  debug(): YardDebug;
}

class YardScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Sprite;
  private shadow!: Phaser.GameObjects.Ellipse;
  private pet: Phaser.GameObjects.Sprite | null = null;
  private petSheet: PetSheet | null = null;
  private petStuckMs = 0;
  private bang!: Phaser.GameObjects.Image;
  private beds: Phaser.GameObjects.Image[] = [];
  private feet: Point = { ...SPAWN };
  private facing: Facing = 'Front';
  private moving = false;
  private running = false;
  private path: Point[] = [];
  private pathTarget: InteractableId | null = null;
  private prompt: InteractableId | null = null;
  private camCenter: Point = { ...SPAWN };
  private animKey = '';

  private readonly assets: YardAssets;
  private readonly controls: ControlState;
  private readonly hooks: YardEvents;
  private readonly onReady: () => void;

  constructor(assets: YardAssets, controls: ControlState, hooks: YardEvents, onReady: () => void) {
    super('yard');
    this.assets = assets; this.controls = controls; this.hooks = hooks; this.onReady = onReady;
  }

  create() {
    const { textures } = this;
    const town = textures.addSpriteSheet('town', this.assets.town, { frameWidth: 16, frameHeight: 16 });
    town?.add('tree', 0, 64, 0, 16, 32);
    textures.addCanvas('ground', this.drawGround());
    textures.addCanvas('house', this.drawHouse());
    textures.addCanvas('bang', drawBang());
    textures.addImage('scarecrow', this.assets.scarecrow);
    this.addAvatarTexture();

    this.add.image(0, 0, 'ground').setOrigin(0, 0).setDepth(-1000);
    // 집(타일 3×3을 2배로 — 기존 마당과 같은 크기/위치). 깊이는 집 아래 끝.
    const houseCell = toWorldCell({ x: 3, y: 1 });
    this.add.image(houseCell.x * TILE, houseCell.y * TILE, 'house').setOrigin(0, 0).setScale(2).setDepth((houseCell.y + 6) * TILE);
    for (const tree of borderTrees()) this.add.image(tree.x * TILE + TILE / 2, tree.y * TILE, 'town', 'tree').setOrigin(0.5, 1).setDepth(tree.y * TILE - 2);
    for (const tree of BIG_TREES) {
      const cell = toWorldCell(tree);
      this.add.image(cell.x * TILE, cell.y * TILE, 'town', 'tree').setOrigin(0, 0).setScale(2).setDepth((cell.y + 4) * TILE - 2);
    }
    for (const row of FENCE_ROWS) [80, 81, 81, 82].forEach((frame, i) => {
      const cell = toWorldCell({ x: 10 + i, y: row });
      this.add.image(cell.x * TILE, cell.y * TILE, 'town', frame).setOrigin(0, 0).setDepth((cell.y + 1) * TILE - 4);
    });
    this.setBeds(this.assets.beds);
    const scarecrow = toWorldCell(SCARECROW_CELL);
    this.add.image(scarecrow.x * TILE + TILE / 2, (scarecrow.y + 1) * TILE, 'scarecrow').setOrigin(0.5, 1).setDepth((scarecrow.y + 1) * TILE - 1);

    this.shadow = this.add.ellipse(this.feet.x, this.feet.y, 14, 5, 0x453d29, 0.22);
    this.player = this.add.sprite(this.feet.x, this.feet.y, this.assets.avatar.key, 0).setOrigin(0.5, 31 / 32);
    this.playAvatar(false, 1);
    if (this.assets.pet) this.addPet(this.assets.pet.id, this.assets.pet.source);
    this.bang = this.add.image(0, 0, 'bang').setOrigin(0.5, 1).setVisible(false).setDepth(100000);
    this.tweens.add({ targets: this.bang, scaleY: { from: 1, to: 1.15 }, duration: 380, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const camera = this.cameras.main;
    camera.setBackgroundColor('#5d8a4a');
    camera.setRoundPixels(true);
    this.applyZoom();
    this.scale.on('resize', this.applyZoom, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.applyZoom, this));
    this.onReady();
  }

  private applyZoom() {
    const camera = this.cameras.main;
    camera.setZoom(cameraZoom(this.scale.width, this.scale.height));
    this.camCenter = { x: this.feet.x, y: this.feet.y - 12 };
    this.positionCamera(1);
  }

  private drawGround(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = WORLD_WIDTH; canvas.height = WORLD_HEIGHT;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const town = this.assets.town;
    for (let y = 0; y < WORLD_ROWS; y++) for (let x = 0; x < WORLD_COLS; x++) {
      const id = groundTile(x, y);
      ctx.drawImage(town, (id % 12) * 16, Math.floor(id / 12) * 16, 16, 16, x * TILE, y * TILE, TILE, TILE);
    }
    // 문 앞 매트 — 기존 마당과 같은 interior 러그(48×32)를 2×1칸 상자에 비율 유지로 넣는다.
    const mat = toWorldCell({ x: 5.5, y: 7 });
    ctx.drawImage(this.assets.interior, 48, 144, 48, 32, mat.x * TILE + 4, mat.y * TILE, 24, 16);
    return canvas;
  }

  private drawHouse(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = 48; canvas.height = 48;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    [52, 53, 54, 64, 65, 66, 84, 86, 84].forEach((id, i) => {
      ctx.drawImage(this.assets.town, (id % 12) * 16, Math.floor(id / 12) * 16, 16, 16, (i % 3) * 16, Math.floor(i / 3) * 16, 16, 16);
    });
    return canvas;
  }

  private addAvatarTexture() {
    const { key, canvas } = this.assets.avatar;
    const texture = this.textures.addCanvas(key, canvas);
    if (!texture) return;
    for (let i = 0; i < AVATAR_POSES.length * AVATAR_FRAMES_PER_POSE; i++) {
      texture.add(i, 0, (i % AVATAR_FRAMES_PER_POSE) * 32, Math.floor(i / AVATAR_FRAMES_PER_POSE) * 32, 32, 32);
    }
    AVATAR_POSES.forEach((pose, index) => {
      const walking = pose.startsWith('Walk');
      const frames = walking ? [0, 1, 2, 3] : [0];
      this.anims.create({
        key: `${key}:${pose}`, repeat: -1, frameRate: 8,
        frames: frames.map(frame => ({ key, frame: index * AVATAR_FRAMES_PER_POSE + frame })),
      });
    });
  }

  private addPet(id: PetId, source: HTMLImageElement | HTMLCanvasElement) {
    const sheet = PET_SHEETS[id];
    const key = `pet:${id}`;
    const texture = source instanceof HTMLCanvasElement ? this.textures.addCanvas(key, source) : this.textures.addImage(key, source);
    if (!texture) return;
    for (let r = 0; r < sheet.rows; r++) for (let c = 0; c < sheet.columns; c++) texture.add(r * sheet.columns + c, 0, c * sheet.cell, r * sheet.cell, sheet.cell, sheet.cell);
    for (const [name, anim] of [['walk', sheet.walk], ['idle', sheet.idle]] as const) {
      this.anims.create({ key: `${key}:${name}`, repeat: -1, frameRate: 1000 / anim.frameMs, frames: anim.frames.map(frame => ({ key, frame: anim.row * sheet.columns + frame })) });
    }
    const spot = petFollowSpot(this.feet, this.facing);
    const start = feetBlocked(spot) ? { ...this.feet } : spot;
    this.petSheet = sheet;
    this.pet = this.add.sprite(start.x, start.y, key, sheet.idle.row * sheet.columns).setOrigin(0.5, sheet.footY / sheet.cell);
    this.pet.play(`${key}:idle`);
  }

  setBeds(images: HTMLImageElement[]) {
    this.beds.forEach(bed => bed.destroy());
    this.beds = [];
    images.forEach((image, index) => {
      const cell = BED_CELLS[index];
      if (!cell) return;
      const key = `bed:${index}:${image.src.length}:${hash(image.src)}`;
      if (!this.textures.exists(key)) this.textures.addImage(key, image);
      this.beds.push(this.add.image(cell.x * TILE, cell.y * TILE, key).setOrigin(0, 0).setDepth((cell.y + 2) * TILE - 3));
    });
  }

  walkToWorld(point: Point) {
    const target = cellOf(point);
    const item = INTERACTABLES.find(entry => entry.cell.x === target.x && entry.cell.y === target.y) ?? null;
    const path = planPath(cellOf(this.feet), target);
    this.path = path.map(cellCenter);
    this.pathTarget = item?.id ?? null;
    if (!path.length && item) this.arrive(item.id);
  }
  walkToScreen(x: number, y: number) {
    const world = this.cameras.main.getWorldPoint(x, y);
    this.walkToWorld({ x: world.x, y: world.y });
  }
  cancelWalk() { this.path = []; this.pathTarget = null; }

  private arrive(id: InteractableId) {
    const item = INTERACTABLES.find(entry => entry.id === id);
    if (item) this.facing = facingToward(this.feet, cellCenter(item.cell));
    this.playAvatar(false, 1);
    this.updatePrompt();
    this.hooks.onArrive(id);
  }

  update(_time: number, deltaMs: number) {
    const dt = Math.min(deltaMs, 50) / 1000;
    const { stick, run, frozen } = this.controls;
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
      this.feet = moveFeet(before, vx * dt, vy * dt);
      this.facing = facingFor(vx, vy, this.facing);
      // 벽에 정면으로 막혀 제자리면 걷는 시늉도 멈춘다(제자리 걸음 방지).
      this.moving = Math.hypot(this.feet.x - before.x, this.feet.y - before.y) > 0.05 * speedScale;
      if (!this.moving && this.path.length) this.cancelWalk();
    } else this.moving = false;
    this.running = this.moving && run;
    if (this.moving || wasMoving || this.animKey === '') this.playAvatar(this.moving, Math.max(0.6, speedScale));
    this.player.setPosition(Math.round(this.feet.x), Math.round(this.feet.y)).setDepth(this.feet.y);
    this.shadow.setPosition(Math.round(this.feet.x), Math.round(this.feet.y)).setDepth(this.feet.y - 0.5);
    this.updatePet(deltaMs);
    this.updatePrompt();
    this.positionCamera(dt);
  }

  private playAvatar(walking: boolean, timeScale: number) {
    const key = `${this.assets.avatar.key}:${walking ? 'Walk' : 'Idle'}_${this.facing}`;
    if (key !== this.animKey) { this.player.play(key); this.animKey = key; }
    this.player.anims.timeScale = timeScale;
  }

  private updatePet(deltaMs: number) {
    const pet = this.pet, sheet = this.petSheet;
    if (!pet || !sheet) return;
    const spot = petFollowSpot(this.feet, this.facing);
    const here = { x: pet.x, y: pet.y };
    const dx = spot.x - here.x, dy = spot.y - here.y;
    const distance = Math.hypot(dx, dy);
    const key = pet.texture.key;
    if (distance > 7) {
      const far = distance > 40;
      const speed = (far ? RUN_SPEED * 1.05 : WALK_SPEED) * sheet.pace;
      const step = Math.min(distance, speed * Math.min(deltaMs, 50) / 1000);
      const next = moveFeet(here, dx / distance * step, dy / distance * step);
      const moved = Math.hypot(next.x - here.x, next.y - here.y);
      // 집/울타리에 걸려 오래 못 따라오면 플레이어 뒤로 살짝 순간이동(펫 길찾기는 다음 단계).
      this.petStuckMs = moved < step * 0.3 ? this.petStuckMs + deltaMs : 0;
      const target = this.petStuckMs > 900 && !feetBlocked(spot) ? spot : next;
      if (target === spot) this.petStuckMs = 0;
      pet.setPosition(target.x, target.y);
      if (Math.abs(dx) > 1) pet.setFlipX(sheet.facesLeft ? dx > 0 : dx < 0);
      if (pet.anims.currentAnim?.key !== `${key}:walk`) pet.play(`${key}:walk`);
    } else if (pet.anims.currentAnim?.key !== `${key}:idle`) pet.play(`${key}:idle`);
    pet.setDepth(pet.y);
  }

  private updatePrompt() {
    const item = this.moving && this.path.length ? null : facedInteractable(this.feet, this.facing);
    const id = item?.id ?? null;
    if (item) {
      const top = id === 'scarecrow' ? (item.cell.y + 1) * TILE - 32 : id === 'door' ? item.cell.y * TILE - 2 : item.cell.y * TILE + 2;
      this.bang.setPosition(item.cell.x * TILE + TILE / 2, top).setVisible(true);
    } else this.bang.setVisible(false);
    if (id !== this.prompt) { this.prompt = id; this.hooks.onPrompt(id); }
  }

  private positionCamera(dt: number) {
    const camera = this.cameras.main;
    const target = { x: this.feet.x, y: this.feet.y - 12 };
    const t = Math.min(1, dt * 8);
    this.camCenter = { x: this.camCenter.x + (target.x - this.camCenter.x) * t, y: this.camCenter.y + (target.y - this.camCenter.y) * t };
    const viewW = camera.width / camera.zoom, viewH = camera.height / camera.zoom;
    camera.centerOn(cameraCenterAxis(this.camCenter.x, viewW, WORLD_WIDTH), cameraCenterAxis(this.camCenter.y, viewH, WORLD_HEIGHT));
  }

  snapshot(): YardDebug {
    const camera = this.cameras.main;
    return {
      x: Math.round(this.feet.x * 10) / 10, y: Math.round(this.feet.y * 10) / 10, facing: this.facing, moving: this.moving, running: this.running,
      prompt: this.prompt, pet: this.pet ? { x: Math.round(this.pet.x), y: Math.round(this.pet.y) } : null, zoom: camera.zoom,
      camera: { x: Math.round(camera.scrollX), y: Math.round(camera.scrollY) }, fps: Math.round(this.game.loop.actualFps),
      renderer: this.game.renderer.type === Phaser.WEBGL ? 'webgl' : 'canvas', pathLength: this.path.length,
      targets: Object.fromEntries(INTERACTABLES.map(item => {
        const c = cellCenter(item.cell);
        return [item.id, { x: Math.round((c.x - camera.worldView.x) * camera.zoom), y: Math.round((c.y - camera.worldView.y) * camera.zoom) }];
      })) as Record<InteractableId, Point>,
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
function hash(text: string): number { let h = 0; for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0; return h >>> 0; }

export function startYardGame(parent: HTMLElement, assets: YardAssets, controls: ControlState, events: YardEvents): Promise<YardGameHandle> {
  return new Promise(resolve => {
    const scene: YardScene = new YardScene(assets, controls, events, () => resolve({
      destroy: () => game.destroy(true),
      setActive: active => { if (active) game.loop.wake(); else game.loop.sleep(); },
      walkToScreen: (x, y) => scene.walkToScreen(x, y),
      cancelWalk: () => scene.cancelWalk(),
      setBeds: images => scene.setBeds(images),
      debug: () => scene.snapshot(),
    }));
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
      scale: { mode: Phaser.Scale.RESIZE, width: parent.clientWidth || 1, height: parent.clientHeight || 1 },
      fps: { target: 60, smoothStep: true },
      scene,
    });
  });
}
