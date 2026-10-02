import { useEffect, useState } from 'react';
import type { AdminExamApi, AdminExamAttemptSummary } from '../../features/exam/contract';
import { adminExamApi } from '../../features/exam/examClient';
import { AdminAttemptReview } from '../../features/exam/ui/AdminAttemptReview';
import '../../styles/examPractice.css';

const dateLabel = (value: string) => new Date(value).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
type Api = AdminExamApi;

export default function AdminStudentExamSummary({ studentId, studentName, onPractice, api = adminExamApi }: {
  studentId: string; studentName: string; onPractice?: () => void; api?: Api;
}) {
  const [rows, setRows] = useState<AdminExamAttemptSummary[] | null>(null);
  const [selected, setSelected] = useState<AdminExamAttemptSummary | null>(null);
  const [page, setPage] = useState(0);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    setRows(null);
    setError(false);
    void api.listAttempts(studentId, page * 30).then(value => { if (alive) setRows(value); })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [api, studentId, page, reload]);

  return <section className="exam-practice exam-admin-summary" aria-label="학생 시험 풀이" data-testid="admin-exam-summary">
    <div className="exam-admin-actions">
      <h3>시험 풀이 기록</h3>
      {onPractice && <button type="button" className="rn-button rn-button-compact" onClick={onPractice}>관리자 직접 풀기</button>}
    </div>
    <p className="rn-caption">{studentName}의 시험별 점수와 답안·필기를 확인해요.</p>
    {selected && <AdminAttemptReview key={selected.attemptId} target={selected} studentName={studentName} api={api} onClose={() => setSelected(null)} />}
    {<>
      <button type="button" className="rn-button rn-button-compact" onClick={() => setReload(n => n + 1)}>기록 새로고침</button>
      {error ? <p role="alert">시험 기록을 불러오지 못했어요. 새로고침으로 다시 시도해 주세요.</p>
        : rows === null ? <p role="status">시험 기록을 불러오는 중…</p>
        : rows.length === 0 ? <p className="rn-caption">{page === 0 ? '아직 응시한 시험이 없어요.' : '더 이상 응시 기록이 없어요.'}</p>
        : <ul className="exam-admin-attempts">{rows.map(row => <li key={row.attemptId}>
          <button type="button" className="exam-admin-attempt" onClick={() => setSelected(row)}>
            <span><strong>{row.paperTitle}</strong><small>{row.round}차 · {row.mode === 'real' ? '실전' : '자유'}{row.elective ? ` · ${row.elective}` : ''} · {dateLabel(row.submittedAt ?? row.startedAt)}</small></span>
            <span className="exam-admin-score">{row.status === 'submitted' ? `${row.score} / ${row.maxScore}점` : `풀이 중 ${row.answeredCount}/${row.questionCount}`}<small>전체 화면으로 보기 →</small></span>
          </button>
        </li>)}</ul>}
      {(page > 0 || rows?.length === 30) && <nav className="exam-admin-actions" aria-label="응시 기록 페이지">
        <button type="button" className="rn-button rn-button-compact" disabled={page === 0 || rows === null} onClick={() => setPage(n => n - 1)}>이전 기록</button>
        <span>{page + 1}페이지</span>
        <button type="button" className="rn-button rn-button-compact" disabled={rows?.length !== 30} onClick={() => setPage(n => n + 1)}>다음 기록</button>
      </nav>}
    </>}
  </section>;
}
