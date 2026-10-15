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
