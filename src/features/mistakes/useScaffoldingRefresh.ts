import { useEffect, useEffectEvent } from 'react';
import { supabase } from '../../services/supabase';

const REVIEW_COMPLETED_EVENT = 'reviewnote_scaffoldings_cleaned';

export function notifyScaffoldingCleanup(mistakeId: string) {
  window.dispatchEvent(new CustomEvent(REVIEW_COMPLETED_EVENT, { detail: mistakeId }));
}

// 복습 완료 직후(같은 기기) 최신 이미지를 다시 읽는다. 실시간 구독은 기본으로 끈다 — 선생님 화면이 학생 복습마다 이미지를 다시 받으면 트래픽이 크다.
export function useScaffoldingRefresh(refresh: () => void | Promise<void>, mistakeId?: string, realtime = false) {
  const refreshLatest = useEffectEvent(() => { void refresh(); });
  useEffect(() => {
    const onCompleted = (event: Event) => {
      if (!mistakeId || (event as CustomEvent<string>).detail === mistakeId) refreshLatest();
    };
    window.addEventListener(REVIEW_COMPLETED_EVENT, onCompleted);
    const channel = realtime ? supabase
      .channel(`scaffolding-refresh-${mistakeId || 'all'}-${crypto.randomUUID()}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'mistakes',
        ...(mistakeId ? { filter: `id=eq.${mistakeId}` } : {}),
      }, () => refreshLatest())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mistake_scaffoldings' }, () => refreshLatest())
      .subscribe() : null;
    return () => {
      window.removeEventListener(REVIEW_COMPLETED_EVENT, onCompleted);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [mistakeId, realtime]);
}
