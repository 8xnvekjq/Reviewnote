import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { MistakeAnalysis, MistakeEntry } from '../../types';
import { resolveNeedsHelp } from '../../types';
import type { NoticeModalState } from '../../components/CustomNoticeModal';
import { supabase } from '../../services/supabase';
import { generateSolutionCheckpointsWithGemini } from '../../services/gemini';

interface UseCheckpointGenerationParams {
  // selectedEntry는 이 훅이 소유하지 않는다 — 레거시 lazy 생성 트리거 판단에만 읽기 전용으로
  // 쓰인다. mistakes 배열/선택된 엔트리 자체의 소유권은 그대로 App.tsx(추후 mistakes feature)에
  // 남는다.
  selectedEntry: MistakeEntry | null;
  setMistakes: Dispatch<SetStateAction<MistakeEntry[]>>;
  setSelectedEntry: Dispatch<SetStateAction<MistakeEntry | null>>;
  showNoticeModal: (info: Omit<NoticeModalState, 'isOpen'>) => void;
}

// 단계형 풀이 체크리스트(solutionCheckpoints) 생성·재생성·상태 갱신을 담당하는 훅. App.tsx에
// 있던 것을 그대로 옮긴 것으로, 기존 안전장치(세대 카운터, in-flight Promise 공유, 세션 내
// 실패 캐시, 저장 직전 최신 DB 재조회·병합, checkpointStuckLog append-only)를 전혀 바꾸지
// 않았다.
export function useCheckpointGeneration({
  selectedEntry,
  setMistakes,
  setSelectedEntry,
  showNoticeModal,
}: UseCheckpointGenerationParams) {
  // generateAndSaveSolutionCheckpoints의 중복 실행 가드용(같은 이유로 ref 사용 — state/클로저는
  // 이 함수가 신규 분석 직후 fire-and-forget으로도, 상세 모달 open 시 lazy로도, 정리하기(초기화)
  // 재생성으로도 호출될 수 있어 같은 문제에 대해 겹쳐 호출될 여지가 있다). 문제 id별로 "지금
  // 진행 중인 요청이 어느 세대(checkpointGenerationRef)의 것인지"까지 함께 기억해 둔다 —
  // 같은 세대의 중복 호출은 Gemini를 또 부르지 않고 그 Promise를 그대로 재사용하고, 정리하기로
  // 세대가 올라간 뒤 들어온 새 호출은 기존 요청이 끝나길 기다렸다가 그제서야 자신의 세대로 다시
  // 시도한다(Gemini 동시 중복 호출 없이도 최신 세대 요청이 결국 반영되도록). DB 재확인(아래 함수
  // 본문)으로 한 번 더 방지한다.
  const checkpointGenerationInFlightRef = useRef<Record<string, { generation: number; promise: Promise<boolean> }>>({});
  // lazy 생성이 실패한 문제 id를 이 세션(탭) 동안만 기억해, 같은 문제를 열었다 닫았다
  // 반복할 때마다 Gemini를 매번 재호출하는 비용 낭비를 막는다. 메모리에만 있고 저장/영속화하지
  // 않으므로 새로고침·재로그인·다른 탭에서는 자유롭게 다시 시도된다 — 영구 잠금 아님.
  const checkpointGenerationFailedIdsRef = useRef<Set<string>>(new Set());
  // "정리하기"(집중 오답 초기화)로 체크리스트를 다시 만들 때, 그 전에 이미 진행 중이던(예: 최초
  // 분석 직후 eager) 생성 요청이 뒤늦게 끝나면서 초기화 이후 상태를 덮어쓰는 걸 막기 위한 세대
  // 번호. 초기화 시 이 값을 올리면, 그보다 낮은 세대에서 시작된 생성 요청은 결과를 저장하지 않고
  // 스스로 폐기한다(generateAndSaveSolutionCheckpoints 본문 참고).
  const checkpointGenerationRef = useRef<Record<string, number>>({});
  // 정리하기(초기화) 이후 체크리스트 재생성의 진행 상태 — 카드/상세 모달에 표시하기 위한
  // React state(ref가 아님: 렌더로 드러나야 하는 UI 상태라서). 성공 상태는 잠깐 보여준 뒤
  // 자동으로 지운다(엔트리 자체를 지움 = 평소 카드로 복귀).
  const [checkpointRegenStatus, setCheckpointRegenStatus] = useState<Record<string, 'generating' | 'success' | 'failed'>>({});

  // 🧭 단계형 풀이 체크리스트 생성 — 신규(solveStep 직후 eager)와 레거시 needsHelp 문제(상세
  // 모달을 열 때 lazy) 양쪽에서 동일하게 재사용하는 단일 함수. 이미 있으면(캐시) 재생성하지 않는다.
  // 반환값은 "결과적으로 solutionCheckpoints가 유효하게 존재하는가"(성공 여부) — 정리하기(초기화)
  // 재생성 흐름이 성공/실패 UI를 표시하려면 이 결과를 알아야 한다. 성공 기준은 Gemini 응답이 아니라
  // DB 저장 완료(또는 이미 다른 경로로 저장되어 있음)다.
  const generateAndSaveSolutionCheckpoints = async (entry: MistakeEntry): Promise<boolean> => {
    if (entry.analysis?.solutionCheckpoints) return true; // 이미 캐시돼 있음 = 이미 성공한 상태
    if (!entry.analysis?.problemText || !entry.analysis?.solvingProcess) return false; // 재료 미비(분석 미완료)

    // 이 호출 시작 시점의 세대를 기억해둔다 — 정리하기(초기화)가 이 세대 번호를 올리면, 이 호출은
    // (뒤늦게 응답이 와도) 더 이상 최신이 아니므로 결과를 저장하지 않고 조용히 스스로 폐기한다.
    const myGeneration = checkpointGenerationRef.current[entry.id] || 0;

    const inFlight = checkpointGenerationInFlightRef.current[entry.id];
    if (inFlight) {
      if (inFlight.generation === myGeneration) {
        // 완전히 같은 세대의 겹친 호출(예: 신규 분석 직후 eager와 모달 open lazy가 거의 동시에
        // 발생) — Gemini를 또 부르지 않고 이미 진행 중인 그 요청의 결과를 그대로 재사용한다.
        return inFlight.promise;
      }
      // 더 오래된 세대의 요청이 아직 진행 중(예: 레거시 문제를 열자마자 시작된 lazy 생성이 끝나기
      // 전에 정리하기를 눌러 세대가 올라간 경우) — 새 Gemini 호출을 겹쳐 띄우지 않고 그 요청이
      // 끝나길 기다린 뒤, 그래도 내가 여전히 최신 세대이면 그제서야 내 몫의 새 요청을 시작한다.
      await inFlight.promise.catch(() => {});
      if ((checkpointGenerationRef.current[entry.id] || 0) !== myGeneration) return false; // 기다리는 사이 또 새치기당함
    }

    const run = (async (): Promise<boolean> => {
      try {
        const checkpointStages = await generateSolutionCheckpointsWithGemini(
          entry.analysis!.problemText!,
          entry.analysis!.solvingProcess!
        );
        if (!checkpointStages) {
          // 생성 실패/품질 검증 실패 — 조용히 폴백(기존 정석 풀이만 노출). 이 세션 동안은 같은
          // 문제를 다시 열어도 자동 재호출하지 않는다(비용 낭비 방지) — 영구 잠금은 아니라서
          // 새로고침/재로그인하면 다시 시도된다.
          checkpointGenerationFailedIdsRef.current.add(entry.id);
          return false;
        }

        // 세대 확인: 이 호출이 진행되는 동안 정리하기(초기화)로 새 세대가 시작됐으면, 이 결과는
        // 이제 무의미하므로 저장하지 않고 폐기한다 — "이전 요청 결과가 초기화 이후 저장되는" 것 방지.
        if ((checkpointGenerationRef.current[entry.id] || 0) !== myGeneration) return false;

        // 🛡️ background/lazy로 시간이 걸리는 호출이라, 그 사이 학생이 복습 체크·정리하기·대책 작성
        // 등으로 analysis를 바꿨을 수 있다. 함수 시작 시 캡처해둔 entry.analysis는 stale할 수
        // 있으므로, 저장 직전에 DB에서 analysis를 다시 읽어 그 위에 병합한다(classifyStep이 예전에
        // analysis를 통째로 덮어써서 reviewLog 등이 사라지던 것과 같은 종류의 버그를 여기서도 막음).
        const { data: freshRow, error: fetchError } = await supabase
          .from('mistakes')
          .select('analysis')
          .eq('id', entry.id)
          .single();

        if (fetchError || !freshRow) {
          console.error('Failed to refetch analysis before saving solution checkpoints:', fetchError);
          checkpointGenerationFailedIdsRef.current.add(entry.id);
          return false;
        }

        // 재조회 사이에도 새 세대가 시작될 수 있으므로 저장 직전에 한 번 더 확인한다.
        if ((checkpointGenerationRef.current[entry.id] || 0) !== myGeneration) return false;

        // 그 사이 다른 경로(다른 탭, 겹친 호출 등)로 이미 생성/저장됐으면 중복 저장하지 않는다.
        // (성공한 경우이므로 실패 마킹은 하지 않는다)
        if (freshRow.analysis?.solutionCheckpoints) return true;

        const mergedAnalysis: MistakeAnalysis = {
          ...freshRow.analysis,
          solutionCheckpoints: checkpointStages,
        };

        const { error: updateError } = await supabase
          .from('mistakes')
          .update({ analysis: mergedAnalysis })
          .eq('id', entry.id);

        if (updateError) {
          console.error('Failed to save solution checkpoints:', updateError);
          checkpointGenerationFailedIdsRef.current.add(entry.id);
          return false;
        }

        setMistakes(prev => prev.map(m => m.id === entry.id ? { ...m, analysis: mergedAnalysis } : m));
        setSelectedEntry(prev => prev && prev.id === entry.id ? { ...prev, analysis: mergedAnalysis } : prev);
        return true;
      } finally {
        if (checkpointGenerationInFlightRef.current[entry.id]?.generation === myGeneration) {
          delete checkpointGenerationInFlightRef.current[entry.id];
        }
      }
    })();

    checkpointGenerationInFlightRef.current[entry.id] = { generation: myGeneration, promise: run };
    return run;
  };

  // 🧭 정리하기(초기화) 이후의 체크리스트 재생성 + 진행 상태 표시를 하나로 묶은 헬퍼 — 초기화
  // 트리거와 "다시 시도" 버튼이 동일하게 재사용한다. 세대 번호를 먼저 올려서, 이전에 떠 있던
  // (초기화 전 시작된) 생성 요청이 뒤늦게 끝나도 결과를 저장하지 않도록 한다. 세대가 올라간
  // 상태에서 이전 요청이 아직 진행 중이어도, generateAndSaveSolutionCheckpoints 자체가 세대별
  // in-flight Promise를 추적해 새 Gemini 호출을 겹쳐 띄우지 않으면서 이전 요청이 끝나는 대로
  // 이 최신 세대의 요청을 이어서 실행하므로, 여기서는 항상 그대로 호출하면 된다.
  const regenerateCheckpointsWithProgress = (entry: MistakeEntry) => {
    const id = entry.id;
    checkpointGenerationRef.current[id] = (checkpointGenerationRef.current[id] || 0) + 1;
    setCheckpointRegenStatus(prev => ({ ...prev, [id]: 'generating' }));
    generateAndSaveSolutionCheckpoints(entry)
      .then(success => {
        setCheckpointRegenStatus(prev => ({ ...prev, [id]: success ? 'success' : 'failed' }));
        if (success) {
          // "✓ 새로운 진단이 준비됐어요"를 잠깐 보여준 뒤 일반 카드로 복귀
          setTimeout(() => {
            setCheckpointRegenStatus(prev => {
              if (prev[id] !== 'success') return prev; // 그 사이 다시 재시도됐다면 건드리지 않음
              const next = { ...prev };
              delete next[id];
              return next;
            });
          }, 2500);
        }
      })
      .catch(err => {
        console.error('Failed to regenerate solution checkpoints:', err);
        setCheckpointRegenStatus(prev => ({ ...prev, [id]: 'failed' }));
      });
  };

  // 🧭 단계형 풀이 체크포인트 상태 갱신("이해했어요"/"여기서 막혔어요") — O/X/★ 복습 체크와
  // 동일하게 클릭 즉시 저장한다. stuck을 선택할 때만 checkpointStuckLog에 append(understood는
  // 기록하지 않음 — 통계는 "막혔던 적이 있는지"만 본다. 재선택으로 stuck→understood가 되어도
  // 이 로그 자체는 지우지 않는다).
  const handleUpdateCheckpointStatus = async (
    id: string,
    stageIndex: number,
    checkpointIndex: number,
    newStatus: 'understood' | 'stuck'
  ) => {
    try {
      // generateAndSaveSolutionCheckpoints와 동일한 이유로, 저장 직전에 최신 analysis를 다시 읽어
      // 그 위에 병합한다(그 사이 다른 필드가 바뀌었을 수 있음).
      const { data: freshRow, error: fetchError } = await supabase
        .from('mistakes')
        .select('analysis')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      const stages = freshRow?.analysis?.solutionCheckpoints as MistakeAnalysis['solutionCheckpoints'];
      if (!stages || !stages[stageIndex] || !stages[stageIndex].checkpoints[checkpointIndex]) {
        throw new Error('체크리스트를 찾을 수 없습니다.');
      }

      const targetCheckpoint = stages[stageIndex].checkpoints[checkpointIndex];
      const updatedStages = stages.map((stageEntry, si) => {
        if (si !== stageIndex) return stageEntry;
        return {
          ...stageEntry,
          checkpoints: stageEntry.checkpoints.map((cp, ci) =>
            ci === checkpointIndex ? { ...cp, status: newStatus } : cp
          )
        };
      });

      const existingStuckLog = freshRow.analysis?.checkpointStuckLog || [];
      const updatedStuckLog = newStatus === 'stuck'
        ? [...existingStuckLog, {
            date: new Date().toISOString(),
            stage: stages[stageIndex].stage,
            stageType: targetCheckpoint.stageType
          }]
        : existingStuckLog;

      const mergedAnalysis: MistakeAnalysis = {
        ...freshRow.analysis,
        solutionCheckpoints: updatedStages,
        checkpointStuckLog: updatedStuckLog,
      };

      const { error: updateError } = await supabase
        .from('mistakes')
        .update({ analysis: mergedAnalysis })
        .eq('id', id);

      if (updateError) throw updateError;

      setMistakes(prev => prev.map(m => m.id === id ? { ...m, analysis: mergedAnalysis } : m));
      setSelectedEntry(prev => prev && prev.id === id ? { ...prev, analysis: mergedAnalysis } : prev);
    } catch (err: any) {
      console.error('체크포인트 상태 업데이트 실패:', err);
      showNoticeModal({
        title: '저장 실패',
        message: err.message || '체크포인트 상태를 저장하지 못했습니다.',
        badge: '오류',
        icon: '⚠️',
      });
    }
  };

  // 🧭 레거시 needsHelp 문제 lazy 생성 — 상세 모달을 열 때(selectedEntry 변경) checkpoint가
  // 없으면 그 순간 1회 생성. 신규 문제는 solveStep에서 이미 eager로 생성되므로 보통 이 경로를
  // 타지 않는다(생성 함수 자체의 캐시 가드 덕에 겹쳐 호출돼도 안전). 이전 시도가 이 세션에서
  // 이미 실패했으면 재호출하지 않는다(checkpointGenerationFailedIdsRef, 비용 낭비 방지).
  //
  // deps를 selectedEntry?.id로만 좁힌 것은 누락이 아니라 의도된 선택이다:
  // - 이 lazy 경로가 대상으로 삼는 "이미 오래전에 분석 완료된 needsHelp 레거시 문제"는 모달을 여는
  //   시점에 reviews/needsHelp/problemText/solvingProcess가 전부 이미 안정적으로 채워져 있다
  //   (스트리밍 중인 신규 분석과 달리 이후에 이 필드들이 바뀔 일이 없다) — 그래서 이 조건들을
  //   deps에 추가로 넣어도 "더 최신 값을 반영"할 기회가 실질적으로 생기지 않는다.
  //   반대로 넣으면 review 체크·정리하기 등 이 문제와 무관해 보이는 변경에도 매번 재실행되어
  //   더 시끄러워지기만 한다.
  // - 설령 클로저가 오래된 selectedEntry를 참조하더라도, 실제 호출 대상인
  //   generateAndSaveSolutionCheckpoints 자체가 저장 직전 DB를 다시 읽어 병합하고
  //   (checkpointGenerationInFlightRef로) 동시 중복 실행도 막아주므로, 이 effect가 약간 오래된
  //   스냅샷으로 호출해도 데이터 유실이나 중복 저장으로 이어지지 않는다.
  // 즉 selectedEntry.id가 바뀔 때 "이 문제를 처음 열었는지"만 판단하면 충분하고 안전하다.
  useEffect(() => {
    if (!selectedEntry) return;
    if (checkpointGenerationFailedIdsRef.current.has(selectedEntry.id)) return;
    if (!resolveNeedsHelp(selectedEntry.reviews, selectedEntry.analysis?.needsHelp)) return;
    if (selectedEntry.analysis?.solutionCheckpoints) return;
    // 체크리스트 2.0(solutionChecklist)로 이미 생성된 신규 레코드는 구버전 4단계 체크포인트를
    // 또 만들 필요가 없다 — 신규 분석은 항상 solutionChecklist를 먼저 갖게 되므로, 이 레거시
    // lazy 경로는 그 이전(체크리스트 2.0 이전)에 만들어진 needsHelp 레코드만 대상으로 한다.
    if (selectedEntry.analysis?.solutionChecklist) return;
    if (!selectedEntry.analysis?.problemText || !selectedEntry.analysis?.solvingProcess) return;

    generateAndSaveSolutionCheckpoints(selectedEntry).catch(err => {
      console.error('Failed to lazily generate solution checkpoints:', err);
    });
  }, [selectedEntry?.id]);

  return {
    checkpointRegenStatus,
    generateAndSaveSolutionCheckpoints,
    regenerateCheckpointsWithProgress,
    handleUpdateCheckpointStatus,
  };
}
