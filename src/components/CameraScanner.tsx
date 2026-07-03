import React, { useRef, useState, useEffect } from 'react';

interface CameraScannerProps {
  onCapture: (imageUrl: string) => void;
  onClose: () => void;
}

export const CameraScanner: React.FC<CameraScannerProps> = ({ onCapture, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // streamRef always holds the latest stream so cleanup closures can access it
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [loading, setLoading] = useState(true);
  const [autoCapture, setAutoCapture] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Countdown timer effect for Auto-Capture
  useEffect(() => {
    if (!autoCapture) {
      setCountdown(null);
      return;
    }

    if (countdown === null) {
      setCountdown(5);
      return;
    }

    if (countdown === 0) {
      handleCapture();
      setAutoCapture(false);
      setCountdown(null);
      return;
    }

    const timer = setTimeout(() => {
      setCountdown(countdown - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [autoCapture, countdown]);

  // Helper to stop all tracks on a stream
  const stopStream = (s: MediaStream | null) => {
    if (s) s.getTracks().forEach((track) => track.stop());
  };

  // Initialize and start camera
  const startCamera = async () => {
    setLoading(true);
    setError(null);

    // Stop existing stream tracks if any
    stopStream(streamRef.current);

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = mediaStream; // always keep ref in sync

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err: any) {
      console.error('Camera capture init failed:', err);
      setError(
        '카메라 미디어 장치에 접근할 수 없습니다. 권한이 거부되었거나 지원하지 않는 기기/환경(HTTP 등)일 수 있습니다.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    startCamera();
    // Cleanup: use ref so closure always sees latest stream
    return () => {
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, [facingMode]);

  // Toggle Camera (front/back)
  const toggleCamera = () => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  // Capture frame from video and convert to Base64
  const handleCapture = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (context) {
        // Set canvas to match video actual resolution
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Draw current frame
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Convert canvas image to JPEG base64 string
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

        // ✅ Stop camera stream immediately after capture (removes iOS indicator)
        stopStream(streamRef.current);
        streamRef.current = null;

        onCapture(dataUrl);
      }
    }
  };

  // Fallback: file selection from gallery
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          onCapture(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col justify-between overflow-hidden">
      {/* Hidden canvas for capturing images */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Camera Top Bar */}
      <div className="absolute top-0 inset-x-0 z-50 safe-top bg-gradient-to-b from-black/80 to-transparent p-4 flex items-center justify-between">
        <button
          onClick={() => {
            stopStream(streamRef.current);
            streamRef.current = null;
            onClose();
          }}
          className="w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center text-white text-lg active:scale-90 transition-transform animate-scale-up"
        >
          ✕
        </button>
        <h2 className="text-sm font-bold text-white tracking-wider">문제 스캔</h2>
        <button
          onClick={() => setAutoCapture(!autoCapture)}
          className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all active:scale-95 ${autoCapture ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
        >
          {autoCapture ? '자동 촬영 ON (5초)' : '자동 촬영 OFF'}
        </button>
      </div>

      {/* Video Viewfinder with Custom Scanning Reticle */}
      <div className="relative flex-1 bg-black flex items-center justify-center">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center space-y-3 z-20 bg-slate-950">
            <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs text-slate-400">카메라 스트림 로딩 중...</p>
          </div>
        )}

        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center space-y-4 z-20 bg-slate-950">
            <div className="text-4xl">⚠️</div>
            <p className="text-sm text-slate-300 max-w-xs leading-relaxed">{error}</p>
            <label className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white cursor-pointer active:scale-95 transition-transform">
              갤러리에서 불러오기
              <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
            </label>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />

            {/* Target Reticle Overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-6">
              <div className="w-full max-w-sm aspect-[4/3] border border-white/20 rounded-2xl relative shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
                {/* Glowing corners */}
                <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-emerald-400 rounded-tl-xl animate-pulse"></div>
                <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-emerald-400 rounded-tr-xl animate-pulse"></div>
                <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-emerald-400 rounded-bl-xl animate-pulse"></div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-emerald-400 rounded-br-xl animate-pulse"></div>

                {/* Laser scan line effect */}
                <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent top-0 animate-[scan_2s_infinite_linear]"></div>

                {/* Countdown Overlay */}
                {countdown !== null && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-2xl">
                    <div className="text-6xl font-black text-emerald-400 animate-ping">
                      {countdown}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Camera Action Controls */}
      <div className="safe-bottom bg-slate-950 p-6 pb-8 flex items-center justify-between z-10">
        {/* Toggle Front/Back Camera */}
        <button
          onClick={toggleCamera}
          disabled={!!error || loading}
          className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 disabled:opacity-40 hover:bg-slate-800 active:scale-90 flex items-center justify-center text-white transition-all"
        >
          🔄
        </button>

        {/* Shutter Button */}
        <button
          onClick={handleCapture}
          disabled={!!error || loading}
          className="w-16 h-16 rounded-full border-4 border-white p-1 hover:scale-105 active:scale-95 disabled:opacity-40 transition-all flex items-center justify-center"
        >
          <div className="w-full h-full rounded-full bg-white shadow-lg"></div>
        </button>

        {/* Gallery Upload Alternate */}
        <label className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 hover:bg-slate-800 active:scale-90 flex items-center justify-center text-white cursor-pointer transition-all">
          🖼️
          <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
        </label>
      </div>

      {/* CSS Animation for laser scanner inside component or global styles */}
      <style>{`
        @keyframes scan {
          0% { top: 0%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
      `}</style>
    </div>
  );
};
