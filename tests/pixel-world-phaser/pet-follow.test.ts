import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPetFollowState, stepPetFollow, PET_STOP_RADIUS } from '../../src/features/pixel-world-phaser/logic/petFollow.ts';
import { PET_SHEETS, petFollowSpot } from '../../src/features/pixel-world-phaser/logic/petSheets.ts';
import type { Facing, Point } from '../../src/features/pixel-world-phaser/logic/joystick.ts';
import { moveFeet, feetBlocked } from '../../src/features/pixel-world-phaser/logic/yardWorld.ts';

const openWorld = {
  move: (from: Point, dx: number, dy: number) => ({ x: from.x + dx, y: from.y + dy }),
  blocked: () => false,
};
const gap = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

for (const [id, sheet] of Object.entries(PET_SHEETS)) {
  for (const fps of [60, 30]) {
    test(`${id} at ${fps} fps: walking, running, stops and turns stay calm`, () => {
      const feet = { x: 0, y: 0 };
      let here = petFollowSpot(feet, 'Right');
      let state = createPetFollowState(here);
      let animation = false, switches = 0, flips = 0, maxGap = 0;
      const phases: { seconds: number; speed: number; facing: Facing }[] = [
        { seconds: 4, speed: 56, facing: 'Right' },
        { seconds: 4, speed: 96, facing: 'Right' },
        { seconds: 3, speed: 0, facing: 'Right' },
        { seconds: 4, speed: -96, facing: 'Left' },
        { seconds: 3, speed: 0, facing: 'Left' },
        { seconds: 3, speed: 56, facing: 'Front' },
        { seconds: 3, speed: 0, facing: 'Front' },
      ];
      for (const phase of phases) {
        let previousDirection = 0, reversals = 0;
        for (let frame = 0; frame < phase.seconds * fps; frame++) {
          if (phase.facing === 'Front') feet.y += phase.speed / fps;
          else feet.x += phase.speed / fps;
          const result = stepPetFollow(state, here, feet, phase.facing, sheet, 1000 / fps, 96, openWorld);
          const movement = phase.facing === 'Front' ? result.position.y - here.y : result.position.x - here.x;
          const direction = Math.abs(movement) > 1e-6 ? Math.sign(movement) : 0;
          if (direction && previousDirection && direction !== previousDirection) reversals++;
          if (direction) previousDirection = direction;
          if (animation !== result.walking) switches++;
          if (state.flipX !== result.state.flipX) flips++;
          assert.equal(result.teleported, false);
          maxGap = Math.max(maxGap, gap(result.position, feet));
          animation = result.walking;
          state = result.state;
          here = result.position;
        }
        // 뒤돌아서는 순간에는 한 번 방향을 바꿀 수 있지만 직진 도중에는 왕복하지 않는다.
        assert.ok(reversals <= (phase.facing === 'Left' && phase.speed ? 1 : 0), `reversals: ${reversals}`);
        if (!phase.speed) {
          assert.equal(animation, false, 'settles into idle after stopping');
          assert.ok(gap(here, petFollowSpot(feet, phase.facing)) <= PET_STOP_RADIUS + 0.2);
        }
      }
      assert.ok(switches <= 8, `animation switches: ${switches}`);
      assert.ok(flips <= 3, `flip changes: ${flips}`);
      assert.ok(maxGap < 65, `maximum player distance: ${maxGap}`);
    });

    test(`${id} at ${fps} fps: catches a distant running player without overshoot`, () => {
      const feet = { x: 200, y: 0 };
      let here = { x: 0, y: 3 };
      let state = createPetFollowState(here);
      for (let frame = 0; frame < 8 * fps; frame++) {
        feet.x += 96 / fps;
        const result = stepPetFollow(state, here, feet, 'Right', sheet, 1000 / fps, 96, openWorld);
        assert.ok(result.position.x >= here.x);
        assert.ok(result.position.x <= result.state.target.x - PET_STOP_RADIUS + 1e-6);
        state = result.state;
        here = result.position;
      }
      assert.ok(gap(here, feet) < 50, 'all pets catch up with a running player');
    });
  }
}

test('start/stop hysteresis, flip dead zone and eased facing target', () => {
  const here = { x: 0, y: 0 };
  const sheet = PET_SHEETS.pet_dog;
  // 정지 상태는 중간 반경에서 출발하지 않고, 걷던 상태만 계속 이동한다.
  const idle = createPetFollowState({ x: 8, y: 0 }, true);
  const feet = { x: 26, y: -3 };
  assert.equal(stepPetFollow(idle, here, feet, 'Right', sheet, 1000 / 60, 96, openWorld).walking, false);
  assert.equal(stepPetFollow({ ...idle, walking: true }, here, feet, 'Right', sheet, 1000 / 60, 96, openWorld).walking, true);
  const vertical = { ...idle, target: { x: -2, y: 20 }, walking: true };
  assert.equal(stepPetFollow(vertical, here, { x: 16, y: 17 }, 'Right', sheet, 1000 / 60, 96, openWorld).state.flipX, true);
  const initial = createPetFollowState(petFollowSpot(here, 'Right'));
  const turned = stepPetFollow(initial, initial.target, here, 'Left', sheet, 1000 / 60, 96, openWorld);
  assert.ok(turned.state.target.x > initial.target.x && turned.state.target.x < petFollowSpot(here, 'Left').x);
  assert.ok(gap(turned.state.target, initial.target) < 7, '36px facing jump is eased');
});

for (const fps of [60, 30]) {
  test(`wall recovery at ${fps} fps happens once and settles with blocked follow spot`, () => {
    // 수직 벽 너머 플레이어: 목표 지점은 벽 안, 플레이어 발은 안전하다.
    const solid = (cell: Point) => cell.x === 3;
    const world = {
      move: (from: Point, dx: number, dy: number) => moveFeet(from, dx, dy, solid),
      blocked: (point: Point) => feetBlocked(point, solid),
    };
    const feet = { x: 72, y: 104 };
    assert.equal(world.blocked(petFollowSpot(feet, 'Right')), true);
    let here = { x: 40, y: 104 };
    let state = createPetFollowState(here), recoveries = 0;
    for (let frame = 0; frame < 8 * fps; frame++) {
      const result = stepPetFollow(state, here, feet, 'Right', PET_SHEETS.pet_dog, 1000 / fps, 96, world);
      if (result.teleported) {
        recoveries++;
        assert.deepEqual(result.position, feet);
        assert.equal(result.state.stuckMs, 0);
        assert.equal(result.state.walking, false);
        assert.deepEqual(result.state.target, result.position);
      }
      assert.equal(world.blocked(result.position), false);
      here = result.position;
      state = result.state;
    }
    assert.equal(recoveries, 1, 'no repeated teleport near the wall');
  });
}
