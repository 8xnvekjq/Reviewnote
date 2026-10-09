// 관리자 읽기 전용 "학생 풀이 검토" — 화면 전체를 덮는다.
// 제출한 응시: 학생이 보는 OMR 결과 화면을 그대로(오답노트 담기·필기 저장 없이) 보여 준다.
// 풀이 중인 응시: 문항별 학생 답·시간·필기(+필기 순서 재생)를 크게 보여 준다.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AdminExamApi, AdminExamAttemptSummary, ExamAttempt, ExamResult, InkStroke } from '../contract';
import { ResultInkNotes } from './ResultInkNotes';
import { ExamAnswer } from './ExamAnswer';
import { formatDuration, usesWholePages } from './examLogic';
import { OmrResultView } from './OmrResultView';

export type ReviewTarget = Pick<AdminExamAttemptSummary, 'attemptId' | 'paperTitle' | 'round' | 'status' | 'mode' | 'elective' | 'score' | 'maxScore'> & { isMine?: boolean };

function InProgressReview({ target, api }: { target: ReviewTarget; api: AdminExamApi }) {
  const [data, setData] = useState<{ attempt: ExamAttempt; ink: Map<string, InkStroke[]> } | null>(null);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    let alive = true;
    setError(false);
    setData(null);
    void Promise.all([api.getAttempt(target.attemptId), api.getInk(target.attemptId)]).then(([attempt, ink]) => {
      if (alive) setData({ attempt, ink: new Map(ink.map(doc => [doc.questionId, doc.strokes])) });
    }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [api, target.attemptId, reload]);
  const question = data?.attempt.questions[index];
  const item = question && data?.attempt.items.find(i => i.questionId === question.id);
  const hanneung = data ? usesWholePages(data.attempt.questions) : false;
  const inkKey = question && (hanneung ? data!.attempt.questions.find(q => q.imageUrl === question.imageUrl)!.id : question.id);
  const answered = data ? data.attempt.items.filter(i => i.answer != null).length : 0;

  return <div className="exam-admin-detail" data-testid="admin-exam-detail">
    <div className="exam-admin-actions">
      <p className="rn-caption">풀이 중 · 아직 채점 전 · {answered}/{data?.attempt.questions.length ?? '—'}문항 답함</p>
      <button type="button" className="rn-button rn-button-compact" onClick={() => setReload(n => n + 1)}>최신 풀이 불러오기</button>
    </div>
    {!data && !error && <p role="status">학생 풀이를 불러오는 중…</p>}
    {error && <p role="alert">풀이를 불러오지 못했어요. 최신 풀이 불러오기를 눌러 다시 시도해 주세요.</p>}
    {data && question && <>
      <nav className="exam-admin-qnav" aria-label="학생 풀이 문항 이동">
        {data.attempt.questions.map((q, i) => {
          const it = data.attempt.items.find(x => x.questionId === q.id);
          return <button key={q.id} type="button" aria-current={i === index ? 'true' : undefined}
            className={`exam-admin-qchip${it?.answer != null ? ' is-answered' : ''}${i === index ? ' is-on' : ''}`}
            onClick={() => setIndex(i)}>{q.number}{it?.unsure ? '🤔' : ''}</button>;
        })}
      </nav>
      <div className="exam-admin-actions">
        <button type="button" className="rn-button rn-button-compact" aria-label="이전 문항" disabled={index === 0} onClick={() => setIndex(n => n - 1)}>◀ 이전</button>
        <p className="exam-admin-answer"><strong>{question.number}번</strong>{question.sourceRound && <> · 제{question.sourceRound}회 {question.sourceNumber}번</>} · 학생 답 <strong><ExamAnswer question={question} answer={item?.answer ?? null} /></strong>
          {' · '}{formatDuration(item?.timeSpentMs ?? 0)}{item?.unsure ? ' · 🤔 애매 표시' : ''}</p>
        <button type="button" className="rn-button rn-button-compact" aria-label="다음 문항" disabled={index === data.attempt.questions.length - 1} onClick={() => setIndex(n => n + 1)}>다음 ▶</button>
      </div>
      {!data.ink.get(inkKey!)?.length && <p className="rn-caption">이 문항에 서버로 저장된 필기가 없어요.</p>}
      {question.sourceLabel && <p className="rn-caption">{question.sourceLabel}</p>}
      <div className="exam-admin-paper">
        {/* 필기 순서 자동 재생 + 관리자가 이 기기에서만 보이는 필기(학생 풀이에는 저장 안 됨) */}
        <ResultInkNotes key={`${question.id}:${reload}`} review persist={false} ready imageUrl={question.imageUrl}
          client={api} attemptId={target.attemptId} questionId={inkKey!}
          strokes={data.ink.get(inkKey!) ?? []} imageMaxWidth={hanneung ? 980 : 480} />
      </div>
    </>}
  </div>;
}

export function AdminAttemptReview({ target, studentName, api, onClose }: {
  target: ReviewTarget; studentName: string; api: AdminExamApi; onClose: () => void;
}) {
  const [result, setResult] = useState<ExamResult | null>(null);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const submitted = target.status === 'submitted';

  useEffect(() => {
    if (!submitted) return;
    let alive = true;
    setError(false);
    setResult(null);
    api.getResult(target.attemptId).then(value => { if (alive) setResult(value); }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [api, target.attemptId, submitted, reload]);

  // 전체 화면 동안 뒤 페이지가 스크롤되지 않게 하고, Esc로 닫는다(문항 크게 보기가 열려 있으면 그것부터 닫힌다).
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('.exam-viewer-overlay')) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  // 관리자 패널 같은 부모의 transform·overflow에 갇히지 않도록 body에 바로 띄운다.
  return createPortal(<div className="rn-app exam-practice exam-admin-review" role="dialog" aria-modal="true" aria-label={`${studentName} 학생 풀이 검토`} data-testid="admin-exam-review">
    <header className="exam-admin-review-bar">
      <button type="button" className="rn-button rn-button-compact" onClick={onClose}>← 닫기</button>
      <div className="exam-admin-review-title">
        <strong>{studentName} 학생</strong>
        <span>{target.paperTitle} · {target.round}차 · {target.mode === 'real' ? '실전' : '자유'}{target.elective ? ` · ${target.elective}` : ''}</span>
      </div>
      <span className="exam-admin-review-badge">읽기 전용</span>
    </header>
    <div className="exam-admin-review-body">
      {submitted ? <>
        {!result && !error && <p role="status">결과를 불러오는 중…</p>}
        {error && <p role="alert">결과를 불러오지 못했어요. <button type="button" className="rn-button rn-button-compact" onClick={() => setReload(n => n + 1)}>다시 시도</button></p>}
        {result && <OmrResultView key={result.attemptId} client={api} result={result} onBack={onClose} backLabel="← 닫기" review={{ studentName }}
          videoApi={target.isMine && api.listPaperVideos ? { listPaperVideos: api.listPaperVideos } : undefined} />}
      </> : <InProgressReview target={target} api={api} />}
    </div>
  </div>, document.body);
}
