import assert from 'node:assert/strict';
import test from 'node:test';
import { createReelGame, stepReelGame, minReelMs, REEL_MARGIN_MS } from '../../src/features/pixel-world-phaser/logic/reelGame.ts';
import type { ReelGame, ReelAxisInput } from '../../src/features/pixel-world-phaser/logic/reelGame.ts';
type Player = 'lazy' | 'novice' | 'good';
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
    if (player === 'novice' && d === 1) assert.ok(wins.length >= 28);
    if (player === 'novice' && (d === 2 || d === 3)) assert.ok(wins.length >= 16 && wins.length <= 24);
    if (player === 'novice' && d === 4) assert.ok(wins.length <= 8);
    if (player === 'novice' && d === 5) assert.ok(wins.length <= 2);
    if (player === 'good' && d === 4) assert.ok(wins.length >= 32);
    if (player === 'good' && d === 5) { assert.ok(wins.length >= 24); assert.ok(mean >= 20 && mean <= 35); }
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
  for (const d of [1,3,5]) {
    const {game,taps,axes} = simulate(d,'good',5);
    for (const frames of [[1000/30],[1000/60],[17,93,250,41,99]]) {
      let other=createReelGame(d,false,false,5), wall=0, ti=0, ai=0, frame=0;
      while(other.status==='playing' && wall<76000) {
        const dt=frames[frame++%frames.length], ts:number[]=[], xs:ReelAxisInput[]=[];
        while(ti<taps.length && taps[ti]<=wall+dt+1e-7) ts.push(taps[ti++]);
        while(ai<axes.length && axes[ai].time<=wall+dt+1e-7) xs.push(axes[ai++]);
        other=stepReelGame(other,dt,ts,xs);wall+=dt;
      }
      for(const field of ['status','elapsed','zoneX','zone','fishX','fish','progress','tapCount'] as const) assert.equal(other[field],game[field],field);
    }
  }
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
