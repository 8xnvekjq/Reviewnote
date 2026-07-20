import React, { useMemo, useState } from "react";

interface SlideItem {
  title: string;
  filename: string;
  date: string;
  dateLabel: string;
}

interface SlideListModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SlideListModal: React.FC<SlideListModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const SLIDE_LIST: SlideItem[] = [
    { title: "개념원리 공통수학2 - 02. 직선의 방정식 (p34~62)", filename: "math2_linear_equation_02.html", date: "2026-07-21", dateLabel: "0721 MON" },
    { title: "I. 함수의 극한과 연속 - 04. 함수의 극한의 응용", filename: "math_limit_applications.html", date: "2026-07-18", dateLabel: "0718 SAT" },
    { title: "II. 함수의 극한과 연속 - 01. 함수의 연속", filename: "math_continuity_01.html", date: "2026-07-18", dateLabel: "0718 SAT" },
    { title: "개념원리 공통수학2 - 평면좌표 (내분점~무게중심)", filename: "math2_plane_coordinates.html", date: "2026-07-18", dateLabel: "0718 SAT" },
    { title: "2024학년도 수능 수학 14번 및 변형문제", filename: "2024_suneung_math_14.html", date: "2026-07-18", dateLabel: "0718 SAT" },
    { title: "2024학년도 수능 수학 미적분 27, 28번 및 변형문제", filename: "2024_suneung_calculus_27_28.html", date: "2026-07-18", dateLabel: "0718 SAT" },
    { title: "2024학년도 수능 수학 확률과 통계 30번 및 변형문제", filename: "2024_suneung_prob_stat_30.html", date: "2026-07-18", dateLabel: "0718 SAT" },
  ];

  const groupedSlides = useMemo(() => {
    const sorted = [...SLIDE_LIST].sort((a, b) => b.date.localeCompare(a.date));
    const groups: Record<string, SlideItem[]> = {};
    sorted.forEach(item => {
      if (!groups[item.dateLabel]) groups[item.dateLabel] = [];
      groups[item.dateLabel].push(item);
    });
    const orderedLabels = Array.from(new Set(sorted.map(item => item.dateLabel)));
    return orderedLabels.map(label => ({ dateLabel: label, slides: groups[label] }));
  }, []);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (label: string) => {
    setOpenGroups(prev => ({ ...prev, [label]: prev[label] === false ? true : false }));
  };

  const isGroupOpen = (label: string) => openGroups[label] !== false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-955/85 backdrop-blur-sm animate-fade-in">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-slate-900/90 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl animate-scale-up flex flex-col max-h-[85vh]">

        <div className="flex items-center justify-between p-5 border-b border-slate-800/80 bg-slate-950/40">
          <div className="flex items-center space-x-2.5">
            <span className="text-xl">🖥️</span>
            <div>
              <h3 className="text-sm font-extrabold text-white">더쿠키수학 핵심 수업자료</h3>
              <p className="text-[10px] text-slate-500 font-bold mt-0.5">선생님이 직접 제작하신 슬라이드 교안</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-950/60 hover:bg-slate-950 hover:text-white border border-slate-850 flex items-center justify-center text-slate-400 transition-colors text-xs font-bold">
            ✕
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-3 flex-1 min-h-0 scrollbar-thin scrollbar-thumb-slate-800">
          {groupedSlides.map((group) => {
            const open = isGroupOpen(group.dateLabel);
            return (
              <div key={group.dateLabel} className="rounded-2xl border border-slate-800/60 overflow-hidden bg-slate-950/30 animate-scale-up">

                <button
                  onClick={() => toggleGroup(group.dateLabel)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800/30 transition-colors select-none"
                >
                  <div className="flex items-center space-x-3">
                    <span className="text-[11px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full tracking-wider font-mono">
                      📅 {group.dateLabel}
                    </span>
                    <span className="text-[10px] text-slate-500 font-medium">슬라이드 {group.slides.length}개</span>
                  </div>
                  <span
                    className="text-slate-500 text-sm transition-transform duration-300 select-none"
                    style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)", display: "inline-block" }}
                  >
                    ▾
                  </span>
                </button>

                {open && (
                  <div className="px-3 pb-3 pt-1 grid gap-2 border-t border-slate-800/40">
                    {group.slides.map((slide, idx) => (
                      <a
                        key={idx}
                        href={`/slides/${slide.filename}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between p-3.5 bg-slate-955/40 hover:bg-slate-900/40 border border-slate-850 hover:border-emerald-500/30 rounded-xl transition-all duration-200 group active:scale-[0.99]"
                      >
                        <div className="flex items-center space-x-3.5 min-w-0">
                          <span className="text-xl flex-none select-none group-hover:scale-110 transition-transform">📄</span>
                          <div className="min-w-0 space-y-0.5">
                            <h4 className="text-xs font-bold text-slate-200 group-hover:text-emerald-400 transition-colors leading-snug break-keep">{slide.title}</h4>
                            <p className="text-[9px] text-slate-500 font-mono">{slide.filename}</p>
                          </div>
                        </div>
                        <span className="text-[10.5px] font-extrabold text-slate-400 group-hover:text-emerald-400 transition-colors flex items-center space-x-1 flex-none bg-slate-950/80 px-3 py-1.5 border border-slate-800 rounded-xl">
                          <span>View</span>
                          <span className="text-[9px]">▶</span>
                        </span>
                      </a>
                    ))}
                  </div>
                )}

              </div>
            );
          })}
        </div>

        <div className="p-4 border-t border-slate-850/60 bg-slate-950/50 flex justify-end">
          <button onClick={onClose} className="px-5 py-2 rounded-xl bg-slate-950/80 hover:bg-slate-950 text-xs font-extrabold text-slate-400 hover:text-slate-200 border border-slate-850 hover:border-slate-800 transition-all">
            닫기
          </button>
        </div>

      </div>
    </div>
  );
};
