import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabase';

export interface MistakeScaffolding {
  id: string;
  mistake_id: string;
  student_id: string;
  teacher_id: string;
  image_url: string;
  caption: string;
  created_at: string;
}

interface MistakeScaffoldingDrawerProps {
  mistakeId: string;
  studentId: string;
  currentUserId: string;
  isAdmin?: boolean;
}

export const MistakeScaffoldingDrawer: React.FC<MistakeScaffoldingDrawerProps> = ({
  mistakeId,
  studentId,
  currentUserId,
  isAdmin = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(false); // 📍 디폴트 접힘 상태
  const [scaffoldings, setScaffoldings] = useState<MistakeScaffolding[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [caption, setCaption] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // 📍 이미지 풀스크린 확대 (문제 사진과 동일한 pinch-to-zoom 방식)
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const touchStartRef = useRef({ x: 0, y: 0 });
  const initialDistanceRef = useRef(0);
  const initialScaleRef = useRef(1);
  const isDraggingRef = useRef(false);

  const drawerTopRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 스캐폴딩 힌트 사진 내역 로드
  const fetchScaffoldings = async () => {
    if (!mistakeId) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('mistake_scaffoldings')
        .select('*')
        .eq('mistake_id', mistakeId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setScaffoldings(data || []);
    } catch (err) {
      console.error('Failed to load scaffoldings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScaffoldings();
  }, [mistakeId]);

  // 펼쳤을 때 스크롤 위치 조절
  const handleToggleExpand = () => {
    const nextState = !isExpanded;
    setIsExpanded(nextState);
    if (nextState) {
      setTimeout(() => {
        drawerTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    }
  };

  // 선생님 전용: 힌트 사진 선택 & Base64 변환
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert('이미지 파일 크기는 10MB 이하이어야 합니다.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setPreviewImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // 선생님 전용: 스캐폴딩 사진 업로드 (SQL 데이터베이스 전송)
  // ── 핀치 줌 및 터치 드래그 제스처 핸들러 (문제 사진과 동일) ──
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1) {
      isDraggingRef.current = scale > 1;
      const touch = e.touches[0];
      touchStartRef.current = { x: touch.clientX - position.x, y: touch.clientY - position.y };
    } else if (e.touches.length === 2) {
      isDraggingRef.current = false;
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const distance = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      initialDistanceRef.current = distance;
      initialScaleRef.current = scale;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1 && isDraggingRef.current) {
      const touch = e.touches[0];
      const dx = touch.clientX - touchStartRef.current.x;
      const dy = touch.clientY - touchStartRef.current.y;
      const maxDragX = (scale - 1) * 200;
      const maxDragY = (scale - 1) * 300;
      const boundedX = Math.max(-maxDragX, Math.min(maxDragX, dx));
      const boundedY = Math.max(-maxDragY, Math.min(maxDragY, dy));
      setPosition({ x: boundedX, y: boundedY });
    } else if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const distance = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      if (initialDistanceRef.current > 0) {
        const factor = distance / initialDistanceRef.current;
        let newScale = initialScaleRef.current * factor;
        newScale = Math.max(1, Math.min(4.5, newScale));
        setScale(newScale);
        if (newScale === 1) setPosition({ x: 0, y: 0 });
      }
    }
  };

  const handleTouchEnd = () => {
    isDraggingRef.current = false;
    if (scale <= 1) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
    }
  };

  const openZoom = (url: string) => {
    setZoomImageUrl(url);
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const closeZoom = () => {
    setZoomImageUrl(null);
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  // 선생님 전용: 스캐폴딩 삭제
  const handleDeleteScaffolding = async (scaffoldingId: string) => {
    if (!isAdmin) return;
    const confirmed = window.confirm('이 스캐폴딩 힌트를 삭제하시겠습니까?');
    if (!confirmed) return;
    try {
      const { error } = await supabase
        .from('mistake_scaffoldings')
        .delete()
        .eq('id', scaffoldingId);
      if (error) throw error;
      setScaffoldings(prev => prev.filter(s => s.id !== scaffoldingId));
    } catch (err) {
      console.error('Failed to delete scaffolding:', err);
      alert('삭제에 실패했습니다. 다시 시도해 주세요.');
    }
  };

  const handleUploadScaffolding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!previewImage || uploading || !currentUserId || !mistakeId || !studentId) return;

    try {
      setUploading(true);

      const insertPayload = {
        mistake_id: mistakeId,
        student_id: studentId,
        teacher_id: currentUserId,
        image_url: previewImage,
        caption: caption.trim() || '선생님 풀이 힌트',
      };

      const { data, error } = await supabase
        .from('mistake_scaffoldings')
        .insert([insertPayload])
        .select()
        .single();

      if (error) throw error;

      if (data) {
        setScaffoldings(prev => [...prev, data]);
        setPreviewImage(null);
        setCaption('');
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    } catch (err) {
      console.error('Failed to upload scaffolding:', err);
      alert('스캐폴딩 사진 업로드에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setUploading(false);
    }
  };

  const formatDateString = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch {
      return '';
    }
  };

  return (
    <div ref={drawerTopRef} className="w-full bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-md my-3 scroll-mt-6">
      {/* ── 1. 접힘/펼침 토글 버튼 (디폴트: 접힘) ────────────────────── */}
      <button
        onClick={handleToggleExpand}
        className="w-full px-4 py-3 bg-slate-950/80 hover:bg-slate-850 flex items-center justify-between transition-colors text-left"
      >
        <div className="flex items-center space-x-2.5">
          <span className="text-base">🧩</span>
          <span className="text-xs font-black text-slate-200">
            Scaffolding(스캐폴딩)
          </span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
            {scaffoldings.length}개
          </span>
        </div>

        <div className="flex items-center space-x-1 text-slate-400 text-xs font-bold">
          <span>{isExpanded ? '접기' : '힌트 보기'}</span>
          <span className={`transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </div>
      </button>

      {/* ── 2. 펼침 상태 스캐폴딩 힌트 이미지 리스트 & 업로드 영역 ────── */}
      {isExpanded && (
        <div className="p-3.5 space-y-4 border-t border-slate-800 bg-slate-950/50 animate-fade-in">
          {/* 스캐폴딩 힌트 카드 리스트 */}
          {loading ? (
            <div className="text-center py-6 text-slate-500 text-xs">스캐폴딩 힌트를 불러오는 중...</div>
          ) : scaffoldings.length === 0 ? (
            <div className="text-center py-6 text-slate-500 text-xs space-y-1">
              <p>등록된 선생님 힌트 사진이 없습니다.</p>
              <p className="text-[11px] text-slate-600">선생님이 추가 손글씨 풀이나 단계별 스캐폴딩 힌트를 남기면 이곳에 표시됩니다. 🧩</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {scaffoldings.map((sc, idx) => (
                <div key={sc.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-3 space-y-2 shadow-sm">
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span className="font-black text-amber-400 flex items-center space-x-1">
                      <span>🧩</span>
                      <span>스캐폴딩 힌트 #{idx + 1}</span>
                    </span>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-slate-500">{formatDateString(sc.created_at)}</span>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => handleDeleteScaffolding(sc.id)}
                          className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-red-900/40 text-red-400 border border-red-700/40 hover:bg-red-700/60 hover:text-red-100 transition-all active:scale-95"
                        >
                          🗑 삭제
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 힌트 메모 (caption) */}
                  {sc.caption && (
                    <p className="text-xs font-semibold text-slate-200 bg-slate-950/60 p-2 rounded-xl border border-slate-850">
                      {sc.caption}
                    </p>
                  )}

                  {/* 힌트 사진 — 탭 시 풀스크린 확대 (문제사진과 동일) */}
                  <div
                    onClick={() => openZoom(sc.image_url)}
                    className="rounded-xl overflow-hidden border border-slate-800 bg-black flex justify-center relative cursor-zoom-in group/scimg"
                  >
                    <img
                      src={sc.image_url}
                      alt={`Scaffolding Hint #${idx + 1}`}
                      className="max-h-80 w-auto object-contain group-hover/scimg:opacity-90 transition-opacity"
                    />
                    <div className="absolute bottom-2 left-2 bg-slate-950/85 border border-slate-800/60 rounded-lg px-2 py-0.5 text-[9px] font-black text-amber-400 flex items-center space-x-1 shadow backdrop-blur select-none">
                      <span>💡 누르면 확대돼요!</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 선생님(어드민) 전용: 스캐폴딩 힌트 사진 업로드 폼 */}
          {isAdmin && (
            <form onSubmit={handleUploadScaffolding} className="space-y-3 pt-3 border-t border-slate-850">
              <span className="text-xs font-black text-amber-400 block">
                📷 힌트 사진 첨부 (스캐폴딩)
              </span>

              <div className="flex items-center space-x-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                  id={`scaffolding-file-input-${mistakeId}`}
                />
                <label
                  htmlFor={`scaffolding-file-input-${mistakeId}`}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-bold transition-all cursor-pointer flex-none"
                >
                  {previewImage ? '🖼️ 사진 변경' : '📷 힌트 사진 선택'}
                </label>
                <input
                  type="text"
                  value={caption}
                  onChange={e => setCaption(e.target.value)}
                  placeholder="힌트 메모 (예: 1단계 공식 적용)"
                  className="flex-1 bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 outline-none transition-colors"
                />
              </div>

              {/* 이미지 미리보기 및 전송 버튼 */}
              {previewImage && (
                <div className="space-y-2 pt-1 animate-fade-in">
                  <div className="relative w-32 h-32 rounded-xl overflow-hidden border border-amber-500/40 bg-black">
                    <img src={previewImage} alt="Preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setPreviewImage(null)}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center shadow"
                    >
                      ✕
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={uploading}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 disabled:opacity-40 text-slate-950 font-black text-xs transition-all shadow-md active:scale-95"
                  >
                    {uploading ? '스캐폴딩 전송 중...' : '🧩 스캐폴딩 힌트 전송하기 (SQL 서버 저장)'}
                  </button>
                </div>
              )}
            </form>
          )}
        </div>
      )}

      {/* 풀스크린 이미지 확대 모달 (문제 사진과 동일 — pinch-to-zoom + 터치 드래그 지원) */}
      {zoomImageUrl && (
        <div
          className="fixed inset-0 z-[100] bg-black/98 flex items-center justify-center animate-fade-in cursor-zoom-out"
          onClick={closeZoom}
        >
          <div
            className="absolute inset-0 flex items-center justify-center touch-none select-none"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <img
              src={zoomImageUrl}
              alt="확대된 스캐폴딩 힌트 이미지"
              className="max-w-full max-h-full object-contain pointer-events-none select-none"
              style={{
                transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              }}
            />
          </div>

          {/* 배율 표시 + 닫기 가이드 */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 select-none pointer-events-none">
            <span className="text-[9.5px] text-slate-400 font-extrabold bg-slate-950/85 px-4 py-1.5 rounded-full border border-slate-850 shadow-lg backdrop-blur-md">
              배율: {scale.toFixed(1)}x　·　탭하면 닫혀요
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
