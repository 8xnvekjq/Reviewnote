// Browser assertions only: imported by coordinator-run browser suites.
import assert from 'node:assert/strict';

export async function assertCompactTopbar(page, { digits = false, freeCheck = false } = {}) {
  const width = page.viewportSize().width;
  const topbar = await page.locator('.exam-topbar').boundingBox();
  const answerbar = await page.getByTestId('exam-answerbar').boundingBox();
  // No safe-area in these desktop browser fixtures. CSS calculation:
  // tablet topbar 4 + 38 + 2 + 36 + 4 + 1 = 85;
  // phone has one extra 38px row + 2px gap = 125.
  // answerbar 44 (choices) / 82 (digits) + 2*2 padding + 1 border.
  // 폰 폭의 자유 모드는 '채점해 보기'가 답안 줄 둘째 줄로 내려간다(36px 버튼 + 4px 간격).
  const maxHeight = (width >= 820 ? 134 : 174) + (digits ? 38 : 0) + (freeCheck && width < 820 ? 40 : 0);
  assert.ok(answerbar.y + answerbar.height - topbar.y <= maxHeight + 2,
    `${width}px ${digits ? "digits" : "choices"} top frame ${Math.round(answerbar.y + answerbar.height - topbar.y)}px exceeds ${maxHeight + 2}px (topbar ${Math.round(topbar.height)}, answerbar ${Math.round(answerbar.height)})`);
  const controls = await page.locator('.exam-topbar button, .exam-answerbar button, .exam-wheel').evaluateAll(nodes => nodes.map(node => {
    const box = node.getBoundingClientRect();
    return { name: node.getAttribute('aria-label') || node.textContent, width: box.width, height: box.height };
  }));
  for (const control of controls) {
    assert.ok(control.width >= 36 && control.height >= 36, `${control.name}: touch target ${control.width}×${control.height}`);
  }
  const exit = await page.locator('.exam-exit').boundingBox();
  const submit = await page.locator('.exam-submit-open').boundingBox();
  assert.ok(exit.x >= 18 && submit.x + submit.width <= width - 18 + 1, 'edge buttons retain horizontal inset');
  if (digits) {
    const centers = await page.locator('.exam-wheel').evaluateAll(nodes => nodes.map(node => {
      const wheel = node.getBoundingClientRect();
      const digit = node.querySelector('.is-current').getBoundingClientRect();
      return Math.abs(wheel.y + wheel.height / 2 - digit.y - digit.height / 2);
    }));
    assert.ok(centers.every(delta => delta <= 1), 'selected wheel digits stay centered');
  }
}
