import { useEffect, useRef } from 'react';

/**
 * 안드로이드·브라우저 뒤로가기로 닫기. 마운트할 때 history 항목을 하나 쌓고, 뒤로가기면 onClose,
 * 다른 방법(닫기 버튼)으로 닫히면 쌓은 항목을 되돌린다. ExamImageViewer와 같은 방식이다
 * (StrictMode 즉시 재실행에서도 항목이 하나만 남도록 되돌리기는 microtask로 미룬다).
 */
export function useHistoryClose(stateKey: string, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const life = useRef({ active: false, token: '' });
  useEffect(() => {
    const state = life.current;
    state.active = true;
    if (!state.token || history.state?.[stateKey] !== state.token) {
      state.token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      history.pushState({ ...(history.state ?? {}), [stateKey]: state.token }, '');
    }
    const token = state.token;
    const pop = () => { if (history.state?.[stateKey] !== token) onCloseRef.current(); };
    window.addEventListener('popstate', pop);
    return () => {
      window.removeEventListener('popstate', pop);
      state.active = false;
      queueMicrotask(() => {
        if (!state.active && history.state?.[stateKey] === token) history.back();
      });
    };
  }, [stateKey]);
}
