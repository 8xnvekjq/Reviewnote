export function buildQrLoginUrl(origin: string, token: string): string {
  const url = new URL('/', origin);
  url.searchParams.set('qr', token);
  return url.toString();
}

export function readQrParam(url: string): string | null {
  try { return new URL(url).searchParams.get('qr'); } catch { return null; }
}

export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, '');
}

export function stripQrParam(): string | null {
  const url = new URL(window.location.href);
  const token = readQrParam(url.href);
  if (url.searchParams.has('qr')) {
    url.searchParams.delete('qr');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  }
  return token;
}

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** 카메라로 읽은 QR 글자 → 로그인 토큰. 우리 사이트의 `/?qr=` 주소나 토큰 자체만 받는다(다른 QR은 무시). */
export function tokenFromScan(text: string, origin: string, knownHosts: readonly string[] = ['reviewnote.vercel.app']): string | null {
  const value = text.trim();
  if (TOKEN.test(value)) return value;
  try {
    const url = new URL(value);
    const host = url.host.toLowerCase();
    if (host !== new URL(origin).host.toLowerCase() && !knownHosts.includes(host)) return null;
    const token = url.searchParams.get('qr');
    return token && TOKEN.test(token) ? token : null;
  } catch { return null; }
}
