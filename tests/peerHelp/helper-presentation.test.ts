import test from 'node:test';
import assert from 'node:assert/strict';
import { helpFeedbackText, helpRewardText } from '../../src/features/peerHelp/helper/presentation.ts';
import { HelpInkLog, helpSolutionStats, helpTooShortReason } from '../../src/features/peerHelp/solutionFile.ts';
import type { InkStroke } from '../../src/features/exam/contract.ts';

test('피드백이 있을 때만 실제 보상을 표시한다', () => {
  assert.equal(helpFeedbackText(null), '기다리는 중');
  assert.equal(helpFeedbackText('like'), '👍 좋아요');
  assert.equal(helpFeedbackText('unclear'), '🤔 이해 안 돼요');
  assert.equal(helpRewardText(null, 30), '피드백을 기다려요');
  assert.equal(helpRewardText('like', 30), '+30P');
  assert.equal(helpRewardText('unclear', 10), '+10P');
  assert.equal(helpRewardText('like', 0), '보상 한도라 포인트 없음');
});

test('필기 기록은 실행 취소를 포함하고 남은 획과 실제 기록 시간으로 전송을 제한한다', () => {
  let now = 1000;
  const log = new HelpInkLog(() => now);
  let strokes: InkStroke[] = [];
  for (let i = 0; i < 5; i++) {
    const next: InkStroke[] = [...strokes, { id: String(i), tool: 'pen', color: '#000', size: 3, points: [{ x: 0.1, y: i / 10, pressure: 0.5, t: 0 }, { x: 0.3, y: i / 10, pressure: 0.5, t: 100 }] }];
    log.record(strokes, next); strokes = next; now += 5000;
  }
  assert.equal(log.events.length, 5);
  assert.equal(helpTooShortReason(helpSolutionStats(log.events, strokes)), null);
  const beforeUndo = strokes;
  strokes = strokes.slice(0, -1); log.record(beforeUndo, strokes, 'undo');
  assert.ok(helpTooShortReason(helpSolutionStats(log.events, strokes)));
  assert.equal(log.events.length, 6);
  const count = log.events.length;
  log.record(strokes, strokes);
  assert.equal(log.events.length, count);
  log.clear(); assert.equal(log.events.length, 0);
});
