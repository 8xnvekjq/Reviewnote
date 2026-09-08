import { useCallback, useRef } from 'react';

// PR3(추가 필기장) 전용 최소 유틸 — 문제 위 필기창과 추가 필기장이 동시에 열려 있을 때, 두 창의
// 저장(raster export + Supabase INSERT)이 겹치지 않게 순서를 보장한다. 창이 최대 2개뿐이라
// 범용 큐 라이브러리 대신 promise 체인 하나로 충분하다 — 항상 "이전 저장이 끝난 뒤" 다음 저장이
// 시작된다. 대기 중인 창도 자기 자신의 isSaving을 계속 true로 유지해 "저장 중…" 표시가 끊기지
// 않게 하는 건 호출부(HandwritingOverlay.handleSave)의 책임이다 — runExclusiveSave(task)는
// task가 대기까지 포함해 완전히 끝날 때(성공/실패 모두)까지 반환하지 않는다.
export type RunExclusiveSave = (task: () => Promise<void>) => Promise<void>;

export function useSharedSaveLock(): RunExclusiveSave {
  const chainRef = useRef<Promise<void>>(Promise.resolve());

  return useCallback<RunExclusiveSave>((task) => {
    // 이전 작업이 성공했든 실패했든(then의 두 번째 인자로 같은 task를 넘겨) 다음 작업은 항상
    // 실행된다 — 한 창의 저장 실패가 다른 창의 대기를 영원히 막는(deadlock) 일이 없다.
    const run = chainRef.current.then(task, task);
    // 체인 자체는 항상 성공 상태로만 이어간다 — run의 실패는 호출자(run을 그대로 반환받는 쪽)의
    // try/catch가 처리하고, 체인 이어가기 목적으로는 실패 여부를 신경 쓰지 않는다.
    chainRef.current = run.then(() => undefined, () => undefined);
    return run;
  }, []);
}
