import type { ActiveTab } from '../types';

// "공부 중인 친구들" 팝업에서 이름 옆에 작게 보이는 최근 탭. 관리자·예전 화면 등은 보여 주지 않는다.
const LABELS: Partial<Record<ActiveTab, string>> = {
  notes: '오답노트',
  completed: '복습완료 보관함',
  camera: '문제 등록',
  stats: '학습 현황',
  store: '럭키상점',
  activity: '최근활동',
  scaffolding: '풀이 힌트',
  guide: '이용안내',
  hidden: '숨긴 카드',
  examPrep: '시험대비 분석',
  reviewCheck: '복습체크',
  pixelRoom: 'Pixel World',
  examPractice: '기출문제 풀이',
};

export function onlineTabLabel(tab: string | null | undefined): string | null {
  return tab && Object.prototype.hasOwnProperty.call(LABELS, tab) ? LABELS[tab as ActiveTab] ?? null : null;
}
