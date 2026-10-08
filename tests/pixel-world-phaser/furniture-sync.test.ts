import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PIXEL_CATALOG } from '../../src/features/pixel-room/shop/catalog.ts';
import { createLayoutGate, sameLayout, savedFurniture } from '../../src/features/pixel-world-phaser/logic/savedFurniture.ts';
import { entryScriptPath } from '../../src/utils/appVersion.ts';

const ownedIds = new Set(PIXEL_CATALOG.filter(item => item.category === 'furniture').map(item => item.itemId));

test('서버 행 순서가 달라도 모든 기기에서 같은 방이 된다', () => {
  const rows = [{ itemId: 'furniture_desk', x: 3, y: 4 }, { itemId: 'furniture_bed', x: 0, y: 0 }, { itemId: 'furniture_plant', x: 8, y: 3 }];
  const a = savedFurniture(rows, PIXEL_CATALOG, ownedIds);
  const b = savedFurniture([...rows].reverse(), PIXEL_CATALOG, ownedIds);
  assert.deepEqual(a, b);
  assert.equal(a.length, 3);
});

test('규칙에 어긋난 한 줄 때문에 방 전체가 비지 않는다', () => {
  // 서버 RPC는 시작 칸만 검사하므로 겹침·발자국 밖 행이 남아 있을 수 있다.
  const rows = [
    { itemId: 'furniture_desk', x: 3, y: 4 },
    { itemId: 'furniture_chair', x: 4, y: 4 }, // 책상(3x1)과 겹침
    { itemId: 'furniture_bed', x: 9, y: 7 }, // 침대(2x3)가 방 밖으로 나감
    { itemId: 'furniture_plant', x: 8, y: 3 },
  ];
  const furniture = savedFurniture(rows, PIXEL_CATALOG, ownedIds);
  // itemId 순(chair < desk)으로 읽으므로 겹친 둘 중 의자가 남는다 — 어느 기기에서나 같은 결과.
  assert.deepEqual(furniture.map(item => item.type).sort(), ['chair', 'plant']);
});

test('보유하지 않은 가구는 숨긴다', () => {
  const rows = [{ itemId: 'furniture_desk', x: 3, y: 4 }, { itemId: 'furniture_plant', x: 8, y: 3 }];
  assert.deepEqual(savedFurniture(rows, PIXEL_CATALOG, new Set(['furniture_desk'])), [{ type: 'desk', x: 3, y: 4 }]);
});

test('같은 배치 비교는 순서를 무시하고 좌표·가구 차이는 잡는다', () => {
  const a = [{ itemId: 'furniture_desk', x: 3, y: 4 }, { itemId: 'furniture_plant', x: 8, y: 3 }];
  assert.ok(sameLayout(a, [...a].reverse()));
  assert.ok(sameLayout([], []));
  assert.ok(!sameLayout(a, [{ itemId: 'furniture_desk', x: 3, y: 4 }]));
  assert.ok(!sameLayout(a, [{ itemId: 'furniture_desk', x: 4, y: 4 }, { itemId: 'furniture_plant', x: 8, y: 3 }]));
  assert.ok(!sameLayout(a, [{ itemId: 'furniture_desk', x: 3, y: 4 }, { itemId: 'furniture_chair', x: 8, y: 3 }]));
});

test('저장보다 먼저 시작한 조회 결과는 버린다', () => {
  const gate = createLayoutGate();
  const before = gate.startRead();
  assert.ok(gate.canApply(before));
  gate.startWrite();
  const during = gate.startRead();
  assert.ok(!gate.canApply(before), '저장 중에는 이전 조회를 반영하지 않는다');
  assert.ok(!gate.canApply(during), '저장 중에 시작한 조회도 반영하지 않는다');
  gate.endWrite();
  assert.ok(!gate.canApply(before), '저장이 끝난 뒤 도착한 예전 조회도 버린다');
  assert.ok(!gate.canApply(during));
  assert.ok(gate.canApply(gate.startRead()), '저장 뒤 새로 시작한 조회는 반영한다');
});

test('배포된 index.html의 진입 스크립트를 찾는다', () => {
  assert.equal(entryScriptPath('<head><script type="module" crossorigin src="/assets/index-Ab12.js"></script><link rel="modulepreload" href="/assets/vendor-1.js"></head>'), '/assets/index-Ab12.js');
  assert.equal(entryScriptPath("<script src='/assets/x.js'></script><script type='module' src='./assets/index-Z.js'></script>"), '/assets/index-Z.js');
  assert.equal(entryScriptPath('<script type="module" src="/src/main.tsx"></script>'), null, '개발 서버는 비교하지 않는다');
  assert.equal(entryScriptPath('<html></html>'), null);
});
