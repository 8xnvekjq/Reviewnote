import assert from 'node:assert/strict';

export async function assertViewerDock(page, dock, width) {
  const box = await dock.boundingBox();
  const viewport = page.viewportSize();
  assert.equal(await dock.evaluate(el => getComputedStyle(el).position), width <= 640 ? 'fixed' : 'static');
  assert.ok(box.x >= 0 && box.x + box.width <= viewport.width + 1, '재생 막대가 가로로 넘치지 않는다');
  if (width <= 640) {
    assert.ok(Math.abs(viewport.height - box.y - box.height) <= 24, '재생 막대는 화면 아래에 있다');
    const viewer = page.getByTestId('exam-viewer');
    assert.ok(await viewer.evaluate(el => parseFloat(getComputedStyle(el).paddingBottom)) >= box.height, '문항 끝이 막대에 가리지 않는다');
    await viewer.evaluate(el => { el.scrollTop = el.scrollHeight; });
    const after = await dock.boundingBox();
    assert.ok(Math.abs(after.y - box.y) < 1, '스크롤해도 막대는 고정된다');
    await viewer.evaluate(el => { el.scrollTop = 0; });
  } else {
    const paper = await page.locator('.exam-viewer .exam-ink:visible').last().boundingBox();
    assert.ok(box.y + box.height <= paper.y + 1, '넓은 화면에서는 문항 위에 있다');
  }
}

export async function duplicateSubmittedAttempt(page) {
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('exam-practice-harness'));
    const entry = structuredClone(saved.attempts.find(row => row.result));
    entry.attempt.id += '-second';
    entry.attempt.startedAt = new Date(Date.now() + 1000).toISOString();
    entry.result.attemptId = entry.attempt.id;
    saved.attempts.push(entry);
    localStorage.setItem('exam-practice-harness', JSON.stringify(saved));
  });
  await page.reload();
}
