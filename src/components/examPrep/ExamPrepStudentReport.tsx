import { useMemo, useState } from 'react';
import type { MistakeEntry } from '../../types';
import { MATH_CURRICULUM, GRADE_LIST } from '../../types';
import { computeExamPrepReport, type ExamPrepReport } from '../../utils/examPrepAnalysis';
import { RadarChart } from './RadarChart';
import { BarList } from './BarList';
import { CollapsibleSection } from '../CollapsibleSection';
import { AppIcon } from '../ui/AppIcon';

interface Props {
  studentId: string;
  studentName: string;
  mistakes: MistakeEntry[];
  scaffoldedMistakeIds: Set<string>;
  onBack?: () => void;
  // 'student'면 본인 리포트를 보는 것 — 교사 전용인 "실제 수업 순서 제안" 섹션을 숨기고,
  // 학생 목록으로 돌아가는 버튼(onBack)도 표시하지 않는다. 분석 로직/데이터 자체는 동일하게 재사용.
  viewerRole?: 'admin' | 'student';
}

const REVIEW_COLOR: Record<string, string> = { complete: 'var(--rn-success)', inProgress: 'var(--rn-warning)', retry: 'var(--rn-danger)', unreviewed: '#5b6376' };
const REVIEW_LABEL: Record<string, string> = { complete: '복습 완료', inProgress: '진행 중', retry: '재도전 필요', unreviewed: '미복습' };
const CAUSE_COLOR: Record<string, string> = { concept: '#8b7bea', strategy: '#e0996a', calc: '#e0c56a', formula: 'var(--rn-accent)', misread: 'var(--rn-danger)' };

// 공통수학2를 가장 흔히 쓰는 기본값으로 — 나머지는 교사가 직접 선택.
const DEFAULT_GRADE = MATH_CURRICULUM['공통수학2'] ? '공통수학2' : GRADE_LIST[0];

export function ExamPrepStudentReport({ studentId, studentName, mistakes, scaffoldedMistakeIds, onBack, viewerRole = 'admin' }: Props) {
  const [grade, setGrade] = useState(DEFAULT_GRADE);
  const chapters = MATH_CURRICULUM[grade] || [];
  const [startChapter, setStartChapter] = useState(chapters[0] || '');
  const [endChapter, setEndChapter] = useState(chapters[chapters.length - 1] || '');
  const [report, setReport] = useState<ExamPrepReport | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);
  const [showPlans, setShowPlans] = useState(false);
  const [showCaveats, setShowCaveats] = useState(false);

  const handleGradeChange = (g: string) => {
    setGrade(g);
    const list = MATH_CURRICULUM[g] || [];
    setStartChapter(list[0] || '');
    setEndChapter(list[list.length - 1] || '');
  };

  const runAnalysis = () => {
    const result = computeExamPrepReport(mistakes, studentId, studentName, grade, startChapter, endChapter, scaffoldedMistakeIds);
    setReport(result);
    setSelectedChapter(null);
  };

  const drilldown = useMemo(
    () => report?.chapterDrilldowns.find(c => c.chapter === selectedChapter) || null,
    [report, selectedChapter],
  );

  return (
    <div className="rn-examprep-no-print">
      {onBack && (
        <button type="button" className="rn-button rn-button-ghost rn-button-compact" onClick={onBack} style={{ marginBottom: 10 }}>
          <AppIcon name="arrow" width={14} height={14} style={{ transform: 'rotate(180deg)' }} /> 학생 목록
        </button>
      )}
      {viewerRole === 'admin' && <h2 className="rn-title" style={{ marginBottom: 2 }}>{studentName}</h2>}
      <p className="rn-caption" style={{ marginBottom: 14 }}>오답노트 기록을 바탕으로 본 시험대비 분석이에요. 시험범위를 지정하고 분석하기를 눌러주세요.</p>

      <div className="rn-examprep-range-bar">
        <div className="rn-examprep-range-field">
          <label htmlFor="ep-grade">과목/교재</label>
          <select id="ep-grade" value={grade} onChange={e => handleGradeChange(e.target.value)}>
            {GRADE_LIST.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div className="rn-examprep-range-field">
          <label htmlFor="ep-start">시작</label>
          <select id="ep-start" value={startChapter} onChange={e => setStartChapter(e.target.value)}>
            {chapters.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="rn-examprep-range-field">
          <label htmlFor="ep-end">끝</label>
          <select id="ep-end" value={endChapter} onChange={e => setEndChapter(e.target.value)}>
            {chapters.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button type="button" className="rn-button rn-button-primary" onClick={runAnalysis} style={{ flex: 'none' }}>분석하기</button>
      </div>

      {!report && <div className="rn-empty"><span>시험범위를 지정하고 분석하기를 눌러주세요.</span></div>}

      {report && report.N === 0 && (
        <div className="rn-empty">
          <span>{studentName}가 이 시험범위({startChapter} ~ {endChapter})에 등록한 오답이 아직 없어요.</span>
          <span className="rn-caption">시험범위를 바꿔보거나, 학생이 오답을 등록한 뒤 다시 분석해 주세요.</span>
        </div>
      )}

      {report && report.N > 0 && (
        <>
          {report.sampleWarning && <div className="rn-examprep-warning">⚠ {report.sampleWarning}</div>}

          <div className="rn-examprep-summary-grid">
            <div className="rn-examprep-summary-tile"><div className="num">{report.N}건</div><div className="label">분석 대상 문제</div></div>
            <div className="rn-examprep-summary-tile"><div className="num">{report.review.complete + report.review.inProgress + report.review.retry}건</div><div className="label">복습 참여</div></div>
            <div className="rn-examprep-summary-tile"><div className="num">{report.scaffoldingCount}건</div><div className="label">재풀이·손풀이 기록</div></div>
            <div className="rn-examprep-summary-tile"><div className="num">{report.planCount}/{report.N}</div><div className="label">대책 작성</div></div>
          </div>

          <div className="rn-examprep-two-col">
            <div className="rn-surface" style={{ padding: 16 }}>
              <h3 className="rn-section" style={{ fontSize: 14, fontWeight: 750, marginBottom: 8 }}>6축 학습 프로필</h3>
              <RadarChart scores={report.radar} />
              <p className="rn-examprep-radar-caption">오답노트 기록을 바탕으로 본 현재 학습 프로필이에요. 절대적인 실력 점수가 아니라 상대적 경향입니다.</p>
            </div>
            <div className="rn-surface" style={{ padding: 16 }}>
              <h3 className="rn-section" style={{ fontSize: 14, fontWeight: 750, marginBottom: 4 }}>가장 먼저 잡을 취약점</h3>
              {report.weakItems.map((w, i) => (
                <div className="rn-examprep-weak-item" key={w.title}>
                  <span className="rn-examprep-weak-num">{i + 1}</span>
                  <span>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--rn-text)' }}>{w.title}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--rn-muted)', marginTop: 2 }}>{w.detail}</div>
                  </span>
                </div>
              ))}
              <h3 className="rn-section" style={{ fontSize: 14, fontWeight: 750, margin: '14px 0 4px' }}>현재 비교적 안정적인 부분</h3>
              {report.stableItems.map(s => (
                <div className="rn-examprep-stable-item" key={s}><span className="rn-examprep-stable-dot">✓</span><span>{s}</span></div>
              ))}
            </div>
          </div>

          <div className="rn-examprep-two-col" style={{ marginTop: 14 }}>
            <div className="rn-surface" style={{ padding: 16 }}>
              <h3 className="rn-section" style={{ fontSize: 14, fontWeight: 750, marginBottom: 4 }}>시험범위 단원별 오답 분포</h3>
              <p className="rn-caption" style={{ marginBottom: 8 }}>단원을 누르면 반복된 실수 유형을 자세히 볼 수 있어요.</p>
              <BarList
                rows={report.chapterStats.filter(c => c.count > 0).map(c => ({ label: c.chapter, count: c.count }))}
                onSelectRow={label => setSelectedChapter(prev => (prev === label ? null : label))}
                selectedLabel={selectedChapter || undefined}
              />
              {report.dataGapChapters.length > 0 && (
                <p className="rn-caption" style={{ marginTop: 8 }}>기록 없음: {report.dataGapChapters.join(', ')}</p>
              )}
              {drilldown && (
                <div className="rn-examprep-drilldown-chapter" style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 750, marginBottom: 6 }}>{drilldown.chapter} · {drilldown.count}건</div>
                  <BarList
                    rows={drilldown.causes.map(c => ({ label: c.label, count: c.count, color: CAUSE_COLOR[c.cause] }))}
                    unit="건"
                  />
                  <div className="rn-caption" style={{ margin: '8px 0 4px' }}>대표 문제</div>
                  <ul style={{ margin: 0, paddingLeft: '1.1em', fontSize: 12, color: 'var(--rn-text)' }}>
                    {drilldown.representativeTitles.map(t => <li key={t}>{t}</li>)}
                  </ul>
                  <div className="rn-caption" style={{ marginTop: 8 }}>
                    현재 상태 — O {drilldown.review.complete + drilldown.review.inProgress}건 · X {drilldown.review.retry}건 · 미복습 {drilldown.review.unreviewed}건
                  </div>
                </div>
              )}
            </div>
            <div className="rn-surface" style={{ padding: 16 }}>
              <h3 className="rn-section" style={{ fontSize: 14, fontWeight: 750, marginBottom: 2 }}>{studentName}는 이렇게 느꼈어요</h3>
              <p className="rn-caption" style={{ marginBottom: 8 }}>학생이 오답을 등록하며 직접 선택한 실수 유형이에요. AI가 추론한 원인이 아닙니다.</p>
              {report.causeStats.length === 0 ? (
                <p className="rn-caption">아직 자기진단이 기록된 오답이 없어요.</p>
              ) : (
                <BarList rows={report.causeStats.map(c => ({ label: c.label, count: c.count, color: CAUSE_COLOR[c.cause] }))} />
              )}
            </div>
          </div>

          <div className="rn-surface" style={{ padding: 16, marginTop: 14 }}>
            <h3 className="rn-section" style={{ fontSize: 14, fontWeight: 750, marginBottom: 8 }}>복습 현황</h3>
            <div className="rn-examprep-review-strip">
              {(['complete', 'inProgress', 'retry', 'unreviewed'] as const).map(key => {
                const count = report.review[key];
                if (count === 0) return null;
                return <span key={key} style={{ width: `${(count / report.N) * 100}%`, background: REVIEW_COLOR[key] }} />;
              })}
            </div>
            <div className="rn-examprep-review-legend">
              {(['complete', 'inProgress', 'retry', 'unreviewed'] as const).map(key => (
                <span key={key}><span className="dot" style={{ background: REVIEW_COLOR[key] }} />{REVIEW_LABEL[key]} {report.review[key]}건</span>
              ))}
            </div>
            <div className="rn-examprep-signal-grid" style={{ marginTop: 12 }}>
              <div className="rn-examprep-signal-card">🧩 재풀이·손풀이 {report.scaffoldingCount}건</div>
              <div className="rn-examprep-signal-card">🎓 대책 작성 {report.planCount}/{report.N}건</div>
            </div>
          </div>

          <div className="rn-surface" style={{ padding: 16, marginTop: 14 }}>
            <h3 className="rn-section" style={{ fontSize: 14, fontWeight: 750, marginBottom: 8 }}>학생이 적은 대책 분석</h3>
            <p style={{ fontSize: 12.5, color: 'var(--rn-text)', lineHeight: 1.6 }}>
              {report.planCount === 0
                ? '아직 대책을 작성한 오답이 없어요.'
                : `${report.N}건 중 ${report.planCount}건에 대책이 적혀 있고, 그중 ${report.concretePlanCount}건은 비교적 구체적인 문장이에요(짧은 일반론 표현은 제외한 단순 기준). 나머지는 "잘 읽는다"처럼 행동 기준이 모호한 경우가 있어, 문제별 확인 순서로 바꿔보도록 안내하면 좋아요.`}
            </p>
            {report.planSamples.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <button type="button" className="rn-button rn-button-ghost rn-button-compact" onClick={() => setShowPlans(v => !v)}>
                  {showPlans ? '대책 원문 닫기 ▴' : '학생이 실제로 적은 대책 보기 ▾'}
                </button>
                {showPlans && (
                  <div style={{ marginTop: 8 }}>
                    {report.planSamples.map(p => (
                      <div className="rn-examprep-plan-sample" key={p.title}>
                        <span className="chip">{p.chapter}</span>
                        <div>{p.text}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="rn-surface" style={{ padding: 16, marginTop: 14 }}>
            <h3 className="rn-section" style={{ fontSize: 14, fontWeight: 750, marginBottom: 4 }}>시험대비 우선순위</h3>
            {report.priorities.map(p => (
              <div className="rn-examprep-priority-row" key={p.rank}>
                <span className="rn-examprep-priority-badge">{p.rank}</span>
                <span>
                  <div className="rn-examprep-priority-title">{p.title}</div>
                  <div className="rn-examprep-priority-detail">{p.reason}</div>
                  <div className="rn-examprep-priority-detail" style={{ color: 'var(--rn-accent)', marginTop: 2 }}>→ {p.suggestion}</div>
                </span>
              </div>
            ))}
          </div>

          {viewerRole === 'admin' && (
            <div className="rn-surface" style={{ padding: 16, marginTop: 14 }}>
              <h3 className="rn-section" style={{ fontSize: 14, fontWeight: 750, marginBottom: 4 }}>실제 수업 순서 제안</h3>
              {report.lessonSteps.map(step => (
                <div className="rn-examprep-lesson-step" key={step.when}>
                  <div className="rn-examprep-lesson-when">{step.when}</div>
                  <ul>{step.items.map(item => <li key={item}>{item}</li>)}</ul>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <CollapsibleSection icon="⚠️" title="데이터 해석 주의사항" color="slate" isOpen={showCaveats} onToggle={() => setShowCaveats(v => !v)}>
              <ul style={{ margin: 0, paddingLeft: '1.1em', fontSize: 11.5, color: 'var(--rn-muted)', lineHeight: 1.7 }}>
                <li>오답노트 기반 분석으로, 전체 학습에 대한 정답률/성취도가 아닙니다.</li>
                <li>실수 유형은 학생이 직접 선택한 자기진단이며, 실제 원인과 다를 수 있습니다.</li>
                <li>복습 현황은 현재 시점 스냅샷이며, 재풀이·손풀이 기록은 최근 도입된 기능이라 장기 비교에는 한계가 있습니다.</li>
                <li>is_hidden 처리된 문제와 선택한 시험범위 밖의 문제는 분석에서 제외했습니다.</li>
                <li>분석 기준: 방금 계산됨 (열람 시점의 현재 데이터 기준, 저장되지 않고 매번 새로 계산됩니다)</li>
              </ul>
            </CollapsibleSection>
          </div>

          <div style={{ marginTop: 16, textAlign: 'right' }}>
            <button type="button" className="rn-button rn-button-secondary rn-button-compact" onClick={() => window.print()}>인쇄 / PDF 저장</button>
          </div>
        </>
      )}
    </div>
  );
}
