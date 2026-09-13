// Pixel World 광장 realtime reconnect 회귀 테스트 — 실제 usePlazaRealtime.ts/
// useSmoothedPlayerPositions.ts 훅을 fakeRealtime.mjs(transport만 대체) 위에서 실제 브라우저로
// 구동해, "reconnect 후 상대가 moving=true인데도 제자리 걷기만 함" 버그를 재현/검증한다.
// 순수 로직 단위 테스트(tests/plaza/*.test.ts)만으로는 이 클래스의 버그(React effect 타이밍,
// reconnect의 실제 DOM 반영)를 못 잡는다 — 그래서 이 파일은 node --test가 아니라 별도 실행한다.
//
// 사전 준비: 1) 별도 터미널에서 `npx vite --port 5174 --strictPort`로 dev 서버를 띄워 둔다.
//           2) `npm run test:plaza-reconnect` (기본: 고친 코드가 맞게 동작하는지 검증, PASS 기대)
//              `EXPECT_REGRESSION=1 npm run test:plaza-reconnect` (버그가 실제 있었는지 재현 —
//              고친 코드에서 돌리면 일부러 실패해야 정상: 회귀가 사라졌다는 증거).
// 시스템에 설치된 Microsoft Edge(channel:'msedge')를 그대로 구동한다 — `npx playwright install`로
// 별도 브라우저를 내려받을 필요가 없다(이 프로젝트가 개발되는 Windows 환경 기준).
import { createRequire } from 'node:module';
import { mkdir,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH || 'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
const before=process.env.EXPECT_REGRESSION==='1';
const output=process.env.UI_OUTPUT || 'node_modules/.cache/plaza-reconnect';
await mkdir(output,{recursive:true});
try {
  const page=await browser.newPage();
  await page.addInitScript(()=>{
    localStorage.setItem('rn-plaza-debug','1');
    window.plazaLogs=[];
    const debug=console.debug;
    console.debug=(...args)=>{window.plazaLogs.push(args);debug(...args);};
  });
  await page.route('**/src/services/supabase.ts',route=>route.fulfill({contentType:'application/javascript',body:"export { supabase } from '/tests/plaza/fakeRealtime.mjs';"}));
  await page.goto('http://127.0.0.1:5174/tests/plaza/reconnect.html');
  await page.waitForFunction(()=>document.querySelector('#sender')?.dataset.ready==='true');
  const move=async(x,moving=true)=>page.evaluate(({x,moving})=>window.plazaSender({x,y:0,direction:'Right',moving}),{x,moving});
  const read=async()=>page.evaluate(()=>({raw:JSON.parse(document.querySelector('#raw').textContent).find(p=>p.sessionId==='sender'),rendered:JSON.parse(document.querySelector('#smoothed').textContent).find(p=>p.sessionId==='sender')}));
  await page.evaluate(()=>{for(let i=0;i<35;i++) window.plazaSender({x:0,y:0,direction:'Right',moving:false});});
  await move(1,false);
  await page.waitForFunction(()=>JSON.parse(document.querySelector('#smoothed').textContent).some(p=>p.sessionId==='sender' && p.x===1));
  const high=(await read()).raw.seq;
  await page.evaluate(()=>window.plazaTransport.fail('sender'));
  await page.waitForFunction(()=>document.querySelector('#sender').dataset.ready==='false');
  await page.waitForFunction(()=>document.querySelector('#sender').dataset.ready==='true');
  await move(2);
  await page.waitForTimeout(400);
  const afterReconnect=await read();
  if(before) {
    assert.ok(afterReconnect.raw.seq<high);
    assert.equal(afterReconnect.raw.moving,true);assert.equal(afterReconnect.rendered.x,1);
    assert.equal(afterReconnect.rendered.moving,true);
    while((await read()).raw.seq<=high) await move(3);
    await page.waitForFunction(()=>JSON.parse(document.querySelector('#smoothed').textContent).some(p=>p.x===3));
    console.log('REPRODUCED',JSON.stringify({high,afterReconnect,recovered:await read()}));
  } else {
    assert.ok(afterReconnect.raw.seq>high);
    assert.equal(afterReconnect.rendered.x,2);
    assert.equal(afterReconnect.rendered.moving,false,'settled avatar must idle even if raw moving remains true');
    const latest=afterReconnect.raw;
    // A delayed low-seq packet must still be rejected; no cursor reset or replay.
    await page.evaluate(p=>window.plazaTransport.broadcast({...p,seq:1,x:0}),latest);
    await page.waitForTimeout(100);assert.equal((await read()).raw.seq,latest.seq);assert.equal((await read()).rendered.x,2);
    await move(3,false);await page.waitForTimeout(50);
    const mid=await read();assert.ok(mid.rendered.x>2 && mid.rendered.x<3);assert.equal(mid.rendered.moving,true);
    await page.waitForTimeout(250);assert.equal((await read()).rendered.x,3);assert.equal((await read()).rendered.moving,false);
    console.log('PASS reconnect sequence + stale packet rejection + interpolation/animation alignment',JSON.stringify({high,afterReconnect}));
  }
  const logs=await page.evaluate(()=>window.plazaLogs);
  await writeFile(`${output}/${before?'before':'after'}.json`,JSON.stringify(logs,null,2));
  const blocked=logs.filter(([tag,id,data])=>tag==='[PlazaDebug] smooth:consume' && id==='sender' && data.moving && data.pathCount===0 && data.recvSeq<data.cursor);
  console.log('Blocked cursor samples:',JSON.stringify(blocked.slice(0,2)));
  if(before) assert.ok(blocked.length>0);else assert.equal(blocked.length,0);
} finally {await browser.close();}
