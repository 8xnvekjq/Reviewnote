import { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { MistakeAnalysis, MistakeEntry, SolutionChecklistItem } from '../../types';
import { SOLVING_PLACEHOLDER_TEXT } from '../../types';
import type { NoticeModalState } from '../../components/CustomNoticeModal';
import { supabase } from '../../services/supabase';
import { generateChecklistWithGemini } from '../../services/gemini';

interface UseChecklistGenerationParams {
  setMistakes: Dispatch<SetStateAction<MistakeEntry[]>>;
  setSelectedEntry: Dispatch<SetStateAction<MistakeEntry | null>>;
  customAiName: string;
  showNoticeModal: (info: Omit<NoticeModalState, 'isOpen'>) => void;
}

// 매 문제마다 AI를 다시 부르지 않는 고정 3개 — 클라이언트 상수로만 렌더(토큰 절감).
const FIXED_CHECKLIST_ITEMS: SolutionChecklistItem[] = [
  { id: 'fixed-1', text: '문제의 조건을 빠뜨리지 않고 확인했나요?', source: 'fixed', checked: false },
  { id: 'fixed-2', text: '조건을 내가 익숙한 식이나 그림으로 바꿔봤나요?', source: 'fixed', checked: false },
  { id: 'fixed-3', text: '문제에서 무엇을 구해야 하는지 정확히 확인했나요?', source: 'fixed', checked: false },
];

// 🧭 체크리스트 2.0 생성/체크 상태 관리 훅.
//
// 핵심 설계(Orca 감사 + Codex 검증으로 확정):
// - "생성은 일찍(classify/solve와 병렬), DB 저장은 solve 완료 후 한 번"만 한다 — classify/solve가
//   매번 analysis 필드 전체를 자기 스냅샷으로 덮어쓰기 때문에(useMistakeAnalysis.ts 참고), 그보다
//   먼저 체크리스트를 독립적으로 저장하면 뒤이은 classify/solve 저장에 지워질 수 있다. 그래서
//   "생성(Gemini 호출)"과 "DB 저장 시점"을 분리해, 저장은 항상 solve의 마지막 DB 쓰기 이후에만
//   한다(=오늘의 eager 체크포인트 저장과 동일한 위치, 새로운 동시 쓰기를 만들지 않음).
// - 그 사이(체크리스트가 로컬에 먼저 뜬 뒤 solve가 끝나기 전) 학생이 체크한 내용이 유실되지
//   않도록, 체크는 항상 latest ref(checklistCheckedRef)에 동기 기록되고, 첫 저장은 그 ref를 쓰기
//   직전 마지막 순간에 읽는다. 쓰는 도중에도 체크가 또 바뀔 수 있어 버전 번호(checklistVersionRef)로
//   "쓰기 시작 시점 버전 == 쓰기 끝난 시점 버전"이 성립할 때까지 반복 저장한다(무한 재시도 구조가
//   아니라, 실제로 그 사이 변경이 있었을 때만 한 번 더 도는 in-flight + merged-rerun 패턴).
// - 첫 저장이 끝나기 전(checklistFirstSaveDoneRef가 false인 동안) 체크는 로컬 state만 갱신하고
//   DB를 건드리지 않는다 — 이 구간에 유일한 쓰기는 flush 루프 하나뿐이라 별도의 동시-호출자 방지
//   장치가 필요 없다. 첫 저장이 끝난 뒤부터는 기존 handleUpdateCheckpointStatus와 동일한 즉시
//   fetch-merge-write 경로로 전환된다.
export function useChecklistGeneration({
  setMistakes,
  setSelectedEntry,
  customAiName,
  showNoticeModal,
}: UseChecklistGenerationParams) {
  // 카드/모달에 "생성 중.../실패" 배지를 그리기 위한 React state. 'ready'는 별도 값이 없다 —
  // 로컬 analysis.solutionChecklist가 채워진 것 자체가 ready를 의미한다.
  const [checklistStatus, setChecklistStatus] = useState<Record<string, 'generating' | 'failed'>>({});

  // 학생이 지금까지 체크한 항목(entry.id → itemId → checked). React state와 별개로 항상 최신값을
  // 동기 유지하는 ref — 첫 저장 루프가 "쓰기 직전 마지막 순간"에 이 값을 읽어야 stale closure 없이
  // 정확한 최신 체크 상태를 저장할 수 있다.
  const checklistCheckedRef = useRef<Record<string, Record<string, boolean>>>({});
  // 체크가 바뀔 때마다 +1 — 첫 저장 루프가 "쓰는 동안 또 바뀌었는지"를 판단하는 데 사용.
  const checklistVersionRef = useRef<Record<string, number>>({});
  // 생성된 항목(고정 3개 + AI 맞춤) — 첫 저장이 이 값 위에 최신 checked를 얹어서 저장한다.
  const checklistItemsRef = useRef<Record<string, SolutionChecklistItem[]>>({});
  // 진행 중인(또는 이미 끝난) 생성 Promise — flush가 "결과가 아직 안 왔으면 기다렸다가" 저장할 수
  // 있도록 붙잡아 둔다.
  const checklistGenerationPromiseRef = useRef<Record<string, Promise<void>>>({});
  // 첫 저장이 끝났는지 — 이 값이 true가 되기 전까지는 모든 체크가 로컬 전용이다.
  const checklistFirstSaveDoneRef = useRef<Record<string, boolean>>({});
  // flush 중복 실행 방어(정상 흐름에선 flush가 entry당 1회만 불리지만, 방어적으로 유지).
  const checklistFlushInFlightRef = useRef<Record<string, boolean>>({});

  // 🧭 체크리스트 생성 시작 — classify/solve와 병렬로, 이미지 준비 완료 즉시 호출한다(problemText/OCR
  // 완료를 기다리지 않음). 결과는 로컬 state(analysis.solutionChecklist)에만 반영되고 DB에는 아직
  // 쓰지 않는다 — 실제 저장은 flushFirstChecklistSave가 solve 완료 후 담당한다.
  const startChecklistGeneration = (
    entry: MistakeEntry,
    image: { mimeType: string; base64Data: string },
    studentGrade: string | undefined
  ): Promise<void> => {
    setChecklistStatus(prev => ({ ...prev, [entry.id]: 'generating' }));
    checklistCheckedRef.current[entry.id] = {};
    checklistVersionRef.current[entry.id] = 0;
    delete checklistItemsRef.current[entry.id];
    // 방어적 초기화: "AI 분석 시작하기" 버튼은 실제로는 미분석 항목에만 노출되어 이미 firstSaveDone인
    // entry가 재진입할 일은 없지만, 만에 하나 재진입하더라도 이번 생성 결과가 다시 "첫 저장" 취급되게
    // 한다(그렇지 않으면 이번 phase 1 구간의 체크가 toggleChecklistItem에서 즉시 DB 쓰기 경로를 타서
    // classify/solve의 전체 덮어쓰기 저장과 충돌할 수 있다).
    checklistFirstSaveDoneRef.current[entry.id] = false;

    const applyLocalItems = (analysis: MistakeAnalysis | undefined, items: SolutionChecklistItem[]): MistakeAnalysis => ({
      ...(analysis ?? { solvingProcess: SOLVING_PLACEHOLDER_TEXT }),
      solutionChecklist: { items },
    });

    const promise = (async () => {
      const customTexts = await generateChecklistWithGemini(image, studentGrade, customAiName || '밤티');
      if (!customTexts) {
        setChecklistStatus(prev => ({ ...prev, [entry.id]: 'failed' }));
        return;
      }

      const items: SolutionChecklistItem[] = [
        ...FIXED_CHECKLIST_ITEMS,
        ...customTexts.map((text, i) => ({ id: `ai-${i}`, text, source: 'ai' as const, checked: false })),
      ];
      checklistItemsRef.current[entry.id] = items;

      // 로컬 프리뷰 반영 (id 가드 — solveStep의 onProgress 스트리밍과 동일한 패턴, 그 사이 학생이
      // 다른 카드로 전환했으면 selectedEntry는 건드리지 않는다)
      setMistakes(prev => prev.map(m => m.id === entry.id ? { ...m, analysis: applyLocalItems(m.analysis, items) } : m));
      setSelectedEntry(prev => prev && prev.id === entry.id ? { ...prev, analysis: applyLocalItems(prev.analysis, items) } : prev);

      setChecklistStatus(prev => {
        if (!(entry.id in prev)) return prev;
        const next = { ...prev };
        delete next[entry.id];
        return next;
      });
    })().catch(err => {
      console.error('체크리스트 생성 실패:', err);
      setChecklistStatus(prev => ({ ...prev, [entry.id]: 'failed' }));
    });

    checklistGenerationPromiseRef.current[entry.id] = promise;
    return promise;
  };

  // 🧭 첫 DB 저장 — solve의 마지막 DB 쓰기가 끝난 직후(오늘의 eager 체크포인트 저장과 동일한
  // 위치) 정확히 한 번 호출된다. 생성이 아직 안 끝났으면 기다리고, 저장 도중 학생이 체크를 바꾸면
  // (버전이 달라지면) 최신 스냅샷으로 한 번 더 저장한다 — 버전이 안정될 때까지만 반복(무한 루프 아님,
  // 인간 클릭 속도 대비 네트워크 왕복이 짧아 보통 1~2회 안에 수렴).
  const flushFirstChecklistSave = async (entry: MistakeEntry): Promise<void> => {
    if (checklistFlushInFlightRef.current[entry.id]) return;
    checklistFlushInFlightRef.current[entry.id] = true;

    try {
      await (checklistGenerationPromiseRef.current[entry.id] || Promise.resolve()).catch(() => {});
      if (!checklistItemsRef.current[entry.id]) return; // 생성 실패 — 저장할 것 없음(재시도 버튼으로 위임)

      while (true) {
        const startVersion = checklistVersionRef.current[entry.id] || 0;
        const items = checklistItemsRef.current[entry.id]!;
        const checkedSnapshot = checklistCheckedRef.current[entry.id] || {};
        const itemsWithChecked = items.map(it => ({ ...it, checked: !!checkedSnapshot[it.id] }));

        // 저장 직전 최신 analysis를 다시 읽어 병합 — classify/solve의 전체 덮어쓰기 저장 패턴과
        // 같은 이유로, 그 사이 바뀐 다른 필드(예: O/X 리뷰 체크)가 사라지지 않게 한다.
        const { data: freshRow, error: fetchError } = await supabase
          .from('mistakes')
          .select('analysis')
          .eq('id', entry.id)
          .single();

        if (fetchError || !freshRow) {
          console.error('Failed to refetch analysis before saving checklist:', fetchError);
          setChecklistStatus(prev => ({ ...prev, [entry.id]: 'failed' }));
          return;
        }

        const mergedAnalysis: MistakeAnalysis = {
          ...freshRow.analysis,
          solutionChecklist: { items: itemsWithChecked },
        };

        const { error: updateError } = await supabase
          .from('mistakes')
          .update({ analysis: mergedAnalysis })
          .eq('id', entry.id);

        if (updateError) {
          console.error('Failed to save checklist:', updateError);
          setChecklistStatus(prev => ({ ...prev, [entry.id]: 'failed' }));
          return;
        }

        const currentVersion = checklistVersionRef.current[entry.id] || 0;
        if (currentVersion === startVersion) {
          checklistFirstSaveDoneRef.current[entry.id] = true;
          setMistakes(prev => prev.map(m => m.id === entry.id ? { ...m, analysis: mergedAnalysis } : m));
          setSelectedEntry(prev => prev && prev.id === entry.id ? { ...prev, analysis: mergedAnalysis } : prev);
          return;
        }
        // 저장 도중 체크가 또 바뀜 — 같은 루프로 최신 스냅샷을 한 번 더 저장(수렴할 때까지)
      }
    } finally {
      checklistFlushInFlightRef.current[entry.id] = false;
    }
  };

  // 🧭 첫 저장 이후의 개별 체크 즉시 저장 — handleUpdateCheckpointStatus(레거시)와 동일한
  // fetch-merge-write 패턴.
  const persistChecklistItemStatus = async (entryId: string, itemId: string, checked: boolean) => {
    try {
      const { data: freshRow, error: fetchError } = await supabase
        .from('mistakes')
        .select('analysis')
        .eq('id', entryId)
        .single();

      if (fetchError) throw fetchError;

      const checklist = freshRow?.analysis?.solutionChecklist;
      if (!checklist) throw new Error('체크리스트를 찾을 수 없습니다.');

      const mergedAnalysis: MistakeAnalysis = {
        ...freshRow.analysis,
        solutionChecklist: {
          items: checklist.items.map((it: SolutionChecklistItem) => it.id === itemId ? { ...it, checked } : it),
        },
      };

      const { error: updateError } = await supabase
        .from('mistakes')
        .update({ analysis: mergedAnalysis })
        .eq('id', entryId);

      if (updateError) throw updateError;

      setMistakes(prev => prev.map(m => m.id === entryId ? { ...m, analysis: mergedAnalysis } : m));
      setSelectedEntry(prev => prev && prev.id === entryId ? { ...prev, analysis: mergedAnalysis } : prev);
    } catch (err: any) {
      console.error('체크리스트 상태 업데이트 실패:', err);
      showNoticeModal({
        title: '저장 실패',
        message: err.message || '체크리스트 상태를 저장하지 못했습니다.',
        badge: '오류',
        icon: '⚠️',
      });
    }
  };

  // 🧭 UI가 호출하는 단일 토글 핸들러 — 첫 저장 전이면 로컬 state만, 이후면 즉시 DB 저장까지.
  const toggleChecklistItem = (entryId: string, itemId: string) => {
    const nextChecked = !(checklistCheckedRef.current[entryId]?.[itemId] ?? false);
    checklistCheckedRef.current[entryId] = { ...(checklistCheckedRef.current[entryId] || {}), [itemId]: nextChecked };
    checklistVersionRef.current[entryId] = (checklistVersionRef.current[entryId] || 0) + 1;

    const applyToggle = (analysis: MistakeAnalysis | undefined): MistakeAnalysis | undefined => {
      if (!analysis?.solutionChecklist) return analysis;
      return {
        ...analysis,
        solutionChecklist: {
          items: analysis.solutionChecklist.items.map(it => it.id === itemId ? { ...it, checked: nextChecked } : it),
        },
      };
    };

    setMistakes(prev => prev.map(m => m.id === entryId ? { ...m, analysis: applyToggle(m.analysis) } : m));
    setSelectedEntry(prev => prev && prev.id === entryId ? { ...prev, analysis: applyToggle(prev.analysis) } : prev);

    if (checklistFirstSaveDoneRef.current[entryId]) {
      void persistChecklistItemStatus(entryId, itemId, nextChecked);
    }
  };

  // 🧭 생성 실패 후 "다시 시도" — 재생성 후 flush까지 이어서 호출한다(재생성이 성공하면 그 시점이
  // 곧 이 문제의 사실상 "첫 저장"이므로 동일한 안전한 저장 경로를 그대로 재사용).
  const retryChecklistGeneration = async (
    entry: MistakeEntry,
    image: { mimeType: string; base64Data: string },
    studentGrade: string | undefined
  ) => {
    await startChecklistGeneration(entry, image, studentGrade);
    await flushFirstChecklistSave(entry);
  };

  return {
    checklistStatus,
    startChecklistGeneration,
    flushFirstChecklistSave,
    toggleChecklistItem,
    retryChecklistGeneration,
  };
}
