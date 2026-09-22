// MistakeCard "완벽!"/"약함" 배지 검증 — 네트워크 mock 불필요(순수 프레젠테이션 컴포넌트).
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ channel: 'msedge', headless: true });

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:5174/tests/reviewCheck/mistake-card-badges.html');
  await page.locator('#card-mastered').waitFor();

  // 마스터된 문제 -> "완벽!"만, "약함"은 없음.
  await page.locator('#card-mastered').getByText('완벽!').waitFor();
  assert.equal(await page.locator('#card-mastered').getByText('약함').count(), 0);

  // 최근에 틀린 문제 -> "약함"만, "완벽!"은 없음.
  await page.locator('#card-weak').getByText('약함').waitFor();
  assert.equal(await page.locator('#card-weak').getByText('완벽!').count(), 0);

  // 과거엔 틀렸다가 최근에 통과(mastered) -> 호출부가 실수로 isReviewCheckWeak=true를 넘겨도
  // 카드 자체의 가드 덕분에 "완벽!"만 보이고 "약함"은 절대 같이 뜨지 않는다.
  await page.locator('#card-mixed-mastered-wins').getByText('완벽!').waitFor();
  assert.equal(await page.locator('#card-mixed-mastered-wins').getByText('약함').count(), 0);

  // 복습체크 이력이 전혀 없는 문제 -> 두 배지 다 없음.
  assert.equal(await page.locator('#card-untouched').getByText('완벽!').count(), 0);
  assert.equal(await page.locator('#card-untouched').getByText('약함').count(), 0);

  assert.deepEqual(errors, []);
  await context.close();
  console.log('PASS: MistakeCard 마스터/약함 배지 — 상호배타적으로 정확히 렌더링됨(마스터 우선 가드 포함)');
} finally {
  await browser.close();
}
