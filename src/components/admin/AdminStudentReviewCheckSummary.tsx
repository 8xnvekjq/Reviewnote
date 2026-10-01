import { useEffect, useState } from 'react';
import { fetchStudentReviewCheckSessions, type ReviewCheckSession } from '../../utils/reviewCheckClient';

interface Props {
  studentId: string;
  // 채점 대기 회차가 있을 때 "채점하러 가기" — 전체메뉴 복습체크(관리자 채점 화면) 탭으로 이동.
  // 없으면 버튼을 그리지 않는다.
  onOpenGrading?: () => void;
}

const RECENT_LIMIT = 5;

function formatMonthDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getMonth() + 1}/${String(d.getDate()).padStart(2, '0')}`;
}

function formatRange(s: ReviewCheckSession): string {
  const chapters = s.startChapter === s.endChapter ? s.startChapter : `${s.startChapter}~${s.endChapter}`;
  return s.grade ? `${s.grade} · ${chapters}` : chapters;
}

// 관리자 학생 상세 모달의 "최근 복습체크 현황". fetchStudentReviewCheckSessions는 관리자 채점
// 오버레이(ReviewCheckAdminOverlay)도 다른 학생 세션을 읽을 때 그대로 쓰는 함수다 — 관리자는
// SELECT RLS로 전체 세션을 볼 수 있으므로 서버 변경 없이 재사용한다.
export function AdminStudentReviewCheckSummary({ studentId, onOpenGrading }: Props) {
  const [sessions, setSessions] = useState<ReviewCheckSession[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // 다른 학생으로 바뀌는 동안 이전 학생의 응답이 늦게 도착해도 덮어쓰지 않도록 취소 플래그.
    let cancelled = false;
    setSessions(null);
    setFailed(false);
    fetchStudentReviewCheckSessions(studentId)
      .then(rows => { if (!cancelled) setSessions(rows); })
      .catch(err => {
        console.error('Failed to load student review check sessions:', err);
        if (!cancelled) setFailed(true);
      });
    return () => { cancelled = true; };
  }, [studentId]);

  const header = (
    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">📝 최근 복습체크 현황</span>
  );

  if (failed) {
    return (
      <div className="space-y-2" data-testid="admin-rc-summary">
        {header}
        <p className="text-[10px] text-slate-500">복습체크 기록을 불러오지 못했어요.</p>
      </div>
    );
  }
  if (!sessions) {
    return (
      <div className="space-y-2" data-testid="admin-rc-summary">
        {header}
        <p className="text-[10px] text-slate-500">불러오는 중…</p>
      </div>
    );
  }

  const finished = sessions.filter(s => s.status !== 'in_progress');
  if (sessions.length === 0) {
    return (
      <div className="space-y-2" data-testid="admin-rc-summary">
        {header}
        <p className="text-[10px] text-slate-500">아직 복습체크 기록이 없어요</p>
      </div>
    );
  }

  const graded = sessions.filter(s => s.status === 'graded');
  const gradedTotal = graded.reduce((sum, s) => sum + s.totalCount, 0);
  const gradedCorrect = graded.reduce((sum, s) => sum + s.correctCount, 0);
  const accuracy = gradedTotal > 0 ? Math.round((gradedCorrect / gradedTotal) * 100) : null;
  const pendingCount = sessions.filter(s => s.status === 'submitted').length;
  const inProgress = sessions.some(s => s.status === 'in_progress');
  const recent = sessions.slice(0, RECENT_LIMIT);

  return (
    <div className="space-y-2" data-testid="admin-rc-summary">
      <div className="flex items-center justify-between">
        {header}
        {inProgress && (
          <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-sky-950/60 border border-sky-800/50 text-sky-300">풀이 중</span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-center">
          <div className="text-sm font-black text-white" data-testid="admin-rc-total">{finished.length}회</div>
          <div className="text-[9px] text-slate-500 font-bold mt-0.5">총 복습체크</div>
        </div>
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-center">
          <div className="text-sm font-black text-amber-300" data-testid="admin-rc-accuracy">{accuracy === null ? '—' : `${accuracy}%`}</div>
          <div className="text-[9px] text-slate-500 font-bold mt-0.5">평균 정답률</div>
        </div>
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-center">
          <div className={`text-sm font-black ${pendingCount > 0 ? 'text-rose-300' : 'text-slate-400'}`} data-testid="admin-rc-pending">{pendingCount}건</div>
          <div className="text-[9px] text-slate-500 font-bold mt-0.5">채점 대기</div>
        </div>
      </div>

      <div className="border border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-800/60">
        {recent.map(s => (
          <div key={s.id} className="flex items-center gap-2 px-3 py-1.5 text-[10px]" data-testid="admin-rc-row">
            <span className="text-slate-300 font-semibold flex-none w-9">{formatMonthDay(s.createdAt)}</span>
            <span className="text-slate-400 truncate flex-1 min-w-0">{formatRange(s)}</span>
            {s.status === 'graded' ? (
              <span className="text-amber-300 font-black flex-none">
                {s.correctCount}/{s.totalCount}
                <span className="text-slate-500 font-bold ml-1">
                  {s.totalCount > 0 ? `${Math.round((s.correctCount / s.totalCount) * 100)}%` : '—'}
                </span>
              </span>
            ) : s.status === 'submitted' ? (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-rose-950/60 border border-rose-800/50 text-rose-300 flex-none">채점 대기</span>
            ) : (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-sky-950/60 border border-sky-800/50 text-sky-300 flex-none">풀이 중</span>
            )}
          </div>
        ))}
      </div>

      {pendingCount > 0 && onOpenGrading && (
        <button
          type="button"
          onClick={onOpenGrading}
          className="w-full px-3 py-1.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/50 text-[10px] font-black text-rose-300 transition-colors"
        >
          ✍️ 채점하러 가기
        </button>
      )}
    </div>
  );
}
