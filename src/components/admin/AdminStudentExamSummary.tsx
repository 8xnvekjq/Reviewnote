import { useEffect, useState } from 'react';
import type { AdminExamAttemptSummary, ExamAttempt, ExamResult, InkStroke } from '../../features/exam/contract';
import { adminExamClient, examClient } from '../../features/exam/examClient';
import { ExamInkCanvas } from '../../features/exam/ink/ExamInkCanvas';
import { ExamAnswer } from '../../features/exam/ui/ExamAnswer';
import { formatDuration } from '../../features/exam/ui/examLogic';
import '../../styles/examPractice.css';

const dateLabel = (value: string) => new Date(value).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const studentExamApi = {
  ...adminExamClient,
  getInk: examClient.getInk,
  getResult: examClient.getResult,
};
type Api = typeof studentExamApi;

function AttemptDetail({ row, studentName, api, onBack }: {
  row: AdminExamAttemptSummary; studentName: string; api: Api; onBack: () => void;
}) {
  const [data, setData] = useState<{ attempt: ExamAttempt; result: ExamResult | null; ink: Map<string, InkStroke[]> } | null>(null);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    let alive = true;
    setError(false);
    setData(null);
    void (async () => {
      const attempt = await api.getAttempt(row.attemptId);
      const [ink, result] = await Promise.all([
        api.getInk(row.attemptId), attempt.status === 'submitted' ? api.getResult(row.attemptId) : Promise.resolve(null),
      ]);
      if (alive) setData({ attempt, result, ink: new Map(ink.map(doc => [doc.questionId, doc.strokes])) });
    })().catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [api, row.attemptId, reload]);
  const question = data?.attempt.questions[index];
  const item = question && data?.attempt.items.find(i => i.questionId === question.id);
  const graded = question && data?.result?.items.find(i => i.questionId === question.id);
  const pageKey = question && data?.attempt.questions.find(q => q.imageUrl === question.imageUrl)?.id;

  return <div className="exam-admin-detail" data-testid="admin-exam-detail">
    <div className="exam-admin-actions">
      <button type="button" className="rn-button rn-button-compact" onClick={onBack}>← 응시 목록</button>
      <button type="button" className="rn-button rn-button-compact" onClick={() => setReload(n => n + 1)}>최신 풀이 불러오기</button>
    </div>
    <h4>{studentName} · {row.paperTitle} · {row.round}차</h4>
    <p className="rn-caption">읽기 전용 · {data?.result ? `${data.result.score} / ${row.maxScore}점` : row.status === 'submitted' ? `${row.score} / ${row.maxScore}점` : '풀이 중 · 아직 채점 전'} · {row.mode === 'real' ? '실전' : '자유'}{row.elective ? ` · ${row.elective}` : ''}</p>
    {!data && !error && <p role="status">학생 풀이를 불러오는 중…</p>}
    {error && <p role="alert">풀이를 불러오지 못했어요. 최신 풀이 불러오기를 눌러 다시 시도해 주세요.</p>}
    {data && question && <>
      <nav className="exam-admin-actions" aria-label="학생 풀이 문항 이동">
        <button type="button" className="rn-button rn-button-compact" disabled={index === 0} onClick={() => setIndex(n => n - 1)}>이전</button>
        <label>문항 <select value={index} onChange={e => setIndex(Number(e.target.value))}>
          {data.attempt.questions.map((q, i) => <option key={q.id} value={i}>{q.number}번</option>)}
        </select></label>
        <button type="button" className="rn-button rn-button-compact" disabled={index === data.attempt.questions.length - 1} onClick={() => setIndex(n => n + 1)}>다음</button>
      </nav>
      <p className="exam-admin-answer">학생 답 <strong><ExamAnswer question={question} answer={item?.answer ?? null} /></strong>
        {graded && <> · {graded.isCorrect ? '정답' : '오답'} · 정답 <ExamAnswer question={question} answer={graded.correctAnswer} /></>}
        {' · '}{formatDuration(item?.timeSpentMs ?? 0)}{item?.unsure ? ' · 애매 표시' : ''}
      </p>
      {!data.ink.get(data.attempt.kind === 'hanneung' ? pageKey! : question.id)?.length && <p className="rn-caption">이 문항에 서버로 저장된 필기가 없어요. 예전 기기 필기는 학생이 그 기기에서 시험을 열면 옮겨져요.</p>}
      <div className="exam-admin-paper">
        <ExamInkCanvas key={`${question.id}:${reload}`} imageUrl={question.imageUrl}
          strokes={data.ink.get(data.attempt.kind === 'hanneung' ? pageKey! : question.id) ?? []}
          onChange={() => {}} tool="pen" color="#1f2937" size={4} readOnly
          imageMaxWidth={data.attempt.kind === 'hanneung' ? 980 : 480} />
      </div>
    </>}
  </div>;
}

export default function AdminStudentExamSummary({ studentId, studentName, onPractice, api = studentExamApi }: {
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
    {selected ? <AttemptDetail key={selected.attemptId} row={selected} studentName={studentName} api={api} onBack={() => setSelected(null)} /> : <>
      <button type="button" className="rn-button rn-button-compact" onClick={() => setReload(n => n + 1)}>기록 새로고침</button>
      {error ? <p role="alert">시험 기록을 불러오지 못했어요. 새로고침으로 다시 시도해 주세요.</p>
        : rows === null ? <p role="status">시험 기록을 불러오는 중…</p>
        : rows.length === 0 ? <p className="rn-caption">{page === 0 ? '아직 응시한 시험이 없어요.' : '더 이상 응시 기록이 없어요.'}</p>
        : <ul className="exam-admin-attempts">{rows.map(row => <li key={row.attemptId}>
          <button type="button" className="exam-admin-attempt" onClick={() => setSelected(row)}>
            <span><strong>{row.paperTitle}</strong><small>{row.round}차 · {row.mode === 'real' ? '실전' : '자유'}{row.elective ? ` · ${row.elective}` : ''} · {dateLabel(row.submittedAt ?? row.startedAt)}</small></span>
            <span className="exam-admin-score">{row.status === 'submitted' ? `${row.score} / ${row.maxScore}점` : `풀이 중 ${row.answeredCount}/${row.questionCount}`}<small>답안·필기 보기 →</small></span>
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
