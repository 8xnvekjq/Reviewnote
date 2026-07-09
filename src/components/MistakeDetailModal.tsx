import React from 'react';
import type { MistakeEntry, ReviewState } from '../types';
import { ROOT_CAUSE_OPTIONS, MATH_CURRICULUM, GRADE_LIST } from '../types';
import { LaTeXRenderer } from './LaTeXRenderer';
import { formatDate } from '../utils/date';
import { supabase } from '../services/supabase';

interface MistakeDetailModalProps {
  selectedEntry: MistakeEntry;
  allEntries?: MistakeEntry[]; // 전체 오답 노트 리스트 (통계 분석용)
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
  allEntries = [],
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
  const [progress, setProgress] = React.useState(0);
  const [showResult, setShowResult] = React.useState(!isAnalyzing && !!selectedEntry.analysis);
  const [insightIndex, setInsightIndex] = React.useState(0);
  const analysisCardRef = React.useRef<HTMLDivElement>(null);

  // 1. 개인 오답 데이터 기반 5대 통계 인사이트 도출
  const statsInsights = React.useMemo(() => {
    if (!allEntries || allEntries.length === 0) {
      return [
        { emoji: '📝', title: '나의 오답 노트', value: '첫 오답 노트를 분석해 나만의 수학 약점 노트를 완성해 보세요!' },
        { emoji: '🔥', title: '열정적인 학습', value: '오늘부터 매일 오답을 정리하는 습관을 만들어 가요.' },
        { emoji: '🎯', title: '복습의 중요성', value: '오답을 등록하고 3번 복습을 마친 오답은 자동으로 보관함으로 이동합니다.' },
        { emoji: '🧠', title: '메타인지 훈련', value: '내가 왜 틀렸는지 직시하는 것이 실력 향상의 지름길입니다.' },
        { emoji: '💡', title: '꿀팁 처방전', value: 'AI 분석이 완료되면 맞춤형 힌트와 유사 비디오가 자동 제공됩니다.' }
      ];
    }

    const insights = [];

    // 1-1. 총 오답 개수
    insights.push({
      emoji: '📝',
      title: '총 오답 현황',
      value: `지금까지 총 ${allEntries.length}개의 오답노트를 작성하셨어요!`
    });

    // 1-2. 복습 완료율 (reviews 중 'O'가 3개인 항목)
    const completedCount = allEntries.filter(
      e => e.reviews && e.reviews.filter(r => r === 'O').length === 3
    ).length;
    const completedRate = Math.round((completedCount / allEntries.length) * 100) || 0;
    insights.push({
      emoji: '🎯',
      title: '복습 완료율',
      value: `누적 오답 중 ${completedRate}%(${completedCount}문제)의 복습을 완벽히 마쳤어요. 훌륭해요!`
    });

    // 1-3. 가장 많이 틀린 오답 원인 (rootCauses 집계)
    const causeCount: Record<string, number> = {};
    allEntries.forEach(e => {
      e.rootCauses?.forEach(c => {
        causeCount[c] = (causeCount[c] || 0) + 1;
      });
    });
    const causeMap: Record<string, string> = {
      calc: '🧮 계산 실수',
      formula: '📘 공식 오적용',
      misread: '🔍 문제 오독',
      concept: '🧠 개념 부족',
      strategy: '🎯 풀이 전략 실패'
    };
    let topCauseId = '';
    let topCauseMax = 0;
    Object.entries(causeCount).forEach(([id, count]) => {
      if (count > topCauseMax) {
        topCauseMax = count;
        topCauseId = id;
      }
    });

    if (topCauseId && topCauseMax > 0) {
      insights.push({
        emoji: '📊 취약 원인 분석',
        title: '나의 약점 유형',
        value: `"${causeMap[topCauseId] || topCauseId}"로 인해 틀린 적이 가장 많아요 (${topCauseMax}회).`
      });
    }

    // 1-4. 최다 오답 과목/단원 (grade / chapter 집계)
    const chapterCount: Record<string, number> = {};
    allEntries.forEach(e => {
      if (e.grade && e.chapter) {
        const key = `${e.grade} > ${e.chapter}`;
        chapterCount[key] = (chapterCount[key] || 0) + 1;
      }
    });
    let topChapterKey = '';
    let topChapterMax = 0;
    Object.entries(chapterCount).forEach(([key, count]) => {
      if (count > topChapterMax) {
        topChapterMax = count;
        topChapterKey = key;
      }
    });
    if (topChapterKey && topChapterMax > 0) {
      insights.push({
        emoji: '📚 최다 오답 단원',
        title: '집중 보완 필요',
        value: `"${topChapterKey}" 단원에서 가장 많은 오답(${topChapterMax}문제)이 등록되었어요.`
      });
    }

    // 1-5. 연속 등록일 (스트릭)
    const dates = allEntries
      .map(e => e.date.substring(0, 10))
      .filter((v, i, self) => self.indexOf(v) === i)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

    let streak = 0;
    if (dates.length > 0) {
      const todayStr = new Date().toISOString().substring(0, 10);
      const yesterdayStr = new Date(Date.now() - 86400000).toISOString().substring(0, 10);

      if (dates[0] === todayStr || dates[0] === yesterdayStr) {
        streak = 1;
        for (let i = 0; i < dates.length - 1; i++) {
          const curr = new Date(dates[i]);
          const next = new Date(dates[i + 1]);
          const diffDays = (curr.getTime() - next.getTime()) / (1000 * 3600 * 24);
          if (diffDays === 1) {
            streak++;
          } else if (diffDays > 1) {
            break;
          }
        }
      }
    }

    if (streak >= 2) {
      insights.push({
        emoji: '🔥 연속 기록',
        title: '오답 습관 형성 중',
        value: `벌써 ${streak}일 연속으로 오답을 등록하며 실력을 쌓고 계시네요!`
      });
    } else {
      insights.push({
        emoji: '💡 매일 오답 노트',
        title: '꾸준한 습관',
        value: '매일 틀린 문제를 꾸준히 1개씩 기록하는 습관이 실력 도약의 첫걸음입니다!'
      });
    }

    // 만약 insights 개수가 3개 미만이면 기본 멘트 추가
    while (insights.length < 3) {
      insights.push({
        emoji: '🧠 메타인지 훈련',
        title: '나를 마주하는 시간',
        value: '내가 왜 틀렸는지 분석하고 반성할 때 진짜 내 실력이 됩니다.'
      });
    }

    return insights;
  }, [allEntries]);

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

  // 3. 사진 업로드 후 AI 진단 카드로 부드럽게 스크롤 이동
  React.useEffect(() => {
    if (selectedEntry && !selectedEntry.analysis) {
      const timer = setTimeout(() => {
        analysisCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [selectedEntry.id, selectedEntry.analysis]);

  // 4. 지능형 감속 가상 타이머 로직
  React.useEffect(() => {
    if (isAnalyzing) {
      setProgress(0);
      setShowResult(false);
      
      const startTime = Date.now();
      const timer = setInterval(() => {
        const elapsed = Date.now() - startTime;
        let nextProgress = 0;
        if (elapsed <= 8000) {
          // 0 ~ 8초: 70%까지 빠르게 상승
          nextProgress = (elapsed / 8000) * 70;
        } else if (elapsed <= 20000) {
          // 8 ~ 20초: 90%까지 서서히 상승
          const ratio = (elapsed - 8000) / 12000;
          nextProgress = 70 + ratio * 20;
        } else {
          // 20초 이상: 90%에서 99.5%까지 지수함수 형태로 점근
          const extra = elapsed - 20000;
          nextProgress = 90 + 9.5 * (1 - Math.exp(-extra / 15000));
        }
        setProgress(Math.min(99.5, nextProgress));
      }, 100);

      return () => clearInterval(timer);
    } else {
      // API 응답 완료 (isAnalyzing: true -> false)
      if (progress > 0 && progress < 100) {
        setProgress(100); // 100%로 강제 도달시킴
        const delayTimer = setTimeout(() => {
          setShowResult(true);
        }, 500); // 100% 도달한 상태를 0.5초 노출
        return () => clearTimeout(delayTimer);
      } else {
        setShowResult(!!selectedEntry.analysis);
      }
    }
  }, [isAnalyzing, selectedEntry.id]);

  // 5. 통계 인사이트 자동 슬라이드 로직 (3초 간격)
  React.useEffect(() => {
    if (isAnalyzing) {
      setInsightIndex(0);
      const interval = setInterval(() => {
        setInsightIndex(prev => (prev + 1) % statsInsights.length);
      }, 3000);
      return () => clearInterval(interval);
    } else {
      setInsightIndex(0);
    }
  }, [isAnalyzing, statsInsights.length]);

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

            {/* 단계별 유기적 활성화 영역 (3열 구조 복원 및 포커싱 강화) */}
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
                  <div className="grid grid-cols-3 gap-3">
                    {[0, 1, 2].map((index) => {
                      const state = reviews[index];
                      const isCompleted = state !== '';
                      const isActive = index === activeStep;
                      const isLocked = index > activeStep;

                      let cardStyle = "";
                      if (isActive) {
                        cardStyle = "bg-slate-900 border-indigo-500/80 shadow-lg shadow-indigo-500/5 ring-1 ring-indigo-500/30";
                      } else if (isCompleted) {
                        cardStyle = "bg-slate-900/80 border-slate-800 opacity-95";
                      } else if (isLocked) {
                        cardStyle = "bg-slate-900/40 border-slate-900 opacity-40";
                      }

                      return (
                        <div 
                          key={index} 
                          className={`p-3 rounded-2xl border text-center flex flex-col justify-between min-h-[90px] transition-all duration-300 ${cardStyle}`}
                        >
                          <div className="text-[10px] font-bold text-slate-500 mb-1">{index + 1}차 복습</div>
                          
                          <div className="flex-1 flex items-center justify-center">
                            {isCompleted ? (
                              /* 완료 상태: 큼직한 결과 스탬프 배지 단독 노출 */
                              <div className="animate-scale-up">
                                {state === 'O' && (
                                  <span className="w-9 h-9 rounded-full bg-emerald-500 text-slate-950 font-black text-sm flex items-center justify-center shadow-lg shadow-emerald-500/10">
                                    O
                                  </span>
                                )}
                                {state === 'X' && (
                                  <span className="w-9 h-9 rounded-full bg-red-500 text-white font-black text-sm flex items-center justify-center shadow-lg shadow-red-500/10">
                                    X
                                  </span>
                                )}
                                {state === 'star' && (
                                  <span className="w-9 h-9 rounded-full bg-amber-400 text-slate-950 font-black text-sm flex items-center justify-center shadow-lg shadow-amber-400/10">
                                    ★
                                  </span>
                                )}
                              </div>
                            ) : isActive ? (
                              /* 활성 상태: 클릭 가능한 입력 버튼 활성화 */
                              <div className="flex items-center space-x-1.5 animate-fade-in">
                                <button
                                  onClick={() => handleReviewToggle(index, 'O')}
                                  className="w-7 h-7 rounded-full text-xs font-black bg-slate-800 text-emerald-400 hover:bg-emerald-500 hover:text-slate-950 transition-all active:scale-90 border border-slate-700/60"
                                >
                                  O
                                </button>
                                <button
                                  onClick={() => handleReviewToggle(index, 'X')}
                                  className="w-7 h-7 rounded-full text-xs font-black bg-slate-800 text-red-400 hover:bg-red-500 hover:text-white transition-all active:scale-90 border border-slate-700/60"
                                >
                                  X
                                </button>
                                <button
                                  onClick={() => handleReviewToggle(index, 'star')}
                                  className="w-7 h-7 rounded-full text-xs font-black bg-slate-800 text-amber-400 hover:bg-amber-400 hover:text-slate-950 transition-all active:scale-90 border border-slate-700/60"
                                >
                                  ★
                                </button>
                              </div>
                            ) : (
                              /* 잠금 상태: 🔒 표시 */
                              <div className="text-[10px] text-slate-600 font-bold flex flex-col items-center justify-center space-y-1">
                                <span className="text-xs">🔒</span>
                                <span>대기 중</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* 하단 롤백(앞으로 가기) 및 복습 기록 정리 제어반 */}
                  <div className="flex flex-col space-y-2 mt-1">
                    {activeStep > 0 && (
                      <button
                        onClick={handleRollbackReview}
                        className="px-3 py-1.5 rounded-full bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-500 hover:text-slate-400 font-bold text-[10px] transition-all active:scale-95 w-fit mx-auto flex items-center justify-center mt-1"
                      >
                        <span>↩ 이전 단계로</span>
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
          {(!showResult && (isAnalyzing || (progress > 0 && progress < 100))) ? (
            <div className="py-8 px-4 flex flex-col items-center space-y-8 animate-fade-in bg-slate-900/20 rounded-3xl border border-slate-800/40 backdrop-blur-md">
              {/* 상단: 타이머와 로딩 텍스트를 담은 세련된 원형 기기 */}
              <div className="flex flex-col items-center space-y-4">
                <div className="relative w-32 h-32 flex items-center justify-center">
                  {/* 뒷배경 서클 트랙 */}
                  <svg className="w-full h-full transform -rotate-90">
                    <circle
                      cx="64"
                      cy="64"
                      r="54"
                      className="stroke-slate-800/60"
                      strokeWidth="6"
                      fill="transparent"
                    />
                    {/* 앞 배경 프로그레스 서클 */}
                    <circle
                      cx="64"
                      cy="64"
                      r="54"
                      className="stroke-indigo-500 transition-all duration-100 ease-out"
                      strokeWidth="6"
                      fill="transparent"
                      strokeDasharray="339.29"
                      strokeDashoffset={339.29 - (339.29 * progress) / 100}
                      strokeLinecap="round"
                    />
                  </svg>
                  {/* 중앙 진행 퍼센티지 텍스트 */}
                  <div className="absolute flex flex-col items-center justify-center">
                    <span className="text-2xl font-black text-white font-mono">
                      {Math.round(progress)}%
                    </span>
                    <span className="text-[10px] text-indigo-400 font-bold tracking-wider mt-0.5 animate-pulse">
                      진단 중
                    </span>
                  </div>
                </div>
                
                {/* 진행 상황 및 남은 예상 시간 설명 */}
                <div className="text-center space-y-1">
                  <p className="text-sm font-semibold text-white tracking-tight flex items-center justify-center space-x-1.5 min-h-[20px]">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping"></span>
                    <span className="animate-pulse">{loadingText}</span>
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {progress >= 100 ? (
                      <span className="text-emerald-400 font-bold animate-pulse">완료! 상세 진단을 표시합니다...</span>
                    ) : progress >= 90 ? (
                      <span>마지막 맞춤 처방을 다듬는 중입니다...</span>
                    ) : (
                      <span>예상 대기 시간: 약 {Math.max(1, Math.round((30 * (100 - progress)) / 100))}초</span>
                    )}
                  </p>
                </div>
              </div>

              {/* 중앙 분할선 */}
              <div className="w-full max-w-md h-[1px] bg-gradient-to-r from-transparent via-slate-800 to-transparent"></div>

              {/* 하단: 통계 인사이트 카드 */}
              <div className="w-full max-w-sm">
                <div className="text-center mb-3">
                  <span className="text-[10px] font-extrabold text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-full border border-indigo-500/20 tracking-widest uppercase">
                    📊 나의 오답 분석 분석소
                  </span>
                </div>
                
                {/* 카드 본체 */}
                <div className="min-h-[110px] bg-slate-950/80 border border-slate-850 p-4.5 rounded-2xl relative shadow-inner flex flex-col justify-center transition-all duration-300">
                  <div className="flex items-start space-x-3">
                    <span className="text-2xl mt-0.5 select-none animate-bounce">
                      {statsInsights[insightIndex]?.emoji}
                    </span>
                    <div className="space-y-1 flex-1 text-left">
                      <h5 className="text-xs font-black text-slate-300">
                        {statsInsights[insightIndex]?.title}
                      </h5>
                      <p className="text-xs text-slate-400 leading-relaxed font-medium">
                        {statsInsights[insightIndex]?.value}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 인디케이터 도트 */}
                <div className="flex items-center justify-center space-x-1.5 mt-3.5">
                  {statsInsights.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setInsightIndex(idx)}
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        idx === insightIndex ? 'w-4 bg-indigo-500' : 'w-1.5 bg-slate-800'
                      }`}
                    ></button>
                  ))}
                </div>
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
            <div 
              ref={analysisCardRef}
              className="py-8 bg-slate-950/60 rounded-2xl border border-slate-800 p-6 text-center space-y-4"
            >
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
