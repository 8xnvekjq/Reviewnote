import React, { useMemo, useState } from "react";

export type GradeLevel = '예비고1' | '고1' | '고2' | '고3';

interface SlideItem {
  title: string;
  filename: string;
  date: string; // YYYY-MM-DD (정렬 기준)
  grade: GradeLevel;
}

interface SlideListModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SlideListModal: React.FC<SlideListModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  // ── 학년별 수업 슬라이드 마스터 리스트 ──────────────────────────────────────
  const SLIDE_LIST: SlideItem[] = [
    // 🐣 예비고1 (공통수학1, 공통수학2)
    { title: "베이직쎈 공통수학1 - 01~11단원 + 조합 (종합 복습, 전체 흐름) (p8~192)", filename: "math1_basicsen_comprehensive_review_01_11.html", date: "2026-08-12", grade: "예비고1" },
    { title: "베이직쎈 공통수학1 - 01~06단원 종합 복습 (전체 흐름) (p8~99)", filename: "math1_basicsen_comprehensive_review_01_06.html", date: "2026-08-07", grade: "예비고1" },
    { title: "베이직쎈 공통수학1 - 10. 순열과 조합 (조합의 활용) (p163~172)", filename: "math1_combination_usage_10.html", date: "2026-07-31", grade: "예비고1" },

    // 🏫 고1 (공통수학1, 공통수학2)
    { title: "개념원리 공통수학2 - Ⅱ. 집합의 뜻과 포함관계 (p120~136)", filename: "math2_set_meaning_containment_p120_136.html", date: "2026-08-11", grade: "고1" },
    { title: "개념원리 공통수학2 - 03.원의 방정식 (p66~96)", filename: "math2_circle_equation_03.html", date: "2026-07-28", grade: "고1" },
    { title: "개념원리 공통수학2 - 02. 직선의 방정식 (p34~62)", filename: "math2_linear_equation_02.html", date: "2026-07-22", grade: "고1" },
    { title: "개념원리 공통수학2 - 평면좌표 (내분점~무게중심)", filename: "math2_plane_coordinates.html", date: "2026-07-18", grade: "고1" },

    // 🏫 고2 (수학Ⅰ, 수학Ⅱ, 미적분1)
    { title: "개념원리 미적분1 - 02. 도함수의 활용 - 01. 접선의 방정식 (p86~95)", filename: "calculus1_tangent_equation_p86_95.html", date: "2026-08-01", grade: "고2" },
    { title: "개념원리 미적분1 - 03. 도함수 (p72~82)", filename: "calculus1_derivative_function_p72_82.html", date: "2026-07-29", grade: "고2" },
    { title: "개념원리 미적분1 - 01. 함수의 극한과 연속 (p31~47)", filename: "calculus1_limit_continuity_01.html", date: "2026-07-22", grade: "고2" },
    { title: "개념원리 미적분1 - 02. 연속함수의 성질 (p51~55)", filename: "calculus1_continuous_functions_02.html", date: "2026-07-22", grade: "고2" },
    { title: "개념원리 미적분1 - 03. 미분계수 (p58~68)", filename: "calculus1_derivative_03.html", date: "2026-07-22", grade: "고2" },
    { title: "I. 함수의 극한과 연속 - 04. 함수의 극한의 응용", filename: "math_limit_applications.html", date: "2026-07-18", grade: "고2" },
    { title: "II. 함수의 극한과 연속 - 01. 함수의 연속", filename: "math_continuity_01.html", date: "2026-07-18", grade: "고2" },

    // 🎓 고3 / N수 (수능 파이널 & 준킬러 특강)
    { title: "수학Ⅱ/미적분1 - 삼차함수 실전 공식 특강 (비율관계·접선·극값)", filename: "math_cubic_function_practical_formulas_special.html", date: "2026-08-11", grade: "고3" },
    { title: "2025학년도 9월 모의평가 수학 21·22번 클리닉", filename: "2025_mock_sep_math_21_22.html", date: "2026-08-08", grade: "고3" },
    { title: "수학Ⅱ - 함수의 극한 존재조건 활용 (정규수업)", filename: "math2_limit_existence_condition.html", date: "2026-08-01", grade: "고3" },
    { title: "고3 준킬러 스피드 & 숏컷 클리닉 특강 (3탄)", filename: "g3_speedcut_clinic_special_3.html", date: "2026-08-06", grade: "고3" },
    { title: "고3 준킬러 스피드 & 숏컷 클리닉 특강 (2탄)", filename: "g3_speedcut_clinic_special_2.html", date: "2026-07-30", grade: "고3" },
    { title: "고3 준킬러 스피드 & 숏컷 클리닉 (수능 특강)", filename: "g3_speedcut_clinic_special.html", date: "2026-07-28", grade: "고3" },
    { title: "2025학년도 수능 수학 15, 20, 21, 22번 및 변형문제", filename: "2025_suneung_math_15_20_21_22.html", date: "2026-07-25", grade: "고3" },
    { title: "고3 준킬러 스피드 & 숏컷 클리닉", filename: "g3_speedcut_clinic.html", date: "2026-07-23", grade: "고3" },
    { title: "2024학년도 수능 수학 14번 및 변형문제", filename: "2024_suneung_math_14.html", date: "2026-07-18", grade: "고3" },
    { title: "2024학년도 수능 수학 미적분 27, 28번 및 변형문제", filename: "2024_suneung_calculus_27_28.html", date: "2026-07-18", grade: "고3" },
    { title: "2024학년도 수능 수학 확률과 통계 30번 및 변형문제", filename: "2024_suneung_prob_stat_30.html", date: "2026-07-18", grade: "고3" },
  ];

  // 탭 선택 상태 ('ALL' | '예비고1' | '고1' | '고2' | '고3')
  const [selectedGradeTab, setSelectedGradeTab] = useState<'ALL' | GradeLevel>('ALL');

  // 각 학년별 '더 보기' 전개 상태 (기본값: false -> 상위 3개만 표출)
  const [expandedGrades, setExpandedGrades] = useState<Record<GradeLevel, boolean>>({
    '예비고1': false,
    '고1': false,
    '고2': false,
    '고3': false,
  });

  const toggleGradeExpand = (grade: GradeLevel) => {
    setExpandedGrades(prev => ({ ...prev, [grade]: !prev[grade] }));
  };

  // 학년순(예비고1 -> 고1 -> 고2 -> 고3)으로 그루핑
  const gradeOrder: GradeLevel[] = ['예비고1', '고1', '고2', '고3'];

  const groupedByGrade = useMemo(() => {
    const sorted = [...SLIDE_LIST].sort((a, b) => b.date.localeCompare(a.date));
    const groups: Record<GradeLevel, SlideItem[]> = {
      '예비고1': [],
      '고1': [],
      '고2': [],
      '고3': [],
    };

    sorted.forEach(item => {
      if (groups[item.grade]) {
        groups[item.grade].push(item);
      }
    });

    return gradeOrder.map(g => ({
      grade: g,
      items: groups[g],
    }));
  }, []);

  // 학년별 테마 색상 맵
  const gradeThemeMap: Record<GradeLevel, { badgeBg: string; text: string; border: string; icon: string }> = {
    '예비고1': {
      badgeBg: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
      text: 'text-purple-400',
      border: 'border-purple-500/40',
      icon: '🐣',
    },
    '고1': {
      badgeBg: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      text: 'text-amber-400',
      border: 'border-amber-500/40',
      icon: '📘',
    },
    '고2': {
      badgeBg: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      text: 'text-emerald-400',
      border: 'border-emerald-500/40',
      icon: '📗',
    },
    '고3': {
      badgeBg: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
      text: 'text-rose-400',
      border: 'border-rose-500/40',
      icon: '📕',
    },
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-955/85 backdrop-blur-sm animate-fade-in">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-slate-900/95 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl animate-scale-up flex flex-col max-h-[88vh]">

        {/* Header */}
        <div className="flex items-center justify-between p-4.5 border-b border-slate-800/80 bg-slate-950/60">
          <div className="flex items-center space-x-3">
            <span className="text-2xl animate-bounce">🖥️</span>
            <div>
              <h3 className="text-sm font-black text-white flex items-center space-x-2">
                <span>더쿠키수학 학년별 수업자료</span>
              </h3>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                선생님이 제작하신 학년별 개념원리 &amp; 수능 특강 슬라이드
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-955/60 hover:bg-slate-950 hover:text-white border border-slate-800 flex items-center justify-center text-slate-400 transition-colors text-xs font-bold"
          >
            ✕
          </button>
        </div>

        {/* 학년 선택 필터 탭 (전체 / 예비고1 / 고1 / 고2 / 고3) */}
        <div className="px-4 pt-3 pb-2 bg-slate-950/40 border-b border-slate-850 flex items-center space-x-2 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setSelectedGradeTab('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex-none ${
              selectedGradeTab === 'ALL'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'bg-slate-850 text-slate-400 hover:text-slate-200'
            }`}
          >
            🌟 전체보기 ({SLIDE_LIST.length})
          </button>
          {gradeOrder.map(g => {
            const count = SLIDE_LIST.filter(s => s.grade === g).length;
            const theme = gradeThemeMap[g];
            const isSelected = selectedGradeTab === g;
            return (
              <button
                key={g}
                onClick={() => setSelectedGradeTab(g)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex-none flex items-center space-x-1 ${
                  isSelected
                    ? `${theme.badgeBg} border font-bold shadow-md scale-105`
                    : 'bg-slate-850 text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>{theme.icon}</span>
                <span>{g} ({count})</span>
              </button>
            );
          })}
        </div>

        {/* Body: 학년별 그룹 및 상위 3개 제한 + 더 보기 */}
        <div className="p-4 overflow-y-auto space-y-5 flex-1 min-h-0 scrollbar-thin scrollbar-thumb-slate-800">
          {groupedByGrade
            .filter(g => selectedGradeTab === 'ALL' || selectedGradeTab === g.grade)
            .map(group => {
              const theme = gradeThemeMap[group.grade];
              const isExpanded = expandedGrades[group.grade];
              const totalCount = group.items.length;
              // 📍 기본 상위 3개 표시, '더 보기' 활성화 시 전체 표출
              const visibleItems = isExpanded ? group.items : group.items.slice(0, 3);
              const remainingCount = totalCount - 3;

              return (
                <div key={group.grade} className="space-y-2.5 animate-fade-in">
                  {/* 학년 헤더 타이틀 */}
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-lg">{theme.icon}</span>
                      <h4 className={`text-xs font-black ${theme.text} tracking-wide`}>
                        {group.grade} 수업자료
                      </h4>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${theme.badgeBg}`}>
                        총 {totalCount}개
                      </span>
                    </div>

                    {totalCount > 3 && (
                      <button
                        onClick={() => toggleGradeExpand(group.grade)}
                        className={`text-[10.5px] font-extrabold ${theme.text} hover:underline flex items-center space-x-1`}
                      >
                        <span>{isExpanded ? '접기 ▲' : `더 보기 (+${remainingCount}개) ▼`}</span>
                      </button>
                    )}
                  </div>

                  {/* 슬라이드 아이템 카드 리스트 */}
                  <div className="grid gap-2">
                    {visibleItems.map((slide, idx) => (
                      <a
                        key={idx}
                        href={`/slides/${slide.filename}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between p-3.5 bg-slate-955/60 hover:bg-slate-900 border border-slate-850 hover:border-slate-700 rounded-2xl transition-all duration-200 group active:scale-[0.99] shadow-sm"
                      >
                        <div className="flex items-center space-x-3 min-w-0">
                          <span className="text-xl flex-none select-none group-hover:scale-110 transition-transform">
                            📄
                          </span>
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center space-x-1.5">
                              <span className={`text-[9px] font-black px-1.5 py-0.2 rounded border ${theme.badgeBg} flex-none`}>
                                {slide.grade}
                              </span>
                              <h5 className="text-xs font-bold text-slate-200 group-hover:text-white transition-colors truncate leading-snug">
                                {slide.title}
                              </h5>
                            </div>
                            <p className="text-[9.5px] text-slate-500 font-mono flex items-center space-x-2">
                              <span>📅 {slide.date}</span>
                              <span>·</span>
                              <span className="truncate">{slide.filename}</span>
                            </p>
                          </div>
                        </div>

                        <span className="text-[10px] font-extrabold text-slate-400 group-hover:text-amber-300 transition-colors flex items-center space-x-1 flex-none bg-slate-900 px-3 py-1.5 border border-slate-800 rounded-xl group-hover:border-amber-500/40">
                          <span>열기</span>
                          <span className="text-[8px]">▶</span>
                        </span>
                      </a>
                    ))}
                  </div>

                  {/* 3개 초과 시 섹션 하단 '더 보기' 확장 버튼 */}
                  {totalCount > 3 && (
                    <button
                      onClick={() => toggleGradeExpand(group.grade)}
                      className="w-full py-2 rounded-xl bg-slate-955/40 hover:bg-slate-900 border border-slate-850 hover:border-slate-750 text-slate-400 hover:text-slate-200 text-[11px] font-bold transition-all flex items-center justify-center space-x-1.5 active:scale-98"
                    >
                      {isExpanded ? (
                        <>
                          <span>▲ 목록 접기</span>
                        </>
                      ) : (
                        <>
                          <span className={theme.text}>▼ {group.grade} 자료 {remainingCount}개 더 보기</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
};
