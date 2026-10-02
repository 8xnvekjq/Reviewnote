import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { eraStats, HANNEUNG_ERAS, HANNEUNG_FIELDS, resultPaperId, weakEras, type HanneungTopicFile } from '../../src/features/exam/ui/hanneungEra.ts';
import { HANNEUNG_LECTURES } from '../../src/features/exam/data/hanneungLectures.ts';

const ERA_IDS: string[] = HANNEUNG_ERAS.map(era => era.id);
const readJson = (name: string) => JSON.parse(readFileSync(new URL(`../../src/features/exam/data/${name}`, import.meta.url), 'utf8'));
const topics: HanneungTopicFile = readJson('2026-hanneung-79-advanced.topics.json');

const file = (eras: string[]): HanneungTopicFile => ({
  paperId: 'p',
  questions: eras.map((era, i) => ({ number: i + 1, era: era as HanneungTopicFile['questions'][number]['era'], field: '정치', keywords: [], confidence: 'high', note: '' })),
});
const items = (rows: Array<[boolean, number]>) => rows.map(([isCorrect, points], i) => ({ number: i + 1, isCorrect, points }));

test('시대별 집계: 표 순서, 문항 0개 시대 숨김, 태그 없는 문항 제외', () => {
  const stats = eraStats(items([[true, 2], [false, 3], [true, 1], [true, 2], [false, 1]]), file(['goryeo', 'prehistory', 'goryeo', 'modern']));
  assert.deepEqual(stats.map(stat => stat.era), ['prehistory', 'goryeo', 'modern']);
  const goryeo = stats.find(stat => stat.era === 'goryeo')!;
  assert.deepEqual({ ...goryeo }, { era: 'goryeo', label: '고려', total: 2, correct: 2, points: 3, earned: 3, rate: 1 });
  assert.deepEqual(stats[0], { era: 'prehistory', label: '선사·초기 국가', total: 1, correct: 0, points: 3, earned: 0, rate: 0 });
  // 5번 문항은 태그가 없어 빠진다.
  assert.equal(stats.reduce((sum, stat) => sum + stat.total, 0), 4);
});

test('약한 시대: 60% 미만은 모두 "보충 필요", 없으면 가장 낮은 1개, 모두 만점이면 없음', () => {
  const tags = file(['goryeo', 'goryeo', 'goryeo', 'goryeo', 'goryeo', 'modern', 'modern', 'modern', 'modern', 'modern']);
  // 고려 3/5=60%(경계, 보충 아님), 현대 2/5=40%
  const mixed = eraStats(items([[true, 1], [true, 1], [true, 1], [false, 1], [false, 1], [true, 1], [true, 1], [false, 1], [false, 1], [false, 1]]), tags);
  assert.deepEqual(weakEras(mixed), { kind: 'needs-work', eras: ['modern'] });
  // 고려 4/5, 현대 3/5 → 둘 다 60% 이상 → 가장 낮은 현대
  const okish = eraStats(items([[true, 1], [true, 1], [true, 1], [true, 1], [false, 1], [true, 1], [true, 1], [true, 1], [false, 1], [false, 1]]), tags);
  assert.deepEqual(weakEras(okish), { kind: 'weakest', eras: ['modern'] });
  // 동률이면 표시 순서상 앞 시대
  const tie = eraStats(items([[true, 1], [true, 1], [true, 1], [true, 1], [false, 1], [true, 1], [true, 1], [true, 1], [true, 1], [false, 1]]), tags);
  assert.deepEqual(weakEras(tie), { kind: 'weakest', eras: ['goryeo'] });
  assert.equal(weakEras(eraStats(items(tags.questions.map(() => [true, 1])), tags)), null);
  assert.equal(weakEras([]), null);
});

test('결과의 시험지 id: paperId 우선, 없으면 이미지 경로', () => {
  assert.equal(resultPaperId({ paperId: 'x', items: [{ imageUrl: '/exams/y/q-01.jpg' }] }), 'x');
  assert.equal(resultPaperId({ items: [{ imageUrl: '/exams/2026-hanneung-79-advanced/q-01.jpg' }] }), '2026-hanneung-79-advanced');
  assert.equal(resultPaperId({ items: [] }), null);
});

test('79회 심화 태그 파일: 1~50 빠짐·중복 없음, 허용 값만, 정답 관련 키 없음', () => {
  assert.equal(topics.paperId, '2026-hanneung-79-advanced');
  assert.deepEqual(Object.keys(topics).sort(), ['paperId', 'questions']);
  assert.deepEqual(topics.questions.map(q => q.number), Array.from({ length: 50 }, (_, i) => i + 1));
  const allowed = ['number', 'era', 'field', 'keywords', 'confidence', 'note'];
  for (const question of topics.questions) {
    assert.deepEqual(Object.keys(question).sort(), [...allowed].sort(), `${question.number}번 키`);
    assert.ok(ERA_IDS.includes(question.era), `${question.number}번 era ${question.era}`);
    assert.ok((HANNEUNG_FIELDS as readonly string[]).includes(question.field), `${question.number}번 field`);
    assert.ok(question.keywords.length >= 1 && question.keywords.length <= 4, `${question.number}번 keywords`);
    assert.ok(question.keywords.every(keyword => typeof keyword === 'string' && keyword.trim().length > 0));
    assert.ok(question.confidence === 'high' || question.confidence === 'low');
    assert.equal(typeof question.note, 'string');
    if (question.confidence === 'low') assert.ok(question.note.length > 0, `${question.number}번 low는 note 필요`);
  }
  // 정답·배점이 섞여 들어오지 않았는지(키 이름·값 어디에도).
  const raw = readFileSync(new URL('../../src/features/exam/data/2026-hanneung-79-advanced.topics.json', import.meta.url), 'utf8');
  assert.doesNotMatch(raw, /"(answer|correctAnswer|points|answerType|choices|isCorrect)"/);
  // 문항 수·이미지 수가 시험지와 같다(시험지 JSON은 테스트에서만 읽는다).
  assert.equal(readJson('2026-hanneung-79-advanced.json').questions.length, topics.questions.length);
});

test('시대별 강의: 모든 시대에 1~2개, https URL, 제공자·제목 있음', () => {
  assert.deepEqual(Object.keys(HANNEUNG_LECTURES).sort(), [...ERA_IDS].sort());
  for (const era of ERA_IDS) {
    const lectures = HANNEUNG_LECTURES[era as keyof typeof HANNEUNG_LECTURES];
    assert.ok(lectures.length >= 1 && lectures.length <= 2, era);
    for (const lecture of lectures) {
      assert.match(lecture.url, /^https:\/\//);
      assert.doesNotThrow(() => new URL(lecture.url));
      assert.ok(lecture.provider.length > 0 && lecture.title.length > 0);
    }
  }
  const urls = Object.values(HANNEUNG_LECTURES).flat().map(lecture => lecture.url);
  assert.equal(new Set(urls).size, urls.length);
});
