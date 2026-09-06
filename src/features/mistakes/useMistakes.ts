import type { Dispatch, SetStateAction } from 'react';
import type { MistakeEntry } from '../../types';
import type { NoticeModalState } from '../../components/CustomNoticeModal';
import { supabase } from '../../services/supabase';

// DB의 mistakes row(snake_case) -> 클라이언트 MistakeEntry(camelCase) 매핑.
// fetchUserData(전체 로드, App.tsx)와 refreshMistakesLight(실시간 경량 갱신, 이 훅)가 공유해서
// 로직이 갈라지지 않게 한다.
export const mapDbMistakeRow = (m: any): MistakeEntry => ({
  id: m.id,
  userId: m.user_id,
  title: m.title,
  imageUrl: m.image_url,
  date: m.date,
  updatedAt: m.updated_at,
  analysis: m.analysis || undefined,
  reviews: m.reviews || ['', '', ''],
  grade: m.grade || undefined,
  chapter: m.chapter || undefined,
  rootCauses: m.root_causes || [],
  userActionPlan: m.user_action_plan || undefined,
  teacherScaffoldingHint: m.teacher_scaffolding_hint || undefined,
  isHidden: m.is_hidden || false, // 구버전 로우(컬럼 추가 전)는 undefined/null -> false로 취급
});

interface UseMistakesParams {
  // mistakes/selectedEntry 자체는 이 훅이 소유하지 않는다 — App.tsx의 최상위 state로 남겨둔다.
  // (이유: `useEffect(..., [activeTab, mistakes])`처럼 컴포넌트 초반부에서 이미 mistakes를
  // 참조하는 곳이 있어, 상태 선언 자체를 뒤로 옮기면 참조 순서가 꼬인다. 또한 selectedEntry는
  // 체크포인트/분석 훅에도 그대로 파라미터로 전달되고 있어, 지금처럼 App.tsx가 계속 소유하는
  // 편이 모달 unmount와 무관한 상위 수명을 유지하기에도 가장 안전하다.)
  setMistakes: Dispatch<SetStateAction<MistakeEntry[]>>;
  setSelectedEntry: Dispatch<SetStateAction<MistakeEntry | null>>;
  setScaffoldedMistakeIds: Dispatch<SetStateAction<Set<string>>>;
  showNoticeModal: (info: Omit<NoticeModalState, 'isOpen'>) => void;
  // 삭제 성공 시 명예의 전당 배너를 즉각 갱신하기 위한 연결(leaderboard는 이 훅의 관심사가
  // 아니므로 직접 호출하지 않고 콜백으로만 받는다).
  onMistakeDeleted?: () => void;
}

// 오답 목록 데이터의 fetch(경량 refresh)/CRUD 책임을 담당하는 훅. App.tsx에 있던 것을 그대로
// 옮긴 것으로, review/AI 분석의 의미는 전혀 끌어들이지 않는다.
export function useMistakes({
  setMistakes,
  setSelectedEntry,
  setScaffoldedMistakeIds,
  showNoticeModal,
  onMistakeDeleted,
}: UseMistakesParams) {
  // 🔄 오답노트/스캐폴딩 실시간 동기화 전용 경량 새로고침. fetchUserData는 프로필·전체 학생
  // 이름맵·스트릭·티켓 등을 전부 다시 조회해서 무거운데, mistakes 테이블 변화 하나에는 그 중
  // mistakes와 스캐폴딩 초록마크만 실제로 영향을 받으므로 그 두 개만 가볍게 다시 불러온다.
  const refreshMistakesLight = async () => {
    try {
      const { data: dbMistakes, error } = await supabase
        .from('mistakes')
        .select('*')
        .order('date', { ascending: false });
      if (error) throw error;
      setMistakes((dbMistakes || []).map(mapDbMistakeRow));

      const { data: scaffoldingRows } = await supabase
        .from('mistake_scaffoldings')
        .select('mistake_id');
      setScaffoldedMistakeIds(new Set((scaffoldingRows || []).map((r: any) => r.mistake_id)));
    } catch (err) {
      console.error('Error refreshing mistakes:', err);
    }
  };

  // Delete mistake from Supabase & local state
  const handleDeleteMistake = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('이 오답 기록을 삭제하시겠습니까?')) {
      try {
        const { data, error } = await supabase
          .from('mistakes')
          .delete()
          .eq('id', id)
          .select('id');

        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error('삭제 권한이 없거나 이미 삭제된 기록입니다.');
        }

        setMistakes(prev => prev.filter(m => m.id !== id));
        setSelectedEntry(null);
        onMistakeDeleted?.(); // MVP 챔피언 배너 즉각 갱신
      } catch (err: any) {
        console.error(err);
        showNoticeModal({
          title: '삭제 실패',
          message: err.message,
          badge: '오류',
          icon: '⚠️',
        });
      }
    }
  };

  // 시험범위 제외 등으로 오답 카드를 메인 리스트에서 숨기거나(true) 다시 노출(false)
  const handleToggleHidden = async (id: string, hidden: boolean) => {
    // 즉시 토글되는 가벼운 액션이라 낙관적으로 로컬 상태부터 반영하고, 실패 시에만 되돌린다.
    setMistakes(prev => prev.map(m => m.id === id ? { ...m, isHidden: hidden } : m));
    try {
      const { error } = await supabase
        .from('mistakes')
        .update({ is_hidden: hidden })
        .eq('id', id);
      if (error) throw error;
    } catch (err: any) {
      console.error('Failed to toggle hidden state:', err);
      setMistakes(prev => prev.map(m => m.id === id ? { ...m, isHidden: !hidden } : m));
      showNoticeModal({
        title: '처리 실패',
        message: err.message || '숨김 상태 변경 중 오류가 발생했습니다.',
        badge: '오류',
        icon: '⚠️',
      });
    }
  };

  return {
    refreshMistakesLight,
    handleDeleteMistake,
    handleToggleHidden,
  };
}
