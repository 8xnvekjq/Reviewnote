import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

// 교재 슬라이드 올리기 + 전체 화면 보기 검사(Supabase는 가짜 응답). 가로 태블릿과 휴대폰 화면.
const base = 'http://127.0.0.1:5175';
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5175', '--strictPort'], { stdio: 'pipe', windowsHide: true });
let output = '';
vite.stdout.on('data', value => { output += value; });
vite.stderr.on('data', value => { output += value; });
let browser;
try {
  for (let i = 0; i < 100 && !output.includes('5175'); i++) {
    if (vite.exitCode !== null) throw new Error(output);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ headless: true });
  const objects = new Map();
  const decks = [];
  const requests = [];
  const mock = async context => {
    await context.routeWebSocket(/supabase/, ws => ws.close());
    await context.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin === base) return route.continue();
      requests.push(`${req.method()} ${decodeURIComponent(url.pathname)}`);
      if (url.pathname.endsWith('/rest/v1/lecture_decks')) {
        if (req.method() === 'GET') return route.fulfill({ json: [...decks].reverse() });
        if (req.method() === 'POST') { decks.push({ ...req.postDataJSON(), created_at: '2026-10-15T00:00:00Z', published: false }); return route.fulfill({ status: 201, body: '' }); }
        if (req.method() === 'DELETE') {
          const id = url.searchParams.get('id').slice(3);
          decks.splice(decks.findIndex(d => d.id === id), 1); return route.fulfill({ status: 204, body: '' });
        }
        if (req.method() === 'PATCH') {
          const id = url.searchParams.get('id').slice(3);
          Object.assign(decks.find(d => d.id === id), req.postDataJSON()); return route.fulfill({ status: 204, body: '' });
        }
      }
      if (url.pathname.endsWith('/rest/v1/lecture_recordings')) return route.fulfill({ json: [] });
      if (url.pathname.endsWith('/storage/v1/object/sign/lecture-slides')) {
        const { paths } = req.postDataJSON();
        return route.fulfill({ json: paths.map(path => ({ path, signedURL: `/object/sign/lecture-slides/${path}?token=t`, error: null })) });
      }
      if (url.pathname.includes('/storage/v1/object/sign/lecture-slides/')) {
        const path = url.pathname.split('/lecture-slides/')[1];
        const object = objects.get(path);
        return object ? route.fulfill({ body: object.body, contentType: object.type }) : route.fulfill({ status: 404, body: '' });
      }
      if (url.pathname.includes('/storage/v1/object/lecture-slides/') && req.method() === 'POST') {
        const path = url.pathname.split('/lecture-slides/')[1];
        const request = new Request(req.url(), { method: 'POST', headers: req.headers(), body: req.postDataBuffer() });
        const form = await request.formData();
        const file = [...form.values()].find(value => typeof value !== 'string');
        objects.set(path, { body: Buffer.from(await file.arrayBuffer()), type: file.type });
        return route.fulfill({ json: { Key: `lecture-slides/${path}` } });
      }
      if (url.pathname.endsWith('/storage/v1/object/lecture-slides') && req.method() === 'DELETE') {
        for (const path of req.postDataJSON().prefixes) objects.delete(path);
        return route.fulfill({ json: [] });
      }
      return route.abort();
    });
  };

  // ── 가로 태블릿 1280×800: 올리기 → 목록 → 보기 ──
  const tablet = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 800 }, hasTouch: true });
  let sizes;
  try {
    await mock(tablet);
    const page = await tablet.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.goto(base + '/tests/ui/lecture-deck.html');
    // 기존 HTML 수업자료는 '특강 · 정리 자료'로 그대로 보인다.
    await page.getByText('개념원리 공통수학2 - Ⅱ. 집합의 연산 (p138~160)').waitFor();
    // 올리기·삭제는 ⚙ 관리 안에 있다.
    assert.equal(await page.getByRole('button', { name: '＋ 교재 슬라이드 올리기' }).count(), 0);
    await page.getByRole('button', { name: '⚙ 관리' }).click();
    await page.getByText('아직 올린 교재 슬라이드가 없습니다.').waitFor();

    // 교재 스캔처럼 글자가 많은 1920×1080 슬라이드를 만든다.
    const toc = { book: '개념원리 공통수학2', chapter: 'Ⅱ-3 명제', slides: [
      { no: 1, file: '01-개념1-명제.png', section: '01 명제와 조건', label: '개념 1 · 명제', bookPage: 166 },
      { no: 2, file: '02-필수예제01.png', section: '01 명제와 조건', label: '필수예제 01', bookPage: 167 },
      { no: 3, file: '03-개념2-조건.png', section: '01 명제와 조건', label: '개념 2 · 조건과 진리집합', bookPage: 168 },
      { no: 4, file: '04-개념3-역과대우.png', section: '02 명제의 역과 대우', label: '개념 3 · 역과 대우', bookPage: 176 },
      { no: 5, file: '05-필수예제07.png', section: '02 명제의 역과 대우', label: '필수예제 07', bookPage: 179 },
    ] };
    const pngs = await page.evaluate(async count => {
      const out = [];
      for (let n = 1; n <= count; n++) {
        const canvas = document.createElement('canvas'); canvas.width = 1920; canvas.height = 1080;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fbfaf6'; ctx.fillRect(0, 0, 1920, 1080);
        // 스캔 느낌의 옅은 잡티
        for (let i = 0; i < 6000; i++) { ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`; ctx.fillRect(Math.random() * 1920, Math.random() * 1080, 2, 2); }
        ctx.fillStyle = '#111'; ctx.font = 'bold 72px sans-serif'; ctx.fillText(`슬라이드 ${n}`, 80, 120);
        ctx.font = '36px serif';
        for (let line = 0; line < 20; line++) ctx.fillText(`명제 p → q 가 참이면 대우 ~q → ~p 도 참이다. x² − 5x + 6 = 0 (${line})`, 80, 200 + line * 42);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = ''; for (const b of bytes) binary += String.fromCharCode(b);
        out.push(btoa(binary));
      }
      return out;
    }, toc.slides.length);
    const files = [
      ...toc.slides.map((s, i) => ({ name: s.file, mimeType: 'image/png', buffer: Buffer.from(pngs[i], 'base64') })),
      { name: '목차.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(toc)) },
    ];
    await page.getByRole('button', { name: '＋ 교재 슬라이드 올리기' }).click();
    assert.equal(await page.getByTestId('lecture-folder-input').getAttribute('webkitdirectory'), '');
    await page.getByTestId('lecture-files-input').setInputFiles(files);
    await page.getByText('슬라이드 5장 중 5장 확인').waitFor();
    assert.equal(await page.getByLabel('제목').inputValue(), '개념원리 공통수학2 - Ⅱ-3 명제 (p166~179)');
    assert.equal(await page.getByRole('radio', { name: '고1', exact: true }).getAttribute('aria-checked'), 'true');
    // 빠진 파일이 있으면 올리기를 막는다.
    await page.getByTestId('lecture-files-input').setInputFiles(files.slice(1));
    await page.getByText('빠진 파일 1개: 01-개념1-명제.png').waitFor();
    assert.ok(await page.getByRole('button', { name: /장 올리기/ }).isDisabled());
    await page.getByTestId('lecture-files-input').setInputFiles(files);
    await page.getByRole('radio', { name: '고2', exact: true }).click();
    await page.getByRole('button', { name: '슬라이드 5장 올리기' }).click();
    const unitName = '01 명제와 조건 · 02 명제의 역과 대우';
    await page.getByText(unitName).waitFor();
    assert.equal(decks.length, 1);
    const deck = decks[0];
    assert.equal(deck.grade, '고2');
    assert.deepEqual(deck.slides.map(s => s.label), toc.slides.map(s => s.label));
    assert.equal(objects.size, 5);
    const original = files.slice(0, 5).reduce((sum, f) => sum + f.buffer.length, 0);
    const stored = [...objects.values()].reduce((sum, o) => sum + o.body.length, 0);
    sizes = { original, stored, type: [...objects.values()][0].type };
    assert.ok(stored <= original);
    // 관리에서는 학년을 바꿀 수 있고, 열기 대신 삭제가 보인다.
    assert.equal(await page.getByLabel(`${unitName} 학년`).inputValue(), '고2');
    await page.getByText('교재 166–179쪽').waitFor();
    await page.getByRole('button', { name: '⚙ 관리' }).click();

    // 전체 탭: 학년 제목 아래 교재 카드(접힘) → 펼치면 단원
    const book = page.getByTestId('lecture-book');
    await page.locator('[data-grade=고2]').getByText('교재 슬라이드').waitFor();
    assert.match(await book.innerText(), /개념원리 공통수학2[\s\S]*수업 1개 · 슬라이드 5장/);
    await page.getByText(unitName).waitFor({ state: "detached" });
    await book.getByRole('button', { name: /개념원리 공통수학2/ }).click();
    await page.getByText(unitName).waitFor();
    // 다른 학년 탭에서는 숨고, 그 학년 탭에서는 펼쳐져 있다.
    await page.getByRole('button', { name: /^📘 고1 · / }).click();
    await book.waitFor({ state: "detached" });
    await page.getByRole('button', { name: /^📗 고2 · / }).click();
    await page.getByText(unitName).waitFor();

    await page.getByRole('button', { name: `${unitName} 열기` }).click();
    const viewer = page.getByRole('dialog');
    await viewer.waitFor();
    const counter = page.getByTestId('slide-counter');
    const stage = page.getByTestId('slide-stage');
    const img = viewer.locator('img');
    const checkSlide = async n => {
      await page.waitForFunction(n => document.querySelector('[data-testid=slide-counter]')?.textContent === `${n} / 5`, n);
      await page.waitForFunction(() => { const i = document.querySelector('[role=dialog] img'); return i && i.complete && i.naturalWidth === 1920; });
    };
    await checkSlide(1);
    // 16:9 유지, 화면 안에 맞춤
    const box = await stage.boundingBox();
    assert.ok(Math.abs(box.width / box.height - 16 / 9) < 0.01, `16:9 ${box.width}×${box.height}`);
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 1280.5 && box.y + box.height <= 800.5);
    assert.ok(box.width > 1100, `태블릿에서 충분히 큼: ${box.width}`);
    // 다음 슬라이드를 미리 받는다.
    const prefetched = () => requests.filter(r => r.startsWith('GET') && r.includes(deck.slides[1].path)).length;
    for (let i = 0; i < 50 && !prefetched(); i++) await page.waitForTimeout(50);
    assert.ok(prefetched() >= 1, '다음 슬라이드 미리 받기');

    await page.keyboard.press('ArrowRight'); await checkSlide(2);
    await page.getByRole('button', { name: '다음 슬라이드' }).click(); await checkSlide(3);
    await page.keyboard.press('ArrowLeft'); await checkSlide(2);
    assert.match(await img.getAttribute('alt'), /필수예제 01/);
    // 손가락 스와이프(왼쪽으로 밀면 다음)
    const swipe = async (dx, pointerType = 'touch') => {
      const b = await stage.boundingBox();
      const y = b.y + b.height / 2, x = b.x + b.width / 2;
      await stage.dispatchEvent('pointerdown', { pointerType, pointerId: 7, clientX: x, clientY: y, isPrimary: true, bubbles: true });
      await stage.dispatchEvent('pointerup', { pointerType, pointerId: 7, clientX: x + dx, clientY: y + 5, isPrimary: true, bubbles: true });
    };
    await swipe(-200); await checkSlide(3);
    await swipe(200); await checkSlide(2);
    await swipe(-200, 'pen'); await page.waitForTimeout(100); await checkSlide(2); // S펜은 넘기지 않는다
    // 처음/끝에서 멈춘다.
    await page.keyboard.press('Home'); await checkSlide(1);
    assert.ok(await page.getByRole('button', { name: '이전 슬라이드' }).isDisabled());
    await page.keyboard.press('End'); await checkSlide(5);
    await page.keyboard.press('ArrowRight'); await checkSlide(5);

    // 목차: 단원별, 현재 슬라이드 표시, 누르면 이동
    await page.getByRole('button', { name: '☰ 목차' }).click();
    const nav = page.getByRole('navigation', { name: '목차' });
    await nav.getByText('02 명제의 역과 대우').waitFor();
    assert.equal(await nav.getByText('01 명제와 조건').count(), 1);
    assert.match(await nav.locator('[aria-current=true]').innerText(), /필수예제 07[\s\S]*교재 179쪽/);
    await nav.getByRole('button', { name: /개념 2 · 조건과 진리집합/ }).click();
    await checkSlide(3);
    assert.match(await nav.locator('[aria-current=true]').innerText(), /교재 168쪽/);
    // 넓은 화면에서는 목차가 무대 옆에 있고 슬라이드는 여전히 16:9
    const navBox = await nav.boundingBox(), withToc = await stage.boundingBox();
    assert.ok(withToc.x + withToc.width <= navBox.x + 1, '목차가 슬라이드를 가리지 않음');
    assert.ok(Math.abs(withToc.width / withToc.height - 16 / 9) < 0.01);
    await page.screenshot({ path: '.test-artifacts/lecture-deck-tablet.png' }).catch(() => {});
    await page.keyboard.press('Escape'); await nav.waitFor({ state: 'detached' });
    await page.keyboard.press('Escape'); await viewer.waitFor({ state: 'detached' });

    // 이어서 보기: 마지막으로 본 3번째 장부터 다시 연다.
    const resume = page.getByTestId('lecture-resume');
    assert.match(await resume.innerText(), /01 명제와 조건[\s\S]*3 \/ 5장/);
    await resume.getByRole('button').first().click();
    await checkSlide(3);
    await page.keyboard.press('Escape'); await viewer.waitFor({ state: 'detached' });

    // 검색: 쪽수·단원 이름
    const search = page.getByRole('searchbox', { name: '수업자료 검색' }).first();
    await search.fill('176');
    await page.getByText(unitName).waitFor();
    await search.fill('없는단원');
    await page.getByText("'없는단원'에 맞는 자료가 없습니다.").waitFor();
    await search.fill('');

    // 관리에서 학년을 바꾸면 그 학년으로 옮겨 간다.
    await page.getByRole('button', { name: /^🌟 전체/ }).click();
    await page.getByRole('button', { name: '⚙ 관리' }).click();
    await page.getByLabel(`${unitName} 학년`).selectOption('고1');
    await page.waitForFunction(() => document.querySelector('[data-grade=고1] [data-testid=lecture-book]'));
    assert.equal(decks[0].grade, '고1');

    // 삭제하면 행과 파일이 함께 사라진다.
    await page.getByRole('button', { name: /Ⅱ-3 명제 \(p166~179\) 삭제/ }).click();
    await page.getByText('아직 올린 교재 슬라이드가 없습니다.').waitFor();
    assert.equal(decks.length, 0); assert.equal(objects.size, 0);
    assert.deepEqual(errors, []);
    // 다음 단계(휴대폰) 검사용으로 다시 넣어 둔다.
    decks.push(deck);
    for (const s of deck.slides) objects.set(s.path, { body: files[deck.slides.indexOf(s)].buffer, type: 'image/png' });
  } finally { await tablet.close(); }

  // ── 휴대폰 390×844 ──
  const phone = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  try {
    await mock(phone);
    const page = await phone.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/tests/ui/lecture-deck.html');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth) <= 390, '목록도 가로 스크롤 없음');
    await page.getByTestId('lecture-book').getByRole('button', { name: /개념원리 공통수학2/ }).click();
    await page.getByRole('button', { name: /^01 명제와 조건 .* 열기$/ }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid=slide-counter]')?.textContent === '1 / 5');
    const box = await page.getByTestId('slide-stage').boundingBox();
    assert.ok(Math.abs(box.width / box.height - 16 / 9) < 0.01);
    assert.ok(box.width <= 390.5 && box.width > 370, `휴대폰 폭에 맞춤: ${box.width}`);
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(scrollWidth <= 390, '가로 스크롤 없음');
    await page.getByRole('button', { name: '☰ 목차' }).click();
    const nav = page.getByRole('navigation', { name: '목차' });
    await nav.getByRole('button', { name: /필수예제 07/ }).click();
    await nav.waitFor({ state: 'detached' }); // 휴대폰에서는 고르면 닫힌다
    await page.waitForFunction(() => document.querySelector('[data-testid=slide-counter]')?.textContent === '5 / 5');
    await page.screenshot({ path: '.test-artifacts/lecture-deck-phone.png' }).catch(() => {});
    assert.deepEqual(errors, []);

    // 관리자가 아니면 교재 덱을 묻지도 보이지도 않는다.
    requests.length = 0;
    await page.goto(base + '/tests/ui/lecture-deck.html?admin=0');
    await page.getByText('개념원리 공통수학2 - Ⅱ. 집합의 연산 (p138~160)').waitFor();
    assert.equal(await page.getByTestId('lecture-deck-section').count(), 0);
    assert.equal(await page.getByRole('button', { name: '⚙ 관리' }).count(), 0);
    assert.equal(requests.filter(r => r.includes('lecture')).length, 0);
  } finally { await phone.close(); }
  console.log(`PASS: upload (5 slides, PNG ${sizes.original} B → ${sizes.type} ${sizes.stored} B), 관리(학년 변경·삭제), 교재 카드·학년 탭, 이어서 보기, 검색, viewer 16:9 fit, keys/buttons/swipe (pen ignored), prefetch, 목차 jump, delete; phone 390×844; non-admin hidden`);
} finally {
  if (browser) await browser.close();
  if (vite.exitCode === null) { const stopped = new Promise(resolve => vite.once('exit', resolve)); vite.kill(); await stopped; }
}
