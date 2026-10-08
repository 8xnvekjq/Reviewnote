import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const base = 'http://127.0.0.1:5177';
await mkdir('scratch/fish-album', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
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
      assert.equal(await page.locator('.pwp-fish-slot').count(), 12);
      assert.equal(await page.locator('[data-caught=true]').count(), 4);
      assert.equal(await page.locator('.is-silhouette').count(), 8);
      assert.match(await page.locator('.pwp-turtle-lines').textContent(), /새 친구.*비둘기/s);
      assert.match(await page.locator('.pwp-fish-progress').textContent(), /9\/12/);
      const checkBounds = async () => {
        const box = await page.getByRole('dialog').boundingBox();
        assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height);
        assert.equal(await page.locator('.pwp-panel-content').evaluate(node => node.scrollWidth > node.clientWidth), false);
      };
      await checkBounds();
      await page.screenshot({ path: `scratch/fish-album/album-${viewport.width}.png` });
      await page.keyboard.press('Escape');
      assert.equal(await page.getByRole('dialog').count(), 0);
      await page.getByRole('button', { name: '게시판', exact: true }).click();
      await page.locator('.pwp-fish-board li').last().waitFor();
      assert.equal(await page.locator('.pwp-fish-board li').count(), 10);
      assert.equal(await page.getByRole('img', { name: '익명 동물 얼굴' }).count(), 10);
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
      await page.screenshot({ path: `scratch/fish-album/board-${viewport.width}.png` });
      await page.evaluate(() => document.querySelector('.pwp-window').dispatchEvent(new Event('pwp-cancel')));
      assert.equal(await page.getByRole('dialog').count(), 0);
      await page.getByRole('button', { name: '게시판', exact: true }).click();
      await page.getByRole('dialog').waitFor();
      await page.locator('.pwp-panel-shade').click({ position: { x: 1, y: 1 } });
      assert.equal(await page.getByRole('dialog').count(), 0);
      for (const mode of ['error', 'budget', 'empty', 'board-error']) {
        await page.goto(`${base}/tests/pixel-world-phaser/fish-album.harness.html?mode=${mode}`);
        await page.getByRole('button', { name: '거북이', exact: true }).click();
        if (mode === 'error' || mode === 'board-error') await page.getByRole('button', { name: '다시 시도' }).click();
        await page.locator('.pwp-fish-slot').last().waitFor();
        if (mode === 'budget') assert.match(await page.locator('.pwp-turtle-lines').textContent(), /내일 또 와요/);
        if (mode === 'empty') {
          assert.equal(await page.locator('[data-caught=true]').count(), 0);
          await page.keyboard.press('Escape');
          await page.getByRole('button', { name: '게시판', exact: true }).click();
          await page.getByText('아직 기록이 없어요.', { exact: false }).waitFor();
        }
      }
      assert.deepEqual(errors, []);
      console.log(`PASS fish album/board ${viewport.width}px: screenshots, bounds, close, retry, empty, budget`);
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
