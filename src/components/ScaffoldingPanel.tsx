import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../services/supabase';
import type { MistakeEntry } from '../types';
import { MATH_CURRICULUM } from '../types';

interface ProfileInfo {
  id: string;
  nickname?: string;
  display_name?: string;
  email?: string;
}

interface ExtendedMistakeEntry extends MistakeEntry {
  studentName: string;
  studentEmail: string;
  xCount: number;
  starCount: number;
  weakCount: number; // xCount + starCount
}

interface ScaffoldingPanelProps {
  isAdmin: boolean;
  onOpenDetailModal?: (mistake: MistakeEntry) => void;
}

export const ScaffoldingPanel: React.FC<ScaffoldingPanelProps> = ({ isAdmin, onOpenDetailModal }) => {
  const [mistakes, setMistakes] = useState<ExtendedMistakeEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);

  // 🔍 필터 상태
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [selectedGrades, setSelectedGrades] = useState<string[]>([]);
  const [minWeakCount, setMinWeakCount] = useState<number>(2); // 기본 X+★ 2개 이상

  // 🚀 5개씩 더보기 렌더링 제한
  const [displayLimit, setDisplayLimit] = useState<number>(5);

  // ✍️ 힌트 작성 모달 상태
  const [hintModalTarget, setHintModalTarget] = useState<ExtendedMistakeEntry | null>(null);
  const [hintInput, setHintInput] = useState<string>('');
  const [savingHint, setSavingHint] = useState<boolean>(false);
  const [hintSaveNotice, setHintSaveNotice] = useState<string | null>(null);

  // ── 1. 전체 학생 오답 데이터 Supabase 로드 ──────────────────────────
  const fetchAllMistakes = async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      // 1. 프로필 목록 조회
      const { data: profData } = await supabase
        .from('profiles')
        .select('id, nickname, display_name, email');

      const profMap: Record<string, ProfileInfo> = {};
      (profData || []).forEach((p: ProfileInfo) => {
        profMap[p.id] = p;
      });
      setProfiles(profData || []);

      // 2. 전체 오답 노트 조회
      const { data: mData, error } = await supabase
        .from('mistakes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // 3. 취약 오답 (X + ★ >= minWeakCount) 계산 및 확장 정보 가공
      const processed: ExtendedMistakeEntry[] = (mData || []).map((row: any) => {
        const reviewsArr: string[] = Array.isArray(row.reviews) ? row.reviews : [];
        let xCount = 0;
        let starCount = 0;

        reviewsArr.forEach((r: string) => {
          if (r === 'X') xCount++;
          if (r === 'star') starCount++;
        });

        const weakCount = xCount + starCount;
        const studentProf = profMap[row.user_id] || {};
        const studentName = studentProf.nickname || studentProf.display_name || studentProf.email?.split('@')[0] || '학생';

        return {
          id: row.id,
          userId: row.user_id,
          title: row.title || '무제 오답',
          imageUrl: row.image_url,
          date: row.created_at || row.date,
          updatedAt: row.updated_at,
          analysis: row.analysis,
          reviews: reviewsArr as any,
          grade: row.grade,
          chapter: row.chapter,
          rootCauses: row.root_causes,
          userActionPlan: row.user_action_plan,
          studentName,
          studentEmail: studentProf.email || '',
          xCount,
          starCount,
          weakCount,
        };
      });

      setMistakes(processed);
    } catch (e) {
      console.error('스캐폴딩 오답 로드 오류:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllMistakes();

    // ⚡ Realtime 구독: 학생이 복습 체크나 새 오답 등록 시 즉시 실시간 갱신
    const channel = supabase
      .channel('scaffolding-mistakes-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mistakes' },
        () => {
          fetchAllMistakes();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin]);

  // ── 2. 필터링된 취약 오답 목록 계산 ──────────────────────────────
  const filteredMistakes = useMemo(() => {
    return mistakes.filter((item) => {
      // 1) 최소 취약 횟수 조건 (기본 X+★ >= 2)
      if (item.weakCount < minWeakCount) return false;

      // 2) 학생 선택 필터 (비어있으면 전체 선택 취급)
      if (selectedStudentIds.length > 0) {
        if (!item.userId || !selectedStudentIds.includes(item.userId)) return false;
      }

      // 3) 학년/과목 선택 필터 (비어있으면 전체 선택 취급)
      if (selectedGrades.length > 0) {
        if (!item.grade || !selectedGrades.includes(item.grade)) return false;
      }

      return true;
    });
  }, [mistakes, minWeakCount, selectedStudentIds, selectedGrades]);

  // 5개씩 잘라낸 현재 렌더링 카드들
  const visibleMistakes = useMemo(() => {
    return filteredMistakes.slice(0, displayLimit);
  }, [filteredMistakes, displayLimit]);

  // 학년 목록 추출
  const availableGrades = useMemo(() => {
    const set = new Set<string>();
    mistakes.forEach((m) => {
      if (m.grade) set.add(m.grade);
    });
    return Array.from(set).length > 0 ? Array.from(set) : Object.keys(MATH_CURRICULUM);
  }, [mistakes]);

  // ── 3. 필터 핸들러 ──────────────────────────────────────────────
  const toggleStudentFilter = (id: string) => {
    setDisplayLimit(5); // 필터 변경 시 5개로 다시 리셋
    setSelectedStudentIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleGradeFilter = (grade: string) => {
    setDisplayLimit(5);
    setSelectedGrades((prev) =>
      prev.includes(grade) ? prev.filter((item) => item !== grade) : [...prev, grade]
    );
  };

  const selectAllStudents = () => {
    setDisplayLimit(5);
    setSelectedStudentIds([]);
  };

  const selectAllGrades = () => {
    setDisplayLimit(5);
    setSelectedGrades([]);
  };

  // ── 4. 스캐폴딩 힌트 저장 처리 ──────────────────────────────────
  const handleOpenHintModal = (item: ExtendedMistakeEntry) => {
    setHintModalTarget(item);
    setHintInput(item.userActionPlan || '');
    setHintSaveNotice(null);
  };

  const handleSaveHint = async () => {
    if (!hintModalTarget) return;
    setSavingHint(true);
    try {
      const { error } = await supabase
        .from('mistakes')
        .update({ user_action_plan: hintInput })
        .eq('id', hintModalTarget.id);

      if (error) throw error;

      // 메모리 내 상태 즉시 업데이트
      setMistakes((prev) =>
        prev.map((m) => (m.id === hintModalTarget.id ? { ...m, userActionPlan: hintInput } : m))
      );

      setHintSaveNotice('✅ 스캐폴딩 힌트가 학생에게 전달되었습니다!');
      setTimeout(() => {
        setHintModalTarget(null);
        setHintSaveNotice(null);
      }, 1200);
    } catch (e) {
      console.error('힌트 저장 실패:', e);
      alert('스캐폴딩 힌트 저장 중 오류가 발생했습니다.');
    } finally {
      setSavingHint(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-8 text-center text-slate-400 font-bold">
        🔒 어드민 계정 전용 취약 오답 스캐폴딩 탐색기 패널입니다.
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12 animate-fade-in">
      {/* 🧩 헤더 카드 */}
      <div className="bg-gradient-to-r from-purple-950/80 via-slate-900 to-indigo-950/80 border border-purple-500/30 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute -right-8 -top-8 w-36 h-36 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex items-center space-x-3 mb-2">
          <span className="p-2.5 bg-purple-500/20 text-purple-300 rounded-2xl text-2xl border border-purple-500/30 shadow-inner">
            🧩
          </span>
          <div>
            <h2 className="text-xl font-black text-white tracking-tight">
              취약 오답 클리닉 <span className="text-purple-400 font-mono text-base">(스캐폴딩 탐색기)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              복습 중 <strong className="text-rose-400">틀림(X)</strong> 또는 <strong className="text-amber-400">별표(★)가 2개 이상</strong> 누적된 학생별 고난도 취약 문제를 실시간으로 탐색하고 힌트를 전수합니다.
            </p>
          </div>
        </div>

        {/* 요약 통계 뱃지 */}
        <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-wrap items-center gap-3 text-xs font-bold">
          <div className="bg-slate-950/80 px-3.5 py-1.5 rounded-xl border border-slate-800 flex items-center space-x-2">
            <span className="text-slate-400">총 감지된 취약 오답:</span>
            <span className="text-purple-400 font-black font-mono text-sm">{filteredMistakes.length}개</span>
          </div>
          <div className="bg-slate-950/80 px-3.5 py-1.5 rounded-xl border border-slate-800 flex items-center space-x-2">
            <span className="text-slate-400">현재 표시 중:</span>
            <span className="text-amber-300 font-black font-mono text-sm">
              {visibleMistakes.length} / {filteredMistakes.length}개
            </span>
          </div>
        </div>
      </div>

      {/* 🔍 실시간 필터 제어판 */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
        {/* 1. 학생별 필터 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-slate-300 flex items-center space-x-1.5">
              <span>👤 학생별 선택</span>
              <span className="text-[10px] text-slate-500 font-normal">
                ({selectedStudentIds.length === 0 ? '전체 학생' : `${selectedStudentIds.length}명 선택`})
              </span>
            </span>
            <button
              onClick={selectAllStudents}
              className={`text-[11px] font-extrabold px-2.5 py-1 rounded-lg border transition-all ${
                selectedStudentIds.length === 0
                  ? 'bg-purple-600 text-white border-purple-400 shadow-sm shadow-purple-500/30'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
            >
              전체 학생 보기
            </button>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {profiles.map((p) => {
              const name = p.nickname || p.display_name || p.email?.split('@')[0] || '학생';
              const isSelected = selectedStudentIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => toggleStudentFilter(p.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center space-x-1.5 ${
                    isSelected
                      ? 'bg-purple-500/20 text-purple-300 border-purple-500/60 shadow-md shadow-purple-500/10'
                      : 'bg-slate-950/70 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-300'
                  }`}
                >
                  <span>{isSelected ? '✓' : '👤'}</span>
                  <span>{name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. 학년/과목별 필터 */}
        <div className="space-y-2 pt-2 border-t border-slate-800/60">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-slate-300 flex items-center space-x-1.5">
              <span>📚 학년/과목별 선택</span>
              <span className="text-[10px] text-slate-500 font-normal">
                ({selectedGrades.length === 0 ? '전체 과목' : `${selectedGrades.length}개 선택`})
              </span>
            </span>
            <button
              onClick={selectAllGrades}
              className={`text-[11px] font-extrabold px-2.5 py-1 rounded-lg border transition-all ${
                selectedGrades.length === 0
                  ? 'bg-indigo-600 text-white border-indigo-400 shadow-sm shadow-indigo-500/30'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
            >
              전체 과목 보기
            </button>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {availableGrades.map((g) => {
              const isSelected = selectedGrades.includes(g);
              return (
                <button
                  key={g}
                  onClick={() => toggleGradeFilter(g)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center space-x-1.5 ${
                    isSelected
                      ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/60 shadow-md shadow-indigo-500/10'
                      : 'bg-slate-950/70 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-300'
                  }`}
                >
                  <span>{isSelected ? '✓' : '📘'}</span>
                  <span>{g}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. 취약 기준 조절 */}
        <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-xs font-bold">
          <span className="text-slate-400">취약 감지 기준 (X+★ 최소 누적):</span>
          <div className="flex items-center space-x-2">
            {[2, 3, 4].map((num) => (
              <button
                key={num}
                onClick={() => {
                  setMinWeakCount(num);
                  setDisplayLimit(5);
                }}
                className={`px-3 py-1 rounded-lg border transition-all ${
                  minWeakCount === num
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/60 font-black'
                    : 'bg-slate-950 text-slate-500 border-slate-800 hover:text-slate-300'
                }`}
              >
                {num}개 이상
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 📄 취약 오답 카드 리스트 */}
      {loading ? (
        <div className="py-16 text-center space-y-3">
          <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-400 font-bold">학생들의 오답 데이터를 탐색하고 있습니다...</p>
        </div>
      ) : filteredMistakes.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-12 text-center space-y-3">
          <span className="text-4xl">🎉</span>
          <h3 className="text-sm font-black text-slate-300">선택한 필터 조건에 해당하는 취약 오답이 없습니다!</h3>
          <p className="text-xs text-slate-500">학생들이 아주 잘해내고 있거나, 필터 조건을 넓혀보세요.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            {visibleMistakes.map((item) => (
              <div
                key={item.id}
                className="bg-slate-900/80 border border-slate-800 hover:border-purple-500/40 rounded-3xl p-5 shadow-xl transition-all space-y-4 relative group"
              >
                {/* 상단 프로필 및 헤더 */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/70 pb-3">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-xs font-black text-white shadow">
                      {item.studentName.slice(0, 1)}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-black text-white">{item.studentName}</span>
                        {item.grade && (
                          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                            {item.grade}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-500">{item.date?.slice(0, 10)}</span>
                    </div>
                  </div>

                  {/* 취약도 뱃지 */}
                  <div className="flex items-center space-x-2">
                    <div className="bg-rose-500/10 border border-rose-500/30 px-3 py-1 rounded-xl text-xs font-black text-rose-400 flex items-center space-x-1.5">
                      <span>⚠️ 취약도:</span>
                      <span className="font-mono text-sm">{item.weakCount}회</span>
                      <span className="text-[10px] text-rose-300/80 font-normal">
                        (X: {item.xCount}, ★: {item.starCount})
                      </span>
                    </div>
                  </div>
                </div>

                {/* 메인 내용: 문제 제목 & 이미지 & 힌트 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                  {/* 문제 이미지 (클릭 시 원본 상세보기) */}
                  <div
                    onClick={() => onOpenDetailModal && onOpenDetailModal(item)}
                    className="md:col-span-1 aspect-video md:aspect-square bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden relative cursor-pointer group/img"
                  >
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center text-xs font-black text-white">
                      🔍 문제 돋보기 확대
                    </div>
                  </div>

                  {/* 오답 상세 분석 & 스캐폴딩 힌트 */}
                  <div className="md:col-span-2 space-y-3">
                    <div>
                      <h4 className="text-base font-black text-white group-hover:text-purple-300 transition-colors">
                        {item.title}
                      </h4>
                      {item.chapter && (
                        <p className="text-xs text-indigo-400 font-extrabold mt-0.5">단원: {item.chapter}</p>
                      )}
                    </div>

                    {/* 실수원인 태그 */}
                    {item.rootCauses && item.rootCauses.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {item.rootCauses.map((rc, idx) => (
                          <span
                            key={idx}
                            className="text-[10px] font-extrabold px-2 py-0.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700"
                          >
                            {rc}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* 💡 전달된 스캐폴딩 힌트 박스 */}
                    <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3.5 space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-extrabold">
                        <span className="text-amber-400 flex items-center space-x-1">
                          <span>💡 전달된 스캐폴딩 힌트</span>
                        </span>
                        <button
                          onClick={() => handleOpenHintModal(item)}
                          className="text-[11px] font-black text-purple-400 hover:text-purple-300 underline"
                        >
                          {item.userActionPlan ? '✍️ 힌트 수정하기' : '✍️ 힌트 추가하기'}
                        </button>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed font-sans whitespace-pre-wrap">
                        {item.userActionPlan || '아직 전달된 힌트가 없습니다. [✍️ 힌트 추가하기]를 눌러 학생에게 스캐폴딩 가이드를 입력해 보세요!'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 🚀 5개씩 더보기 버튼 */}
          {filteredMistakes.length > displayLimit && (
            <div className="pt-4 text-center">
              <button
                onClick={() => setDisplayLimit((prev) => prev + 5)}
                className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-sm shadow-xl shadow-purple-500/20 transition-all flex items-center space-x-2 mx-auto"
              >
                <span>➕ 취약 오답 더보기 (+5개 더)</span>
                <span className="text-xs font-mono opacity-80">
                  ({visibleMistakes.length} / {filteredMistakes.length})
                </span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* ✍️ 스캐폴딩 힌트 작성/수정 모달 */}
      {hintModalTarget && (
        <div className="fixed inset-0 z-50 bg-slate-955/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-purple-500/40 rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <span className="text-xl">✍️</span>
                <h3 className="text-base font-black text-white">
                  스캐폴딩 힌트 전달 - <span className="text-purple-300">{hintModalTarget.studentName}</span> 학생
                </h3>
              </div>
              <button
                onClick={() => setHintModalTarget(null)}
                className="text-slate-400 hover:text-white font-black text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-400">문제: {hintModalTarget.title}</span>
              <textarea
                value={hintInput}
                onChange={(e) => setHintInput(e.target.value)}
                placeholder="예: 1단계 - 이 문제는 공통인수를 먼저 묶어야 해!&#10;2단계 - x^2-y^2 합차 공식을 적용해 보렴!"
                rows={5}
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 transition-all leading-relaxed"
              />
            </div>

            {hintSaveNotice && (
              <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-xl text-xs font-bold text-purple-300 text-center">
                {hintSaveNotice}
              </div>
            )}

            <div className="flex items-center space-x-3 pt-2">
              <button
                onClick={() => setHintModalTarget(null)}
                className="flex-1 py-3 rounded-2xl bg-slate-800 text-slate-300 font-bold text-xs hover:bg-slate-700 transition-all"
              >
                취소
              </button>
              <button
                onClick={handleSaveHint}
                disabled={savingHint}
                className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-purple-500 to-indigo-600 text-white font-black text-xs hover:from-purple-400 hover:to-indigo-500 transition-all shadow-lg shadow-purple-500/20 disabled:opacity-50"
              >
                {savingHint ? '저장 중...' : '학생에게 힌트 전송하기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
