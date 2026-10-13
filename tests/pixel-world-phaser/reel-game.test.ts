import assert from 'node:assert/strict';
import test from 'node:test';
import { createReelGame, stepReelGame, minReelMs, REEL_MARGIN_MS, HEAVY_PATTERNS, HEAVY } from '../../src/features/pixel-world-phaser/logic/reelGame.ts';
import type { ReelGame, ReelAxisInput } from '../../src/features/pixel-world-phaser/logic/reelGame.ts';
type Player = 'lazy' | 'novice' | 'good';
function verticalBot(seed: number, heavy: boolean) {
  let g = createReelGame(5, false, false, seed, 1, undefined, false, 0, heavy), lastTap = -1000;
  for (let tick = 0; tick < 9000 && g.status === 'playing'; tick++) {
    const time = (tick + 1) * 1000 / 120;
    // 같은 봇이 물고기가 원 중심보다 위에 있으면 빠르게 탭하고 좌우를 따라간다.
    const tap = time - lastTap >= 90 && g.fish > g.zone;
    if (tap) lastTap = time;
    const x = Math.max(-1, Math.min(1, (g.fishX - g.zoneX) * 5 / 1.8));
    g = stepReelGame(g, 1000 / 120, tap ? [time] : [], [{ time, x }]);
  }
  return g;
}
test('상어·고래는 30개 시드에서 잡을 수 있고 일반 물고기보다 탭이 많이 필요하다', () => {
  const heavy = Array.from({ length: 30 }, (_, seed) => verticalBot(seed, true));
  const normal = Array.from({ length: 30 }, (_, seed) => verticalBot(seed, false));
  const wins = heavy.filter(g => g.status === 'landed' && g.elapsed <= 75);
  const heavyTaps = heavy.reduce((sum, g) => sum + g.tapCount, 0);
  const normalTaps = normal.reduce((sum, g) => sum + g.tapCount, 0);
  console.log(`HEAVY wins=${wins.length}/30 taps=${heavyTaps} normalWins=${normal.filter(g => g.status === 'landed').length}/30 normalTaps=${normalTaps} ratio=${(heavyTaps / normalTaps).toFixed(2)}`);
  assert.ok(wins.length >= 18);
  // 위로 15% 느려지고 좌우로도 헤엄쳐 덜 가혹해졌지만, 여전히 보통 물고기보다 탭이 많이 든다.
  assert.ok(heavyTaps >= normalTaps * 1.3);
});
test('상어·고래는 5가지 패턴을 섞고(연달아 같은 것 없음), 아래보다 위에 오래 있고, 좌우로도 크게 움직인다', () => {
  let g = createReelGame(5, false, false, 7, 1, undefined, false, 0, true);
  const order: string[] = [];
  let top = 0, bottom = 0, wide = 0;
  for (let tick = 0; tick < 120 * 120; tick++) {
    const next = stepReelGame({ ...g, progress: .5 }, 1000 / 120);
    if (next.motion !== g.motion) order.push(next.motion);
    if (next.fish > .2) top++; else if (next.fish < -.2) bottom++;
    if (Math.abs(next.fishX) > .55) wide++;
    assert.ok(Math.hypot(next.fishX, next.fish) <= .94 + 1e-12);
    assert.ok(Math.hypot(next.zoneX, next.zone) <= 1 - next.zoneSize + 1e-12);
    g = next;
  }
  assert.deepEqual(new Set(order), new Set(HEAVY_PATTERNS.map(p => p.kind)));
  for (let i = 1; i < order.length; i++) assert.notEqual(order[i], order[i - 1]);
  // 위에 더 오래(아래는 위의 대략 절반 이하) — 시드 하나라 범위를 넉넉히 둔다(여러 시드 평균은 약 0.46).
  assert.ok(bottom / top > .15 && bottom / top < .65, `bottom/top ${(bottom / top).toFixed(2)}`);
  assert.ok(wide / (120 * 120) > .08, 'swings wide left and right');
  const normal = createReelGame(5);
  assert.ok(stepReelGame(createReelGame(5, false, false, 0, 1, undefined, false, 0, true), 100).velocity < stepReelGame(normal, 100).velocity);
});
export function simulate(d: number, player: Player, seed: number, big = false) {
  let g = createReelGame(d, false, big, seed), last = -1000, random = seed + 1, lazyAxis = 0;
  const history: ReelGame[] = [g], taps: number[] = [], axes: ReelAxisInput[] = [];
  const reaction = player === 'good' ? 150 : 300 + seed % 7 * 25;
  for (let tick = 0; tick < 9000 && g.status === 'playing'; tick++) {
    const time = (tick + 1) * 1000 / 120;
    const seen = history[Math.max(0, history.length - 1 - Math.round(reaction * .12))];
    const lead = player === 'good' ? reaction / 1000 : 0;
    const noise = player === 'novice' ? .07 * Math.sin(time / 230 + seed * 2) : 0;
    if (tick % 84 === 0) {
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
      lazyAxis = random / 4294967296 * 2 - 1;
    }
    const x = player === 'lazy' ? lazyAxis : Math.max(-1, Math.min(1, ((seen.fishX + seen.fishVX * lead + noise - g.zoneX) * 5 + seen.fishVX * .7) / 1.8));
    const tap = time - last >= (player === 'lazy' ? 850 : 150) && (player === 'lazy' || g.zone + g.velocity * .18 < seen.fish + seen.fishVY * lead + noise - .055);
    if (tap) { last = time; taps.push(time); }
    const axis = { time, x }; axes.push(axis);
    g = stepReelGame(g, 1000 / 120, tap ? [time] : [], [axis]); history.push(g);
  }
  return { game: g, taps, axes };
}
test('지연된 추적 플레이어의 난이도별 성공률', () => {
  for (const d of [1, 2, 3, 4, 5]) for (const player of ['lazy', 'novice', 'good'] as const) {
    const results = Array.from({length:40}, (_,seed) => simulate(d, player, seed).game);
    const wins = results.filter(g => g.status === 'landed');
    const mean = wins.reduce((sum,g) => sum + g.elapsed,0) / (wins.length || 1);
    console.log(`SIM difficulty=${d} player=${player} wins=${wins.length}/40 meanSeconds=${mean.toFixed(2)}`);
    if (player === 'lazy' && d === 1) assert.ok(wins.length <= 8);
    if (player === 'novice' && d === 1) assert.ok(wins.length >= 38);
    if (player === 'novice' && (d === 2 || d === 3)) assert.ok(Math.abs(wins.length - (d === 2 ? 22 : 23)) <= 2);
    if (player === 'novice' && d === 4) assert.ok(wins.length <= 2);
    if (player === 'novice' && d === 5) assert.equal(wins.length, 0);
    if (player === 'good' && d === 4) assert.ok(wins.length >= 30 && wins.length <= 36);
    if (player === 'good' && d === 5) assert.ok(wins.length >= 22 && wins.length <= 28);
    if (player === 'good' && d <= 3) assert.equal(wins.length, 40);
    if (player === 'good') assert.ok(wins.every(g => g.elapsed < 75));
  }
});
test('원 내부 물리, 좌우 조작, 위로 부스트와 오리 보너스', () => {
  let g = createReelGame();
  const right = stepReelGame(g, 100, [0], [{time:0,x:1}]);
  const left = stepReelGame(g, 100, [], [{time:0,x:-1}]);
  assert.ok(right.zoneX > 0 && left.zoneX < 0); assert.ok(right.zone > 0 && left.zone < 0);
  for (let i=0;i<2000;i++) {
    g = stepReelGame({...g,progress:.5}, 1000/120, [i*1000/120], [{time:i*1000/120,x:1}]);
    assert.ok(Math.hypot(g.zoneX,g.zone) <= 1-g.zoneSize+1e-10);
    assert.ok(Math.hypot(g.fishX,g.fish) <= .94+1e-10);
  }
  assert.ok(createReelGame(1).arenaScale > createReelGame(5).arenaScale);
  assert.ok(createReelGame(1).zoneSize > createReelGame(5).zoneSize);
  assert.ok(createReelGame(3,true).zoneSize > createReelGame(3).zoneSize);
  assert.notEqual(stepReelGame({...createReelGame(3,true,true),progress:.5},10000).fish,stepReelGame({...createReelGame(3),progress:.5},10000).fish);
});
test('시간표 입력 재생은 프레임 속도와 무관하다', () => {
  for (const d of [1,3,3.75,4,5]) {
    const {game,taps,axes} = simulate(d,'good',5);
    for (const frames of [[1000/30],[1000/60],[17,93,250,41,99]]) {
      let other=createReelGame(d,false,false,5), wall=0, ti=0, ai=0, frame=0;
      while(other.status==='playing' && wall<76000) {
        const dt=frames[frame++%frames.length], ts:number[]=[], xs:ReelAxisInput[]=[];
        while(ti<taps.length && taps[ti]<=wall+dt+1e-7) ts.push(taps[ti++]);
        while(ai<axes.length && axes[ai].time<=wall+dt+1e-7) xs.push(axes[ai++]);
        other=stepReelGame(other,dt,ts,xs);wall+=dt;
      }
      for(const field of ['status','elapsed','zoneX','zone','fishX','fish','fishVX','fishVY','progress','tapCount','random','motion','motionStart','motionAngle','motionTurn','wanderFrequency','nextTarget','targetX','targetY'] as const) assert.equal(other[field],game[field],field);
    }
  }
});

test('원의 크기와 잡기 반경은 기존 공식 그대로다', () => {
  for (const [d, arena, radius] of [[1, 1, .42], [2, .9375, .33], [3, .875, .32], [3.5, .84375, .315], [4, .8125, .31], [5, .75, .30]]) {
    for (const duck of [false, true]) {
      const g = createReelGame(d, duck);
      assert.equal(g.arenaScale, arena);
      assert.ok(Math.abs(g.zoneSize - radius * (duck ? 1.1 : 1)) < 1e-12) // 오리: 원 +10%;
    }
  }
});

test('불규칙한 행동은 회전 분산을 늘리고 속도와 위치는 제한된다', () => {
  const variance = (difficulty: number) => {
    const angles: number[] = [], modes = new Set<string>(), dwell = new Set<number>(), frequencies = new Set<number>();
    let fullSweep = false, reversed = false;
    for (let seed = 0; seed < 8; seed++) {
      let g = createReelGame(difficulty, false, false, seed);
      for (let tick = 0; tick < 3600; tick++) {
        const next = stepReelGame({ ...g, progress: .5 }, 1000 / 120);
        const d = difficulty - 1, erratic = Math.max(0, Math.min(1, (difficulty - 3.5) / 1.5));
        const cap = (.455 + (d - 2) * .0925) * (1 + erratic * (2.45 - 2.4 * erratic)) * 1.9;
        assert.ok(Math.hypot(next.fishX, next.fish) <= .94 + 1e-12);
        if (difficulty > 3.5) {
          assert.ok(Math.hypot(next.fishVX, next.fishVY) <= cap + 1e-12);
          assert.ok(Math.hypot(next.fishX - g.fishX, next.fish - g.fish) <= cap / 120 + 1e-12);
        }
        if (Math.hypot(g.fishVX, g.fishVY) > .05 && Math.hypot(next.fishVX, next.fishVY) > .05) {
          angles.push(Math.atan2(g.fishVX * next.fishVY - g.fishVY * next.fishVX, g.fishVX * next.fishVX + g.fishVY * next.fishVY));
        }
        modes.add(next.motion); frequencies.add(next.wanderFrequency);
        if (next.nextTarget !== g.nextTarget) dwell.add(next.nextTarget - next.elapsed);
        if (next.motion === 'sweep' && next.nextTarget - next.motionStart > 3) fullSweep = true;
        if (next.motion === 'feint' && g.motion === 'feint' && next.targetX * g.targetX < 0) reversed = true;
        g = next;
      }
    }
    if (difficulty > 3.5) {
      assert.equal(modes.size, 4); assert.ok(dwell.size > 50); assert.ok(frequencies.size > 50);
      assert.ok(fullSweep); assert.ok(reversed);
    }
    const mean = angles.reduce((sum, angle) => sum + angle, 0) / angles.length;
    return angles.reduce((sum, angle) => sum + (angle - mean) ** 2, 0) / angles.length;
  };
  const easy = variance(3), hard = variance(4), hardest = variance(5);
  console.log(`MOTION turnVariance d3=${easy.toFixed(6)} d4=${hard.toFixed(6)} d5=${hardest.toFixed(6)}`);
  assert.ok(hard > easy * 2); assert.ok(hardest > hard);
  assert.deepEqual(stepReelGame(createReelGame(5, false, false, 12), 2000), stepReelGame(createReelGame(5, false, false, 12), 2000));
  assert.notDeepEqual(stepReelGame(createReelGame(5, false, false, 12), 2000), stepReelGame(createReelGame(5, false, false, 13), 2000));
});
test('최소 시간, 불변성, 잘못된 입력과 미래 입력', () => {
  for(const d of [1,1.63,3,4.79,5]) for(const speed of [1,2]) {
    const minimum=minReelMs(d,speed)+REEL_MARGIN_MS;
    let g={...createReelGame(d,false,false,0,speed),progress:1,zoneSize:2};
    g=stepReelGame(g,minimum-1);assert.equal(g.status,'playing');
    g=stepReelGame(g,20);assert.equal(g.status,'landed');assert.ok(g.elapsed*1000+1e-7>=minimum);
  }
  const initial=Object.freeze(createReelGame());
  const next=stepReelGame(initial,100,[150,NaN],[{time:150,x:1}]);
  assert.equal(next.tapCount,0);assert.equal(next.axis,0);
  assert.equal(stepReelGame(next,100).tapCount,1);assert.equal(initial.elapsed,0);
  assert.strictEqual(stepReelGame(initial,NaN),initial);assert.deepEqual(initial.taps,[]);
});

test('연타는 위쪽으로 지나치고 무입력은 탈출한다', () => {
  let spam = createReelGame();
  for (let tick = 0; tick < 240; tick++) {
    spam = stepReelGame({ ...spam, progress: .5 }, 1000 / 120, tick % 9 === 0 ? [tick * 1000 / 120] : []);
  }
  assert.ok(spam.zone > .5);
  assert.ok(spam.zone - spam.fish > .2);
  assert.equal(stepReelGame(createReelGame(), 75000, Array.from({ length: 1000 }, (_, i) => i * 75)).status, 'escaped');
  const escaped = stepReelGame(createReelGame(), 75000);
  assert.equal(escaped.status, 'escaped');
  assert.strictEqual(stepReelGame(escaped, 100, [0]), escaped);
});

test('난도가 높으면 더 빠르게 방향을 바꾸고 대물은 추가 돌진한다', () => {
  const motion = (difficulty: number, big = false, trophy = false) => {
    let g = createReelGame(difficulty, false, big, 7, 1, undefined, trophy), distance = 0, turns = 0, targets = 0;
    for (let tick = 0; tick < 3600; tick++) {
      const next = stepReelGame({ ...g, progress: .5 }, 1000 / 120);
      distance += Math.hypot(next.fishX - g.fishX, next.fish - g.fish);
      if (next.nextTarget !== g.nextTarget) targets++;
      if (next.fishVX * g.fishVX < 0 || next.fishVY * g.fishVY < 0) turns++;
      g = next;
    }
    return { distance, turns, targets };
  };
  const easy = motion(1), hard = motion(5);
  assert.ok(hard.distance > easy.distance * 1.5);
  assert.ok(hard.targets > easy.targets);
  assert.ok(hard.turns > easy.turns);
  assert.notEqual(motion(1, true).distance, easy.distance);
  assert.notEqual(motion(1, false, true).distance, easy.distance);
});

// 실력 좋은 학생: 화면을 0.1초 늦게 보고, 탭은 0.15초에 한 번까지.
function skilledPlayer(seed: number, heavy: boolean) {
  let g = createReelGame(5, false, false, seed, 1, undefined, false, 0, heavy), lastTap = -1000;
  const seen: ReelGame[] = [];
  for (let tick = 0; tick < 9000 && g.status === 'playing'; tick++) {
    const time = (tick + 1) * 1000 / 120;
    seen.push(g); const view = seen.length > 12 ? seen[seen.length - 12] : seen[0];
    const tap = time - lastTap >= 150 && view.fish > view.zone;
    if (tap) lastTap = time;
    const x = Math.max(-1, Math.min(1, (view.fishX - view.zoneX) * 5 / 1.8));
    g = stepReelGame(g, 1000 / 120, tap ? [time] : [], [{ time, x }]);
  }
  return g;
}
test('상어·고래는 실력 좋은 학생이면 대부분 낚지만 보통 난이도 5보다 탭이 더 든다', () => {
  const heavy = Array.from({ length: 40 }, (_, seed) => skilledPlayer(seed, true));
  const normal = Array.from({ length: 40 }, (_, seed) => skilledPlayer(seed, false));
  const win = (r: ReelGame[]) => r.filter(g => g.status === 'landed').length;
  const rate = (r: ReelGame[]) => r.reduce((a, g) => a + g.tapCount, 0) / r.reduce((a, g) => a + g.elapsed, 0);
  console.log(`SKILLED heavy ${win(heavy)}/40 normal ${win(normal)}/40 taps/s ${rate(heavy).toFixed(2)} vs ${rate(normal).toFixed(2)}`);
  // 2026-10-14 완화 뒤엔 실력 좋은 학생이면 거의 다 낚는다(전 33/40). 무거운 느낌은 탭 수로 남긴다.
  assert.ok(win(heavy) >= 34, 'easier than before the 2026-10-14 tuning');
  assert.ok(rate(heavy) > rate(normal) * 1.15, 'more tapping');
});

// 2026-10-14 상어·고래 완화: 탭 점프·원 밖 감소·패턴 사이 휴식. 일반 물고기는 그대로.
function peakAfterTap(heavy: boolean) {
  let g = createReelGame(5, false, false, 3, 1, undefined, false, 0, heavy);
  g = stepReelGame({ ...g, zone: -.4, velocity: 0 }, 1000 / 120, [g.elapsed * 1000 + 1]);
  const start = -.4 + 0; let peak = g.zone;
  for (let i = 0; i < 120; i++) { g = stepReelGame({ ...g, progress: .5 }, 1000 / 120); peak = Math.max(peak, g.zone); }
  return { rise: peak - start, velocity: g.velocity };
}
test('상어·고래 탭 점프가 예전(.85)보다 약 40% 높고 일반 물고기 탭은 그대로', () => {
  const rise = (v0: number, gravity: number) => v0 * v0 / (2 * gravity);
  assert.equal(HEAVY.tapVelocity, 1);
  assert.ok(rise(HEAVY.tapVelocity, HEAVY.gravity) / rise(.85, HEAVY.gravity) > 1.35);
  const heavy = peakAfterTap(true);
  assert.ok(heavy.rise > rise(.85, HEAVY.gravity) * 1.25, `heavy rise ${heavy.rise.toFixed(3)}`);
  // 일반 물고기는 탭 직후 속도 .85에서 시작한다.
  const g = createReelGame(5);
  const tapped = stepReelGame(g, 1000 / 120, [1]);
  assert.ok(Math.abs(tapped.velocity - (.85 - 2.3 / 120)) < 1e-12);
  const heavyTapped = stepReelGame(createReelGame(5, false, false, 0, 1, undefined, false, 0, true), 1000 / 120, [1]);
  assert.ok(Math.abs(heavyTapped.velocity - (1 - HEAVY.gravity / 120)) < 1e-12);
});
test('상어·고래는 원 밖에서 진행이 25% 느리게 줄고, 얻는 속도는 같다', () => {
  const lossOver = (heavy: boolean) => {
    // 물고기를 원과 먼 곳에 두고 0.2초 동안만 본다(물고기가 원에 닿지 않을 만큼 짧게).
    const g = { ...createReelGame(5, false, false, 1, 1, undefined, false, 0, heavy), progress: .5, zone: -.6, fish: .8 };
    return .5 - stepReelGame(g, 200).progress;
  };
  const normal = lossOver(false), heavy = lossOver(true);
  assert.ok(normal > 0);
  assert.ok(Math.abs(heavy / normal - HEAVY.lossScale) < 1e-9, `ratio ${(heavy / normal).toFixed(4)}`);
  const gainOver = (heavy: boolean) => {
    const g = { ...createReelGame(5, false, false, 1, 1, undefined, false, 0, heavy), progress: .5, zone: 0, fish: 0, nextTarget: 99, targetX: 0, targetY: 0 };
    return stepReelGame(g, 50).progress - .5;
  };
  assert.ok(Math.abs(gainOver(true) - gainOver(false)) < 1e-12);
});
test('상어·고래는 패턴이 바뀐 뒤 0.5초 지쳐 절반 속도로 헤엄치고 그동안 돌진하지 않는다', () => {
  let g = createReelGame(5, false, false, 11, 1, undefined, false, 0, true);
  g = stepReelGame(g, 1000 / 120);
  assert.ok(g.tiredUntil <= g.elapsed + 1e-9, 'first pattern starts without rest');
  let changes = 0;
  for (let tick = 0; tick < 120 * 30; tick++) {
    const prev = g;
    g = stepReelGame({ ...g, progress: .5 }, 1000 / 120);
    if (g.motion !== prev.motion) {
      changes++;
      assert.ok(Math.abs(g.tiredUntil - (g.elapsed + HEAVY.tiredSeconds)) < 1e-9);
      assert.ok(g.burstUntil <= g.elapsed || g.burstUntil >= g.tiredUntil, 'no burst inside tired window');
    }
    if (g.elapsed > 1 && g.elapsed < g.tiredUntil - .3) {
      // 휴식 중엔 목표 속도가 cruise(최대 1.15) × .5 — 관성을 감안해 넉넉히 확인.
      assert.ok(Math.hypot(g.fishVX, g.fishVY) < 1.15 * 1.9, 'never bursting while tired');
    }
  }
  assert.ok(changes >= 5);
  // 같은 상태에서 지친 물고기가 덜 움직인다.
  const base = { ...g, motion: 'climb' as const, motionStart: g.elapsed, nextTarget: g.elapsed + 5, burstUntil: 0, fishX: 0, fish: -.6, fishVX: 0, fishVY: 0, progress: .5 };
  const rested = stepReelGame({ ...base, tiredUntil: 0 }, 300), tired = stepReelGame({ ...base, tiredUntil: g.elapsed + 5 }, 300);
  const moved = (s: ReelGame) => Math.hypot(s.fishX - base.fishX, s.fish - base.fish);
  assert.ok(moved(tired) < moved(rested) * .7, `tired ${moved(tired).toFixed(3)} vs ${moved(rested).toFixed(3)}`);
});
