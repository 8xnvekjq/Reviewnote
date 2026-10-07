// 장면(앞마당·방, 다음은 광장·밭) 정의의 공통 모양과 장면 사이 연결. 장면은 "격자 + 막힌 칸 + A 대상 +
// 출구 + 입구(들어왔을 때 설 자리)"만 내놓고, 움직임/카메라/펫/대화는 game/WorldScene이 공통으로 처리한다.
// 새 장면을 붙이려면: ① SceneId에 이름 추가 ② 여기처럼 SceneSpec을 만드는 순수 함수 ③ 다른 장면의
// 출구 to가 그 장면의 입구 이름을 가리키게 ④ game/에 WorldScene 하위 클래스(그림만) — 끝. 순수 모듈.
import type { Facing, Point } from './joystick';
import { cellCenter, cellOf, nearestOpenCell, sameCell } from './world';
import type { Grid, Interactable } from './world';
import type { Placement } from '../../pixel-room/model';
import { yardScene } from './yardWorld';
import { roomScene } from './roomWorld';
import { plazaScene } from './plazaWorld';

export type SceneId = 'yard' | 'room' | 'plaza';
/** 출구가 데려가는 곳: 장면 + 그 장면의 입구 이름. */
export interface SceneLink { scene: SceneId; entry: string }
/** 발이 이 칸들 중 하나에 들어서면 장면을 넘어간다. */
export interface SceneExit { id: string; cells: readonly Point[]; to: SceneLink }
/** 다른 장면에서 들어왔을 때 설 칸과 바라볼 방향. */
export interface SceneEntry { cell: Point; facing: Facing }
export interface SceneSpec extends Grid {
  id: SceneId;
  /** 들어올 때 잠깐 뜨는 장면 이름("앞마당", "내 방"). */
  title: string;
  interactables: readonly Interactable[];
  exits: readonly SceneExit[];
  entries: Readonly<Record<string, SceneEntry>>;
  /** 게임을 처음 열 때 / 모르는 입구 이름일 때 쓰는 입구. */
  defaultEntry: string;
}
/** 장면을 만들 때 필요한 서버 데이터(방 가구 배치 등). 읽기 전용. */
export interface SceneData { furniture: readonly Placement[] }

export const FIRST_SCENE: SceneId = 'yard';
export function buildScene(id: SceneId, data: SceneData): SceneSpec {
  return id === 'plaza' ? plazaScene() : id === 'room' ? roomScene(data.furniture) : yardScene();
}

/** 지금 발이 밟고 있는 출구. */
export function exitAt(spec: SceneSpec, feet: Point): SceneExit | null {
  const cell = cellOf(feet);
  return spec.exits.find(exit => exit.cells.some(c => sameCell(c, cell))) ?? null;
}
export const exitById = (spec: SceneSpec, id: string): SceneExit | null => spec.exits.find(exit => exit.id === id) ?? null;
/** 탭해서 걷기가 목표일 때만 밟는 칸(출구). */
export const exitCells = (spec: SceneSpec): Point[] => spec.exits.flatMap(exit => [...exit.cells]);

/** 입구 이름 → 실제로 설 발 위치. 그 칸이 막혔으면(가구가 들어섰다든지) 출구가 아닌 가장 가까운 열린 칸. */
export function entrySpawn(spec: SceneSpec, entry: string | undefined): { feet: Point; facing: Facing } {
  const chosen = (entry && spec.entries[entry]) || spec.entries[spec.defaultEntry];
  const cell = nearestOpenCell(chosen.cell, spec, exitCells(spec)) ?? chosen.cell;
  return { feet: cellCenter(cell), facing: chosen.facing };
}
