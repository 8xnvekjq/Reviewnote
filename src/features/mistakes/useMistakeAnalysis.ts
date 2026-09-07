import { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { MistakeAnalysis, MistakeEntry } from '../../types';
import { ROOT_CAUSE_OPTIONS, SOLVING_PLACEHOLDER_TEXT } from '../../types';
import type { NoticeModalState } from '../../components/CustomNoticeModal';
import { supabase } from '../../services/supabase';
import {
  classifyMistakeWithGemini,
  solveMistakeWithGemini,
  extractProblemWithGemini,
  prepareGeminiImage,
} from '../../services/gemini';

interface UseMistakeAnalysisParams {
  // 이 훅은 mistakes 배열/selectedEntry 자체를 소유하지 않는다 — 읽기(mistakes)와 갱신 함수
  // (setMistakes/setSelectedEntry)만 파라미터로 받는다. 실제 소유권은 App.tsx(추후 useMistakes)에
  // 남는다.
  mistakes: MistakeEntry[];
  setMistakes: Dispatch<SetStateAction<MistakeEntry[]>>;
  setSelectedEntry: Dispatch<SetStateAction<MistakeEntry | null>>;
  profilesGradeMap: Record<string, string>;
  youtubeLectures: any[];
  customAiName: string;
  aiVoice: string | undefined;
  teacherApproachGuides: { grade: string; chapter: string; guideText: string }[];
  showNoticeModal: (info: Omit<NoticeModalState, 'isOpen'>) => void;
  // 신규 분석 완료 직후 eager로 체크리스트를 생성하기 위한 연결 — useCheckpointGeneration이
  // 소유한 함수를 그대로 넘겨받아 호출만 한다(circular dependency를 피하기 위해 이 훅은
  // useCheckpointGeneration을 직접 호출하지 않는다).
  generateAndSaveSolutionCheckpoints: (entry: MistakeEntry) => Promise<boolean>;
}

// AI 분석(classify → extract/solve) 파이프라인을 담당하는 훅. App.tsx에 있던 것을 그대로 옮긴
// 것으로, 프롬프트/모델/응답 포맷/호출 순서/스트리밍 구조를 전혀 바꾸지 않았다.
export function useMistakeAnalysis({
  mistakes,
  setMistakes,
  setSelectedEntry,
  profilesGradeMap,
  youtubeLectures,
  customAiName,
  aiVoice,
  teacherApproachGuides,
  showNoticeModal,
  generateAndSaveSolutionCheckpoints,
}: UseMistakeAnalysisParams) {
  // classify+solve 진단이 "어느 오답 항목"에 대해 진행 중인지 — 예전엔 boolean 하나였는데,
  // 그러면 A를 진단하는 중 다른(B) 카드를 열어도 B에 가짜로 로딩 스피너가 뜨다가 조용히
  // 사라지는 버그가 있었다(전역 상태라 "누구를 진단 중인지"를 구분 못 했음).
  const [analyzingEntryId, setAnalyzingEntryId] = useState<string | null>(null);
  // handleStartAnalysis의 중복 실행 가드용. state는 클로저마다(특히 재시도처럼 실패
  // 시점에 만들어진 오래된 클로저에서) 그 함수가 "정의된 렌더 시점"의 값에 고정되어
  // 최신 실행 여부를 알 수 없다 — ref는 모든 클로저가 항상 같은 최신 값을 본다.
  const analyzingEntryIdRef = useRef<string | null>(null);
  // AI 진단 평균 소요시간(ms) — diagnosis_stats 테이블의 전역 누적치 기반, 오답 카드 삭제와 무관하게 유지됨
  const [averageWaitMs, setAverageWaitMs] = useState<number | null>(null);

  // diagnosis_stats 테이블(전역 누적, 오답 카드 삭제와 무관하게 유지됨)에서 평균 진단 소요시간 조회
  const fetchDiagnosisStats = async () => {
    try {
      const { data, error } = await supabase
        .from('diagnosis_stats')
        .select('total_count, total_duration_ms')
        .eq('id', 1)
        .single();
      if (error) throw error;
      // 표본이 너무 적으면(3건 미만) 신뢰하기 어려운 값이라 아직 노출하지 않음
      setAverageWaitMs(data && data.total_count >= 3 ? data.total_duration_ms / data.total_count : null);
    } catch (err) {
      console.error('Failed to load diagnosis stats from Supabase:', err);
    }
  };

  // --- 1단계: 과목/단원 및 유튜브 딥링크 1차 판단 + DB/로컬 상태 갱신 ---
  const classifyStep = async (
    entry: MistakeEntry,
    studentGrade: string | undefined,
    image: { mimeType: string; base64Data: string }
  ): Promise<MistakeEntry> => {
    const firstResult = await classifyMistakeWithGemini(image, youtubeLectures, studentGrade, customAiName || '밤티');

    // 1단계 결과를 기반으로 Supabase DB에 과목, 단원, 유튜브 매칭 필드 우선 업데이트.
    // 분석 시작 전에 이미 복습 체크(O/X/★)를 해뒀을 수 있으므로, 기존 analysis를 먼저 펼쳐서
    // reviewDates/reviewPoints/pointLog/reviewLog가 통째로 덮여 사라지지 않게 한다.
    const partialAnalysis: MistakeAnalysis = {
      ...entry.analysis,
      solvingProcess: SOLVING_PLACEHOLDER_TEXT,
      matchedVideoId: firstResult.matchedVideoId,
      matchedStartSeconds: firstResult.matchedStartSeconds,
      matchedChapterTitle: firstResult.matchedChapterTitle,
    };

    const { error: firstUpdateError } = await supabase
      .from('mistakes')
      .update({
        title: firstResult.title,
        grade: firstResult.grade || entry.grade || null,
        chapter: firstResult.chapter || entry.chapter || null,
        analysis: partialAnalysis,
        root_causes: entry.rootCauses || [],
        user_action_plan: entry.userActionPlan || null,
      })
      .eq('id', entry.id);

    if (firstUpdateError) throw firstUpdateError;

    const updatedEntry: MistakeEntry = {
      ...entry,
      title: firstResult.title,
      grade: firstResult.grade || entry.grade,
      chapter: firstResult.chapter || entry.chapter,
      analysis: partialAnalysis,
    };

    // 로컬 상태 1차 갱신 (화면에 과목/단원 및 유튜브 딥링크가 바로 노출됨)
    setMistakes(prev => prev.map(m => m.id === entry.id ? updatedEntry : m));
    setSelectedEntry(updatedEntry);

    return updatedEntry;
  };

  // --- 2단계: 문제 풀이(스트리밍) + 문제 지문/바운딩박스 추출을 동시 진행 + DB/로컬 상태 갱신 ---
  const solveStep = async (
    updatedEntry: MistakeEntry,
    studentGrade: string | undefined,
    image: { mimeType: string; base64Data: string },
    extractPromise: ReturnType<typeof extractProblemWithGemini>,
    analysisStartTime: number
  ): Promise<void> => {
    // 풀이가 생성되는 대로 상세 모달에 실시간으로 흘려보냄 (완성될 때까지 기다리지 않음)
    const onProgress = (partialSolvingProcess: string) => {
      setSelectedEntry(prev => {
        if (!prev || prev.id !== updatedEntry.id) return prev;
        return { ...prev, analysis: { ...prev.analysis, solvingProcess: partialSolvingProcess } };
      });
    };

    // 이 학생이 같은 단원에서 이번 건을 포함해 몇 번째 오답을 등록했는지 계산 (이미 로드된 목록으로 즉시 계산, 추가 조회 없음)
    // → solve 인사말에서 자연스러운 격려/환영 멘트를 녹이는 데 사용
    const sameChapterMistakeCount = updatedEntry.chapter
      ? mistakes.filter(m => m.userId === updatedEntry.userId && m.grade === updatedEntry.grade && m.chapter === updatedEntry.chapter).length
      : undefined;

    // 이 학생의 과거 오답들(현재 건 제외)에서 가장 자주 체크된 실수 원인을 찾아, 2회 이상 반복된 경우만
    // "반복되는 실수 패턴"으로 4단계 총평에 녹여준다 (이미 로드된 목록으로 즉시 계산, 추가 조회 없음)
    const rootCauseCounts: Record<string, number> = {};
    mistakes
      .filter(m => m.userId === updatedEntry.userId && m.id !== updatedEntry.id)
      .forEach(m => {
        (m.rootCauses || []).forEach(causeId => {
          rootCauseCounts[causeId] = (rootCauseCounts[causeId] || 0) + 1;
        });
      });
    let recurringRootCause: { label: string; count: number } | undefined;
    Object.entries(rootCauseCounts).forEach(([causeId, count]) => {
      if (count >= 2 && (!recurringRootCause || count > recurringRootCause.count)) {
        const option = ROOT_CAUSE_OPTIONS.find(o => o.id === causeId);
        if (option) {
          // 라벨의 이모지 접두사(예: "🧠 개념 부족")는 떼고 순수 텍스트만 프롬프트에 전달
          recurringRootCause = { label: option.label.split(' ').slice(1).join(' '), count };
        }
      }
    });

    const [secondResult, extractResult] = await Promise.all([
      solveMistakeWithGemini(
        image,
        updatedEntry.grade || '',
        updatedEntry.chapter || '',
        studentGrade,
        onProgress,
        sameChapterMistakeCount,
        recurringRootCause,
        aiVoice,
        customAiName || '밤티',
        teacherApproachGuides
      ),
      extractPromise
    ]);

    const finalAnalysis: MistakeAnalysis = {
      ...updatedEntry.analysis,
      solvingProcess: secondResult.solvingProcess,
      problemText: extractResult.problemText,
      problemBox: extractResult.problemBox,
      // "AI 틀린 이유 진단" 기능 제거 — Gemini에게 더 이상 요청하지 않으므로 secondResult에도
      // 이 필드가 없다. 재분석 시 위 스프레드(...updatedEntry.analysis)로 예전 값이 그대로
      // 새어들어오지 않도록 명시적으로 비워서 저장한다(이전에 이미 저장된, 재분석하지 않는
      // 레코드의 과거 값 자체는 DB에 그대로 남아있어도 문제없음 — 그냥 더 이상 안 씀).
      mistakeSummary: undefined,
      finalAnswer: secondResult.finalAnswer || undefined,
      modelUsed: 'gemini-2.5-flash',
      durationMs: Date.now() - analysisStartTime
    };

    const { error: secondUpdateError } = await supabase
      .from('mistakes')
      .update({
        analysis: finalAnalysis,
      })
      .eq('id', updatedEntry.id);

    if (secondUpdateError) throw secondUpdateError;

    const finalEntry: MistakeEntry = {
      ...updatedEntry,
      analysis: finalAnalysis
    };

    // 로컬 상태 2차 갱신 (상세 해설 로딩 완료 노출)
    setMistakes(prev => prev.map(m => m.id === updatedEntry.id ? finalEntry : m));
    setSelectedEntry(finalEntry);

    // 평균 대기시간 통계에 이번 진단 소요시간 반영 (오답 카드 삭제와 무관하게 영구 누적).
    // 통계 기록 실패는 진단 자체의 성공/실패에 영향을 주면 안 되므로 별도로 감싸서 처리.
    try {
      const { error: statsError } = await supabase.rpc('record_diagnosis_duration', {
        duration_ms: finalAnalysis.durationMs
      });
      if (statsError) throw statsError;
      await fetchDiagnosisStats();
    } catch (err) {
      console.error('Failed to record diagnosis duration stats:', err);
    }

    // 🧭 단계형 풀이 체크리스트: 신규 분석 완료 직후 background로 생성(needsHelp 여부 무관 —
    // 모든 오답에 적용). await 하지 않는다 — 메인 분석 완료 화면은 기존 타이밍 그대로 유지하고,
    // 체크리스트는 조금 늦게 도착해도 무방(record_diagnosis_duration과 동일한 fire-and-forget 패턴).
    generateAndSaveSolutionCheckpoints(finalEntry).catch(err => {
      console.error('Failed to generate solution checkpoints:', err);
    });
  };

  // Start analysis trigger (Gemini API 키는 서버(Edge Function)에서만 다루므로 클라이언트는 신경쓸 필요 없음)
  const handleStartAnalysis = async (entry: MistakeEntry) => {
    // 이미 다른 오답을 진단 중이면 중복 실행(더블탭, 실패 후 재시도 연타 등)을 막는다 —
    // 같은 항목에 두 번 걸리면 두 결과가 뒤섞여 DB에 저장될 수 있었고, 비용도 이중으로 나갔다.
    // ref로 체크하는 이유는 이 함수 자체가 "재시도" 버튼처럼 예전 렌더에서 만들어진
    // 클로저를 통해 다시 호출될 수 있기 때문 — state였다면 그 오래된 클로저는 자신이
    // 정의된 시점의 값에 고정되어 있어 현재 진행 중인 분석을 못 보고 가드를 통과해버린다.
    if (analyzingEntryIdRef.current) return;
    analyzingEntryIdRef.current = entry.id;
    setAnalyzingEntryId(entry.id);
    // 진단 전체(classify+extract+solve) 소요 시간을 재서 평균 대기시간 계산에 사용
    const analysisStartTime = Date.now();
    try {
      const studentGrade = entry.userId ? (profilesGradeMap[entry.userId] || '') : '';

      // 이미지 다운로드 + 리사이즈/압축은 진단당 단 한 번만 수행하고 classify/extract/solve에서 재사용합니다.
      // (과거에는 1차/2차 호출이 각자 이미지를 재다운로드+재압축해서 진단 시간이 두 배로 늘어났었음)
      const image = await prepareGeminiImage(entry.imageUrl);

      // 문제 지문(OCR)/바운딩박스 추출은 과목·단원과 무관한 작업이라 classify와 완전히 동시에 시작합니다.
      const extractPromise = extractProblemWithGemini(image);
      // classify가 끝날 때까지 extractPromise를 아직 await하지 않으므로, 그 사이 실패하더라도
      // "unhandled promise rejection" 경고가 뜨지 않도록 별도 채널로 미리 캐치해둔다 (실제 처리는 solveStep에서).
      extractPromise.catch(() => {});

      const updated = await classifyStep(entry, studentGrade, image);
      await solveStep(updated, studentGrade, image, extractPromise, analysisStartTime);
    } catch (err: any) {
      console.error(err);
      showNoticeModal({
        title: 'AI 분석 오류',
        message: err.message || 'AI 분석 실행 중 오류가 발생했습니다.',
        badge: '오류',
        icon: '⚠️',
        buttonText: '닫기',
        // 원탭 재시도: 기존 handleStartAnalysis를 그대로 재호출한다 (새 상태머신 없음).
        // 같은 entry를 다시 넘기므로 classify/extract/solve가 처음부터 재실행되며,
        // 이 함수 최상단의 analyzingEntryId 가드가 중복 실행을 그대로 막아준다.
        secondaryButtonText: '다시 시도',
        onSecondaryAction: () => handleStartAnalysis(entry),
      });
    } finally {
      analyzingEntryIdRef.current = null;
      setAnalyzingEntryId(null);
    }
  };

  return {
    analyzingEntryId,
    averageWaitMs,
    fetchDiagnosisStats,
    handleStartAnalysis,
  };
}
