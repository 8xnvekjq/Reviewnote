import { useEffect, useRef, useState } from 'react';
import { tokenFromScan } from './helpers';

// 로그인 화면의 카메라 QR 읽기. 카메라 화면(픽셀)에서 QR을 해독해 로그인 토큰만 꺼낸다.
// 해독기: 브라우저 내장 BarcodeDetector(갤럭시탭 크롬 등) → 없으면 jsQR을 그때만 불러온다(아이패드 Safari, 윈도 크롬).
type Detector = { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> };
type DetectorCtor = { new(options: { formats: string[] }): Detector; getSupportedFormats?(): Promise<string[]> };

async function makeDecoder(): Promise<(video: HTMLVideoElement, canvas: HTMLCanvasElement) => Promise<string | null>> {
  const Native = (globalThis as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  if (Native) {
    try {
      const formats = await Native.getSupportedFormats?.();
      if (!formats || formats.includes('qr_code')) {
        const detector = new Native({ formats: ['qr_code'] });
        return async video => (await detector.detect(video))[0]?.rawValue ?? null;
      }
    } catch { /* 아래 jsQR로 */ }
  }
  const jsQR = (await import('jsqr')).default;
  return async (video, canvas) => {
    // 큰 카메라 화면은 줄여서 읽는다(QR은 화면의 큰 부분을 차지하니 640px이면 충분하고 훨씬 빠르다).
    const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
    const w = Math.round(video.videoWidth * scale), h = Math.round(video.videoHeight * scale);
    if (!w || !h) return null;
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);
    return jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' })?.data ?? null;
  };
}

function cameraError(error: unknown): string {
  const name = error && typeof error === 'object' && 'name' in error ? String((error as { name: string }).name) : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return '카메라 권한이 거절됐어요. 주소창의 자물쇠에서 카메라를 허용하거나, 아래에 코드를 입력해 주세요.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return '이 기기에서 카메라를 찾지 못했어요. 아래에 코드를 입력해 주세요.';
  return '카메라를 켜지 못했어요. 아래에 코드를 입력해 주세요.';
}

export function QrScanner({ onToken, onClose }: { onToken: (token: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  const [wrongQr, setWrongQr] = useState(false);
  const onTokenRef = useRef(onToken);
  useEffect(() => { onTokenRef.current = onToken; }, [onToken]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    const canvas = document.createElement('canvas');
    const stop = () => { stopped = true; window.clearTimeout(timer); stream?.getTracks().forEach(track => track.stop()); };
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new DOMException('unsupported', 'NotFoundError');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
        if (stopped) { stream.getTracks().forEach(track => track.stop()); return; }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play().catch(() => {});
        const decode = await makeDecoder();
        const tick = async () => {
          if (stopped) return;
          try {
            const text = video.readyState >= 2 ? await decode(video, canvas) : null;
            if (text) {
              const token = tokenFromScan(text, window.location.origin);
              if (token) { stop(); onTokenRef.current(token); return; }
              setWrongQr(true);
            }
          } catch { /* 이번 장면은 건너뛴다 */ }
          timer = window.setTimeout(() => void tick(), 200);
        };
        void tick();
      } catch (err) { if (!stopped) setError(cameraError(err)); }
    })();
    return stop;
  }, []);

  return (
    <div className="space-y-2" data-testid="qr-scanner">
      {error ? (
        <p role="alert" className="text-sm text-rose-300 break-keep">{error}</p>
      ) : (
        <>
          <div className="relative overflow-hidden rounded-xl bg-black aspect-square max-h-72 mx-auto">
            <video ref={videoRef} muted playsInline className="w-full h-full object-cover" aria-label="QR을 비추는 카메라 화면" />
            <div className="pointer-events-none absolute inset-[18%] rounded-2xl border-4 border-white/80" />
          </div>
          <p className="text-center text-xs text-slate-300 break-keep">
            {wrongQr ? '로그인 QR이 아니에요. 휴대폰의 ‘다른 기기 로그인 (QR)’ 화면을 비춰 주세요.' : '휴대폰의 QR을 네모 안에 비춰 주세요.'}
          </p>
        </>
      )}
      <button type="button" onClick={onClose} className="w-full rounded-xl bg-slate-800 py-2 text-sm text-slate-200">카메라 닫기</button>
    </div>
  );
}
