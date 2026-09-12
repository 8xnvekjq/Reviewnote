import type { ReactNode } from 'react';

interface ScreenProps {
  when: boolean;
  children: ReactNode;
  /** Extra class appended to the screen-enter wrapper — e.g. a screen that needs to fill
   * .rn-main's height itself (Pixel Room) instead of the default shrink-to-fit/scroll behavior. */
  className?: string;
}

// 기존 App.tsx의 `{activeTab === 'x' && (...)}` 조건부 렌더 패턴을 그대로 옮긴 최소 래퍼.
// when이 false면 아무것도 렌더하지 않는다 — 원래 표현식과 동작이 완전히 동일하다. 새로운
// navigation state machine이 아니라, 기존 스위치 방식을 표현하는 얇은 문법적 대체일 뿐이다.
//
// PR8: when이 true가 될 때(= 이 화면이 새로 mount될 때)마다 screen-enter 클래스를 입힌 div로
// 한 번만 감싼다. React는 when이 false→true로 바뀌면 이 화면 전체를 새로 mount하므로(기존
// unmount 구조 그대로 유지, 두 화면을 동시에 렌더하는 구조 아님) CSS 애니메이션이 자동으로
// 매 진입마다 처음부터 재생된다 — 별도의 상태/타이머 없이 순수 CSS만으로 "짧게 나타나는" 효과.
export function Screen({ when, children, className }: ScreenProps) {
  if (!when) return null;
  return <div className={className ? `screen-enter ${className}` : 'screen-enter'}>{children}</div>;
}
