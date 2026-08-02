import React, { useState, useEffect } from 'react';

export interface FloatingPointItem {
  id: string;
  x: number;
  y: number;
  points: number;
  isBooster: boolean;
}

export const FloatingPointsContainer: React.FC = () => {
  const [items, setItems] = useState<FloatingPointItem[]>([]);

  useEffect(() => {
    const handleShowFloating = (e: CustomEvent<{ x: number; y: number; points: number; isBooster?: boolean }>) => {
      const { x, y, points, isBooster = false } = e.detail;
      if (!points || points === 0) return;

      const newItem: FloatingPointItem = {
        id: `${Date.now()}_${Math.random()}`,
        x,
        y,
        points,
        isBooster,
      };

      setItems((prev) => [...prev, newItem]);

      // 애니메이션(2.5초) 종료 후 자동 제거
      setTimeout(() => {
        setItems((prev) => prev.filter((item) => item.id !== newItem.id));
      }, 2500);
    };

    window.addEventListener('reviewnote_show_floating_points' as any, handleShowFloating as EventListener);
    return () => {
      window.removeEventListener('reviewnote_show_floating_points' as any, handleShowFloating as EventListener);
    };
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-[99999] overflow-hidden">
      {items.map((item) => {
        const isPositive = item.points > 0;
        const text = isPositive ? `+${item.points}점!` : `${item.points}점`;

        return (
          <div
            key={item.id}
            style={{
              left: `${item.x}px`,
              top: `${item.y}px`,
            }}
            className="absolute transform -translate-x-1/2 -translate-y-full animate-float-up-fade flex items-center space-x-1 select-none pointer-events-none"
          >
            <div
              className={`px-3 py-1 rounded-full font-black text-sm sm:text-base shadow-2xl flex items-center space-x-1 border backdrop-blur-md ${
                item.isBooster
                  ? 'bg-gradient-to-r from-amber-400 via-purple-500 to-pink-500 text-slate-950 border-amber-300 ring-4 ring-amber-400/40 animate-pulse'
                  : isPositive
                  ? 'bg-slate-900/90 text-amber-400 border-amber-500/50 shadow-amber-500/20'
                  : 'bg-slate-900/90 text-rose-400 border-rose-500/50'
              }`}
            >
              <span>{item.isBooster ? '⚡' : isPositive ? '✨' : '📉'}</span>
              <span className="font-mono tracking-tight">{text}</span>
              {item.isBooster && (
                <span className="text-[10px] bg-slate-950 text-amber-300 px-1.5 py-0.2 rounded-full font-extrabold ml-1">
                  5배!
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
