import type { ReactNode } from 'react';

interface ScreenProps {
  when: boolean;
  children: ReactNode;
}

// 기존 App.tsx의 `{activeTab === 'x' && (...)}` 조건부 렌더 패턴을 그대로 옮긴 최소 래퍼.
// when이 false면 아무것도 렌더하지 않는다 — 원래 표현식과 동작이 완전히 동일하다. 새로운
// navigation state machine이 아니라, 기존 스위치 방식을 표현하는 얇은 문법적 대체일 뿐이다.
export function Screen({ when, children }: ScreenProps) {
  if (!when) return null;
  return <>{children}</>;
}
