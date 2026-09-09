import { Component, Suspense } from 'react';
import type { ReactNode } from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
}

// PR9: AdminPanel/ScaffoldingPanel/GachaStore를 React.lazy로 지연 로드하면서 반드시 같이 넣어야
// 했던 안전장치. Suspense는 "로딩 중"만 처리하고, 청크 로드 자체의 실패(네트워크 오류, 또는 새
// 배포 이후 예전 index.html이 이미 지워진 옛 해시 청크를 가리키는 경우)는 처리하지 못한다 —
// 이 앱에는 최상위 ErrorBoundary가 전혀 없어서, 그런 실패가 그대로 앱 전체 화이트스크린으로
// 번질 위험이 있었다(Codex 반박 검증에서 지적됨). 화면 영역 안에서만 에러를 잡아 하단 네비게이션
// 등 나머지 UI는 그대로 유지하고, "새로고침"은 재시도 대신 페이지 전체를 다시 불러오게 한다 —
// 실패 원인이 배포 직후 해시 불일치라면 같은 청크를 다시 요청해도 똑같이 실패하므로, 최신
// index.html부터 새로 받아오는 편이 안전하다.
class LazyScreenErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[LazyScreenBoundary] failed to load screen chunk:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rn-empty" role="alert">
          <span className="text-3xl">⚠️</span>
          <p className="rn-caption">
            화면을 불러오지 못했습니다.<br />네트워크 상태를 확인한 뒤 다시 시도해 주세요.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="rn-button rn-button-primary"
          >
            새로고침
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const DEFAULT_FALLBACK = (
  <div className="rn-loading" role="status" aria-label="화면을 불러오는 중">
    <div className="rn-skeleton h-7 w-40" aria-hidden="true" />
    <div className="rn-skeleton rn-loading-card" aria-hidden="true" />
    <div className="rn-skeleton rn-loading-card" aria-hidden="true" />
    <p className="rn-caption">학습 공간을 준비하고 있어요…</p>
  </div>
);

interface LazyScreenBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

// 지연 로드 화면 하나를 이 컴포넌트로 감싸면 로딩 중(Suspense) + 로드 실패(ErrorBoundary)가
// 함께 처리된다. 화면마다 각자 에러 처리를 새로 만들지 않도록 하나로 통일했다.
export function LazyScreenBoundary({ children, fallback = DEFAULT_FALLBACK }: LazyScreenBoundaryProps) {
  return (
    <LazyScreenErrorBoundary>
      <Suspense fallback={fallback}>{children}</Suspense>
    </LazyScreenErrorBoundary>
  );
}
