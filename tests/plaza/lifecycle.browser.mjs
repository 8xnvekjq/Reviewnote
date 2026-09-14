// Pixel World 광장 퇴장/재입장(leave/rejoin) lifecycle 회귀 테스트 — Sender를 실제로 mount/
// unmount해서(PixelRoom.tsx의 `{location === 'plaza' && <Plaza .../>}`와 정확히 같은 조건부
// 렌더링) "광장을 나가면 상대 화면에서 즉시 사라지는지, 다시 들어오면 정확히 한 명만 나타나고
// 이동이 정상인지"를 실제 브라우저에서 usePlazaRealtime/useSmoothedPlayerPositions 훅으로 직접
// 검증한다. 단순 채널 재연결만 흉내내는 reconnect.browser.mjs와는 다른 클래스의 버그(훅 인스턴스
// 자체의 완전한 파괴/재생성, 그 사이의 비동기 untrack/removeChannel 경합)를 잡기 위한 것 —
// 단위 테스트만으로는 이 클래스의 버그를 못 잡는다. 라운드 0/1~5는 presence_ref 신원 확인(2026-09
// 1차 수정)을, 라운드 6~11은 채널 재사용 경합(2026-09 2차 수정, plazaVisitTeardown)을 각각
// 압박한다.
//
// 사전 준비: 1) 별도 터미널에서 `npx vite --port 5174 --strictPort`로 dev 서버를 띄워 둔다.
//           2) `npm run test:plaza-lifecycle`.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const output = process.env.UI_OUTPUT || 'node_modules/.cache/plaza-lifecycle';
await mkdir(output, { recursive: true });
try {
  const page = await browser.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('rn-plaza-debug', '1');
    window.plazaLogs = [];
    const debug = console.debug;
    console.debug = (...args) => { window.plazaLogs.push(args); debug(...args); };
  });
  await page.route('**/src/services/supabase.ts', route => route.fulfill({ contentType: 'application/javascript', body: "export { supabase } from '/tests/plaza/fakeRealtime.mjs';" }));
  await page.goto('http://127.0.0.1:5174/tests/plaza/lifecycle.html');
  await page.waitForFunction(() => document.querySelector('#sender')?.dataset.ready === 'true');

  const move = async (x, moving = true) => page.evaluate(({ x, moving }) => window.plazaSender({ x, y: 0, direction: 'Right', moving }), { x, moving });
  const rawSenders = async () => page.evaluate(() => JSON.parse(document.querySelector('#raw').textContent).filter(p => p.sessionId === 'sender'));
  const leave = async () => page.evaluate(() => window.plazaLeave());
  const enter = async () => page.evaluate(() => window.plazaEnter());
  const waitReady = async () => page.waitForFunction(() => document.querySelector('#sender')?.dataset.ready === 'true');
  const waitGone = async () => page.waitForFunction(() => JSON.parse(document.querySelector('#raw').textContent).every(p => p.sessionId !== 'sender'), { timeout: 2000 });
  const waitAt = async x => page.waitForFunction(target => {
    const list = JSON.parse(document.querySelector('#raw').textContent).filter(p => p.sessionId === 'sender');
    return list.length === 1 && list[0].x === target;
  }, x, { timeout: 3000 });

  // --- 라운드 0: 지연 없는 기본 왕복 — 입장 -> 이동 -> 퇴장(즉시 사라지는지) -> 재입장(정확히
  // 한 명만, 이동 정상인지). ---
  await move(3);
  await waitAt(3);

  await leave();
  await waitGone();
  assert.deepEqual(await rawSenders(), [], 'A가 퇴장하면 B 화면에서 즉시 사라져야 한다(고스트로 안 남음)');

  await enter();
  await waitReady();
  await move(5);
  await waitAt(5);
  let senders = await rawSenders();
  assert.equal(senders.length, 1, `재입장 직후 정확히 한 명만 보여야 한다(중복 avatar 없음) — 실제: ${senders.length}`);
  assert.equal(senders[0].x, 5, '재입장 후 이동이 정상 반영돼야 한다(제자리걸음 없음)');
  assert.equal(await page.evaluate(() => window.plazaTransport.entryCount('sender')), 1, '서버 쪽 presence key에도 meta가 정확히 1개만 남아야 한다');

  // --- 라운드 1~5: untrack()을 인위적으로 지연시켜(실제 네트워크 latency 흉내) 퇴장의 leave가
  // 아직 서버에 반영되기 전에 재입장의 join이 경합하도록 압박한다 — "가끔" 재현되던 버그의 핵심
  // 조건. 여러 번 반복해서 간헐성을 잡는다(요청사항: "여러 번 왕복해서 재현/검증"). ---
  for (let i = 0; i < 6; i++) {
    const beforeX = 10 + i;
    const afterX = 20 + i;
    await move(beforeX);
    await waitAt(beforeX);

    await page.evaluate(() => window.plazaTransport.delayUntrack('sender', 180));
    await leave();
    // 퇴장의 untrack()이 아직 끝나기 전에(180ms 지연) 곧바로 재입장한다 — 실제로 문 앞뒤로
    // 빠르게 왕복할 때와 같은 최악의 타이밍.
    await enter();
    await waitReady();
    await move(afterX);

    await waitAt(afterX);
    senders = await rawSenders();
    assert.equal(senders.length, 1, `라운드 ${i}: 지연된 leave와 경합해도 정확히 한 명만 보여야 한다 — 실제: ${senders.length}, 데이터: ${JSON.stringify(senders)}`);
    assert.equal(senders[0].moving, true, `라운드 ${i}: 재입장 후에도 moving이 정상 반영돼야 한다`);
    await page.waitForTimeout(250); // 지연된 leave가 뒤늦게 도착하더라도(같은 sessionId의 새 join을 잘못 지우면 안 됨) 안정될 시간을 준다
    senders = await rawSenders();
    assert.equal(senders.length, 1, `라운드 ${i}: 지연된 leave가 뒤늦게 도착해도 방금 재입장한 새 join을 잘못 지우면 안 된다 — 실제: ${senders.length}`);
    assert.equal(senders[0].x, afterX, `라운드 ${i}: 제자리걸음 없이 최신 위치를 유지해야 한다`);
    assert.equal(await page.evaluate(() => window.plazaTransport.entryCount('sender')), 1, `라운드 ${i}: presence key에 meta가 정확히 1개만 남아야 한다`);
  }

  // --- 라운드 6~11: removeChannel() 자체의 지연(delayRemove)을 압박한다 — 실제 원인(2026-09):
  // @supabase/realtime-js의 RealtimeClient.channel(topic,...)은 같은 topic의 채널이 레지스트리에
  // 아직 남아 있으면 새로 안 만들고 그 기존 채널을 그대로 돌려준다(넘긴 config는 무시됨). 그리고
  // RealtimeClient.removeChannel()은 await channel.unsubscribe()(서버 leave ack를 기다리는 진짜
  // 왕복)가 끝난 뒤에야 teardown()으로 그 채널을 레지스트리에서 뺀다. 그래서 나갈 때의
  // removeChannel()이 아직 안 끝난 채로 빠르게 재입장하면, "새 채널"이라 믿었던 것이 사실은 아직
  // 안 끝난 이전 방문의 채널 객체 그대로일 수 있다 — presence_ref(=joinId)가 안 바뀌는 것으로
  // 직접 확인 가능하다. usePlazaRealtime.ts의 plazaVisitTeardown이 이 race를 막는다: 다음
  // connect()는 supabase.channel()을 부르기 전에 이전 방문의 teardown(leaveChannelSafely) 전체가
  // (removeChannel까지 포함해서) 끝나길 기다린다. ---
  for (let i = 0; i < 6; i++) {
    const beforeX = 30 + i;
    const afterX = 40 + i;
    await move(beforeX);
    await waitAt(beforeX);
    const refBefore = (await page.evaluate(() => window.plazaTransport.last('sender'))).presence_ref;

    await page.evaluate(() => window.plazaTransport.delayRemove('sender', 200));
    await leave();
    // removeChannel()의 teardown이 아직 끝나기 전에(200ms 지연) 곧바로 재입장한다 — supabase.
    // channel()이 아직 레지스트리에 남아있는 옛 채널 객체를 돌려주려는 최악의 타이밍.
    await enter();
    await waitReady();
    await move(afterX);
    await waitAt(afterX);

    senders = await rawSenders();
    assert.equal(senders.length, 1, `라운드 ${6 + i}(removeChannel 지연): 정확히 한 명만 보여야 한다 — 실제: ${senders.length}, 데이터: ${JSON.stringify(senders)}`);
    assert.equal(senders[0].x, afterX, `라운드 ${6 + i}(removeChannel 지연): 제자리걸음 없이 재입장 후 이동이 정상 반영돼야 한다`);
    const refAfter = (await page.evaluate(() => window.plazaTransport.last('sender'))).presence_ref;
    assert.notEqual(refAfter, refBefore, `라운드 ${6 + i}: 재입장은 진짜 새 채널(새 presence_ref)이어야 한다 — 이전 방문의 반쯤 정리된 채널을 재사용하면 안 된다`);
    await page.waitForTimeout(250);
    senders = await rawSenders();
    assert.equal(senders.length, 1, `라운드 ${6 + i}: 뒤늦게 끝난 removeChannel()이 방금 재입장한 새 join을 건드리면 안 된다 — 실제: ${senders.length}`);
    assert.equal(await page.evaluate(() => window.plazaTransport.entryCount('sender')), 1, `라운드 ${6 + i}: presence key에 meta가 정확히 1개만 남아야 한다`);
  }

  console.log('PASS leave/rejoin lifecycle — 즉시 사라짐 + 중복 없음 + 지연된 leave/removeChannel과 경합해도 안전 + 이동 정상');
  const logs = await page.evaluate(() => window.plazaLogs);
  await writeFile(`${output}/logs.json`, JSON.stringify(logs, null, 2));
} finally { await browser.close(); }
