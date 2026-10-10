import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const base = process.env.PWP_BASE ?? 'http://127.0.0.1:5174';
await mkdir('.pixel-world-test.local/fish-album', { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1180, height: 820 }]) {
    const context = await browser.newContext({ viewport });
    try {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${base}/tests/pixel-world-phaser/fish-album.harness.html`);
      await page.getByRole('button', { name: '거북이', exact: true }).click();
      await page.locator('.pwp-fish-slot').last().waitFor();
      assert.equal(await page.locator('.pwp-fish-slot').count(), 14); // 상어·고래 추가(2026-10)
      assert.equal(await page.locator('[data-caught=true]').count(), 4);
      assert.equal(await page.locator('.is-silhouette').count(), 10);
      assert.match(await page.locator('.pwp-turtle-lines').textContent(), /새 친구.*비둘기/s);
      assert.match(await page.locator('.pwp-fish-progress').textContent(), /9\/14/);
      const checkBounds = async () => {
        const box = await page.getByRole('dialog').boundingBox();
        assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height);
        assert.equal(await page.locator('.pwp-panel-content').evaluate(node => node.scrollWidth > node.clientWidth), false);
      };
      await checkBounds();
      await page.screenshot({ path: `.pixel-world-test.local/fish-album/album-${viewport.width}.png` });
      await page.keyboard.press('Escape');
      assert.equal(await page.getByRole('dialog').count(), 0);
      await page.getByRole('button', { name: '게시판', exact: true }).click();
      await page.locator('.pwp-fish-board li').last().waitFor();
      assert.equal(await page.locator('.pwp-fish-board li').count(), 10);
      assert.equal(await page.getByRole('dialog', { name: '이번 주 물고기 랭킹', exact: true }).count(), 1);
      assert.equal(await page.locator('.pwp-fish-board').getByRole('img', { name: '익명 동물 얼굴' }).count(), 9);
      assert.equal(await page.locator('.pwp-fish-champions li').count(), 5);
      assert.equal(await page.locator('.pwp-fish-champions li').first().getAttribute('data-rarity'), 'mythic');
      assert.match(await page.locator('.pwp-fish-champions li').first().textContent(), /62%.*150P/s);
      assert.match(await page.locator('.pwp-fish-champions li[data-teacher="true"]').textContent(), /선생님 기록 · 보상 없음/);
      assert.match(await page.locator('.pwp-fish-board .pwp-fish-length').first().textContent(), /cm.*%/s);
      // 선생님 기록은 학사모 대신 선생님 동물(🦍)로 보인다('선생님' 글자 없음). 순위는 1위부터.
      assert.equal(await page.locator('.pwp-fish-board li[data-teacher="true"]').getByRole('img', { name: '선생님' }).textContent(), '🦍');
      assert.match(await page.locator('.pwp-fish-board li[data-teacher="true"] strong').textContent(), /^\d+위 \S+ ★+$/); // 이름 뒤에 별(희귀도)
      assert.match(await page.locator('.pwp-fish-board li').first().locator('strong').textContent(), /^1위 /);
      await page.evaluate(async () => {
        const { fishBoardFace, fishRelativeTime } = await import('/src/features/pixel-world-phaser/ui/FishBoard.tsx');
        const { peerSolutionLabelParts } = await import('/src/features/exam/ui/peerSolution.ts');
        const expected = peerSolutionLabelParts({ character: 'anonymous-key', title: null, grade: null, isTeacher: false }).face;
        if (fishBoardFace('anonymous-key') !== expected || fishBoardFace('🐢') !== '🐢') throw Error('익명 얼굴 규칙');
        const now = Date.parse('2026-10-08T00:00:00Z');
        for (const [date, label] of [['2026-10-08T00:01:00Z', '방금'], ['2026-10-07T23:58:00Z', '2분 전'], ['2026-10-07T22:00:00Z', '2시간 전'], ['2026-10-06T00:00:00Z', '2일 전'], ['invalid', '이번 주']]) {
          if (fishRelativeTime(date, now) !== label) throw Error('상대 시각');
        }
      });
      await checkBounds();
      await page.screenshot({ path: `.pixel-world-test.local/fish-album/board-${viewport.width}.png` });
      await page.evaluate(() => document.querySelector('.pwp-window').dispatchEvent(new Event('pwp-cancel')));
      assert.equal(await page.getByRole('dialog').count(), 0);
      await page.getByRole('button', { name: '게시판', exact: true }).click();
      await page.getByRole('dialog').waitFor();
      await page.locator('.pwp-panel-shade').click({ position: { x: 1, y: 1 } });
      assert.equal(await page.getByRole('dialog').count(), 0);
      await page.getByRole('button', { name: '보상 입장', exact: true }).click();
      assert.equal(await page.locator('main').getAttribute('data-pending-calls'), null);
      await page.getByRole('button', { name: '게임 준비', exact: true }).click();
      await page.getByTestId('weekly-rewards').waitFor();
      assert.match(await page.locator('.pwp-weekly-total').textContent(), /\+220 P/);
      assert.equal(await page.locator('main').getAttribute('data-pending-calls'), '1');
      await checkBounds();
      await page.getByRole('button', { name: '확인', exact: true }).click();
      assert.equal(await page.getByRole('dialog').count(), 0);
      await page.waitForFunction(() => document.querySelector('main').dataset.ackCalls === '1');
      assert.equal(await page.locator('main').getAttribute('data-ack-ids'), 'fish,crop');
      await page.getByRole('button', { name: /^리렌더/ }).click();
      assert.equal(await page.getByRole('dialog').count(), 0);
      assert.equal(await page.locator('main').getAttribute('data-pending-calls'), '1');
      await page.getByRole('button', { name: '나가기', exact: true }).click();
      await page.getByRole('button', { name: '보상 입장', exact: true }).click();
      await page.getByRole('button', { name: '게임 준비', exact: true }).click();
      await page.getByTestId('weekly-rewards').waitFor();
      assert.equal(await page.locator('main').getAttribute('data-pending-calls'), '2');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.querySelector('main').dataset.ackCalls === '2');
      for (const mode of ['error', 'budget', 'empty', 'board-error']) {
        await page.goto(`${base}/tests/pixel-world-phaser/fish-album.harness.html?mode=${mode}`);
        await page.getByRole('button', { name: '거북이', exact: true }).click();
        if (mode === 'error' || mode === 'board-error') await page.getByRole('button', { name: '다시 시도' }).click();
        await page.locator('.pwp-fish-slot').last().waitFor();
        if (mode === 'budget') assert.doesNotMatch(await page.locator('.pwp-turtle-lines').textContent(), /내일 또 와요/);
        if (mode === 'empty') {
          assert.equal(await page.locator('[data-caught=true]').count(), 0);
          await page.keyboard.press('Escape');
          await page.getByRole('button', { name: '게시판', exact: true }).click();
          await page.getByText('아직 기록이 없어요.', { exact: false }).waitFor();
        }
      }
      for (const mode of ['rewards-error', 'rewards-empty', 'ack-error']) {
        await page.goto(`${base}/tests/pixel-world-phaser/fish-album.harness.html?mode=${mode}`);
        await page.getByRole('button', { name: '보상 입장', exact: true }).click();
        await page.getByRole('button', { name: '게임 준비', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('main').dataset.pendingCalls === '1');
        if (mode === 'ack-error') {
          await page.getByTestId('weekly-rewards').waitFor();
          await page.getByRole('button', { name: '확인', exact: true }).click();
          await page.waitForFunction(() => document.querySelector('main').dataset.ackCalls === '1');
        }
        assert.equal(await page.getByRole('dialog').count(), 0);
        await page.getByRole('button', { name: /^리렌더/ }).click();
        assert.equal(await page.locator('main').getAttribute('data-pending-calls'), '1');
      }
      assert.deepEqual(errors, []);
      console.log(`PASS fish album/board ${viewport.width}px: screenshots, bounds, close, retry, empty, budget`);
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
