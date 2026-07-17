import React, { useMemo } from 'react';

interface SlideItem {
  title: string;
  filename: string;
  date: string;       // YYYY-MM-DD 포맷 (역순 정렬 기준용)
  dateLabel: string;  // 화면에 렌더링할 헤더 라벨 (예: "0718 SAT")
}

interface SlideListModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SlideListModal: React.FC<SlideListModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  // 전체 핵심 수업 슬라이드 데이터베이스 마스터 리스트 (이후 데이터가 추가되면 여기에 단순 기입만 하면 자동 정렬 및 그루핑됩니다)
  const SLIDE_LIST: SlideItem[] = [
    { title: 'I. 함수의 극한과 연속 - 04. 함수의 극한의 응용', filename: 'math_limit_applications.html', date: '2026-07-18', dateLabel: '0718 SAT' },
    { title: 'II. 함수의 극한과 연속 - 01. 함수의 연속', filename: 'math_continuity_01.html', date: '2026-07-18', dateLabel: '0718 SAT' },
    { title: '개념원리 공통수학2 - 평면좌표 (내분점~무게중심)', filename: 'math2_plane_coordinates.html', date: '2026-07-18', dateLabel: '0718 SAT' },
    { title: '2024학년도 수능 수학 14번 및 변형문제', filename: '2024_suneung_math_14.html', date: '2026-07-18', dateLabel: '0718 SAT' },
    { title: '2024학년도 수능 수학 미적분 27, 28번 및 변형문제', filename: '2024_suneung_calculus_27_28.html', date: '2026-07-18', dateLabel: '0718 SAT' },
    { title: '2024학년도 수능 수학 확률과 통계 30번 및 변형문제', filename: '2024_suneung_prob_stat_30.html', date: '2026-07-18', dateLabel: '0718 SAT' },
  ];

  // 확장성 및 유지보수성을 극대화한 자동 날짜별 그루핑 연산
  const groupedSlides = useMemo(() => {
    // 1. 날짜 역순 정렬 (최신 수업이 항상 맨 위로 노출)
    const sorted = [...SLIDE_LIST].sort((a, b) => b.date.localeCompare(a.date));

    // 2. 날짜 라벨별 그루핑 수행
    const groups: Record<string, SlideItem[]> = {};
    sorted.forEach(item => {
      if (!groups[item.dateLabel]) {
        groups[item.dateLabel] = [];
      }
      groups[item.dateLabel].push(item);
    });

    // 3. 정렬 순서를 유지한 중복 없는 라벨 리스트 생성
    const orderedLabels = Array.from(new Set(sorted.map(item => item.dateLabel)));

    // 4. 최종 그룹화된 배열 구조화 반환
    return orderedLabels.map(label => ({
      dateLabel: label,
      slides: groups[label]
    }));
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-955/85 backdrop-blur-sm animate-fade-in">
      {/* 아웃사이드 클릭 시 자동 닫힘 */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* 모달 윈도우 */}
      <div className="relative w-full max-w-lg bg-slate-900/90 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl animate-scale-up flex flex-col max-h-[85vh]">
        
        {/* 1. Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800/80 bg-slate-950/40">
          <div className="flex items-center space-x-2.5">
            <span className="text-xl">🖥️</span>
            <div>
              <h3 className="text-sm font-extrabold text-white">더쿠키수학 핵심 수업자료</h3>
              <p className="text-[10px] text-slate-500 font-bold mt-0.5">선생님이 직접 제작하신 슬라이드 교안</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-950/60 hover:bg-slate-950 hover:text-white border border-slate-850 flex items-center justify-center text-slate-400 transition-colors text-xs font-bold"
          >
            ✕
          </button>
        </div>

        {/* 2. Grouped List Body */}
        <div className="p-5 overflow-y-auto space-y-6 flex-1 min-h-0 scrollbar-thin scrollbar-thumb-slate-800">
          {groupedSlides.map((group) => (
            <div key={group.dateLabel} className="space-y-3.5 animate-scale-up">
              
              {/* 날짜 그루핑 구분 헤더 (0718 SAT 등) */}
              <div className="flex items-center space-x-3 select-none">
                <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full tracking-wider font-mono shadow-sm">
                  📅 {group.dateLabel}
                </span>
                <div className="h-[1px] flex-grow bg-gradient-to-r from-slate-800 to-transparent" />
              </div>

              {/* 하위 슬라이드 리스트 (가지치기 계층 구조 표현: pl-2 border-l border-slate-800/60 ml-6) */}
              <div className="grid gap-2.5 pl-2 border-l border-slate-850 ml-5">
                {group.slides.map((slide, idx) => (
                  <a
                    key={idx}
                    href={`/slides/${slide.filename}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-3.5 bg-slate-955/40 hover:bg-slate-900/40 border border-slate-850 hover:border-emerald-500/30 rounded-2xl transition-all duration-200 group active:scale-[0.99]"
                  >
                    <div className="flex items-center space-x-3.5 min-w-0">
                      <span className="text-xl flex-none select-none group-hover:scale-110 transition-transform">📄</span>
                      <div className="min-w-0 space-y-0.5">
                        <h4 className="text-xs font-bold text-slate-200 group-hover:text-emerald-400 transition-colors leading-snug break-keep">
                          {slide.title}
                        </h4>
                        <p className="text-[9px] text-slate-500 font-mono">
                          {slide.filename}
                        </p>
                      </div>
                    </div>
                    
                    <span className="text-[10.5px] font-extrabold text-slate-400 group-hover:text-emerald-400 transition-colors flex items-center space-x-1 flex-none bg-slate-950/80 px-3 py-1.5 border border-slate-800 rounded-xl">
                      <span>View</span>
                      <span className="text-[9px]">▶</span>
                    </span>
                  </a>
                ))}
              </div>

            </div>
          ))}
        </div>

        {/* 3. Footer */}
        <div className="p-4 border-t border-slate-850/60 bg-slate-950/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-950/80 hover:bg-slate-950 text-xs font-extrabold text-slate-400 hover:text-slate-200 border border-slate-850 hover:border-slate-800 transition-all"
          >
            닫기
          </button>
        </div>

      </div>
    </div>
  );
};
