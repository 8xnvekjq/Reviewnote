import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { groupSlidesBySection, SLIDE_HEIGHT, SLIDE_WIDTH, type LectureDeck } from '../features/lectures/lectureDecks';

interface LectureDeckViewerProps {
  deck: LectureDeck;
  /** 슬라이드 순서와 같은 서명 주소 목록 */
  urls: string[];
  onClose: () => void;
}

// 교재 슬라이드 전체 화면 보기. 가로 태블릿(갤럭시 탭 + S펜) 우선.
// 슬라이드 영역은 1920×1080 좌표계를 그대로 확대/축소하므로 이후 필기 레이어를 같은 상자에 겹치면 된다.
export const LectureDeckViewer: React.FC<LectureDeckViewerProps> = ({ deck, urls, onClose }) => {
  const [index, setIndex] = useState(0);
  const [tocOpen, setTocOpen] = useState(false);
  const [loaded, setLoaded] = useState<Record<number, boolean>>({});
  const total = deck.slides.length;
  const slide = deck.slides[index];
  const groups = useMemo(() => groupSlidesBySection(deck.slides), [deck.slides]);
  const go = useCallback((next: number) => setIndex(Math.max(0, Math.min(total - 1, next))), [total]);
  const currentItemRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); setIndex(i => Math.min(total - 1, i + 1)); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); setIndex(i => Math.max(0, i - 1)); }
      else if (e.key === 'Home') setIndex(0);
      else if (e.key === 'End') setIndex(total - 1);
      else if (e.key === 'Escape') { if (tocOpen) setTocOpen(false); else onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [total, tocOpen, onClose]);

  // 다음(과 이전) 슬라이드를 미리 받아 둔다.
  useEffect(() => {
    for (const i of [index + 1, index - 1, index + 2]) {
      if (i >= 0 && i < total && urls[i]) { const img = new Image(); img.decoding = 'async'; img.src = urls[i]; }
    }
  }, [index, total, urls]);

  useEffect(() => { if (tocOpen) currentItemRef.current?.scrollIntoView({ block: 'center' }); }, [tocOpen]);

  // 손가락 스와이프만 넘김으로 쓴다(S펜은 이후 필기용으로 남겨 둔다).
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch' || e.pointerType === 'mouse') swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const start = swipe.current; swipe.current = null;
    if (!start || start.id !== e.pointerId) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(index + (dx < 0 ? 1 : -1));
  };

  const pageText = (page: number | null) => page != null ? `교재 ${page}쪽` : '';

  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col bg-black text-white select-none" role="dialog" aria-modal="true" aria-label={`${deck.title} 슬라이드`}>
      {/* 상단 바 */}
      <div className="flex-none h-12 flex items-center gap-2 px-2 sm:px-3 bg-slate-950/95 border-b border-slate-800">
        <button onClick={onClose} aria-label="닫기" className="w-9 h-9 flex-none rounded-full bg-slate-900 border border-slate-800 text-slate-300 text-sm font-bold active:scale-95">✕</button>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] sm:text-xs font-black text-slate-100 truncate">{deck.title}</div>
          <div className="text-[10px] text-slate-400 truncate">{slide.section}{slide.section && slide.label ? ' · ' : ''}{slide.label}{slide.bookPage != null ? ` · ${pageText(slide.bookPage)}` : ''}</div>
        </div>
        {/* 이후 수업 녹화 단계의 펜 도구 모음 자리 */}
        <div data-slot="pen-toolbar" className="flex-none flex items-center gap-1" />
        <span data-testid="slide-counter" className="flex-none text-xs font-mono font-bold text-slate-300 px-1">{index + 1} / {total}</span>
        <button
          onClick={() => setTocOpen(open => !open)}
          aria-expanded={tocOpen}
          className={`flex-none h-9 px-3 rounded-xl text-xs font-black border active:scale-95 ${tocOpen ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-300'}`}
        >
          ☰ 목차
        </button>
      </div>

      <div className="flex-1 min-h-0 flex relative">
        {/* 슬라이드 무대: 16:9 유지, 남는 공간은 레터박스 */}
        <div
          className="flex-1 min-w-0 relative flex items-center justify-center touch-pan-y"
          style={{ containerType: 'size' }}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => { swipe.current = null; }}
        >
          <div
            data-testid="slide-stage"
            className="relative bg-white shadow-2xl"
            style={{ width: `min(100cqw, calc(100cqh * ${SLIDE_WIDTH} / ${SLIDE_HEIGHT}))`, aspectRatio: `${SLIDE_WIDTH} / ${SLIDE_HEIGHT}` }}
          >
            {urls[index] ? (
              <img
                key={index}
                src={urls[index]}
                alt={`${index + 1}번 슬라이드 ${slide.label}`}
                draggable={false}
                onLoad={() => setLoaded(prev => ({ ...prev, [index]: true }))}
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
              />
            ) : null}
            {!loaded[index] && (
              <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-xs font-bold">
                {urls[index] ? '불러오는 중…' : '슬라이드 주소를 만들지 못했습니다.'}
              </div>
            )}
          </div>

          <button
            onClick={() => go(index - 1)}
            disabled={index === 0}
            aria-label="이전 슬라이드"
            className="absolute left-1 sm:left-2 top-1/2 -translate-y-1/2 w-11 h-16 rounded-2xl bg-slate-900/70 border border-slate-700/60 text-xl font-black text-slate-200 disabled:opacity-20 active:scale-95"
          >
            ‹
          </button>
          <button
            onClick={() => go(index + 1)}
            disabled={index === total - 1}
            aria-label="다음 슬라이드"
            className="absolute right-1 sm:right-2 top-1/2 -translate-y-1/2 w-11 h-16 rounded-2xl bg-slate-900/70 border border-slate-700/60 text-xl font-black text-slate-200 disabled:opacity-20 active:scale-95"
          >
            ›
          </button>
        </div>

        {/* 목차: 넓은 화면은 오른쪽 칸, 휴대폰은 덮개 */}
        {tocOpen && (
          <>
            <div className="absolute inset-0 bg-black/50 sm:hidden" onClick={() => setTocOpen(false)} />
            <nav
              aria-label="목차"
              className="absolute sm:static right-0 top-0 bottom-0 w-[82%] max-w-xs sm:w-72 flex-none bg-slate-950 border-l border-slate-800 overflow-y-auto p-2 space-y-3"
            >
              {groups.map((group, gi) => (
                <div key={gi}>
                  {group.section && <div className="px-2 pt-1 pb-1.5 text-[11px] font-black text-amber-300">{group.section}</div>}
                  <div className="space-y-1">
                    {group.indexes.map(i => {
                      const item = deck.slides[i];
                      const current = i === index;
                      return (
                        <button
                          key={item.id}
                          ref={current ? currentItemRef : undefined}
                          aria-current={current ? 'true' : undefined}
                          onClick={() => { go(i); if (window.innerWidth < 640) setTocOpen(false); }}
                          className={`w-full text-left px-2.5 py-2 rounded-xl border flex items-center gap-2 ${current ? 'bg-indigo-600/25 border-indigo-500 text-white' : 'bg-slate-900/60 border-slate-850 text-slate-300 hover:border-slate-700'}`}
                        >
                          <span className="flex-none w-6 text-[10px] font-mono text-slate-500">{i + 1}</span>
                          <span className="flex-1 min-w-0 text-xs font-bold leading-snug break-keep">{item.label}</span>
                          {item.bookPage != null && <span className="flex-none text-[10px] text-slate-400">{pageText(item.bookPage)}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
};
