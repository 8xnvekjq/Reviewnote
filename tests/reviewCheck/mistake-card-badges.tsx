// MistakeCard의 "완벽!"/"약함" 배지 렌더링만 검증하는 standalone 마운트 fixture — 네트워크
// 호출이 전혀 없는 순수 프레젠테이션 컴포넌트라 mock 서버가 필요 없다(grading.browser.mjs와
// 달리 page.route 불필요).
import { createRoot } from 'react-dom/client';
import { MistakeCard } from '../../src/components/MistakeCard';
import type { MistakeEntry } from '../../src/types';

function baseEntry(id: string, overrides: Partial<MistakeEntry>): MistakeEntry {
  return {
    id,
    title: `테스트 문제 ${id}`,
    imageUrl: 'https://example.com/mistake.png',
    date: '2026-09-01',
    reviews: ['O', 'O', 'O'],
    ...overrides,
  };
}

const cases: { id: string; entry: MistakeEntry; isReviewCheckWeak?: boolean }[] = [
  // 최근 복습체크 통과 -> "완벽!"만 보여야 한다.
  { id: 'card-mastered', entry: baseEntry('mastered', { reviewCheckMasteredAt: '2026-09-20T00:00:00Z' }), isReviewCheckWeak: false },
  // 최근 복습체크에서 틀림(아직 마스터 아님) -> "약함"만 보여야 한다.
  { id: 'card-weak', entry: baseEntry('weak', { reviewCheckMasteredAt: null }), isReviewCheckWeak: true },
  // 방어적 케이스: 마스터 상태인데(과거엔 틀렸다가 최근에 통과) 호출부가 실수로 isReviewCheckWeak를
  // true로 넘겨도, 카드 자체의 `!reviewCheckMasteredAt && isReviewCheckWeak` 가드 때문에 "완벽!"만
  // 보이고 "약함"은 절대 같이 뜨면 안 된다.
  { id: 'card-mixed-mastered-wins', entry: baseEntry('mixed', { reviewCheckMasteredAt: '2026-09-21T00:00:00Z' }), isReviewCheckWeak: true },
  // 복습체크를 한 번도 안 한 문제 -> 아무 배지도 없어야 한다.
  { id: 'card-untouched', entry: baseEntry('untouched', {}), isReviewCheckWeak: false },
];

for (const { id, entry, isReviewCheckWeak } of cases) {
  const container = document.createElement('div');
  container.id = id;
  document.getElementById('root')!.appendChild(container);
  createRoot(container).render(
    <MistakeCard
      entry={entry}
      onSelect={() => {}}
      onDelete={() => {}}
      isReviewCheckWeak={isReviewCheckWeak}
    />,
  );
}
