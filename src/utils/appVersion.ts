// 오래 켜 둔 탭(특히 iPad·갤럭시 탭 홈 화면 앱)은 배포가 바뀌어도 예전 JS를 계속 돌린다.
// 배포된 index.html이 가리키는 진입 스크립트(/assets/index-<해시>.js)를 지금 돌고 있는 것과 비교해
// 새 버전이 나왔는지 알려 준다. 개발 서버(/src/main.tsx)에서는 비교할 해시가 없어 항상 false.

/** index.html 안 진입 모듈 스크립트 경로(/assets/... .js). 없으면 null. */
export function entryScriptPath(html: string): string | null {
  for (const match of html.matchAll(/<script\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/type\s*=\s*["']module["']/i.test(tag)) continue;
    const src = /src\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (src && /\/assets\/[^/]+\.js$/.test(src)) return new URL(src, 'https://x.invalid/').pathname;
  }
  return null;
}

/** 지금 페이지가 실행 중인 진입 스크립트 경로. */
export function runningEntryScriptPath(doc: Document = document): string | null {
  return entryScriptPath(Array.from(doc.querySelectorAll('script[type="module"][src]'), script => script.outerHTML).join(''));
}

/** 서버의 index.html이 다른 진입 스크립트를 가리키면 true. 네트워크 오류 등 확인 못 하면 false. */
export async function hasNewerBuild(): Promise<boolean> {
  const running = runningEntryScriptPath();
  if (!running) return false;
  try {
    const response = await fetch('/index.html', { cache: 'no-store' });
    if (!response.ok) return false;
    const deployed = entryScriptPath(await response.text());
    return !!deployed && deployed !== running;
  } catch { return false; }
}
