// 전체메뉴 시트: 섹션 묶음(공부하기/내 기록/기타), 권한별 항목, "최근 사용" 2개(사용자별 저장),
// 메뉴 안 화면을 볼 때 하단 "전체메뉴" 강조. vite(127.0.0.1:5174) 위에서 tests/ui/menu.html을 연다.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const out = 'node_modules/.cache/ui-menu';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });

async function open(page, query) {
  await page.goto(`http://127.0.0.1:5174/tests/ui/menu.html?${query}`);
  await page.getByRole('button', { name: '전체메뉴' }).click();
  return page.getByRole('dialog');
}
const sectionTitles = sheet => sheet.locator('.rn-menu-section-title').allInnerTexts();
const rowsIn = (sheet, title) => sheet.getByRole('region', { name: title }).locator('.rn-menu-row strong').allInnerTexts();

try {
  // 학생, 첫 방문: 최근 사용 없음 → 세 섹션만, 각 섹션에 기존 항목 그대로.
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    let sheet = await open(page, 'user=student-1');
    assert.deepEqual(await sectionTitles(sheet), ['공부하기', '내 기록', '기타'], '최근 사용 기록이 없으면 그 영역은 없다');
    assert.deepEqual(await rowsIn(sheet, '공부하기'), ['📝 기출문제 풀이', '복습체크', '선생님 풀이 힌트']);
    assert.deepEqual(await rowsIn(sheet, '내 기록'), ['나의 학습 현황', '나의 시험대비 분석', '복습완료 보관함', '숨긴 카드 🙈']);
    assert.deepEqual(await rowsIn(sheet, '기타'), ['수업자료', '🎮 Pixel Room', '이용안내']);

    // 두 항목을 차례로 열면 최근 사용 2개가 최신순으로 위에 뜬다.
    await sheet.getByRole('button', { name: /나의 학습 현황/ }).click();
    assert.equal(await page.getByTestId('active-tab').innerText(), 'stats');
    sheet = await open(page, 'user=student-1');
    await sheet.getByRole('button', { name: /기출문제 풀이/ }).first().click();
    assert.equal(await page.getByTestId('active-tab').innerText(), 'examPractice');
    assert.equal(await page.getByRole('button', { name: '전체메뉴' }).getAttribute('aria-current'), 'page', '메뉴 안 화면(기출문제 풀이)을 볼 때 전체메뉴가 강조된다');

    await page.getByRole('button', { name: '전체메뉴' }).click();
    sheet = page.getByRole('dialog');
    const recent = sheet.getByRole('region', { name: '최근 사용' });
    assert.deepEqual(await recent.locator('.rn-menu-recent-card strong').allInnerTexts(), ['📝 기출문제 풀이', '나의 학습 현황']);
    // 수업자료(탭이 아닌 항목)도 기록된다 → 맨 앞, 최대 2개.
    await sheet.getByRole('button', { name: /수업자료/ }).click();
    assert.equal(await page.evaluate(() => document.body.dataset.slides), 'opened');
    await page.getByRole('button', { name: '전체메뉴' }).click();
    sheet = page.getByRole('dialog');
    assert.deepEqual(await sheet.getByRole('region', { name: '최근 사용' }).locator('.rn-menu-recent-card strong').allInnerTexts(), ['수업자료', '📝 기출문제 풀이']);
    // 390px에서 가로 넘침 없음
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: `${out}/student-phone.png` });

    // 새로고침해도 유지, 다른 사용자에게는 보이지 않는다.
    sheet = await open(page, 'user=student-1');
    assert.equal(await sheet.getByRole('region', { name: '최근 사용' }).count(), 1, '새로고침 후에도 최근 사용 유지');
    await page.goto('about:blank');
    sheet = await open(page, 'user=student-2');
    assert.equal(await sheet.getByRole('region', { name: '최근 사용' }).count(), 0, '최근 사용은 사용자별로 따로');
    assert.deepEqual(errors, []);
    await context.close();
  }

  // 권한: Pixel World 접근 없음 → 기타에서 Pixel Room 빠짐. 관리자 라벨. 로그아웃이면 로그인 항목·최근 사용 없음.
  {
    const context = await browser.newContext({ viewport: { width: 820, height: 1180 } });
    const page = await context.newPage();
    let sheet = await open(page, 'user=admin-1&admin=1&pixel=0');
    assert.deepEqual(await rowsIn(sheet, '공부하기'), ['📝 기출문제 풀이', '복습체크 관리', '선생님 풀이 힌트']);
    assert.deepEqual(await rowsIn(sheet, '내 기록'), ['나의 학습 현황', '시험대비 분석', '복습완료 보관함', '숨긴 카드 🙈']);
    assert.deepEqual(await rowsIn(sheet, '기타'), ['수업자료', '이용안내']);
    await page.screenshot({ path: `${out}/admin-tablet.png` });

    await page.evaluate(() => localStorage.setItem('rn-menu-recent-v1:undefined', JSON.stringify(['stats'])));
    sheet = await open(page, '');
    assert.deepEqual(await rowsIn(sheet, '공부하기'), ['선생님 풀이 힌트'], '로그아웃이면 로그인 전용 항목은 없다');
    assert.equal(await sheet.getByRole('region', { name: '최근 사용' }).count(), 0, '로그아웃이면 최근 사용 없음');
    await context.close();
  }
  console.log('PASS menu: sections, per-role items, recent 2 (latest first, non-tab slides, per user, persisted), 전체메뉴 highlight, 390px');
} finally {
  await browser.close();
}
