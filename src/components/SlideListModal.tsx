import React, { useMemo, useState } from "react";

interface SlideItem {
  title: string;
  filename: string;
  date: string; // YYYY-MM-DD (정렬 기준)
}

interface SlideListModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// 날짜로부터 "7월 3W" 형태의 주차 라벨을 자동 계산
// 월의 1일이 속한 주 기준으로 주차 산정 (ISO와 무관하게 1일 기준 단순 계산)
function getWeekLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  // 해당 월의 1일의 요일 (0=일, 1=월 ... 6=토)
  const firstDayOfMonth = new Date(d.getFullYear(), d.getMonth(), 1).getDay();
  // 1주차: 1일~첫 번째 토요일, 이후 7일 단위
  const weekNum = Math.ceil((day + firstDayOfMonth) / 7);
  const weekLabels = ["1W", "2W", "3W", "4W", "5W"];
  return `${month}월 ${weekLabels[Math.min(weekNum - 1, 4)]}`;
}

// 주차 라벨을 정렬 가능한 키로 변환 (예: "7월 3W" -> "07-3")
function weekLabelSortKey(label: string): string {
  const m = label.match(/(\d+)월 (\d+)W/);
  if (!m) return label;
  return `${String(m[1]).padStart(2, "0")}-${m[2]}`;
}

export const SlideListModal: React.FC<SlideListModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  // ── 수업 슬라이드 마스터 리스트 ──────────────────────────────────────
  // 새 자료 추가 시 이 배열에 한 줄만 추가하면 주차 자동 그루핑됩니다.
  const SLIDE_LIST: SlideItem[] = [
    // 7월 4W (7/22)
    { title: "개념원리 미적분1 - 01. 함수의 극한과 연속 (p31~47)", filename: "calculus1_limit_continuity_01.html", date: "2026-07-22" },
    { title: "개념원리 미적분1 - 02. 연속함수의 성질 (p51~55)", filename: "calculus1_continuous_functions_02.html", date: "2026-07-22" },
    { title: "개념원리 미적분1 - 03. 미분계수 (p58~68)", filename: "calculus1_derivative_03.html", date: "2026-07-22" },
    { title: "개념원리 공통수학2 - 02. 직선의 방정식 (p34~62)", filename: "math2_linear_equation_02.html", date: "2026-07-22" },
    // 7월 3W (7/18)
    { title: "I. 함수의 극한과 연속 - 04. 함수의 극한의 응용", filename: "math_limit_applications.html", date: "2026-07-18" },
    { title: "II. 함수의 극한과 연속 - 01. 함수의 연속", filename: "math_continuity_01.html", date: "2026-07-18" },
    { title: "개념원리 공통수학2 - 평면좌표 (내분점~무게중심)", filename: "math2_plane_coordinates.html", date: "2026-07-18" },
    { title: "2024학년도 수능 수학 14번 및 변형문제", filename: "2024_suneung_math_14.html", date: "2026-07-18" },
    { title: "2024학년도 수능 수학 미적분 27, 28번 및 변형문제", filename: "2024_suneung_calculus_27_28.html", date: "2026-07-18" },
    { title: "2024학년도 수능 수학 확률과 통계 30번 및 변형문제", filename: "2024_suneung_prob_stat_30.html", date: "2026-07-18" },
  ];

  // 주차 라벨별 자동 그루핑 (날짜 역순 → 최신 주차가 맨 위)
  const groupedSlides = useMemo(() => {
    const sorted = [...SLIDE_LIST].sort((a, b) => b.date.localeCompare(a.date));

    const groups: Record<string, SlideItem[]> = {};
    sorted.forEach(item => {
      const label = getWeekLabel(item.date);
      if (!groups[label]) groups[label] = [];
      groups[label].push(item);
    });

    // 라벨 정렬: 최신 주차 우선 (역순)
    const orderedLabels = Array.from(new Set(sorted.map(item => getWeekLabel(item.date))))
      .sort((a, b) => weekLabelSortKey(b).localeCompare(weekLabelSortKey(a)));

    return orderedLabels.map(label => ({ weekLabel: label, slides: groups[label] }));
  }, []);

  // 주차별 아코디언 열림/닫힘 (기본: 첫 번째=최신 주차만 열림)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const toggleGroup = (label: string) => {
    setOpenGroups(prev => ({ ...prev, [label]: prev[label] === false ? true : false }));
  };
  const isGroupOpen = (label: string, isFirst: boolean) => {
    if (label in openGroups) return openGroups[label];
    return isFirst;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-955/85 backdrop-blur-sm animate-fade-in">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-slate-900/90 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl animate-scale-up flex flex-col max-h-[85vh]">

        {/* Header */}
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

        {/* Body: 주차별 아코디언 */}
        <div className="p-4 overflow-y-auto space-y-3 flex-1 min-h-0 scrollbar-thin scrollbar-thumb-slate-800">
          {groupedSlides.map((group, groupIdx) => {
            const open = isGroupOpen(group.weekLabel, groupIdx === 0);
            return (
              <div key={group.weekLabel} className="rounded-2xl border border-slate-800/60 overflow-hidden bg-slate-950/30 animate-scale-up">

                {/* 주차 헤더 버튼 */}
                <button
                  onClick={() => toggleGroup(group.weekLabel)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800/30 transition-colors select-none"
                >
                  <div className="flex items-center space-x-3">
                    <span className="text-[11px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full tracking-wider font-mono">
                      📅 {group.weekLabel}
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

                {/* 슬라이드 목록 */}
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

        {/* Footer */}
        <div className="p-4 border-t border-slate-850/60 bg-slate-950/50 flex justify-end">
          <button onClick={onClose} className="px-5 py-2 rounded-xl bg-slate-950/80 hover:bg-slate-950 text-xs font-extrabold text-slate-400 hover:text-slate-200 border border-slate-850 hover:border-slate-800 transition-all">
            닫기
          </button>
        </div>

      </div>
    </div>
  );
};
