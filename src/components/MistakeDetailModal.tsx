import React from 'react';
import type { MistakeEntry, ReviewState } from '../types';
import { ROOT_CAUSE_OPTIONS, MATH_CURRICULUM, GRADE_LIST } from '../types';
import { LaTeXRenderer } from './LaTeXRenderer';
import { formatDate } from '../utils/date';
import { supabase } from '../services/supabase';

interface MistakeDetailModalProps {
  selectedEntry: MistakeEntry;
  isAnalyzing: boolean;
  youtubeLectures?: any[]; // DB로부터 가져온 55개 강의 마스터 리스트
  onClose: () => void;
  onDeleteMistake: (id: string, e: React.MouseEvent) => void;
  onStartAnalysis: (entry: MistakeEntry) => void;
  onUpdateReviews: (id: string, newReviews: ReviewState[]) => void;
  onUpdateEntry: (updated: MistakeEntry) => void;
}

const NORMAL_PHRASES = [
  '문제 분석을 시작합니다...',
  '문제 이미지 분석 중...',
  '수학 수식 및 기호 판독 중...',
  '지문 텍스트 복원 중...',
  '개념 검색 중...',
  '정석 풀이 작성 중...',
  '단계별 힌트 구성 중...',
  '과목 및 단원 분류 중...'
];

export const MistakeDetailModal: React.FC<MistakeDetailModalProps> = ({
  selectedEntry,
  isAnalyzing,
  youtubeLectures = [],
  onClose,
  onDeleteMistake,
  onStartAnalysis,
  onUpdateReviews,
  onUpdateEntry,
}) => {
  const [revealedHintCount, setRevealedHintCount] = React.useState(0);
  const [loadingText, setLoadingText] = React.useState('수학 문제 분석을 시작합니다...');

  // Student editable fields
  const [editGrade, setEditGrade] = React.useState(selectedEntry.grade || '');
  const [editChapter, setEditChapter] = React.useState(selectedEntry.chapter || '');
  const [editRootCauses, setEditRootCauses] = React.useState<string[]>(selectedEntry.rootCauses || []);
  const [editActionPlan, setEditActionPlan] = React.useState(selectedEntry.userActionPlan || '');
  const [isSaving, setIsSaving] = React.useState(false);

  // Image lightbox zoom states
  const [isZoomOpen, setIsZoomOpen] = React.useState(false);
  const [zoomScale, setZoomScale] = React.useState(1);

  // Accordion toggle states
  const [showProblemText, setShowProblemText] = React.useState(false);
  const [showSolvingProcess, setShowSolvingProcess] = React.useState(true); // Default open for study
  const [showMistakeSummary, setShowMistakeSummary] = React.useState(false); // Default collapsed for self-study

  const chaptersForGrade = editGrade ? (MATH_CURRICULUM[editGrade] || []) : [];

  // ★ 모든 학생 대상 유튜브 매칭 알고리즘 (하이브리드 AI-우선 / 키워드-보완)
  const matchedLecture = React.useMemo(() => {
    // [우선순위 1] AI가 분석 시점에 직접 지정한 매칭 정보가 있을 때 (1안 적용 대상)
    const aiVideoId = selectedEntry.analysis?.matchedVideoId;
    if (aiVideoId) {
      const bestVideo = youtubeLectures.find(v => v.videoId === aiVideoId);
      if (bestVideo) {
        return {
          videoId: bestVideo.videoId,
          videoTitle: bestVideo.title,
          chapterTitle: selectedEntry.analysis?.matchedChapterTitle || '추천 단원 개념 강의',
          startSeconds: selectedEntry.analysis?.matchedStartSeconds ?? 0
        };
      }
    }

    // [우선순위 2] AI 매칭 정보가 없을 때: 기존 로컬 스코어 매칭 로직 작동 (하위 호환용 Fallback)
    const SYNONYM_MAP: Record<string, string[]> = {
      '오메가': ['omega', '\\omega', 'ω'],
      '로그': ['log'],
      '지수': ['exponent', '거듭제곱근', '제곱근'],
      '행렬': ['matrix', '정사각행렬', '영행렬', '단위행렬', '케일리'],
      '조합': ['combination', '뽑기'],
      '순열': ['permutation', '팩토리얼', 'factorial'],
      '부등식': ['절댓값부등식', '가우스', '연립이차부등식', '이차부등식'],
      '함수': ['최대최소', '이차함수'],
      '방정식': ['근과 계수', '삼사차방정식', '연립이차방정식', '이차방정식'],
      '수열': ['sequence', '등차수열', '등비수열', '시그마', '귀납법', '원리합계'],
      '삼각함수': ['trigonometric', 'sin', 'cos', 'tan', '사인', '코사인', '탄젠트', '호도법', '사인법칙', '코사인법칙'],
      '함수의 극한과 연속': ['limit', 'continuity', '극한', '연속', '좌극한', '우극한', '사잇값', '최대최소정리', '샌드위치', '조임정리', '가우스'],
      '미분': ['derivative', '접선', '극대', '극소', '롤의 정리', '평균값 정리', '도함수', '곱미분', '나머지정리', '비율관계', '속도와 가속도', '변화율', '법선'],
      '적분': ['integral', '정적분', '부정적분', '넓이', '속도와 거리', '6분의 공식', '12분의 공식', '구분구적법', 'FTC', '원시함수', '적분상수'],
      '수열의 극한': ['급수', '등비급수', '수열의 극한', '부분합', '조화급수', '샌드위치 정리', '등비수열의 극한', '자연상수', 'e'],
      '미분법': ['몫의 미분법', '합성함수의 미분법', '음함수 미분법', '역함수 미분법', '매개변수', '지수함수의 미분', '로그함수의 미분', '삼각함수의 미분', '삼각함수의 덧셈정리', '극대극소', '접선의 방정식', '체인룰', '이계도함수'],
      '적분법': ['치환적분', '부분적분', '삼각함수의 부정적분', '부피', '속도와 거리', '구분구적법', '회전체', '단면적'],
      '공통수학1_경우의 수': ['순열', '조합', '합의 법칙', '곱의 법칙', '일렬로', '나열', '이웃', '교대로', '대표'],
      '확률과 통계_경우의 수': ['원순열', '중복순열', '중복조합', '이항정리', '같은 것이 있는 순열', '조합', '순열', '팩토리얼', '이항계수', '파스칼', '하키스틱'],
      '확률': ['조건부확률', '독립시행', '종속', '독립', '여사건', '덧셈정리', '곱셈정리', '전확률', '베이즈', '배반사건', '표본공간'],
      '통계': ['확률분포', '이항분포', '정규분포', '통계적 추정', '표본평균', '신뢰구간', '신뢰도', '모평균', '표본분산', '기댓값', '분산', '표준편차', '이산확률변수', '연속확률변수', '확률밀도함수', '모집단', '표본 조사']
    };

    const targetGrade = selectedEntry.grade;
    const targetChapter = selectedEntry.chapter || '';
    const problemText = selectedEntry.analysis?.problemText || '';
    const problemTitle = selectedEntry.title || '';
    const searchPool = (problemTitle + ' ' + targetChapter + ' ' + problemText).toLowerCase();

    // 1. 해당 과목(grade)에 속하는 강의 동영상들 필터링
    const matchedVideos = youtubeLectures.filter(v => v.grade === targetGrade);
    if (matchedVideos.length === 0) return null;

    let bestVideo = null;
    let bestChapter = null;
    let maxScore = 0; // 0점 초과 매칭 점수만 유효 (랜덤 추천 원천 방지)

    // 2. 동영상 내의 모든 챕터별로 정밀 매칭 점수 계산
    for (const video of matchedVideos) {
      const videoTitleClean = video.title.toLowerCase();
      const chaptersList = (video.chapters && video.chapters.length > 0)
        ? video.chapters
        : [{ startSeconds: 0, chapterTitle: '개념 강의 처음부터' }];

      for (const ch of chaptersList) {
        let score = 0;
        const chapterTitleClean = ch.chapterTitle.toLowerCase();

        // [핵심 1] 단원명과 챕터명이 높은 연관성을 가질 때 (가장 신뢰도 높음)
        if (targetChapter && (
          chapterTitleClean.includes(targetChapter.toLowerCase()) ||
          targetChapter.toLowerCase().includes(chapterTitleClean)
        )) {
          score += 15;
        }

        // [핵심 2] 챕터 타이틀이 문제 본문/제목에 그대로 포함될 때
        if (searchPool.includes(chapterTitleClean)) {
          score += 10;
        }

        // [핵심 3] 동의어가 서로 일치하는 경우
        for (const [key, synonyms] of Object.entries(SYNONYM_MAP)) {
          let cleanKey = key;
          if (key.includes('_')) {
            const [gradePrefix, realKey] = key.split('_');
            if (gradePrefix !== targetGrade) {
              continue;
            }
            cleanKey = realKey;
          }
          if (chapterTitleClean.includes(cleanKey.toLowerCase()) || videoTitleClean.includes(cleanKey.toLowerCase())) {
            if (synonyms.some(syn => searchPool.includes(syn.toLowerCase()))) {
              score += 8;
            }
          }
        }

        // [보너스] 영상 제목 대조 보너스 점수
        if (searchPool.includes(videoTitleClean)) {
          score += 5;
        }
        if (targetChapter && videoTitleClean.includes(targetChapter.toLowerCase())) {
          score += 3;
        }

        // 점수 갱신
        if (score > maxScore) {
          maxScore = score;
          bestVideo = video;
          bestChapter = ch;
        }
      }
    }

    // 최소 매칭 연관성 기준 점수(0점 초과)에 미달하면 카드를 아예 표시하지 않음
    if (!bestVideo || !bestChapter || maxScore === 0) {
      return null;
    }

    return {
      videoId: bestVideo.videoId,
      videoTitle: bestVideo.title,
      chapterTitle: bestChapter.chapterTitle,
      startSeconds: bestChapter.startSeconds
    };
  }, [selectedEntry, youtubeLectures]);

  // 1. Reset all local states when the selected mistake ID changes (opening a different mistake card)
  React.useEffect(() => {
    setRevealedHintCount(0);
    setShowProblemText(false);
    setShowSolvingProcess(true);
    setShowMistakeSummary(false); // ID 변경 시 아코디언 닫음
    setEditGrade(selectedEntry.grade || '');
    setEditChapter(selectedEntry.chapter || '');
    setEditRootCauses(selectedEntry.rootCauses || []);
    setEditActionPlan(selectedEntry.userActionPlan || '');
  }, [selectedEntry.id]);

  // 2. Sync grade and chapter when they change in parent (e.g. when AI classification finishes)
  React.useEffect(() => {
    if (selectedEntry.grade) {
      setEditGrade(selectedEntry.grade);
    }
    if (selectedEntry.chapter) {
      setEditChapter(selectedEntry.chapter);
    }
  }, [selectedEntry.grade, selectedEntry.chapter]);

  // Loading text cycling effect
  React.useEffect(() => {
    if (!isAnalyzing) {
      setLoadingText('처리 중...');
      return;
    }
    
    setLoadingText('문제 분석을 시작합니다...');

    const interval = setInterval(() => {
      const nextText = NORMAL_PHRASES[Math.floor(Math.random() * NORMAL_PHRASES.length)];
      setLoadingText(nextText);
    }, 1500);

    return () => clearInterval(interval);
  }, [isAnalyzing]);

  const hasStruggled = selectedEntry.reviews?.some(r => r === 'X' || r === 'star');

  const handleReviewToggle = (index: number, state: ReviewState) => {
    const currentReviews = [...(selectedEntry.reviews || ['', '', ''])];
    currentReviews[index] = currentReviews[index] === state ? '' : state;
    onUpdateReviews(selectedEntry.id, currentReviews as ReviewState[]);
  };

  const handleRollbackReview = () => {
    const currentReviews = [...(selectedEntry.reviews || ['', '', ''])];
    // activeStep을 계산해 그 직전 완료된 단계를 초기화
    let activeStep = 3;
    for (let i = 0; i < 3; i++) {
      if (currentReviews[i] === '') {
        activeStep = i;
        break;
      }
    }
    const targetIndex = activeStep === 3 ? 2 : activeStep - 1;
    if (targetIndex >= 0) {
      currentReviews[targetIndex] = '';
      onUpdateReviews(selectedEntry.id, currentReviews as ReviewState[]);
    }
  };

  const toggleRootCause = (id: string) => {
    setEditRootCauses(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  // ★ 저장하기 피드백 개선: 완료 알림 띄우고 모달 닫기
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('mistakes')
        .update({
          grade: editGrade || null,
          chapter: editChapter || null,
          root_causes: editRootCauses,
          user_action_plan: editActionPlan || null,
        })
        .eq('id', selectedEntry.id);
      
      if (error) throw error;
      
      onUpdateEntry({
        ...selectedEntry,
        grade: editGrade || undefined,
        chapter: editChapter || undefined,
        rootCauses: editRootCauses,
        userActionPlan: editActionPlan || undefined,
      });

      alert('성공적으로 저장되었습니다! 🎉');
      onClose(); // 저장 완료 후 모달창을 자동으로 닫아 위화감을 없앱니다.
    } catch (err: any) {
      alert('저장 실패: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full max-w-3xl bg-slate-900 border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-slide-up">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/80 sticky top-0">
          <div className="pr-4 flex-1">
            <span className="text-[10px] text-slate-500 font-bold block uppercase tracking-wider">
              {formatDate(selectedEntry.date)}
            </span>
            <h3 className="font-bold text-white text-base line-clamp-1 min-w-0">
              <LaTeXRenderer 
                text={selectedEntry.title} 
                className="text-white font-bold text-base line-clamp-1 inline-block w-full"
              />
            </h3>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 active:scale-90 flex items-center justify-center text-slate-400 text-lg transition-all flex-none"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Problem Image Preview */}
          <div 
            onClick={() => setIsZoomOpen(true)}
            className="w-full rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center relative p-2 min-h-[200px] cursor-zoom-in group/img"
          >
            <img 
              src={selectedEntry.imageUrl} 
              alt={selectedEntry.title} 
              className="w-full h-auto max-h-[60vh] object-contain rounded-xl group-hover/img:opacity-90 transition-opacity" 
            />
            <div className="absolute bottom-4 right-4 bg-slate-950/80 border border-slate-800 rounded-lg px-2.5 py-1 text-[10px] text-slate-400 font-bold flex items-center space-x-1.5 shadow backdrop-blur opacity-0 group-hover/img:opacity-100 transition-opacity">
              <span>🔍 크게 보기</span>
            </div>
          </div>

          {/* 3-Step Review Status Selection Card */}
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-850 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 flex items-center">
                <span className="mr-1 text-sm">📋</span> 복습 상태 진단 (3회 완료 시 보관함 이동)
              </span>
              <div className="flex-none">
                {selectedEntry.reviews?.filter(r => r === 'O').length === 3 ? (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30 font-bold">
                    🎉 복습 완료
                  </span>
                ) : (
                  <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full border border-slate-700 font-bold">
                    진행 중
                  </span>
                )}
              </div>
            </div>

            {/* 단계별 노출 영역 */}
            {(() => {
              const reviews = selectedEntry.reviews || ['', '', ''];
              let activeStep = 3;
              for (let i = 0; i < 3; i++) {
                if (reviews[i] === '') {
                  activeStep = i;
                  break;
                }
              }

              return (
                <>
                  {activeStep < 3 ? (
                    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 text-center space-y-3 shadow-inner">
                      <div className="text-xs font-extrabold text-indigo-400">
                        ✨ {activeStep + 1}차 복습을 완료하셨나요?
                      </div>
                      <p className="text-[10px] text-slate-500">
                        아래 결과를 선택하시면 다음 복습 단계가 활성화됩니다.
                      </p>
                      <div className="flex items-center justify-center space-x-3.5 pt-1">
                        <button
                          onClick={() => handleReviewToggle(activeStep, 'O')}
                          className="w-10 h-10 rounded-full text-sm font-black transition-all flex items-center justify-center bg-slate-855 text-emerald-400 hover:bg-emerald-500 hover:text-slate-950 shadow-sm border border-slate-700/60 active:scale-90"
                        >
                          O
                        </button>
                        <button
                          onClick={() => handleReviewToggle(activeStep, 'X')}
                          className="w-10 h-10 rounded-full text-sm font-black transition-all flex items-center justify-center bg-slate-855 text-red-400 hover:bg-red-500 hover:text-white shadow-sm border border-slate-700/60 active:scale-90"
                        >
                          X
                        </button>
                        <button
                          onClick={() => handleReviewToggle(activeStep, 'star')}
                          className="w-10 h-10 rounded-full text-sm font-black transition-all flex items-center justify-center bg-slate-855 text-amber-400 hover:bg-amber-400 hover:text-slate-950 shadow-sm border border-slate-700/60 active:scale-90"
                        >
                          ★
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-emerald-950/15 p-4 rounded-xl border border-emerald-500/20 text-center space-y-1">
                      <div className="text-xs font-extrabold text-emerald-400">
                        🏆 복습 미션 올클리어!
                      </div>
                      <p className="text-[10px] text-slate-500">
                        이 문제는 완전히 정복했습니다. 완료 보관함으로 자동 보관됩니다.
                      </p>
                    </div>
                  )}

                  {/* 하단 롤백(앞으로 가기) 및 복습 기록 정리 제어반 */}
                  <div className="flex flex-col space-y-2 mt-1">
                    {activeStep > 0 && (
                      <button
                        onClick={() => {
                          const targetName = activeStep === 3 ? '3차' : `${activeStep}차`;
                          if (confirm(`실수로 클릭하셨나요? 이전 단계인 ${targetName} 복습 전 상태로 되돌립니다.`)) {
                            handleRollbackReview();
                          }
                        }}
                        className="w-full py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 active:scale-95 border border-slate-700/60 text-slate-400 font-bold text-xs transition-all flex items-center justify-center space-x-1.5"
                      >
                        <span>↩ 이전 단계로 (롤백)</span>
                      </button>
                    )}

                    {activeStep === 3 && (
                      <button
                        onClick={() => {
                          if (confirm('틀리거나 보류한 기록을 정리하고 맞춘(O) 기록만 앞으로 정렬하여 다시 복습하시겠습니까?')) {
                            const oReviews = (selectedEntry.reviews || []).filter(r => r === 'O');
                            const newReviews = [...oReviews, '', ''].slice(0, 3) as ReviewState[];
                            onUpdateReviews(selectedEntry.id, newReviews);
                          }
                        }}
                        className="w-full py-2.5 rounded-xl bg-indigo-600/10 hover:bg-indigo-600/20 active:scale-95 border border-indigo-500/20 text-indigo-400 font-bold text-xs transition-all flex items-center justify-center space-x-1.5"
                      >
                        <span>🔄 맞춘 오답 제외하고 복습 기록 정리하기</span>
                      </button>
                    )}
                  </div>
                </>
              );
            })()}
          </div>

          {/* ⚡ AI 틀린 이유 1줄 진단 */}
          {selectedEntry.analysis?.mistakeSummary &&
            selectedEntry.analysis.mistakeSummary !== '학생 풀이 없음' && (
            <div className="space-y-2 border-l-4 border-red-500 pl-4 py-1">
              <button
                onClick={() => setShowMistakeSummary(!showMistakeSummary)}
                className="w-full flex items-center justify-between text-left focus:outline-none group"
              >
                <h4 className="text-sm font-extrabold text-red-400 flex items-center group-hover:text-red-300 transition-colors">
                  <span className="mr-1.5 text-base">⚡</span> AI 틀린 이유 진단
                </h4>
                <span className="text-xs text-slate-500 font-bold mr-1 group-hover:text-slate-400 transition-colors">
                  {showMistakeSummary ? '▲ 닫기' : '▼ 보기'}
                </span>
              </button>
              {showMistakeSummary && (
                <div className="bg-red-950/20 p-4.5 rounded-2xl border border-red-500/20 animate-scale-up mt-2">
                  <LaTeXRenderer 
                    text={selectedEntry.analysis.mistakeSummary} 
                    className="text-xs sm:text-sm leading-relaxed text-red-200" 
                  />
                </div>
              )}
            </div>
          )}
          {/* ⚡ AI 추천 동영상 딥링크 연동 카드 (test 학생 한정) */}
          {matchedLecture && (
            <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-3.5 flex items-center justify-between space-x-3.5 animate-scale-up">
              <div className="flex items-center space-x-3 min-w-0">
                <span className="text-xl flex-none">📺</span>
                <div className="min-w-0 space-y-0.5">
                  <p className="text-[10px] font-black text-rose-400 uppercase tracking-wider">선생님 추천 강의</p>
                  <h5 className="text-xs font-bold text-slate-200 truncate leading-tight">
                    {matchedLecture.videoTitle}
                  </h5>
                  <p className="text-[10px] text-slate-400 truncate">
                    ⏱️ {matchedLecture.chapterTitle} ({
                      Math.floor(matchedLecture.startSeconds / 60) > 0 
                        ? `${Math.floor(matchedLecture.startSeconds / 60)}분 ${matchedLecture.startSeconds % 60}초` 
                        : `${matchedLecture.startSeconds % 60}초`
                    }부터)
                  </p>
                </div>
              </div>

              <a
                href={`https://youtu.be/${matchedLecture.videoId}?t=${matchedLecture.startSeconds}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 active:scale-95 text-rose-300 hover:text-rose-200 font-extrabold text-[10px] border border-rose-500/20 transition-all flex items-center space-x-1 flex-none shadow-md"
              >
                <span>▶️</span>
                <span>바로가기</span>
              </a>
            </div>
          )}


          {hasStruggled && selectedEntry.analysis?.hints && selectedEntry.analysis.hints.length > 0 && (
            <div className="bg-slate-950 p-4.5 rounded-2xl border border-slate-850 space-y-3 animate-scale-up">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-400 flex items-center">
                  <span className="mr-1.5 text-sm">💡</span> 단계별 힌트
                </span>
                <span className="text-[10px] text-slate-500 font-bold">
                  {revealedHintCount} / 3 공개됨
                </span>
              </div>

              <div className="space-y-2.5">
                {selectedEntry.analysis.hints.slice(0, revealedHintCount).map((hint, i) => (
                  <div key={i} className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 animate-scale-up space-y-1">
                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block">힌트 {i + 1}단계</span>
                    <LaTeXRenderer text={hint} className="text-xs md:text-sm leading-relaxed text-slate-300" />
                  </div>
                ))}
              </div>

              {revealedHintCount < 3 ? (
                <button
                  onClick={() => setRevealedHintCount(prev => prev + 1)}
                  className="w-full py-2.5 rounded-xl bg-indigo-600/10 hover:bg-indigo-600/20 active:scale-95 border border-indigo-500/20 text-indigo-400 font-bold text-xs transition-all flex items-center justify-center space-x-1"
                >
                  <span>🔍 힌트 {revealedHintCount + 1} 보기</span>
                </button>
              ) : (
                <p className="text-[10px] text-slate-500 text-center font-medium py-1">
                  모든 힌트가 공개되었습니다. 아래 풀이를 참고하여 오답을 완벽히 이해해 보세요!
                </p>
              )}
            </div>
          )}

          {/* AI Analysis trigger / solving process rendering */}
          {isAnalyzing ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-4">
              <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
              <div className="text-center min-h-[60px] flex flex-col justify-center">
                <p className="text-sm font-semibold text-white animate-pulse">{loadingText}</p>
                <p className="text-xs text-slate-400 mt-1">AI 수학 클리닉 진단을 작성하고 있습니다.</p>
              </div>
            </div>
          ) : selectedEntry.analysis ? (
            <div className="space-y-6 animate-scale-up">
              
              {/* Card 0: 원본 문제 지문 복원 */}
              {selectedEntry.analysis.problemText && (
                <div className="space-y-2 border-l-4 border-slate-400 pl-4 py-1">
                  <button
                    onClick={() => setShowProblemText(!showProblemText)}
                    className="w-full flex items-center justify-between text-left focus:outline-none group"
                  >
                    <h4 className="text-sm font-extrabold text-slate-300 flex items-center group-hover:text-white transition-colors">
                      <span className="mr-1.5 text-base">📝</span> 원본 문제 지문
                    </h4>
                    <span className="text-xs text-slate-500 font-bold mr-1 group-hover:text-slate-400 transition-colors">
                      {showProblemText ? '▲ 닫기' : '▼ 보기'}
                    </span>
                  </button>
                  {showProblemText && (
                    <div className="bg-slate-950 p-4.5 rounded-2xl border border-slate-850 animate-scale-up mt-2">
                      <LaTeXRenderer text={selectedEntry.analysis.problemText} className="text-sm md:text-base leading-relaxed text-slate-300" />
                    </div>
                  )}
                </div>
              )}

              {/* Card 1: 정석 풀이 과정 */}
              <div className="space-y-2 border-l-4 border-indigo-500 pl-4 py-1">
                <button
                  onClick={() => setShowSolvingProcess(!showSolvingProcess)}
                  className="w-full flex items-center justify-between text-left focus:outline-none group"
                >
                  <h4 className="text-sm font-extrabold text-indigo-400 flex items-center group-hover:text-indigo-300 transition-colors">
                    <span className="mr-1.5 text-base">💡</span> 정석 풀이 과정
                  </h4>
                  <span className="text-xs text-slate-500 font-bold mr-1 group-hover:text-slate-400 transition-colors">
                    {showSolvingProcess ? '▲ 닫기' : '▼ 보기'}
                  </span>
                </button>
                {showSolvingProcess && (
                  <div className="bg-slate-950 p-4.5 rounded-2xl border border-slate-850 animate-scale-up mt-2">
                    <LaTeXRenderer text={selectedEntry.analysis.solvingProcess} className="text-sm md:text-base leading-relaxed" />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="py-8 bg-slate-950/60 rounded-2xl border border-slate-800 p-6 text-center space-y-4">
              <div className="text-3xl">🤖</div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-white">AI 수학 클리닉 진단</p>
                <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
                  아직 오답 원인이 분석되지 않았습니다. AI가 설계하는 맞춤형 오답 처방전을 확인해 보세요.
                </p>
              </div>
              <button 
                onClick={() => onStartAnalysis({
                  ...selectedEntry,
                  grade: editGrade || undefined,
                  chapter: editChapter || undefined,
                  rootCauses: editRootCauses,
                  userActionPlan: editActionPlan || undefined
                })}
                className="px-6 py-2.5 rounded-full bg-gradient-to-r from-indigo-600 to-indigo-500 active:scale-95 transition-all text-xs font-bold text-white shadow-md shadow-indigo-600/20"
              >
                AI 분석 시작하기
              </button>
            </div>
          )}

          {/* ── 학생 입력 영역 ── */}
          <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/30">
            <div className="bg-slate-800/50 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
              <span className="text-xs font-extrabold text-slate-300">✏️ 오답 클리닉 기록</span>
              {(selectedEntry.grade || selectedEntry.rootCauses?.length) && (
                <div className="flex items-center space-x-1.5">
                  {selectedEntry.grade && <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-600/20 text-indigo-400 border border-indigo-600/30 font-bold">{selectedEntry.grade}</span>}
                  {selectedEntry.chapter && <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700 text-slate-300 border border-slate-600 font-bold">{selectedEntry.chapter}</span>}
                </div>
              )}
            </div>
            <div className="p-4 space-y-4">

              {/* 과목 / 단원 선택 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400 block">과목 (AI 자동분류)</label>
                  <select 
                    value={editGrade} 
                    onChange={e => { setEditGrade(e.target.value); setEditChapter(''); }}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white outline-none focus:border-indigo-500 transition-colors cursor-pointer"
                  >
                    <option value="">선택하세요</option>
                    {GRADE_LIST.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400 block">단원</label>
                  <select 
                    value={editChapter} 
                    onChange={e => setEditChapter(e.target.value)}
                    disabled={!editGrade}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white outline-none focus:border-indigo-500 transition-colors cursor-pointer disabled:opacity-40"
                  >
                    <option value="">선택하세요</option>
                    {chaptersForGrade.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* 실수 원인 체크박스 */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-400 block">실수 원인 (복수 선택 가능)</label>
                <div className="space-y-2">
                  {ROOT_CAUSE_OPTIONS.map(opt => (
                    <label 
                      key={opt.id} 
                      className="flex items-center space-x-3 cursor-pointer group"
                    >
                      <div
                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-none transition-all ${
                          editRootCauses.includes(opt.id)
                            ? 'bg-amber-500 border-amber-500'
                            : 'bg-slate-950 border-slate-700 group-hover:border-amber-500/50'
                        }`}
                        onClick={() => toggleRootCause(opt.id)}
                      >
                        {editRootCauses.includes(opt.id) && <span className="text-white text-[10px] font-black">✓</span>}
                      </div>
                      <div onClick={() => toggleRootCause(opt.id)}>
                        <span className="text-xs font-semibold text-slate-200">{opt.label}</span>
                        <span className="text-[10px] text-slate-500 ml-1.5">{opt.desc}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* 나만의 대책 */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 block">나만의 대책 (직접 작성)</label>
                <textarea
                  value={editActionPlan}
                  onChange={e => setEditActionPlan(e.target.value)}
                  placeholder="이번 실수를 통해 앞으로 어떻게 풀겠다는 나만의 대책을 자유롭게 적어보세요..."
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-600 outline-none focus:border-emerald-500 transition-colors resize-none leading-relaxed"
                />
              </div>

            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-950/60 flex space-x-3">
          <button
            onClick={(e) => onDeleteMistake(selectedEntry.id, e)}
            className="py-3 px-4 rounded-xl border border-red-500/20 hover:border-red-500/40 bg-red-500/5 hover:bg-red-500/10 active:scale-95 transition-all text-xs font-bold text-red-400 flex items-center justify-center space-x-1.5"
          >
            <span>🗑️</span>
            <span>삭제</span>
          </button>
          
          <button 
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-slate-800 hover:border-slate-700 active:scale-95 transition-all text-xs font-semibold text-slate-300"
          >
            닫기
          </button>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 active:scale-95 disabled:opacity-50 transition-all text-xs font-bold text-white shadow-md shadow-emerald-600/20"
          >
            {isSaving ? '저장 중...' : '✅ 저장하기'}
          </button>
        </div>

      </div>

      {/* 이미지 전체화면 확대 모달 */}
      {isZoomOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex flex-col justify-between p-4 animate-fade-in"
          onClick={() => {
            setIsZoomOpen(false);
            setZoomScale(1);
          }}
        >
          {/* Top Bar */}
          <div className="flex items-center justify-between z-10 w-full pl-2">
            <span className="text-[10px] font-bold text-slate-400">
              🔍 화면을 더블 탭(클릭)하면 2배 확대됩니다.
            </span>
            <button 
              onClick={() => {
                setIsZoomOpen(false);
                setZoomScale(1);
              }}
              className="w-9 h-9 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-white hover:bg-slate-800 text-lg transition-all"
            >
              ✕
            </button>
          </div>

          {/* Image Container */}
          <div 
            className={`flex-1 w-full overflow-auto p-4 cursor-zoom-out ${
              zoomScale === 2 ? 'block' : 'flex items-center justify-center'
            }`}
          >
            <img 
              src={selectedEntry.imageUrl} 
              alt="확대된 문제 이미지" 
              onClick={(e) => {
                e.stopPropagation();
                setZoomScale(prev => (prev === 1 ? 2 : 1));
              }}
              className={`rounded-lg select-none transition-all duration-300 ${
                zoomScale === 2 
                  ? 'max-w-none w-[200%] h-auto block' 
                  : 'max-w-full max-h-[80vh] object-contain block'
              }`}
            />
          </div>
          
          {/* Bottom Bar indicator */}
          <div className="text-center z-10 py-2">
            <span className="text-[9px] text-slate-500 font-semibold bg-slate-900/60 px-3 py-1 rounded-full border border-slate-800/40">
              배율: {zoomScale}x
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
