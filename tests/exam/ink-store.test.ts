import test from 'node:test';
import assert from 'node:assert/strict';
import { loadInk, loadInkDrafts } from '../../src/features/exam/ui/inkStore.ts';
import { encodeInkStroke, decodeInkStroke, decodeInkPayload, needsInkCompaction } from '../../src/features/exam/ink/inkCodec.ts';
import { InkSync } from '../../src/features/exam/ui/inkSync.ts';
import { inkDelta } from '../../src/features/exam/ink/inkReplay.ts';
import type { InkSaveRequest } from '../../src/features/exam/contract.ts';
import type { InkStroke } from '../../src/features/exam/contract.ts';

test('IndexedDB reads mixed documents and pending uploads; corrupt compact ink rejects instead of dropping recovery data', async () => {
  const rows = new Map<string, Array<{key:string;value:unknown}>>();
  const previousDb = globalThis.indexedDB, previousRange = globalThis.IDBKeyRange;
  const db = {
    transaction(store: string) {
      const tx: any = { objectStore: () => ({ openCursor: (range: {lower:string;upper:string}) => {
        const entries = (rows.get(store) ?? []).filter(row=>row.key >= range.lower && row.key <= range.upper);
        const req: any = {};
        let offset=0;
        const next=() => queueMicrotask(() => {
          const row=entries[offset++];
          req.result=row ? {...row,continue:next} : null;
          req.onsuccess?.();
          // IDB에서도 success 콜백 예외와 tx complete는 별개다. 명시 reject가 먼저 필요하다.
          if (!row || offset === entries.length) queueMicrotask(()=>tx.oncomplete?.());
        });
        next(); return req;
      } }) };
      return tx;
    },
  };
  Object.assign(globalThis,{ indexedDB: {open:()=> {
    const req: any={result:db}; queueMicrotask(()=>req.onsuccess?.()); return req;
  }}, IDBKeyRange:{bound:(lower:string,upper:string)=>({lower,upper})} });
  try {
    const old: InkStroke={id:'old',tool:'pen',color:'#123456',size:3,points:[{x:.1,y:.2,pressure:.5,t:0}]};
    const packed=encodeInkStroke({...old,id:'new'}), decoded=decodeInkStroke(packed);
    rows.set('strokes',[{key:'attempt::q',value:[old,packed]}]);
    rows.set('drafts',[{key:'attempt::q',value:{ strokes:[old,packed],baseStrokes:[packed],revision:3,pending:true,
      events:[{id:'edit',kind:'draw',at:0,removed:[],added:[{index:1,stroke:packed}]}],
      upload:{id:'batch',revision:3,reencoded:true,strokes:[old,packed],events:[]} }}]);
    assert.deepEqual((await loadInk('attempt')).get('q'),[old,decoded]);
    const draft=(await loadInkDrafts('attempt')).get('q')!;
    assert.deepEqual(draft.strokes,[old,decoded]);
    assert.deepEqual(draft.baseStrokes,[decoded]);
    assert.deepEqual(draft.events![0].added[0].stroke,decoded);
    assert.equal(draft.upload!.id,'batch'); assert.equal(draft.upload!.reencoded,true);
    // 서버 신형 획을 points로 캐시한 뒤 새로고침한 큰 미저장 초안: 실제 edit만 보내야 한다.
    const large = { ...old, id: 'large', points: Array.from({ length: 16000 }, (_, t) => ({ x: .123456, y: .654321, pressure: .5, t })) };
    const newer = { ...old, id: 'edit' };
    const event = inkDelta([large], [large, newer], 'draw');
    rows.set('strokes', [{ key: 'attempt::q', value: structuredClone([large]) }]);
    rows.set('drafts', [{ key: 'attempt::q', value: structuredClone({ strokes: [large, newer], baseStrokes: [large], revision: 3, pending: true, events: [event] }) }]);
    assert.ok(Buffer.byteLength(JSON.stringify([large])) >= 512 * 1024);
    assert.equal(needsInkCompaction((await loadInk('attempt')).get('q')!), false);
    const restored = (await loadInkDrafts('attempt')).get('q')!;
    assert.equal(needsInkCompaction(restored.baseStrokes!), false);
    assert.equal(needsInkCompaction(restored.strokes), false);
    const requests: InkSaveRequest[] = [];
    const sync = new InkSync({
      getInk: async () => [decodeInkPayload({ questionId: 'q', revision: 3, strokes: [encodeInkStroke(large)] })],
      saveInk: async (_attempt, _question, request) => { requests.push(request); return 4; },
    }, 'attempt', undefined, { legacy: loadInk, read: loadInkDrafts, write: async () => true });
    await sync.load();
    assert.equal(await sync.flush(), true);
    assert.deepEqual(requests[0].events, [event], 'no redundant full-baseline reencode after reload');
    assert.equal(needsInkCompaction(decodeInkPayload<InkStroke[]>(structuredClone([large]))), true, 'the same points received from the server still count as legacy');
    rows.set('strokes',[{key:'attempt::q',value:[{...packed,p:'broken'}]}]);
    rows.set('drafts',[{key:'attempt::q',value:{strokes:[{...packed,p:'broken'}],pending:true}}]);
    await assert.rejects(loadInk('attempt'),/EXAM_INK_INVALID/);
    await assert.rejects(loadInkDrafts('attempt'),/EXAM_INK_INVALID/);
  } finally { Object.assign(globalThis,{indexedDB:previousDb,IDBKeyRange:previousRange}); }
});
