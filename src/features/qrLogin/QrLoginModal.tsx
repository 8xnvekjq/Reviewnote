import { useEffect, useRef, useState } from 'react';
import { Sheet } from '../../components/ui/Sheet';
import { createQrLoginToken, qrLoginTokenStatus, type QrLoginToken, type QrLoginStatus } from './api';
import { buildQrLoginUrl } from './helpers';

export function QrLoginModal({ onClose }: { onClose: () => void }) {
  const [token, setToken] = useState<QrLoginToken | null>(null);
  const [qr, setQr] = useState('');
  const [status, setStatus] = useState<QrLoginStatus>('pending');
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const generation = useRef({ value: 0 });
  const initial = useRef<Promise<QrLoginToken> | null>(null);

  async function generate(request: Promise<QrLoginToken>) {
    const version = ++generation.current.value;
    setLoading(true); setError(''); setToken(null); setQr(''); setStatus('pending');
    try {
      const value = await request;
      const { default: QRCode } = await import('qrcode');
      const image = await QRCode.toDataURL(buildQrLoginUrl(window.location.origin, value.token), { width: 320, margin: 4 });
      if (version !== generation.current.value) return;
      setToken(value); setQr(image); setNow(Date.now());
    } catch (err) {
      if (version === generation.current.value) setError(err instanceof Error ? err.message : 'QR을 만들 수 없어요.');
    } finally { if (version === generation.current.value) setLoading(false); }
  }

  useEffect(() => {
    const guard = generation.current;
    initial.current ??= createQrLoginToken();
    void generate(initial.current);
    return () => { guard.value++; };
  }, []);

  useEffect(() => {
    if (!token || status !== 'pending') return;
    let active = true;
    let polling = false;
    const clock = window.setInterval(() => setNow(Date.now()), 250);
    const timer = window.setInterval(async () => {
      if (polling) return;
      polling = true;
      try {
        const value = await qrLoginTokenStatus(token.id);
        if (active) { setStatus(value); setError(''); }
      } catch { if (active) setError('로그인 상태를 확인할 수 없어요. 잠시 기다려 주세요.'); }
      finally { polling = false; }
    }, 2000);
    return () => { active = false; clearInterval(clock); clearInterval(timer); };
  }, [token, status]);

  const remaining = token ? Math.max(0, Math.ceil((Date.parse(token.expires_at) - now) / 1000)) : 0;
  const expired = status === 'expired' || (!!token && remaining === 0);
  return <Sheet open onClose={onClose} title="다른 기기 로그인 (QR)">
    <div className="space-y-4 text-center text-slate-100" data-testid="qr-login-modal">
      <p className="text-sm text-amber-300">친구에게 보여주지 마세요 — 이 QR로 내 계정에 로그인돼요.</p>
      {loading && <p role="status">QR을 만들고 있어요…</p>}
      {status === 'used' ? <p role="status">다른 기기에서 로그인됐어요 ✓</p> : expired ? <p role="status">QR이 만료됐어요.</p> : token && <>
        <img src={qr} alt="다른 기기 로그인 QR 코드" className="mx-auto w-64 max-w-full rounded-xl" />
        <p className="font-mono text-3xl tracking-widest" data-testid="qr-login-code">{token.code.slice(0, 4)}-{token.code.slice(4)}</p>
        <p data-testid="qr-login-countdown">남은 시간 {remaining}초</p>
      </>}
      {error && <p role="alert" className="text-red-400">{error}</p>}
      {!loading && (expired || (!token && error)) && <button type="button" onClick={() => void generate(createQrLoginToken())} className="rounded-xl bg-indigo-600 px-6 py-3">새로 만들기</button>}
    </div>
  </Sheet>;
}
