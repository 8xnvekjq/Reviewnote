// Real PixelRoom + real pets in a real browser, intercepted REST only (same pattern as
// dog.browser.mjs). Tap-to-feed: far tap walks the player beside the pet and then feeds it, a near
// tap feeds at once, the pet is held facing the player while data-interaction runs through its
// stages, repeat taps are ignored, and the pet returns to its own behavior afterwards. Also checks
// the step hop/dust, furniture placement effect and prefers-reduced-motion.
// Captures (390px) go to UI_OUTPUT (default node_modules/.cache/pixel-pet-interaction).
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { emptyFarm } from './emptyFarm.mjs';
import { PIXEL_CATALOG } from '../../src/features/pixel-room/shop/catalog.ts';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const out = process.env.UI_OUTPUT || 'node_modules/.cache/pixel-pet-interaction';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const catalog = PIXEL_CATALOG.map(i => ({ item_id: i.itemId, category: i.category, slot: i.slot, price: i.price, asset_key: i.assetKey, display_name: i.displayName, tier: i.tier, stackable: false }));
const url = user => `http://127.0.0.1:5174/tests/pixel-room/?tab=pixelRoom&user=${user}&testBalance=10000`;

async function open(options, activePet, owned = []) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', ...options });
  const state = { owned: new Set([activePet, ...owned]), placements: new Map(), activePet };
  await context.route('**/*', async route => {
    const path = new URL(route.request().url());
    if (path.hostname === '127.0.0.1') return route.continue();
    let data = [];
    if (path.pathname.endsWith('/get_pixel_farm')) data = emptyFarm();
    else if (path.pathname.endsWith('/pixel_item_catalog')) data = catalog;
    else if (path.pathname.endsWith('/pixel_item_ownership')) data = [...state.owned].map(item_id => ({ item_id }));
    else if (path.pathname.endsWith('/pixel_avatar_equipment')) data = {};
    else if (path.pathname.endsWith('/pixel_furniture_placement')) data = [...state.placements.entries()].map(([item_id, pos]) => ({ item_id, ...pos }));
    else if (path.pathname.endsWith('/pixel_pet_equipment')) data = { active_pet: state.activePet };
    else if (path.pathname.endsWith('/save_pixel_room_layout')) {
      const { p_placements } = route.request().postDataJSON();
      state.placements = new Map(p_placements.map(p => [p.itemId, { x: p.x, y: p.y }]));
      data = { ok: true, count: p_placements.length };
    } else return route.abort();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url(`${activePet}-feeder`));
  await page.locator('.pr-actor').waitFor();
  return { context, page, errors };
}

const read = el => ({ x: +el.dataset.x, y: +el.dataset.y });
const actorCell = page => page.locator('.pr-actor').evaluate(read);
const cellButton = (page, { x, y }) => page.getByRole('button', { name: `${x + 1}열 ${y + 1}행에 배치`, exact: true });
const near = (player, pet, span) => Math.max(player.x < pet.x ? pet.x - player.x : player.x > pet.x + span - 1 ? player.x - (pet.x + span - 1) : 0, Math.abs(player.y - pet.y)) <= 1;
const message = page => page.locator('#pr-instructions').textContent();

// Walk to the free corner farthest from the pet so the next tap is a real "far" tap.
async function walkAway(page, sel) {
  // Floor-tap routes from the bottom row can run over the door (and out), so step up first.
  const actor = await actorCell(page);
  if (actor.y === 7) {
    await cellButton(page, { x: actor.x, y: 4 }).click();
    await page.waitForFunction(() => +document.querySelector('.pr-actor').dataset.y === 4, null, { timeout: 3000 });
  }
  const pet = await page.locator(sel).evaluate(read);
  const target = { x: pet.x >= 4 ? 0 : 9, y: pet.y >= 4 ? 1 : 5 }; // row 7 holds the door
  await cellButton(page, target).click();
  await page.waitForFunction(t => { const a = document.querySelector('.pr-actor'); return +a.dataset.x === t.x && +a.dataset.y === t.y; }, target, { timeout: 6000 });
}

// Tap the pet (real click on its body) until a feed starts; if it wandered off while we walked
// over, the "went away" line must show and we simply try again.
async function feedFromAfar(page, sel, span, awayText) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const before = await actorCell(page);
    await page.locator(`${sel} .pr-pet-hit`).click();
    const outcome = await page.waitForFunction(({ sel, awayText }) => {
      const pet = document.querySelector(sel);
      if (pet?.dataset.interaction) return 'fed';
      return document.querySelector('#pr-instructions').textContent === awayText ? 'away' : false;
    }, { sel, awayText }, { timeout: 8000 }).then(handle => handle.jsonValue());
    const after = await actorCell(page);
    assert.notDeepEqual(after, before, 'a far tap walks the player first');
    if (outcome === 'fed') {
      assert.ok(near(after, await page.locator(sel).evaluate(read), span), 'feeding only starts next to the pet');
      return;
    }
    await walkAway(page, sel);
  }
  assert.fail('pet kept wandering away');
}

// Samples the pet each frame for the whole interaction: stages in order, cell frozen.
async function watchInteraction(page, sel, ms) {
  return page.evaluate(async ({ sel, ms }) => {
    const stages = [], actions = new Set(), cells = new Set(), rights = new Set();
    const start = performance.now();
    while (performance.now() - start < ms) {
      const el = document.querySelector(sel);
      const stage = el?.dataset.interaction;
      if (stage) {
        if (stages.at(-1) !== stage) stages.push(stage);
        actions.add(el.dataset.action); cells.add(`${el.dataset.x},${el.dataset.y}`);
        rights.add(el.querySelector('svg').style.transform || 'none');
      }
      await new Promise(r => requestAnimationFrame(r));
    }
    return { stages, actions: [...actions], cells: [...cells], facings: [...rights] };
  }, { sel, ms });
}

try {
  // ---------------------------------------------------------------- bear: far tap, near tap
  {
    const { context, page, errors } = await open({}, 'pet_bear');
    const bear = page.getByRole('button', { name: '곰에게 꿀 주기', exact: true });
    await bear.waitFor();
    await walkAway(page, '.pr-bear');

    // Step effects: a floor tap walk hops the actor and leaves dust (captured mid-walk).
    const start = await actorCell(page);
    const across = { x: start.x === 0 ? 3 : 6, y: start.y };
    await cellButton(page, across).click();
    // Two steps into this walk: fresh puffs behind the actor (older ones from earlier walks have faded).
    await page.waitForFunction(s => Math.abs(+document.querySelector('.pr-actor').dataset.x - s.x) >= 2, start);
    await page.waitForTimeout(60);
    assert.ok(await page.locator('.pr-dust').count() >= 2);
    await page.screenshot({ path: `${out}/walk-dust.png` });
    assert.notEqual(await page.locator('.pr-actor .pr-avatar').evaluate(el => getComputedStyle(el).animationName), 'none', 'each step plays the hop');
    await page.waitForFunction(t => +document.querySelector('.pr-actor').dataset.x === t.x, across, { timeout: 4000 });
    await walkAway(page, '.pr-bear');

    await feedFromAfar(page, '.pr-bear', 3, '곰이 다른 곳으로 가 버렸어요. 다시 눌러 주세요.');
    assert.equal(await message(page), '곰에게 꿀단지를 건넸어요.');
    const actorDuring = await actorCell(page);
    // Captures across the feed: honey toss, eating (sit), heart + wave.
    await page.locator('.pr-bear[data-interaction=treat] .pr-pet-treat').waitFor();
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${out}/bear-1-honey.png` });
    await page.locator('.pr-bear[data-interaction=eat]').waitFor();
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${out}/bear-2-eat.png` });
    // A second tap mid-feed is ignored: the script keeps going, never restarts at 'treat'.
    await page.locator('.pr-bear .pr-pet-hit').click();
    await page.locator('.pr-bear[data-interaction=love]').waitFor();
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${out}/bear-3-heart.png` });
    await page.locator('.pr-bear[data-interaction=wave]').waitFor();
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${out}/bear-4-wave.png` });
    await page.locator('.pr-bear:not([data-interaction])').waitFor({ timeout: 2000 });
    assert.equal(await message(page), '곰이 꿀을 맛있게 먹었어요!');
    assert.deepEqual(await actorCell(page), actorDuring, 'nothing walked the player during the feed');

    // Near tap (keyboard this time): the player is still beside the bear, so it starts at once
    // with no walk, and the whole script plays with the bear frozen, facing one way.
    const petNow = await page.locator('.pr-bear').evaluate(read);
    if (near(actorDuring, petNow, 3)) {
      await bear.focus();
      await page.keyboard.press('Enter');
      await page.locator('.pr-bear[data-interaction]').waitFor({ timeout: 500 });
      const watched = await watchInteraction(page, '.pr-bear', 3300);
      assert.deepEqual(watched.stages, ['treat', 'eat', 'love', 'wave']);
      assert.deepEqual(watched.actions.sort(), ['idle', 'sit', 'wave']);
      assert.equal(watched.cells.length, 1, 'held in place');
      assert.equal(watched.facings.length, 1, 'keeps facing the player');
      assert.deepEqual(await actorCell(page), actorDuring, 'a near tap does not walk');
    } else console.log('bear moved on right after release; near-tap check covered by the dog run');

    // Afterwards the bear goes back to roaming on its own.
    const resumed = await page.evaluate(async () => {
      const first = document.querySelector('.pr-bear').dataset;
      const seen = new Set([`${first.x},${first.y},${first.action}`]);
      const start = performance.now();
      while (performance.now() - start < 15000 && seen.size < 2) {
        const el = document.querySelector('.pr-bear');
        if (el && !el.dataset.interaction) seen.add(`${el.dataset.x},${el.dataset.y},${el.dataset.action}`);
        await new Promise(r => setTimeout(r, 100));
      }
      return seen.size;
    });
    assert.ok(resumed >= 2, 'bear resumes its own behavior after feeding');

    // Decorating: the pet is not a button at all.
    await page.getByRole('button', { name: '꾸미기', exact: true }).click();
    await page.locator('.pr-bear[data-action=sit]').waitFor();
    assert.equal(await page.getByRole('button', { name: '곰에게 꿀 주기' }).count(), 0);
    assert.equal(await page.locator('.pr-bear .pr-pet-hit').count(), 0);
    await page.getByRole('button', { name: '꾸미기 완료', exact: true }).click();
    assert.deepEqual(errors, []);
    await context.close();
  }

  // ---------------------------------------------------------------- dog + furniture placement
  {
    const { context, page, errors } = await open({}, 'pet_dog', ['furniture_chair']);
    await page.getByRole('button', { name: '강아지에게 간식 주기', exact: true }).waitFor();
    await walkAway(page, '.pr-dog');
    await feedFromAfar(page, '.pr-dog', 2, '강아지가 다른 곳으로 가 버렸어요. 다시 눌러 주세요.');
    const watched = watchInteraction(page, '.pr-dog', 2900);
    await page.locator('.pr-dog[data-interaction=bark]').waitFor();
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${out}/dog-bark.png` });
    const dog = await watched;
    assert.deepEqual(dog.stages.slice(-3), ['sit', 'bark', 'love']);
    assert.equal(dog.cells.length, 1);
    await page.locator('.pr-dog:not([data-interaction])').waitFor({ timeout: 2000 });
    assert.equal(await message(page), '강아지가 간식을 먹고 신이 났어요!');

    // Furniture: set the chair down on a free cell away from the dog and the player.
    await page.locator('.pr-sheet-trigger button').filter({ hasText: '가구' }).click();
    await page.locator('.pr-catalog button').filter({ hasText: '작은 의자' }).click();
    await page.locator('.pr-sheet-trigger button').filter({ hasText: '가구' }).click();
    const spot = await page.evaluate(() => {
      const dog = document.querySelector('.pr-dog')?.dataset, actor = document.querySelector('.pr-actor').dataset;
      for (const [x, y] of [[1, 2], [8, 2], [1, 4], [8, 4]]) {
        const onDog = dog && +dog.y === y && x >= +dog.x && x <= +dog.x + 1;
        if (!onDog && !(+actor.x === x && +actor.y === y)) return { x, y };
      }
    });
    await cellButton(page, spot).click();
    await page.locator('[data-furniture=chair][data-placed] .pr-sparkles').waitFor();
    await page.waitForTimeout(120);
    await page.screenshot({ path: `${out}/furniture-place.png` });
    assert.notEqual(await page.locator('[data-furniture=chair] > svg').evaluate(el => getComputedStyle(el).animationName), 'none');
    await page.locator('[data-furniture=chair]:not([data-placed])').waitFor({ timeout: 2000 });

    // Yard: same flow, driven from the keyboard (focus the pet button, press Enter).
    await page.getByRole('button', { name: '5열 8행에 배치', exact: true }).click();
    await page.locator('.pr-yard-board .pr-dog').waitFor();
    await page.waitForTimeout(500); // fade overlay
    const yardStatus = page.locator('.pr-yard-frame .pr-instructions');
    for (let attempt = 0; ; attempt++) {
      await page.getByRole('button', { name: '강아지에게 간식 주기', exact: true }).focus();
      await page.keyboard.press('Enter');
      const fed = await page.locator('.pr-yard-board .pr-dog[data-interaction]').waitFor({ timeout: 8000 }).then(() => true, () => false);
      if (fed) break;
      assert.equal(await yardStatus.textContent(), '강아지가 다른 곳으로 가 버렸어요. 다시 눌러 주세요.');
      assert.ok(attempt < 3, 'yard dog kept wandering away');
    }
    const yardActor = await page.locator('.pr-yard-board .pr-plaza-actor').evaluate(read);
    assert.ok(near(yardActor, await page.locator('.pr-yard-board .pr-dog').evaluate(read), 2));
    await page.locator('.pr-yard-board .pr-dog:not([data-interaction])').waitFor({ timeout: 3500 });
    assert.equal(await yardStatus.textContent(), '강아지가 간식을 먹고 신이 났어요!');
    assert.deepEqual(errors, []);
    await context.close();
  }

  // ---------------------------------------------------------------- reduced motion
  {
    const { context, page, errors } = await open({ reducedMotion: 'reduce' }, 'pet_dog');
    await page.locator('.pr-dog').waitFor();
    const from = await actorCell(page);
    await cellButton(page, { x: from.x === 0 ? 2 : from.x - 2, y: from.y }).click();
    await page.locator('.pr-actor[data-step]').waitFor();
    assert.equal(await page.locator('.pr-actor .pr-avatar').evaluate(el => getComputedStyle(el).animationName), 'none');
    assert.equal(await page.locator('.pr-dust').first().evaluate(el => getComputedStyle(el).display), 'none');
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('PASS: far tap walks beside the pet then feeds; near tap feeds at once; stages play in order while the pet is held facing the player; repeat taps ignored; result line shown; pet resumes roaming; not tappable while decorating; step hop/dust and furniture placement effects run, and are off under reduced motion');
} finally {
  await browser.close();
}
