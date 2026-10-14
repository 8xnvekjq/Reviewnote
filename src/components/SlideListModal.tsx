import React, { useMemo, useState } from "react";
import { LectureBookCard, LectureDeckUploader, LectureResumeRow, useLectureLibrary } from "./LectureDeckSection";
import { filterBooks } from "../features/lectures/lectureLibrary";

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
  /** 관리자에게만 교재 스캔 슬라이드(비공개 저장소) 목록과 올리기를 보인다. */
  isAdmin?: boolean;
}

// ── 학년별 HTML 특강·정리 자료(public/slides) ─────────────────────────────────
export const SLIDE_LIST: SlideItem[] = [
  // 🐣 예비고1 (공통수학1, 공통수학2)
  { title: "베이직쎈 공통수학1 - 01~11단원 + 조합 (종합 복습, 전체 흐름) (p8~192)", filename: "math1_basicsen_comprehensive_review_01_11.html", date: "2026-08-12", grade: "예비고1" },
  { title: "베이직쎈 공통수학1 - 01~06단원 종합 복습 (전체 흐름) (p8~99)", filename: "math1_basicsen_comprehensive_review_01_06.html", date: "2026-08-07", grade: "예비고1" },
  { title: "베이직쎈 공통수학1 - 10. 순열과 조합 (조합의 활용) (p163~172)", filename: "math1_combination_usage_10.html", date: "2026-07-31", grade: "예비고1" },

  // 🏫 고1 (공통수학1, 공통수학2)
  { title: "개념원리 공통수학2 - Ⅱ. 집합의 연산 (p138~160)", filename: "math2_set_operations_p138_160.html", date: "2026-08-15", grade: "고1" },
  { title: "개념원리 공통수학2 - Ⅱ. 집합의 뜻과 포함관계 (p120~136)", filename: "math2_set_meaning_containment_p120_136.html", date: "2026-08-11", grade: "고1" },
  { title: "개념원리 공통수학2 - 03.원의 방정식 (p66~96)", filename: "math2_circle_equation_03.html", date: "2026-07-28", grade: "고1" },
  { title: "개념원리 공통수학2 - 02. 직선의 방정식 (p34~62)", filename: "math2_linear_equation_02.html", date: "2026-07-22", grade: "고1" },
  { title: "개념원리 공통수학2 - 평면좌표 (내분점~무게중심)", filename: "math2_plane_coordinates.html", date: "2026-07-18", grade: "고1" },

  // 🏫 고2 (수학Ⅰ, 수학Ⅱ, 미적분1)
  { title: "개념원리 미적분1 - 02. 도함수의 활용 - 07. 방정식과 부등식에의 활용 (p133~141)", filename: "calculus1_equation_inequality_application_p133_141.html", date: "2026-08-15", grade: "고2" },
  { title: "개념원리 미적분1 - 02. 도함수의 활용 - 02. 함수의 극대·극소와 그래프 (p108~129)", filename: "calculus1_extreme_values_graph_p108_129.html", date: "2026-08-12", grade: "고2" },
  { title: "개념원리 미적분1 - 02. 도함수의 활용 - 01. 접선의 방정식 (p86~95)", filename: "calculus1_tangent_equation_p86_95.html", date: "2026-08-01", grade: "고2" },
  { title: "개념원리 미적분1 - 03. 도함수 (p72~82)", filename: "calculus1_derivative_function_p72_82.html", date: "2026-07-29", grade: "고2" },
  { title: "개념원리 미적분1 - 01. 함수의 극한과 연속 (p31~47)", filename: "calculus1_limit_continuity_01.html", date: "2026-07-22", grade: "고2" },
  { title: "개념원리 미적분1 - 02. 연속함수의 성질 (p51~55)", filename: "calculus1_continuous_functions_02.html", date: "2026-07-22", grade: "고2" },
  { title: "개념원리 미적분1 - 03. 미분계수 (p58~68)", filename: "calculus1_derivative_03.html", date: "2026-07-22", grade: "고2" },
  { title: "I. 함수의 극한과 연속 - 04. 함수의 극한의 응용", filename: "math_limit_applications.html", date: "2026-07-18", grade: "고2" },
  { title: "II. 함수의 극한과 연속 - 01. 함수의 연속", filename: "math_continuity_01.html", date: "2026-07-18", grade: "고2" },

  // 🎓 고3 / N수 (수능 파이널 & 준킬러 특강)
  { title: "2025·2026학년도 6월 모의평가 공통 4점 문항 특강", filename: "mock_jun_2025_2026_math_common_4point_special.html", date: "2026-08-13", grade: "고3" },
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

const GRADE_ORDER: GradeLevel[] = ['예비고1', '고1', '고2', '고3'];
const GRADE_THEME: Record<GradeLevel, { icon: string; tab: string; heading: string; cover: string }> = {
  '예비고1': { icon: '🐣', tab: 'bg-purple-500/20 text-purple-200 border-purple-400/60', heading: 'text-purple-300', cover: 'bg-gradient-to-br from-purple-400 to-purple-700' },
  '고1': { icon: '📘', tab: 'bg-amber-500/20 text-amber-200 border-amber-400/60', heading: 'text-amber-300', cover: 'bg-gradient-to-br from-amber-400 to-amber-700' },
  '고2': { icon: '📗', tab: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/60', heading: 'text-emerald-300', cover: 'bg-gradient-to-br from-emerald-400 to-emerald-700' },
  '고3': { icon: '📕', tab: 'bg-rose-500/20 text-rose-200 border-rose-400/60', heading: 'text-rose-300', cover: 'bg-gradient-to-br from-rose-400 to-rose-700' },
};
const SPECIAL_PREVIEW = 6;

/** 특강 HTML을 인쇄용으로 연다. window.open은 팝업 차단에 조용히 막혀서 숨겨진 iframe을 쓴다. */
function printSlide(filename: string) {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  iframe.src = `/slides/${filename}`;
  document.body.appendChild(iframe);
  const cleanup = () => { if (iframe.parentNode) document.body.removeChild(iframe); };
  iframe.onload = () => {
    setTimeout(() => {
      const win = iframe.contentWindow;
      if (!win) { cleanup(); return; }
      win.addEventListener('afterprint', cleanup, { once: true });
      win.focus();
      win.print();
      setTimeout(cleanup, 60000); // afterprint가 안 잡히는 브라우저용 정리
    }, 300);
  };
}

export const SlideListModal: React.FC<SlideListModalProps> = ({ isOpen, onClose, isAdmin = false }) => {
  if (!isOpen) return null;
  return <SlideLibrary onClose={onClose} isAdmin={isAdmin} />;
};

// 수업자료: 학년 → 교재(교재 슬라이드) → 단원, 그 아래 특강·정리 자료. 태블릿에서도 넓게 쓰도록 전체 화면.
const SlideLibrary: React.FC<{ onClose: () => void; isAdmin: boolean }> = ({ onClose, isAdmin }) => {
  const [grade, setGrade] = useState<'ALL' | GradeLevel>('ALL');
  const [query, setQuery] = useState('');
  const [manage, setManage] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const lib = useLectureLibrary(isAdmin);

  const specials = useMemo(() => [...SLIDE_LIST].sort((a, b) => b.date.localeCompare(a.date)), []);
  const q = query.trim();
  const books = useMemo(() => filterBooks(lib.books, q), [lib.books, q]);
  const specialMatches = (s: SlideItem) => {
    if (!q) return true;
    const title = s.title.toLowerCase();
    return q.toLowerCase().split(/\s+/).every(word => title.includes(word));
  };

  const countFor = (g: GradeLevel) =>
    specials.filter(s => s.grade === g).length + lib.books.filter(b => b.grade === g).reduce((n, b) => n + b.deckCount, 0);
  const total = GRADE_ORDER.reduce((n, g) => n + countFor(g), 0);
  const grades = grade === 'ALL' ? GRADE_ORDER : [grade];

  const sections = grades.map(g => ({
    grade: g,
    books: books.filter(b => b.grade === g),
    specials: specials.filter(s => s.grade === g && specialMatches(s)),
  })).filter(s => s.books.length || s.specials.length);

  const tabClass = (on: boolean, theme?: string) =>
    `flex-none px-4 py-2 rounded-full text-sm font-black border transition-all whitespace-nowrap ${on ? (theme ?? 'bg-indigo-600 text-white border-indigo-500') : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'}`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-slate-100 animate-fade-in" data-testid="slide-library">
      <header className="flex items-center gap-3 px-4 sm:px-6 py-3.5 border-b border-slate-800 bg-slate-950">
        <span className="text-2xl">📚</span>
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-black">수업자료</h2>
          <p className="text-xs text-slate-500 hidden sm:block">더쿠키수학 학년별 교재 슬라이드 · 특강 자료</p>
        </div>
        <div className="flex-1" />
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="🔍 단원·쪽수 검색 (예: 역함수, 234)"
          aria-label="수업자료 검색"
          className="hidden sm:block w-72 px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-100 placeholder:text-slate-500"
        />
        {isAdmin && (
          <button
            onClick={() => { setManage(m => !m); setUploadOpen(false); }}
            aria-pressed={manage}
            className={`flex-none px-3.5 py-2 rounded-xl text-sm font-black border ${manage ? 'bg-sky-600 border-sky-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-200'}`}
          >
            ⚙ 관리
          </button>
        )}
        <button onClick={onClose} aria-label="수업자료 닫기" className="flex-none w-10 h-10 rounded-full bg-slate-900 border border-slate-800 text-slate-300 hover:text-white font-bold">✕</button>
      </header>

      <div className="px-4 sm:px-6 pt-3 sm:hidden">
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="🔍 단원·쪽수 검색"
          aria-label="수업자료 검색"
          className="w-full px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-100 placeholder:text-slate-500"
        />
      </div>

      <nav className="flex gap-2 px-4 sm:px-6 py-3 border-b border-slate-800 overflow-x-auto no-scrollbar" aria-label="학년">
        <button onClick={() => setGrade('ALL')} className={tabClass(grade === 'ALL')}>🌟 전체 · {total}</button>
        {GRADE_ORDER.map(g => (
          <button key={g} onClick={() => setGrade(g)} className={tabClass(grade === g, GRADE_THEME[g].tab)}>
            {GRADE_THEME[g].icon} {g} · {countFor(g)}
          </button>
        ))}
      </nav>

      <main className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-5 space-y-7">
        <div className="max-w-5xl mx-auto space-y-7">
          {manage && (
            <section className="space-y-3" data-testid="lecture-deck-section">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-sky-300">관리</h3>
                <span className="text-xs text-slate-500">학년 바꾸기·삭제는 아래 목록에서, 녹음은 🎙️에서</span>
                <div className="flex-1" />
                <button onClick={() => setUploadOpen(o => !o)} className="text-sm font-extrabold text-sky-300 hover:underline">
                  {uploadOpen ? '닫기 ▲' : '＋ 교재 슬라이드 올리기'}
                </button>
              </div>
              {uploadOpen && <LectureDeckUploader onUploaded={async () => { setUploadOpen(false); await lib.refresh(); }} />}
            </section>
          )}

          {!manage && !q && <LectureResumeRow lib={lib} grade={grade} />}

          {isAdmin && lib.loadError && <p className="text-sm text-rose-300">{lib.loadError}</p>}
          {isAdmin && manage && lib.loaded && !lib.books.length && !lib.loadError && (
            <p className="text-sm text-slate-500">아직 올린 교재 슬라이드가 없습니다.</p>
          )}

          {sections.map(section => {
            const theme = GRADE_THEME[section.grade];
            const isOpen = expanded[section.grade] || !!q;
            const shown = isOpen ? section.specials : section.specials.slice(0, SPECIAL_PREVIEW);
            return (
              <section key={section.grade} className="space-y-4" data-grade={section.grade}>
                {grade === 'ALL' && (
                  <h3 className={`text-base font-black ${theme.heading} flex items-center gap-2`}>
                    <span className="text-xl">{theme.icon}</span>{section.grade}
                  </h3>
                )}

                {!!section.books.length && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-black text-slate-400">교재 슬라이드</h4>
                    {section.books.map(book => (
                      <LectureBookCard
                        key={book.book}
                        lib={lib}
                        book={book}
                        manage={manage}
                        accent={theme.cover}
                        defaultOpen={!!q || grade !== 'ALL' || manage}
                      />
                    ))}
                  </div>
                )}

                {!!section.specials.length && !manage && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-black text-slate-400">특강 · 정리 자료</h4>
                    <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                      {shown.map(slide => (
                        <div key={slide.filename} className="flex flex-col p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700">
                          <span className="text-[11px] font-black text-violet-300">특강 · HTML</span>
                          <span className="mt-1 text-sm font-bold text-slate-100 leading-snug break-keep line-clamp-3">{slide.title}</span>
                          <span className="flex-1" />
                          <div className="mt-2.5 flex items-center gap-2">
                            <span className="text-xs text-slate-500 font-mono">{slide.date}</span>
                            <span className="flex-1" />
                            <a
                              href={`/slides/${slide.filename}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-extrabold text-slate-200 hover:text-amber-300 bg-slate-950 px-3 py-1.5 border border-slate-800 rounded-lg active:scale-95"
                            >
                              열기 ▶
                            </a>
                            <button
                              onClick={() => printSlide(slide.filename)}
                              className="text-xs font-extrabold text-slate-200 hover:text-indigo-300 bg-slate-950 px-3 py-1.5 border border-slate-800 rounded-lg active:scale-95"
                            >
                              🖨️ PDF
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    {section.specials.length > SPECIAL_PREVIEW && !q && (
                      <button
                        onClick={() => setExpanded(e => ({ ...e, [section.grade]: !e[section.grade] }))}
                        className="w-full py-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-sm font-bold text-slate-300 hover:text-white"
                      >
                        {isOpen ? '▲ 접기' : `▼ ${section.grade} 특강 ${section.specials.length - SPECIAL_PREVIEW}개 더 보기`}
                      </button>
                    )}
                  </div>
                )}
              </section>
            );
          })}

          {!sections.length && (
            <p className="py-16 text-center text-sm text-slate-500">{q ? `'${q}'에 맞는 자료가 없습니다.` : '이 학년의 수업자료가 아직 없습니다.'}</p>
          )}
        </div>
      </main>
      {lib.viewer}
    </div>
  );
};
