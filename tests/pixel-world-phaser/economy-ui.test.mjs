import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// 노드 단위 테스트에서만 Vite의 정적 에셋과 창 테두리를 대신한다.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      const url = new URL(`${specifier}.tsx`, context.parentURL);
      if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('.css')) return { format: 'module', source: '', shortCircuit: true };
    if (url.endsWith('/ui/GamePanels.tsx')) return { format: 'module', source: 'export const Window = ({ children }) => children;', shortCircuit: true };
    if (url.endsWith('.tsx')) {
      const source = readFileSync(fileURLToPath(url), 'utf8').replace(/import\.meta\.glob\([^;]+?\)/g, '({})');
      return { format: 'module', source: ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText, shortCircuit: true };
    }
    return next(url, context);
  },
});
const { CatchCard, catchPointNote } = await import('../../src/features/pixel-world-phaser/ui/CatchCard.tsx');
const { FishChampions, fishSizeLabel, sortedChampions } = await import('../../src/features/pixel-world-phaser/ui/FishBoard.tsx');
const { createWeeklyRewardsEntry } = await import('../../src/features/pixel-world-phaser/ui/WeeklyRewards.tsx');
const { FISH_POINTS, JUNK_POINTS, FISH_TIER_REWARDS } = await import('../../src/features/pixel-world-phaser/logic/gamePoints.ts');
const points = (awarded, capped = true) => ({ awarded, capped, todayEarned: 54, cap: 50 });
const fish = { ok: true, landed: true, speciesId: 'eel', rarity: 'rare', lengthCm: 71, isBig: false, isNew: false, isPersonalBest: false, remaining: 0 };
const junk = { ok: true, landed: true, junk: 'junk_coin', remaining: 0 };

test('포인트는 XP 옆에 표시하고 오늘 합계와 상한 안내를 보여 준다', () => {
  const html = renderToStaticMarkup(createElement(CatchCard, { caught: { ...fish, points: points(2) }, onHide() {} }));
  assert.match(html, /XP · \+2 P/);
  assert.match(html, /오늘 54\/50P/);
  assert.match(html, /오늘 상한을 넘어서 절반만 받았어요/);
  const zero = renderToStaticMarkup(createElement(CatchCard, { caught: { ...junk, points: points(0) }, onHide() {} }));
  assert.match(zero, /XP · \+0 P/);
  assert.match(zero, /오늘 상한을 넘어 잡동사니는 포인트가 없어요/);
  assert.doesNotMatch(renderToStaticMarkup(createElement(CatchCard, { caught: fish, onHide() {} })), /\/50P| · \+\d+ P/);
});

test('상한 안내는 실제 기본 포인트보다 적게 받은 경우에만 나온다', () => {
  for (const [rarity, base] of Object.entries(FISH_POINTS)) {
    assert.equal(catchPointNote({ ...fish, rarity, points: points(base) }), null);
    assert.equal(catchPointNote({ ...fish, rarity, points: points(base - 1, false) }), null);
  }
  for (const [id, base] of Object.entries(JUNK_POINTS)) assert.equal(catchPointNote({ ...junk, junk: id, points: points(base) }), null);
  assert.equal(catchPointNote(fish), null);
});

test('챔피언은 별 5부터 중복 없이 표시하며 선생님에게 상금을 표시하지 않는다', () => {
  const champions = ['common', 'rare', 'mythic', 'legendary', 'uncommon'].map((rarity, index) => ({ rarity, speciesId: 'eel', animal: index === 2 ? '🦍' : '🐢', lengthCm: 71, score: 62, teacher: index === 2, reward: FISH_TIER_REWARDS[rarity] }));
  const ordered = sortedChampions([...champions, champions[0]]);
  assert.deepEqual(ordered.map(row => row.rarity), ['mythic', 'legendary', 'rare', 'uncommon', 'common']);
  assert.equal(champions[0].rarity, 'common');
  const html = renderToStaticMarkup(createElement(FishChampions, { champions }));
  assert.match(html, /71\.0cm.*62%/);
  assert.match(html, /선생님 기록 · 보상 없음/);
  assert.match(html, /🦍/);
  assert.doesNotMatch(html, /150P/);
  assert.match(html, /100P/);
  const student = renderToStaticMarkup(createElement(FishChampions, { champions: [{ ...champions[2], teacher: false }] }));
  assert.match(student, /150P/);
  assert.match(html, /매주 월요일 0시에 지난주 챔피언에게 포인트를 줘요/);
});

test('크기 점수는 종별 범위로 계산하고 큰 물고기의 100% 초과도 보존한다', () => {
  assert.equal(fishSizeLabel('eel', 71), '62%');
  assert.equal(fishSizeLabel('eel', 95), '110%');
  assert.equal(fishSizeLabel('unknown', 71), '—');
});

test('보상 조회와 확인은 입장당 한 번이며 재입장에서는 다시 조회한다', async () => {
  let calls = 0;
  const acknowledgments = [];
  const items = [{ id: 'fish', label: '물고기 챔피언', points: 150 }, { id: 'crop', label: '수확 대회', points: 70 }];
  const adapter = { pending: async () => { calls++; return items; }, ack: async ids => { acknowledgments.push(ids); return true; } };
  const entry = createWeeklyRewardsEntry(adapter);
  assert.deepEqual(await Promise.all([entry.pending(), entry.pending()]), [items, items]);
  assert.equal(calls, 1);
  entry.ack(items.map(item => item.id));
  entry.ack(['fish']);
  await Promise.resolve();
  assert.deepEqual(acknowledgments, [['fish', 'crop']]);
  assert.deepEqual(await entry.pending(), []);
  assert.deepEqual(await createWeeklyRewardsEntry(adapter).pending(), items);
  assert.equal(calls, 2);
});

test('조회·확인 실패와 빈 보상은 게임에 오류를 전파하지 않는다', async () => {
  for (const pending of [() => { throw Error('조회 실패'); }, async () => { throw Error('조회 실패'); }, async () => []]) {
    const entry = createWeeklyRewardsEntry({ pending, ack: async () => { throw Error('확인 실패'); } });
    assert.deepEqual(await entry.pending(), []);
    assert.doesNotThrow(() => entry.ack(['fish']));
    await new Promise(resolve => setImmediate(resolve));
  }
});
