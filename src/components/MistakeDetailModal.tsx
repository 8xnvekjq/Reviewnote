import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import type { MistakeEntry, MistakeAnalysis, ReviewState } from '../types';
import { ROOT_CAUSE_OPTIONS, MATH_CURRICULUM, GRADE_LIST, SOLVING_PLACEHOLDER_TEXT } from '../types';
import { LaTeXRenderer } from './LaTeXRenderer';
import { formatDate } from '../utils/date';
import { supabase } from '../services/supabase';
import { GACHA_ITEMS, getRarityTheme } from '../utils/gachaCatalog';
import { CatPawIcon } from './CatPawIcon';
import { MistakeScaffoldingDrawer } from './MistakeScaffoldingDrawer';
import { HandwritingOverlay } from './HandwritingOverlay';
import { CollapsibleSection } from './CollapsibleSection';

interface MistakeDetailModalProps {
  selectedEntry: MistakeEntry;
  allEntries?: MistakeEntry[];
  peerActivities?: any[];
  isAnalyzing: boolean;
  averageWaitMs?: number | null; // diagnosis_stats 테이블 기반 평균 진단 소요시간(ms) — 오답 카드 삭제와 무관하게 유지됨
  youtubeLectures?: any[]; // DB로부터 가져온 55개 강의 마스터 리스트
  onClose: () => void;
  onDeleteMistake: (id: string, e: React.MouseEvent) => void;
  onStartAnalysis: (entry: MistakeEntry) => void;
  onUpdateReviews: (id: string, newReviews: ReviewState[], skipPointRecalc?: boolean) => void;
  onUpdateCheckpointStatus: (id: string, stageIndex: number, checkpointIndex: number, newStatus: 'understood' | 'stuck') => void;
  checkpointRegenStatus?: 'generating' | 'success' | 'failed'; // 정리하기(초기화) 후 단계형 체크리스트 재생성 진행 상태
  onRetryCheckpointGeneration?: () => void; // 재생성 실패 시 "다시 시도"
  checklistStatus?: 'generating' | 'failed'; // 체크리스트 2.0 생성 진행 상태('ready'는 없음 — analysis.solutionChecklist 존재 자체가 ready)
  onToggleChecklistItem: (entryId: string, itemId: string) => void;
  onRetryChecklistGeneration?: () => void; // 체크리스트 2.0 생성 실패 시 "다시 시도"
  onUploadAnswerImage: (blob: Blob) => void; // 재풀이 사진 업로드(선택, 1장) — 원본 문제 이미지와 별개
  onDeleteAnswerImage: () => void;
  isUploadingAnswerImage?: boolean;
  onUpdateEntry: (updated: MistakeEntry) => void;
  onSelectEntry?: (entry: MistakeEntry | null) => void;
  isReviewSession?: boolean;
  equippedStamp?: string;
  profilesStampMap?: Record<string, string>;
  currentUserId?: string;
  isAdmin?: boolean;
  aiPersonaName?: string; // AI 이름 변경권으로 바꾼 커스텀 AI 페르소나 이름 (없으면 기본값 '밤티')
  comboBoosterExpiresAt?: string | null; // 콤보 부스터 5배 버프 만료시각 (서버 profiles 기준)
}

const getInitialPhrases = (personaName: string) => [
  `${personaName}가 문제 이미지를 열심히 판독하고 있어요... 🔍`,
  `${personaName}가 수학 수식과 기호들을 꼼꼼하게 정리하고 있어요. ✍️`
];

type ImageWindowResizeCorner = 'nw' | 'ne' | 'sw' | 'se';

interface ImageWindowLayout {
  left: number;
  top: number;
  width: number;
  height: number;
}

const IMAGE_WINDOW_MIN_SIZE = { width: 300, height: 240 };

const IMAGE_WINDOW_RESIZE_HANDLES: Array<{
  corner: ImageWindowResizeCorner;
  label: string;
  className: string;
  iconClassName: string;
}> = [
  { corner: 'nw', label: '왼쪽 위에서 문제창 크기 조절', className: 'left-0 top-0 cursor-nwse-resize items-start justify-start', iconClassName: 'border-l-2 border-t-2 rounded-tl-sm' },
  { corner: 'ne', label: '오른쪽 위에서 문제창 크기 조절', className: 'right-0 top-0 cursor-nesw-resize items-start justify-end', iconClassName: 'border-r-2 border-t-2 rounded-tr-sm' },
  { corner: 'sw', label: '왼쪽 아래에서 문제창 크기 조절', className: 'left-0 bottom-0 cursor-nesw-resize items-end justify-start', iconClassName: 'border-l-2 border-b-2 rounded-bl-sm' },
  { corner: 'se', label: '오른쪽 아래에서 문제창 크기 조절', className: 'right-0 bottom-0 cursor-nwse-resize items-end justify-end', iconClassName: 'border-r-2 border-b-2 rounded-br-sm' },
];

const getInitialImageWindowLayout = (): ImageWindowLayout => {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const margin = viewportWidth >= 900 ? 20 : 8;
  const width = Math.max(
    IMAGE_WINDOW_MIN_SIZE.width,
    Math.min(viewportWidth - margin * 2, viewportWidth >= 900 ? Math.round(viewportWidth * 0.48) : viewportWidth - margin * 2, 680),
  );
  const height = Math.max(
    IMAGE_WINDOW_MIN_SIZE.height,
    Math.min(viewportHeight - margin * 2, viewportWidth >= 900 ? viewportHeight - 100 : Math.round(viewportHeight * 0.55), 620),
  );

  return {
    left: margin,
    top: viewportWidth >= 900 ? 64 : margin,
    width,
    height,
  };
};

export const MistakeDetailModal: React.FC<MistakeDetailModalProps> = ({
  selectedEntry,
  allEntries = [],
  peerActivities = [],
  isAnalyzing,
  averageWaitMs = null,
  youtubeLectures = [],
  onClose,
  onDeleteMistake,
  onStartAnalysis,
  onUpdateReviews,
  onUpdateCheckpointStatus,
  checkpointRegenStatus,
  onRetryCheckpointGeneration,
  checklistStatus,
  onToggleChecklistItem,
  onRetryChecklistGeneration,
  onUploadAnswerImage,
  onDeleteAnswerImage,
  isUploadingAnswerImage = false,
  onUpdateEntry,
  onSelectEntry,
  isReviewSession = false,
  equippedStamp,
  profilesStampMap = {},
  currentUserId = '',
  comboBoosterExpiresAt,
  isAdmin = false,
  aiPersonaName = '밤티',
}) => {
  // classify(1차) 단계가 끝나면 solve(2차)가 완료되기 전에도 analysis 객체 자체는 이미
  // (자리표시자 텍스트를 담은 채로) DB에 존재한다. solve가 타임아웃 등으로 끝내 실패하면
  // "analysis가 있냐 없냐"만으로는 성공/실패를 구분할 수 없어서, 자리표시자를 완성된
  // 풀이인 것처럼 화면에 그대로 박아버리는(=학생 눈엔 영원히 멈춘 "무한로딩") 버그가 있었다.
  // 반드시 solvingProcess가 자리표시자가 아닌 실제 내용인지로 판단해야 한다.
  const hasRealAnalysis = (entry: MistakeEntry): entry is MistakeEntry & { analysis: MistakeAnalysis } =>
    !!entry.analysis?.solvingProcess && entry.analysis.solvingProcess !== SOLVING_PLACEHOLDER_TEXT;

  // 손 필기 / 펜슬 풀이 오버레이 — 저장하면 스캐폴딩(본인 풀이)으로 등록되므로,
  // 저장될 때마다 이 값을 올려서 MistakeScaffoldingDrawer가 목록을 다시 불러오게 한다.
  const [isHandwritingOpen, setIsHandwritingOpen] = React.useState(false);
  const [scaffoldingRefreshKey, setScaffoldingRefreshKey] = React.useState(0);

  const authorStamp = selectedEntry.userId ? profilesStampMap[selectedEntry.userId] : equippedStamp;
  // 장착한 스탬프의 실제 뽑기 등급(UR/SSR/SR/R)에 맞는 테두리 클래스
  const authorStampCatalogItem = authorStamp
    ? GACHA_ITEMS.find(g => g.category === 'STAMP' && g.effectValue === authorStamp)
    : undefined;
  const authorStampBorderClass = authorStampCatalogItem ? getRarityTheme(authorStampCatalogItem.rarity).border : '';
  const [loadingText, setLoadingText] = React.useState('수학 문제 분석을 시작합니다...');
  const [progress, setProgress] = React.useState(0);
  const [elapsedMs, setElapsedMs] = React.useState(0);
  const [showResult, setShowResult] = React.useState(!isAnalyzing && hasRealAnalysis(selectedEntry));
  const analysisCardRef = React.useRef<HTMLDivElement>(null);
  const wasAnalyzingRef = React.useRef(isAnalyzing);

  // Student editable fields
  const [editGrade, setEditGrade] = React.useState(selectedEntry.grade || '');
  const [editChapter, setEditChapter] = React.useState(selectedEntry.chapter || '');
  const [editRootCauses, setEditRootCauses] = React.useState<string[]>(selectedEntry.rootCauses || []);
  const [editActionPlan, setEditActionPlan] = React.useState(selectedEntry.userActionPlan || '');
  const [editFinalAnswer, setEditFinalAnswer] = React.useState(selectedEntry.analysis?.finalAnswer || '');
  const [isSaving, setIsSaving] = React.useState(false);

  // 🎯 정답 수정 팝업 임시 편집값 (null이면 닫힘). 팝업 '저장'은 editFinalAnswer만 갱신하고,
  // 실제 DB 반영은 기존 하단 '저장하기'(handleSave)가 그대로 담당한다 — 새 저장 경로를 만들지 않음.
  const [answerDraft, setAnswerDraft] = React.useState<string | null>(null);

  // Image lightbox zoom states & Touch gestures (Pinch-to-zoom)
  const [isZoomOpen, setIsZoomOpen] = React.useState(false);
  const [scale, setScale] = React.useState(1);
  const [position, setPosition] = React.useState({ x: 0, y: 0 });
  const [imageWindowLayout, setImageWindowLayout] = React.useState<ImageWindowLayout>(getInitialImageWindowLayout);
  const touchStartRef = React.useRef({ x: 0, y: 0 });
  const initialDistanceRef = React.useRef(0);
  const initialScaleRef = React.useRef(1);
  const isDraggingRef = React.useRef(false);
  const imageWindowDragRef = React.useRef({
    dragging: false,
    startX: 0,
    startY: 0,
    originLeft: 0,
    originTop: 0,
  });
  const imageWindowResizeRef = React.useRef({
    resizing: false,
    corner: 'se' as ImageWindowResizeCorner,
    startX: 0,
    startY: 0,
    origin: { left: 0, top: 0, width: 0, height: 0 },
  });

  // 🧭 이미지 위 필기(1차, 임시) — DB/Storage에 저장하지 않는다. 좌표 계산을 단순하게 유지하기
  // 위해 필기 모드는 항상 scale=1/position=(0,0)(원본 배율)에서만 동작한다 — 그래서 좌표
  // 변환(스케일/팬 역산) 없이 컨테이너의 getBoundingClientRect()를 그대로 로컬 좌표계로 쓸 수
  // 있다. 이동/확대 모드로 돌아가 실제로 배율이나 위치를 바꾸면(그 순간부터 필기가 이미지와
  // 어긋날 수 있으므로) 기존 필기를 지운다.
  const [isDrawMode, setIsDrawMode] = React.useState(false);
  const [drawStrokes, setDrawStrokes] = React.useState<{ x: number; y: number }[][]>([]);
  const drawContainerRef = React.useRef<HTMLDivElement>(null);
  const isDrawingRef = React.useRef(false);

  // Accordion toggle states
  const [showQuickAnswer, setShowQuickAnswer] = React.useState(false); // 복습 체크 전 스크롤 없이 정답만 바로 확인 (기본 접힘 — 실수로 먼저 보는 것 방지)
  const [showSolvingProcess, setShowSolvingProcess] = React.useState(false); // 기본 접힘 — 대책을 적기 전에 정답부터 스크롤로 보게 되는 것 방지

  // 🧭 능동 학습 UX: AI 진단이 막 완료된 순간 "나만의 대책" 입력란을 짧게(부드럽게) 강조한다.
  // 강제 스크롤은 하지 않는다 — 화면이 갑자기 이동하는 UX보다 조용한 하이라이트를 택함.
  const [actionPlanHighlight, setActionPlanHighlight] = React.useState(false);
  // "직접 다시 풀어보기" CTA를 이번 카드 보기 세션 동안만 건너뛰었는지(영구 저장 아님 — 카드를
  // 다시 열면 또 보인다, 죄책감 유발 요소 없이 매번 가볍게 제안만 함).
  const [reproposeDismissed, setReproposeDismissed] = React.useState(false);
  const answerImageInputRef = useRef<HTMLInputElement>(null);

  // 💡 동일 문제 연속 클릭 쿨다운 커스텀 알림 모달 상태
  const [isCooldownNoticeOpen, setIsCooldownNoticeOpen] = React.useState(false);

  // ── 다음 오답 이동을 위한 미완료 정렬 목록 연산 ──────────────────────────────
  // 🐛 숨김 카드 복습 재노출 버그 수정: App.tsx의 handleStartReviewSession(세션 진입점)에는
  // isHidden 필터가 있었지만, 이 목록(세션 "내부" 진행에 쓰이는 "다음" 버튼/자동진행)에는
  // 없었다 — 그래서 세션 진입 시점엔 안 보이던 숨김 카드가 세션 도중 재등장했다.
  const uncompletedSorted = React.useMemo(() => {
    return allEntries
      .filter(m => {
        if (m.isHidden) return false;
        const oCount = m.reviews?.filter(r => r === 'O').length || 0;
        return oCount < 3;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [allEntries]);

  const currentIndex = React.useMemo(() => {
    return uncompletedSorted.findIndex(m => m.id === selectedEntry.id);
  }, [uncompletedSorted, selectedEntry.id]);

  const hasNextEntry = onSelectEntry && currentIndex !== -1 && currentIndex < uncompletedSorted.length - 1;
  const nextEntry = hasNextEntry ? uncompletedSorted[currentIndex + 1] : null;

  // 카드가 다음 카드로 전환될 때 모달 내부 편집 폼 상태값 동기화
  // 주의: rootCauses/userActionPlan은 학생이 직접 작성하는 필드라, AI 분석(isAnalyzing) 완료로
  // 이 effect가 재실행되면서 분석 대기 중 입력하던 내용을 덮어써버리는 버그가 있었음.
  // 이 두 필드는 selectedEntry.id가 바뀔 때(다른 카드로 전환할 때)만 동기화하는 아래 effect에서 처리하고,
  // 여기서는 AI가 직접 판정하는 grade/chapter만 동기화한다.
  React.useEffect(() => {
    setEditGrade(selectedEntry.grade || '');
    setEditChapter(selectedEntry.chapter || '');
    setShowResult(!isAnalyzing && hasRealAnalysis(selectedEntry));
  }, [selectedEntry.id, selectedEntry.grade, selectedEntry.chapter, isAnalyzing]);

  // ── 핀치 줌 및 터치 드래그 제스처 핸들러 ──────────────────────────────
  // 필기 모드에서는 이동/확대 제스처를 완전히 비활성화한다(모드 분리 — 손가락 하나로 "긋는" 것과
  // "미는" 것을 동시에 지원하지 않고 명확히 나눔).
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isDrawMode) return;
    if (e.touches.length === 1) {
      isDraggingRef.current = scale > 1;
      const touch = e.touches[0];
      touchStartRef.current = { x: touch.clientX - position.x, y: touch.clientY - position.y };
    } else if (e.touches.length === 2) {
      isDraggingRef.current = false;
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const distance = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      initialDistanceRef.current = distance;
      initialScaleRef.current = scale;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isDrawMode) return;
    if (e.touches.length === 1 && isDraggingRef.current) {
      const touch = e.touches[0];
      const dx = touch.clientX - touchStartRef.current.x;
      const dy = touch.clientY - touchStartRef.current.y;

      // 드래그 최대 범위 제한 (확대 상태에서 화면 밖으로 끝없이 사라짐 방지)
      const maxDragX = (scale - 1) * 200;
      const maxDragY = (scale - 1) * 300;
      const boundedX = Math.max(-maxDragX, Math.min(maxDragX, dx));
      const boundedY = Math.max(-maxDragY, Math.min(maxDragY, dy));

      clearDrawStrokesIfAny(); // 팬으로 실제 위치가 바뀌면 기존 필기가 어긋나므로 정리
      setPosition({ x: boundedX, y: boundedY });
    } else if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const distance = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      if (initialDistanceRef.current > 0) {
        const factor = distance / initialDistanceRef.current;
        let newScale = initialScaleRef.current * factor;
        // 최소 1배 ~ 최대 4.5배 줌 스케일 제한
        newScale = Math.max(1, Math.min(4.5, newScale));
        clearDrawStrokesIfAny(); // 배율이 실제로 바뀌면 기존 필기가 어긋나므로 정리
        setScale(newScale);

        if (newScale === 1) {
          setPosition({ x: 0, y: 0 });
        }
      }
    }
  };

  const handleTouchEnd = () => {
    if (isDrawMode) return;
    isDraggingRef.current = false;
    if (scale <= 1) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
    }
  };

  const safeSetPointerCapture = (element: HTMLElement, pointerId: number) => {
    try {
      element.setPointerCapture(pointerId);
    } catch (error) {
      console.warn('Problem image pointer capture failed:', error);
    }
  };

  const resetImageZoom = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const openImageWindow = () => {
    if (!isZoomOpen) {
      setImageWindowLayout(getInitialImageWindowLayout());
      resetImageZoom();
    }
    setIsZoomOpen(true);
  };

  const closeImageWindow = () => {
    setIsZoomOpen(false);
    resetImageZoom();
    setIsDrawMode(false);
    setDrawStrokes([]); // 임시 필기 — 창을 닫으면 저장 없이 사라짐
  };

  // 배율/위치가 실제로 바뀌기 직전에 호출 — 필기가 있으면 더 이상 이미지와 일치를 보장할 수
  // 없으므로 정리한다(조용히 어긋난 채로 남지 않도록).
  const clearDrawStrokesIfAny = () => {
    setDrawStrokes(prev => (prev.length > 0 ? [] : prev));
  };

  const updateImageScale = (nextScale: number) => {
    const boundedScale = Math.max(1, Math.min(4.5, nextScale));
    if (boundedScale !== scale) clearDrawStrokesIfAny();
    setScale(boundedScale);
    if (boundedScale === 1) setPosition({ x: 0, y: 0 });
  };

  // 이동/확대 ↔ 필기 모드 전환. 필기 모드로 들어갈 때는 항상 원본 배율(1x)로 리셋해 좌표
  // 변환 없이 그릴 수 있게 한다.
  const enterDrawMode = () => {
    resetImageZoom();
    setIsDrawMode(true);
  };

  const exitDrawMode = () => {
    setIsDrawMode(false);
  };

  const getLocalDrawPoint = (clientX: number, clientY: number) => {
    const rect = drawContainerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const handleDrawPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDrawMode) return;
    isDrawingRef.current = true;
    safeSetPointerCapture(e.currentTarget, e.pointerId);
    const pt = getLocalDrawPoint(e.clientX, e.clientY);
    setDrawStrokes(prev => [...prev, [pt]]);
  };

  const handleDrawPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDrawMode || !isDrawingRef.current) return;
    const pt = getLocalDrawPoint(e.clientX, e.clientY);
    setDrawStrokes(prev => {
      if (prev.length === 0) return prev;
      const next = prev.slice();
      next[next.length - 1] = [...next[next.length - 1], pt];
      return next;
    });
  };

  const handleDrawPointerUp = () => {
    isDrawingRef.current = false;
  };

  const handleImageWindowDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    imageWindowDragRef.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      originLeft: imageWindowLayout.left,
      originTop: imageWindowLayout.top,
    };
    safeSetPointerCapture(e.currentTarget, e.pointerId);
  };

  const handleImageWindowDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const state = imageWindowDragRef.current;
    if (!state.dragging) return;
    const margin = 8;
    const nextLeft = Math.max(
      margin,
      Math.min(window.innerWidth - imageWindowLayout.width - margin, state.originLeft + e.clientX - state.startX),
    );
    const nextTop = Math.max(
      margin,
      Math.min(window.innerHeight - imageWindowLayout.height - margin, state.originTop + e.clientY - state.startY),
    );
    setImageWindowLayout((layout) => ({ ...layout, left: nextLeft, top: nextTop }));
  };

  const handleImageWindowDragEnd = () => {
    imageWindowDragRef.current.dragging = false;
  };

  const handleImageWindowResizeStart = (
    e: React.PointerEvent<HTMLButtonElement>,
    corner: ImageWindowResizeCorner,
  ) => {
    e.stopPropagation();
    imageWindowResizeRef.current = {
      resizing: true,
      corner,
      startX: e.clientX,
      startY: e.clientY,
      origin: imageWindowLayout,
    };
    safeSetPointerCapture(e.currentTarget, e.pointerId);
  };

  const handleImageWindowResizeMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const state = imageWindowResizeRef.current;
    if (!state.resizing) return;
    const margin = 8;
    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;
    const usesWest = state.corner.includes('w');
    const usesNorth = state.corner.includes('n');
    let nextLeft = state.origin.left;
    let nextTop = state.origin.top;
    let nextWidth = state.origin.width;
    let nextHeight = state.origin.height;

    if (usesWest) {
      nextLeft = Math.max(
        margin,
        Math.min(state.origin.left + state.origin.width - IMAGE_WINDOW_MIN_SIZE.width, state.origin.left + dx),
      );
      nextWidth = state.origin.width + state.origin.left - nextLeft;
    } else {
      nextWidth = Math.max(
        IMAGE_WINDOW_MIN_SIZE.width,
        Math.min(window.innerWidth - state.origin.left - margin, state.origin.width + dx),
      );
    }

    if (usesNorth) {
      nextTop = Math.max(
        margin,
        Math.min(state.origin.top + state.origin.height - IMAGE_WINDOW_MIN_SIZE.height, state.origin.top + dy),
      );
      nextHeight = state.origin.height + state.origin.top - nextTop;
    } else {
      nextHeight = Math.max(
        IMAGE_WINDOW_MIN_SIZE.height,
        Math.min(window.innerHeight - state.origin.top - margin, state.origin.height + dy),
      );
    }

    clearDrawStrokesIfAny(); // 창 크기가 바뀌면 필기 좌표계(컨테이너 픽셀 기준)도 어긋나므로 정리
    setImageWindowLayout({ left: nextLeft, top: nextTop, width: nextWidth, height: nextHeight });
  };

  const handleImageWindowResizeEnd = () => {
    imageWindowResizeRef.current.resizing = false;
  };

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
        if (targetChapter && targetChapter.trim().length > 1 && chapterTitleClean.length > 1 && (
          chapterTitleClean.includes(targetChapter.toLowerCase()) ||
          targetChapter.toLowerCase().includes(chapterTitleClean)
        )) {
          score += 15;
        }

        // [핵심 2] 챕터 타이틀이 문제 본문/제목에 그대로 포함될 때 (한 글자 초과 조건 추가로 짧은 음절 배제)
        if (chapterTitleClean.length > 1 && searchPool.includes(chapterTitleClean)) {
          score += 10;
        }

        // [핵심 3] 동의어가 서로 일치하는 경우 (오직 현재 타겟 단원에 대응하는 키만 매칭되도록 가점 범위 제한)
        for (const [key, synonyms] of Object.entries(SYNONYM_MAP)) {
          let cleanKey = key;
          if (key.includes('_')) {
            const [gradePrefix, realKey] = key.split('_');
            if (gradePrefix !== targetGrade) {
              continue;
            }
            cleanKey = realKey;
          }
          if (targetChapter && (
            cleanKey.toLowerCase().includes(targetChapter.toLowerCase()) ||
            targetChapter.toLowerCase().includes(cleanKey.toLowerCase())
          )) {
            if (chapterTitleClean.includes(cleanKey.toLowerCase()) || videoTitleClean.includes(cleanKey.toLowerCase())) {
              if (synonyms.some(syn => searchPool.includes(syn.toLowerCase()))) {
                score += 8;
              }
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

        // [특수 우선순위] 선생님의 최근 유튜브 강의(제목의 월/일 날짜가 최신인 영상) 우선 매칭
        // 비디오 제목의 M/D(월/일) 포맷을 파싱하여 학기 선후관계(yearOffset)를 고려한 가중치 부여
        const dateMatch = video.title.match(/^(\d{1,2})\/(\d{1,2})\s/);
        if (dateMatch && score > 0) {
          const month = parseInt(dateMatch[1], 10);
          const day = parseInt(dateMatch[2], 10);
          // 학년도 학기 흐름상 8~12월은 작년 하반기 영상, 1~7월은 올해 상반기 최신 영상으로 분류
          const yearOffset = (month >= 8 && month <= 12) ? 0 : 1200;
          const dateVal = yearOffset + (month * 100) + day;
          score += dateVal * 0.05;
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
  // 🐛 UX1 버그 수정: 이 effect가 showSolvingProcess는 이미 리셋하고 있었지만 showQuickAnswer가
  // 빠져 있었다 — 그래서 한 카드에서 정답을 펼친 뒤 "다음" 카드로 넘어가면 새 카드에서도 정답이
  // 펼쳐진 채로 보이는 스포일러 버그가 있었다. showQuickAnswer를 여기 추가해서 카드 전환 시
  // 함께 닫히게 한다.
  React.useEffect(() => {
    setShowQuickAnswer(false);
    setShowSolvingProcess(false);
    setAnswerDraft(null); // 정답 수정 팝업도 카드 전환 시 닫음
    setEditGrade(selectedEntry.grade || '');
    setEditChapter(selectedEntry.chapter || '');
    setEditRootCauses(selectedEntry.rootCauses || []);
    setEditActionPlan(selectedEntry.userActionPlan || '');
    setEditFinalAnswer(selectedEntry.analysis?.finalAnswer || ''); // 카드 전환 시 정답 미리보기도 새 카드 값으로 재동기화
    setReproposeDismissed(false); // "직접 다시 풀어보기" 건너뛰기 여부도 카드 전환 시 초기화(이번 세션 한정 상태)
  }, [selectedEntry.id]);

  // 2. Sync grade/chapter/finalAnswer only when AI classification finishes (분석 시작 전엔 비어있다가 완료 후 채워짐)
  React.useEffect(() => {
    if (wasAnalyzingRef.current && !isAnalyzing) {
      if (selectedEntry.grade) {
        setEditGrade(selectedEntry.grade);
      }
      if (selectedEntry.chapter) {
        setEditChapter(selectedEntry.chapter);
      }
      if (selectedEntry.analysis?.finalAnswer) {
        setEditFinalAnswer(selectedEntry.analysis.finalAnswer);
      }
    }
    wasAnalyzingRef.current = isAnalyzing;
  }, [isAnalyzing, selectedEntry.grade, selectedEntry.chapter, selectedEntry.analysis?.finalAnswer]);

  // 2.5. AI 진단이 "이 카드에서" 막 완료된 순간에만 나만의 대책 입력란을 짧게 강조한다. id도 함께
  // 비교하는 이유: wasAnalyzingRef(위)는 카드 전환만으로도 true→false가 될 수 있는데(다른 카드를
  // 분석 중이다가 분석 중이 아닌 카드로 전환), 그런 경우까지 "이 카드의 AI 진단이 완료됐다"고
  // 오인해 엉뚱한 카드에서 강조가 반짝이면 안 되기 때문.
  const prevHighlightTriggerRef = React.useRef({ id: selectedEntry.id, isAnalyzing });
  React.useEffect(() => {
    const prev = prevHighlightTriggerRef.current;
    if (prev.id === selectedEntry.id && prev.isAnalyzing && !isAnalyzing) {
      setActionPlanHighlight(true);
      const timer = setTimeout(() => setActionPlanHighlight(false), 1400);
      prevHighlightTriggerRef.current = { id: selectedEntry.id, isAnalyzing };
      return () => clearTimeout(timer);
    }
    prevHighlightTriggerRef.current = { id: selectedEntry.id, isAnalyzing };
  }, [isAnalyzing, selectedEntry.id]);

  // Loading text cycling effect with real-time statistics and domain metadata
  React.useEffect(() => {
    if (!isAnalyzing) {
      setLoadingText('처리 중...');
      return;
    }
    
    // 1. 동적 반복 멘트 풀(repeatPhrases) 조립
    const repeatPhrases: string[] = [];

    // 누적 오답 개수 및 복습 완료율 동적 문구 추가
    if (allEntries && allEntries.length > 0) {
      repeatPhrases.push(`지금까지 누적 오답 카드를 ${allEntries.length}개나 돌파했어요! 🚀`);

      // 복습 완료율 집계 (3차 복습 O 완료)
      const completedCount = allEntries.filter(entry => {
        const reviews = entry.reviews || [];
        return reviews.filter(r => r === 'O').length === 3;
      }).length;

      if (completedCount > 0) {
        repeatPhrases.push(`지금까지 총 ${completedCount}개의 오답을 완벽하게 해결해 보관함에 넣었어요! 🎉`);
        const completionRatio = Math.round((completedCount / allEntries.length) * 100);
        repeatPhrases.push(`벌써 전체 오답 중 ${completionRatio}%를 완벽하게 정복하여 완료했답니다! 🏆`);
      }
    }

    // 복습 정답률, 오늘 등록 공부량, 잠자는 오답 리마인더 통계 추가
    if (allEntries && allEntries.length > 0) {
      // 복습 정답률 집계 (O의 비율)
      let totalReviewAttempts = 0;
      let successReviewAttempts = 0;
      allEntries.forEach((entry: MistakeEntry) => {
        (entry.reviews || []).forEach(r => {
          if (r === 'O' || r === 'X') {
            totalReviewAttempts++;
            if (r === 'O') successReviewAttempts++;
          }
        });
      });

      if (totalReviewAttempts > 0) {
        const passRate = Math.round((successReviewAttempts / totalReviewAttempts) * 100);
        repeatPhrases.push(`최근 복습 정답률이 ${passRate}%에 달하고 있어요! 실력이 쑥쑥 자라나고 있네요. 📈`);
      }

      // 오늘 하루 공부량 집계
      const today = new Date();
      const todayYear = today.getFullYear();
      const todayMonth = today.getMonth();
      const todayDate = today.getDate();
      const todayRegisteredCount = allEntries.filter(entry => {
        if (!entry.date) return false;
        const d = new Date(entry.date);
        return d.getFullYear() === todayYear && d.getMonth() === todayMonth && d.getDate() === todayDate;
      }).length;

      if (todayRegisteredCount > 0) {
        repeatPhrases.push(`오늘 벌써 ${todayRegisteredCount}개의 오답을 등록했어요. 오늘의 성실함이 빛나네요! ✍️`);
      }

      // 잠자는 오답 리마인더 (가장 오래 복습을 안 한 카드 검출)
      const unreviewedEntries = allEntries
        .filter(entry => {
          const reviews = entry.reviews || [];
          return reviews.length === 0 || reviews.every(r => r === '');
        })
        .sort((a, b) => {
          if (!a.date) return 1;
          if (!b.date) return -1;
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        });

      if (unreviewedEntries.length > 0) {
        const sleepingEntry = unreviewedEntries[0];
        const sleepingGrade = sleepingEntry.grade || '공통';
        const sleepingChapter = sleepingEntry.chapter || '기타';
        repeatPhrases.push(`아직 복습을 시작하지 않은 '${sleepingGrade} ➔ ${sleepingChapter}' 카드도 차근차근 해결해 봐요! 🔍`);
      }
    }

    // 실수 원인 비율 통계 동적 문구 추가
    if (allEntries && allEntries.length > 0) {
      const causeCounts: Record<string, number> = {};
      let totalCauses = 0;
      allEntries.forEach((entry: MistakeEntry) => {
        (entry.rootCauses || []).forEach((cause: string) => {
          causeCounts[cause] = (causeCounts[cause] || 0) + 1;
          totalCauses++;
        });
      });

      if (totalCauses > 0) {
        let topCause = '';
        let topCount = 0;
        Object.entries(causeCounts).forEach(([cause, count]) => {
          if (count > topCount) {
            topCount = count;
            topCause = cause;
          }
        });

        const option = ROOT_CAUSE_OPTIONS.find(opt => opt.id === topCause);
        if (option) {
          const ratio = Math.round((topCount / totalCauses) * 100);
          repeatPhrases.push(`최근에는 '${option.label}' 유형(${ratio}%)의 오답률이 높은 편이에요. ${aiPersonaName}와 함께 집중 공략해 봐요! 🎯`);
        }
      }
    }



    // 실시간 동료 복습 자극 문구 추가 (최근 피드 연동)
    if (peerActivities && peerActivities.length > 0) {
      peerActivities.slice(0, 3).forEach((act: any) => {
        const studentName = act.display_name || act.username || '동료 학생';
        const reviewsArr = act.reviews || ['', '', ''];
        let lastReview = '';
        for (let i = 2; i >= 0; i--) {
          if (reviewsArr[i] !== '') {
            lastReview = reviewsArr[i];
            break;
          }
        }
        const cleanTitle = (act.title || '').replace(/\$[^$]+\$/g, '').replace(/[#*`_]/g, '').slice(0, 15);
        
        if (lastReview === 'O') {
          repeatPhrases.push(`👤 ${studentName}님이 방금 '${cleanTitle}...' 오답을 깔끔하게 해결했어요! 🎉`);
        } else {
          repeatPhrases.push(`👤 ${studentName}님이 '${cleanTitle}...' 복습 카드에 다시 도전하는 중... 👀`);
        }
      });
    }

    // 동적 멘트 풀이 아예 없을 시 폴백 문구
    if (repeatPhrases.length === 0) {
      repeatPhrases.push('오늘도 힘차게 수학 오답 정복에 나선 당신을 응원해요! 🍩');
    }

    // 최초 0초 시작 문구 노출 (첫 번째 정적 문구)
    const initialPhrases = getInitialPhrases(aiPersonaName);
    setLoadingText(initialPhrases[0]);

    let count = 1;
    const interval = setInterval(() => {
      if (count < initialPhrases.length) {
        // 초반 3초 시점에는 INITIAL_PHRASES 순서대로 1회성 출력
        setLoadingText(initialPhrases[count]);
      } else {
        // 초반 정적 문구 노출이 끝나면, 동적 멘트 풀(repeatPhrases)에서 무작위(Random)로 롤링 출력
        const randomIndex = Math.floor(Math.random() * repeatPhrases.length);
        setLoadingText(repeatPhrases[randomIndex]);
      }
      count++;
    }, 3000); // 3초 주기

    return () => clearInterval(interval);
  }, [isAnalyzing, allEntries, peerActivities, selectedEntry.grade, selectedEntry.chapter, aiPersonaName]);

  // 3. 사진 업로드 후 AI 진단 카드로 부드럽게 스크롤 이동
  React.useEffect(() => {
    if (selectedEntry && !selectedEntry.analysis) {
      const timer = setTimeout(() => {
        analysisCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [selectedEntry.id, selectedEntry.analysis]);

  // 4. 실제 평균 대기시간 기반 선형 타이머 로직
  // (예전에는 시간대별로 가속/감속하는 연출용 곡선이었는데, 실제 경과 시간과 무관하게
  // 움직이는 것처럼 느껴진다는 피드백에 따라 "경과시간 / 평균시간"에 정확히 비례하는
  // 선형 진행률로 교체했습니다. 평균을 넘기면 링은 99%에서 멈추고 별도로 초과 시간을 표시합니다.)
  React.useEffect(() => {
    if (isAnalyzing) {
      setProgress(0);
      setElapsedMs(0);
      setShowResult(false);

      const startTime = Date.now();
      // 실제 평균 대기시간(averageWaitMs)이 3건 이상 쌓여 있으면 그 값을 기준으로,
      // 아직 데이터가 부족하면 기존의 20초 가정치를 기준으로 선형 계산합니다.
      const referenceTime = averageWaitMs ?? 20000;
      const timer = setInterval(() => {
        const elapsed = Date.now() - startTime;
        setElapsedMs(elapsed);
        setProgress(Math.min(99, (elapsed / referenceTime) * 100));
      }, 100);

      return () => clearInterval(timer);
    } else {
      // API 응답 완료 (isAnalyzing: true -> false)
      if (progress > 0 && progress < 100) {
        if (hasRealAnalysis(selectedEntry)) {
          setProgress(100); // 성공 시에만 100%로 도달 후 전환
          const delayTimer = setTimeout(() => {
            setShowResult(true);
          }, 500);
          return () => clearTimeout(delayTimer);
        } else {
          // 분석 실패(타임아웃 등)로 자리표시자만 남았을 시, 99%에 멈추지 않고 0%로 안전 리셋
          // + "AI 분석 시작하기" 버튼 화면으로 돌아가도록 showResult도 false로 유지
          setProgress(0);
          setShowResult(false);
        }
      } else {
        setShowResult(hasRealAnalysis(selectedEntry));
        if (!hasRealAnalysis(selectedEntry)) {
          setProgress(0);
        }
      }
    }
  }, [isAnalyzing, selectedEntry.id]);



  // 동일한 문제 카드(id)별 마지막 복습 완료 시각 기록 (연속 1분 이내 어뷰징 클릭 방지용)
  const lastReviewTimesRef = useRef<Record<string, number>>({});

  const handleReviewToggle = (
    index: number,
    state: ReviewState,
    e?: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>
  ) => {
    const currentReviews = [...(selectedEntry.reviews || ['', '', ''])];
    const isAddingCheck = state !== '' && currentReviews[index] !== state;

    // 복습 체크('O', 'X', 'star')를 새로 등록하는 경우 쿨다운 검증 (동일 문제 카드 기준)
    if (isAddingCheck) {
      const now = Date.now();
      const lastTime = lastReviewTimesRef.current[selectedEntry.id] || 0;
      const diffSec = Math.floor((now - lastTime) / 1000);

      // 동일 문제 카드에 한해 마지막 복습 체크 후 60초(1분)가 지나지 않은 경우 차단
      if (lastTime > 0 && diffSec < 60) {
        setIsCooldownNoticeOpen(true);
        return;
      }

      // 타임스탬프 업데이트
      lastReviewTimesRef.current[selectedEntry.id] = now;

      // 터치/클릭한 자리 위치 추출하여 플로팅 포인트 팝업 디스패치
      let clientX = window.innerWidth / 2;
      let clientY = window.innerHeight / 2;
      if (e) {
        const mouseEvt = e as React.MouseEvent<HTMLButtonElement>;
        const touchEvt = e as React.TouchEvent<HTMLButtonElement>;
        if (mouseEvt.clientX && mouseEvt.clientX > 0) {
          clientX = mouseEvt.clientX;
          clientY = mouseEvt.clientY;
        } else if (touchEvt.touches && touchEvt.touches[0]) {
          clientX = touchEvt.touches[0].clientX;
          clientY = touchEvt.touches[0].clientY;
        }
      }

      const basePoints = state === 'O' ? [3, 7, 15][index] : (state === 'X' || state === 'star') ? 1 : 0;

      // 3시간 5배 부스터 여부 확인 (서버 profiles.combo_booster_expires_at 기준 — App.tsx에서 전달)
      const isBoosterActive = !!comboBoosterExpiresAt && Date.now() < new Date(comboBoosterExpiresAt).getTime();
      const finalPoints = isBoosterActive ? basePoints * 5 : basePoints;

      window.dispatchEvent(
        new CustomEvent('reviewnote_show_floating_points', {
          detail: {
            x: clientX,
            y: clientY,
            points: finalPoints,
            isBooster: isBoosterActive,
            reviewState: state,
          },
        })
      );
    }

    currentReviews[index] = currentReviews[index] === state ? '' : state;
    onUpdateReviews(selectedEntry.id, currentReviews as ReviewState[]);

    // 🎯 복습 세션 중에는 O/X/★ 체크를 새로 추가하면 Next 버튼 없이 곧바로 다음 미완료 카드로 자동 이동
    // (되돌리기 클릭은 isAddingCheck가 false라 자동 이동 대상에서 제외됨)
    if (isReviewSession && isAddingCheck && hasNextEntry && nextEntry && onSelectEntry) {
      setTimeout(() => {
        onSelectEntry(nextEntry);
      }, 550);
    }
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
      // AI가 정답을 잘못 구했을 때 학생/선생님이 직접 고칠 수 있도록 analysis.finalAnswer도 함께 저장
      const updatedAnalysis = selectedEntry.analysis
        ? { ...selectedEntry.analysis, finalAnswer: editFinalAnswer || undefined }
        : selectedEntry.analysis;

      const { error } = await supabase
        .from('mistakes')
        .update({
          grade: editGrade || null,
          chapter: editChapter || null,
          root_causes: editRootCauses,
          user_action_plan: editActionPlan || null,
          analysis: updatedAnalysis,
        })
        .eq('id', selectedEntry.id);

      if (error) throw error;

      onUpdateEntry({
        ...selectedEntry,
        grade: editGrade || undefined,
        chapter: editChapter || undefined,
        rootCauses: editRootCauses,
        userActionPlan: editActionPlan || undefined,
        analysis: updatedAnalysis,
      });

      onClose(); // 저장 완료 후 모달창을 자동으로 닫아 깔끔하게 처리합니다.
    } catch (err: any) {
      alert('저장 실패: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // 남은 예상 시간 / 초과 시간(+N초)을 실제 경과 시간 기준으로 정확히 1초 단위로 계산
  const referenceTimeMs = averageWaitMs ?? 20000;
  const remainingMs = referenceTimeMs - elapsedMs;
  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const overtimeSeconds = remainingMs < 0 ? Math.floor(-remainingMs / 1000) + 1 : 0;

  // 🧭 바깥 영역 탭으로 닫기. target === currentTarget일 때만(=백드롭 자체를 직접 클릭했을 때만)
  // 닫는다 — 카드 내부 어떤 클릭도 이 조건을 만족하지 않으므로(버블링된 이벤트의 target은 항상
  // 원래 클릭된 자손 요소) 버튼/체크리스트/입력/이미지 클릭이 새어나가 닫히는 일이 없다.
  // isZoomOpen(이미지 참고창) 가드가 필요한 이유: 그 창은 실제로는 화면 전체를 덮는 진짜 배경이
  // 아니라 떠다니는 작은 창(바깥 영역이 pointer-events-none으로 완전히 뚫려 있음)이라, 창 밖을
  // 클릭하면 이 백드롭까지 클릭이 그대로 새어들어온다 — 그 사이엔 창 자체의 명시적 닫기(✕ 문제창
  // 닫기/맞춤)만 쓰게 하고 상세 모달 전체가 함께 닫히지 않게 막는다. 정답수정 팝업/쿨다운 알림은
  // 자체적으로 불투명한 전체화면 배경(z-9998/z-100)이라 애초에 클릭이 여기까지 새어들 수 없어
  // 별도 가드가 필요 없다.
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (isZoomOpen) return;
    onClose();
  };

  // 🧭 상단 핸들에서 시작한 아래로 스와이프만 닫기로 인식한다(본문 스크롤/이미지 pinch·drag와는
  // 완전히 분리된 별도 요소에만 리스너를 붙여 충돌 자체가 구조적으로 불가능하다). 실시간으로
  // 시트를 손가락에 따라 움직이는 효과는 넣지 않고, 손을 뗀 시점에 임계값을 넘겼는지만 판정하는
  // 가장 단순한 형태로 구현한다(짧은 탭/작은 움직임/위쪽 드래그는 자연히 무시됨).
  const SHEET_SWIPE_DISMISS_THRESHOLD = 80;
  const sheetSwipeRef = useRef<{ startY: number } | null>(null);

  const handleSheetHandlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    sheetSwipeRef.current = { startY: e.clientY };
    safeSetPointerCapture(e.currentTarget, e.pointerId);
  };

  const handleSheetHandlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = sheetSwipeRef.current;
    sheetSwipeRef.current = null;
    if (!start) return;
    const deltaY = e.clientY - start.startY;
    if (deltaY > SHEET_SWIPE_DISMISS_THRESHOLD) {
      onClose();
    }
  };

  const handleSheetHandlePointerCancel = () => {
    sheetSwipeRef.current = null;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4 modal-backdrop-enter"
      onClick={handleBackdropClick}
    >
      <div className="w-full max-w-3xl bg-slate-900 border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-slide-up">

        {/* 모바일 시트 핸들 — 아래로 스와이프하면 닫힘(데스크톱 중앙 다이얼로그에서는 숨김) */}
        <div
          onPointerDown={handleSheetHandlePointerDown}
          onPointerUp={handleSheetHandlePointerUp}
          onPointerCancel={handleSheetHandlePointerCancel}
          className="flex-none flex items-center justify-center py-2 touch-none select-none cursor-grab active:cursor-grabbing sm:hidden"
        >
          <div className="w-10 h-1.5 rounded-full bg-slate-700" />
        </div>

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
            onClick={openImageWindow}
            className="w-full rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center relative p-2 min-h-[200px] cursor-zoom-in group/img"
          >
            <img
              src={selectedEntry.imageUrl}
              alt={selectedEntry.title}
              className="w-full h-auto max-h-[60vh] object-contain rounded-xl group-hover/img:opacity-90 transition-opacity"
            />
            {/* 손 필기 / 펜슬로 간단히 풀어볼 수 있는 필기창 열기 버튼 */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                openImageWindow();
                setIsHandwritingOpen(true);
              }}
              type="button"
              aria-label="문제 이미지와 손 필기창 함께 열기"
              title="손 필기 / 펜슬로 풀어보기"
              className="absolute top-4 right-4 w-9 h-9 rounded-full bg-slate-950/85 border border-slate-800 hover:border-amber-500/60 text-amber-400 hover:text-amber-300 flex items-center justify-center text-base shadow backdrop-blur transition-all active:scale-90 z-10"
            >
              ✏️
            </button>
            {/* 이미지 확대 가이드 골드 배지 (상시 노출 + 노란색/황금색 텍스트) */}
            <div className="absolute bottom-4 left-4 bg-slate-950/85 border border-slate-800/60 rounded-lg px-2 py-0.5 text-[9px] font-black text-amber-400 flex items-center space-x-1 shadow backdrop-blur select-none">
              <span>💡 이미지를 누르면 확대돼요!</span>
            </div>
            
            <div className="absolute bottom-4 right-4 bg-slate-950/80 border border-slate-800 rounded-lg px-2.5 py-1 text-[10px] text-slate-400 font-bold flex items-center space-x-1.5 shadow backdrop-blur opacity-0 group-hover/img:opacity-100 transition-opacity">
              <span>🔍 크게 보기</span>
            </div>
          </div>

          {/* 3-Step Review Status Selection Card (이미지와 아예 밀착되도록 -mt-4.5 상단 마진 인가) */}
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-850 space-y-4 -mt-4.5">
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

            {/* 정답 바로 확인 + 수정 (아래 정석 풀이 과정까지 스크롤 안 해도 여기서 바로 확인/수정 가능) */}
            {selectedEntry.analysis && (
              <div className="flex items-center space-x-2">
                {editFinalAnswer ? (
                  <button
                    onClick={() => setShowQuickAnswer(!showQuickAnswer)}
                    className="flex-1 min-w-0 flex items-center justify-between px-3 py-2 rounded-xl bg-amber-500/5 hover:bg-amber-500/10 border border-amber-500/20 transition-all"
                  >
                    <span className="text-[11px] font-bold text-amber-400 flex items-center space-x-1.5 min-w-0">
                      <span className="flex-none">🎯</span>
                      {showQuickAnswer ? (
                        // 팝업에서 확정한 로컬 편집값(editFinalAnswer)을 바로 반영 — 하단 '저장하기' 전에도 미리보기 가능
                        <LaTeXRenderer text={editFinalAnswer} className="truncate" />
                      ) : (
                        <span>정답 확인하기</span>
                      )}
                    </span>
                    <span className="text-[9px] text-amber-500/70 font-bold">
                      {showQuickAnswer ? '▲ 가리기' : '▼ 보기'}
                    </span>
                  </button>
                ) : (
                  <div className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-slate-900/40 border border-slate-800/60 text-[11px] text-slate-500 font-bold">
                    아직 등록된 정답이 없어요
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setAnswerDraft(editFinalAnswer)}
                  title="정답 수정"
                  className="flex-none w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 hover:border-amber-500/50 text-amber-400 hover:text-amber-300 flex items-center justify-center transition-all active:scale-95"
                >
                  ✏️
                </button>
              </div>
            )}

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
                          className={`p-3 rounded-2xl border text-center flex flex-col justify-between min-h-[105px] transition-all duration-300 ${cardStyle}`}
                        >
                          <div className="text-[10px] font-bold text-slate-500 mb-1">{index + 1}차 복습</div>
                          
                          <div className="flex-1 flex items-center justify-center">
                            {isCompleted ? (
                              /* 완료 상태: 큼직한 결과 스탬프 배지 및 아래 날짜 노출 */
                              <div className="animate-scale-up flex flex-col items-center">
                                {state === 'O' && (
                                  authorStamp ? (
                                    <span className={`w-9 h-9 rounded-full flex items-center justify-center text-[26px] drop-shadow-[0_2px_8px_rgba(245,158,11,0.25)] animate-scale-up ${authorStampCatalogItem ? `border-2 ${authorStampBorderClass}` : ''}`}>
                                      {authorStamp === '🐾' ? <CatPawIcon className="w-6 h-6" /> : authorStamp}
                                    </span>
                                  ) : (
                                    <span className="w-9 h-9 rounded-full bg-emerald-500 text-slate-950 font-black text-sm flex items-center justify-center shadow-lg shadow-emerald-500/10">
                                      O
                                    </span>
                                  )
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
                                {selectedEntry.analysis?.reviewDates?.[index] && (
                                  <span className="text-[9px] text-slate-400 font-bold font-mono mt-1.5 block select-none">
                                    📅 {selectedEntry.analysis.reviewDates[index]}
                                  </span>
                                )}
                              </div>
                            ) : isActive ? (
                              /* 활성 상태: 클릭 가능한 입력 버튼 활성화 */
                              <div className="flex items-center space-x-1.5 animate-fade-in">
                                <button
                                  onClick={(e) => handleReviewToggle(index, 'O', e)}
                                  className="w-7 h-7 rounded-full text-xs font-black bg-slate-800 text-emerald-400 hover:bg-emerald-500 hover:text-slate-950 transition-all active:scale-90 border border-slate-700/60"
                                >
                                  O
                                </button>
                                <button
                                  onClick={(e) => handleReviewToggle(index, 'X', e)}
                                  className="w-7 h-7 rounded-full text-xs font-black bg-slate-800 text-red-400 hover:bg-red-500 hover:text-white transition-all active:scale-90 border border-slate-700/60"
                                >
                                  X
                                </button>
                                <button
                                  onClick={(e) => handleReviewToggle(index, 'star', e)}
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
                            // O가 하나도 없으면(전부 X/★) ''를 2개만 이어붙여선 배열 길이가 2에
                            // 그쳐서 3번째 칸이 undefined가 되어 버튼도 안 뜨고 잠기지도 않는
                            // "고정" 상태로 망가졌다. 항상 최소 3칸이 되도록 ''를 3개 붙인다.
                            const newReviews = [...oReviews, '', '', ''].slice(0, 3) as ReviewState[];
                            // 배점은 이제 "몇 번째 칸이냐"가 아니라 체크 시점에 analysis.reviewPoints에
                            // 영구 저장된 값을 그대로 데려가므로(handleUpdateReviews 참고), O를 앞으로
                            // 당겨도 그 자체로는 점수가 안 바뀐다 — skipPointRecalc=true는 그래도 이
                            // "정리" 액션만큼은 어떤 미세한 점수 변화도 없도록 하는 추가 안전장치.
                            onUpdateReviews(selectedEntry.id, newReviews, true);
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

          {/* AI Analysis trigger / solving process rendering */}
          {(!showResult && (isAnalyzing || (progress > 0 && progress < 100)) && (!selectedEntry.analysis?.solvingProcess || selectedEntry.analysis.solvingProcess === SOLVING_PLACEHOLDER_TEXT)) ? (
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
                    ) : overtimeSeconds > 0 ? (
                      <span className="text-amber-400 font-bold">예상보다 오래 걸리고 있어요 (+{overtimeSeconds}초)</span>
                    ) : (
                      <span>예상 대기 시간: 약 {remainingSeconds}초</span>
                    )}
                  </p>
                  {averageWaitMs && (
                    <p className="text-[10px] text-slate-600">
                      (최근 진단 평균 소요 시간: 약 {Math.round(averageWaitMs / 1000)}초)
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : hasRealAnalysis(selectedEntry) ? (
            <div className="space-y-6 animate-scale-up">
              {/* AI 모델 명시 정보 */}
              <div className="flex items-center justify-end">
                <span className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-slate-800 text-indigo-400 border border-slate-700/60 flex items-center space-x-1 select-none">
                  <span>⚡ AI 엔진:</span>
                  <span className="font-extrabold">{selectedEntry.analysis.modelUsed || 'gemini-2.5-flash (기본)'}</span>
                </span>
              </div>
              
              {/* Card 0: 원본 문제 지문(problemText)은 학생 UI에서 더 이상 렌더하지 않는다(요구사항).
                  DB 저장/AI 분석 입력/체크포인트 생성 입력으로는 계속 그대로 쓰인다 — 여기서
                  지운 건 이 화면에 보여주던 접힘 섹션 하나뿐이다. */}

              {/* Card 0.5: 선생님 힌트 (스캐폴딩) (접힘 상태 디폴트) */}
              <MistakeScaffoldingDrawer
                mistakeId={selectedEntry.id}
                studentId={selectedEntry.userId || ''}
                currentUserId={currentUserId || ''}
                isAdmin={isAdmin}
                refreshSignal={scaffoldingRefreshKey}
              />

              {/* 🧭 정리하기(초기화) 이후 체크리스트 재생성 진행 상태 — 정석 풀이는 전혀 건드리지
                  않고 이 배너들만 추가/제거된다(기존 데이터가 사라지거나 깜빡이지 않음). */}
              {checkpointRegenStatus === 'generating' && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                  <span className="flex-none w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                  <span>AI가 새로운 학습 진단을 만들고 있어요...</span>
                </div>
              )}
              {checkpointRegenStatus === 'failed' && (
                <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-xs font-bold bg-red-500/10 text-red-300 border border-red-500/20">
                  <span>⚠️ AI 진단 생성에 실패했어요</span>
                  {onRetryCheckpointGeneration && (
                    <button
                      onClick={onRetryCheckpointGeneration}
                      className="flex-none px-3 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-200 font-black active:scale-95 transition-all"
                    >
                      다시 시도
                    </button>
                  )}
                </div>
              )}
              {checkpointRegenStatus === 'success' && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                  <span>✓ 새로운 진단이 준비됐어요</span>
                </div>
              )}

              {/* Card 0.8 (레거시): 단계형 풀이 체크리스트 — 체크리스트 2.0 이전에 생성된
                  레코드만 대상(신규 분석은 항상 solutionChecklist를 갖게 되므로 자연히 배타적). */}
              {!selectedEntry.analysis.solutionChecklist && selectedEntry.analysis.solutionCheckpoints && (() => {
                const stages = selectedEntry.analysis.solutionCheckpoints;
                if (!stages) return null;

                const STAGE_TITLES: Record<number, string> = {
                  1: '1단계: 문제 이해하기',
                  2: '2단계: 해결 계획 세우기',
                  3: '3단계: 계획 실행하기',
                  4: '4단계: 돌아보기 & 쌤의 한끝 팁',
                };

                // 4단계 전체를 관통하는 하나의 순서로 평탄화해서 순차 잠금을 계산한다.
                // "진행 경계(frontier)" = 맨 앞에서부터 봤을 때 처음으로 understood가 아닌 지점
                // (unanswered든, stuck이든). 그 경계까지는(포함) 상호작용 가능하고, 그 뒤는 전부
                // 잠근다 — understood를 stuck으로 되돌리면 그 뒤에 있던 기존 응답(이미 understood/
                // stuck으로 답했던 것)도 다시 잠기지만, status 데이터 자체는 지우지 않는다(그냥
                // 잠금 화면 뒤에 보존됨). 다시 understood가 되면 경계가 한 칸 전진하면서 그 다음
                // checkpoint가 열리는데, 거기 남아있던 예전 응답이 있으면 그대로 다시 보인다.
                const flatStatuses = stages.flatMap(s => s.checkpoints.map(cp => cp.status));
                let frontierIndex = flatStatuses.findIndex(status => status !== 'understood');
                if (frontierIndex === -1) frontierIndex = flatStatuses.length; // 전부 이해 완료

                let flatCursor = -1;

                return (
                  <div className="space-y-3 border-l-4 border-emerald-500 pl-4 py-1">
                    <h4 className="text-sm font-extrabold text-emerald-400 flex items-center">
                      <span className="mr-1.5 text-base">🧭</span> 단계형 풀이 체크리스트
                    </h4>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      순서대로 "이해했어요" 또는 "여기서 막혔어요"를 선택해 보세요. 이전 단계를 선택해야 다음 단계가 열립니다.
                    </p>

                    <div className="space-y-4">
                      {stages.map((stageGroup, stageIndex) => (
                        <div key={stageGroup.stage} className="space-y-2">
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-wide">
                            {STAGE_TITLES[stageGroup.stage] || `${stageGroup.stage}단계`}
                          </span>
                          <div className="space-y-2">
                            {stageGroup.checkpoints.map((cp, checkpointIndex) => {
                              flatCursor += 1;
                              const myFlatIndex = flatCursor;
                              const isLocked = myFlatIndex > frontierIndex;

                              return (
                                <div
                                  key={checkpointIndex}
                                  className={`rounded-xl border p-3 transition-all ${
                                    isLocked ? 'bg-slate-950/40 border-slate-900 opacity-40' :
                                    cp.status === 'stuck' ? 'bg-amber-950/20 border-amber-800/40' :
                                    cp.status === 'understood' ? 'bg-emerald-950/10 border-emerald-800/30' :
                                    'bg-slate-900 border-indigo-500/50'
                                  }`}
                                >
                                  <span className={`text-xs font-bold ${isLocked ? 'text-slate-600' : 'text-slate-200'}`}>
                                    {isLocked && <span className="mr-1">🔒</span>}
                                    {cp.label}
                                  </span>

                                  {!isLocked && (
                                    <div className="flex items-center space-x-2 mt-2">
                                      <button
                                        onClick={() => onUpdateCheckpointStatus(selectedEntry.id, stageIndex, checkpointIndex, 'understood')}
                                        className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all active:scale-95 ${
                                          cp.status === 'understood'
                                            ? 'bg-emerald-500 text-slate-950'
                                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                                        }`}
                                      >
                                        ✅ 이해했어요
                                      </button>
                                      <button
                                        onClick={() => onUpdateCheckpointStatus(selectedEntry.id, stageIndex, checkpointIndex, 'stuck')}
                                        className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all active:scale-95 ${
                                          cp.status === 'stuck'
                                            ? 'bg-amber-500 text-slate-950'
                                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                                        }`}
                                      >
                                        🙋 여기서 막혔어요
                                      </button>
                                    </div>
                                  )}

                                  {/* "이해했어요"는 다음 진행이 가능하다는 뜻일 뿐, AI 풀이 설명을 새로
                                      보여주지 않는다(여러 정상 풀이가 있을 수 있는데 AI 설명과 다르다는
                                      이유만으로 학생이 스스로를 "막혔다"고 오판하게 만들 수 있어서다).
                                      detail/hint는 "여기서 막혔어요"를 선택했을 때만, 그리고 잠기지
                                      않은(현재 진행 경계인) checkpoint에서만 보여준다. */}
                                  {!isLocked && cp.status === 'stuck' && (
                                    <div className="mt-2 text-[11px] text-slate-400 leading-relaxed space-y-1">
                                      <p>{cp.detail}</p>
                                      <p className="text-amber-400 font-semibold">💡 {cp.hint}</p>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={() => setShowSolvingProcess(true)}
                      className="text-[11px] text-indigo-400 hover:text-indigo-300 font-bold underline underline-offset-2"
                    >
                      전체 풀이 처음부터 보기 →
                    </button>
                  </div>
                );
              })()}

              {/* Card 0.9: 체크리스트 2.0 — "AI 풀이를 이해했나요?"가 아니라 "풀기 전에 기본
                  접근을 했나요?"를 확인하는 용도. solve 완료를 기다리지 않고 classify와 병렬로
                  훨씬 일찍 준비되므로, 학생이 전체 풀이를 기다리는 동안에도 먼저 쓸 수 있다. */}
              {checklistStatus === 'generating' && !selectedEntry.analysis.solutionChecklist && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                  <span className="flex-none w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                  <span>{aiPersonaName}가 문제 풀이 체크리스트를 작성 중이에요…</span>
                </div>
              )}
              {checklistStatus === 'failed' && !selectedEntry.analysis.solutionChecklist && (
                <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-xs font-bold bg-red-500/10 text-red-300 border border-red-500/20">
                  <span>⚠️ 체크리스트 생성에 실패했어요</span>
                  {onRetryChecklistGeneration && (
                    <button
                      onClick={onRetryChecklistGeneration}
                      className="flex-none px-3 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-200 font-black active:scale-95 transition-all"
                    >
                      다시 시도
                    </button>
                  )}
                </div>
              )}
              {selectedEntry.analysis.solutionChecklist && (
                <div className="space-y-2 border-l-4 border-emerald-500 pl-4 py-1">
                  <h4 className="text-sm font-extrabold text-emerald-400 flex items-center">
                    <span className="mr-1.5 text-base">✅</span> 풀기 전 체크리스트
                  </h4>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    본격적으로 풀기 전에, 기본적인 접근을 제대로 했는지 스스로 확인해 보세요.
                  </p>
                  <div className="space-y-2">
                    {selectedEntry.analysis.solutionChecklist.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onToggleChecklistItem(selectedEntry.id, item.id)}
                        className={`w-full flex items-start gap-2 text-left rounded-xl border p-3 transition-all active:scale-[0.99] ${
                          item.checked
                            ? 'bg-emerald-950/10 border-emerald-800/30'
                            : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <span className={`flex-none w-4 h-4 mt-0.5 rounded-md border-2 flex items-center justify-center ${
                          item.checked ? 'bg-emerald-500 border-emerald-500' : 'border-slate-600'
                        }`}>
                          {item.checked && <span className="text-slate-950 text-[10px] font-black">✓</span>}
                        </span>
                        <span className={`text-xs font-bold leading-relaxed ${item.checked ? 'text-slate-400' : 'text-slate-200'}`}>
                          {item.text}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Card 1: 정석 풀이 과정 */}
              <CollapsibleSection
                icon="💡"
                title="정석 풀이 과정"
                subtitle={isAnalyzing && (
                  <span className="ml-2 text-[10px] font-bold text-indigo-300 animate-pulse">✍️ {aiPersonaName}가 실시간으로 작성 중...</span>
                )}
                color="indigo"
                isOpen={showSolvingProcess}
                onToggle={() => setShowSolvingProcess(!showSolvingProcess)}
              >
                <LaTeXRenderer text={selectedEntry.analysis.solvingProcess} className="text-sm md:text-base leading-relaxed" />
              </CollapsibleSection>
            </div>
          ) : (
            <div 
              ref={analysisCardRef}
              className="py-8 bg-slate-950/60 rounded-2xl border border-slate-800 p-6 text-center space-y-4"
            >
              <div className="text-3xl">🐱</div>
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

              {/* 나만의 대책 (정답 수정란보다 먼저 배치 — 정답을 보기 전에 스스로 다시 풀어보고 대책부터 적도록 유도)
                  AI는 이 칸을 절대 자동으로 채우지 않는다 — 학생이 직접 적어야만 값이 채워진다. */}
              <div className={`space-y-1.5 rounded-xl transition-shadow ${actionPlanHighlight ? 'action-plan-nudge' : ''}`}>
                <label className="text-[11px] font-bold text-slate-400 block">나만의 대책 (직접 작성)</label>
                <textarea
                  value={editActionPlan}
                  onChange={e => setEditActionPlan(e.target.value)}
                  placeholder="이번 실수를 통해 앞으로 어떻게 풀겠다는 나만의 대책을 자유롭게 적어보세요..."
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-600 outline-none focus:border-emerald-500 transition-colors resize-none leading-relaxed"
                />
              </div>

              {/* 직접 다시 풀어보기 권유 — 강제하지 않는다: 건너뛰어도 복습에 지장 없고, 죄책감
                  유발 문구를 쓰지 않는다. AI 진단이 끝난 뒤에만 노출.
                  🧭 풀이 사진 업로드 자체는 이 PR의 범위가 아니다(schema/storage 변경은 별도 PR).
                  "네, 다시 풀어볼게요"는 지금은 모달을 닫아 AI 풀이가 눈에 보이지 않는 상태로
                  스스로 다시 풀어보게 유도한다(정답을 곁눈질하며 베끼는 것 방지) — 실제 재풀이
                  업로드 플로우가 생기면 이 버튼의 동작만 그걸로 교체하면 된다. */}
              {hasRealAnalysis(selectedEntry) && !reproposeDismissed && (
                <div className="space-y-2 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3">
                  <p className="text-xs font-bold text-indigo-300 leading-relaxed">
                    ✏️ 눈으로 읽는 것보다 직접 풀어보면 훨씬 오래 기억에 남아요. 한 번 다시 풀어볼까요?
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="flex-1 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-400 active:scale-95 transition-all text-[11px] font-black text-white"
                    >
                      ✏️ 네, 다시 풀어볼게요
                    </button>
                    <button
                      type="button"
                      onClick={() => setReproposeDismissed(true)}
                      className="flex-none px-3 py-2 rounded-lg text-[11px] font-bold text-slate-400 hover:text-slate-300 transition-colors"
                    >
                      지금은 건너뛰기
                    </button>
                  </div>
                </div>
              )}

              {/* 재풀이 사진 업로드(선택, 1장) — 위 권유 배너를 건너뛰었어도(reproposeDismissed) 항상
                  노출한다: "지금은 건너뛰기"가 이 기능 자체를 막는 게 아니라 그 순간의 팝업만 닫는
                  것이므로, 학생이 종이에 풀고 나중에 돌아와 올리고 싶을 때 언제든 쓸 수 있어야 한다.
                  원본 문제 이미지(imageUrl)와 완전히 분리된 answer-images 버킷/컬럼을 쓴다. */}
              {hasRealAnalysis(selectedEntry) && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400 block">재풀이 사진 (선택)</label>
                  {selectedEntry.answerImageUrl ? (
                    <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-950">
                      <img
                        src={selectedEntry.answerImageUrl}
                        alt="내가 다시 푼 풀이"
                        className="w-full max-h-64 object-contain"
                      />
                      <button
                        type="button"
                        onClick={onDeleteAnswerImage}
                        aria-label="재풀이 사진 삭제"
                        className="absolute top-2 right-2 w-7 h-7 rounded-full bg-slate-950/80 hover:bg-red-500/80 flex items-center justify-center text-white text-xs font-black transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        ref={answerImageInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) onUploadAnswerImage(file);
                          e.target.value = '';
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => answerImageInputRef.current?.click()}
                        disabled={isUploadingAnswerImage}
                        className="w-full py-2.5 rounded-xl border border-dashed border-slate-700 text-[11px] font-bold text-slate-400 hover:border-slate-600 hover:text-slate-300 transition-colors disabled:opacity-50"
                      >
                        {isUploadingAnswerImage ? '업로드 중...' : '📷 다시 푼 풀이 사진 올리기'}
                      </button>
                    </>
                  )}
                </div>
              )}

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

        {/* 💡 👨‍🏫 선생님이 전달해 준 스캐폴딩 힌트 가이드 카드 */}
        {selectedEntry.teacherScaffoldingHint && (
          <div className="bg-gradient-to-r from-purple-950/60 via-slate-900 to-indigo-950/60 border border-purple-500/40 rounded-2xl p-4 space-y-2 shadow-lg animate-fade-in mt-4">
            <div className="flex items-center space-x-2">
              <span className="text-base">💡</span>
              <h4 className="text-xs font-black text-purple-300">👨‍🏫 선생님의 스캐폴딩 처방 힌트</h4>
            </div>
            <p className="text-xs text-slate-200 leading-relaxed font-sans whitespace-pre-wrap pl-6">
              {selectedEntry.teacherScaffoldingHint}
            </p>
          </div>
        )}

      </div>

      {/* 이동·크기 조절이 가능한 문제 참고창. 필기창과 동시에 조작할 수 있도록 배경은 클릭을 가로채지 않는다. */}
      {isZoomOpen && createPortal(
        <div className="fixed inset-0 z-[9997] pointer-events-none">
          <section
            role="dialog"
            aria-label="문제 이미지 참고창"
            aria-modal="false"
            className="absolute flex flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl pointer-events-auto animate-fade-in"
            style={{
              left: imageWindowLayout.left,
              top: imageWindowLayout.top,
              width: imageWindowLayout.width,
              height: imageWindowLayout.height,
            }}
          >
            <div
              onPointerDown={handleImageWindowDragStart}
              onPointerMove={handleImageWindowDragMove}
              onPointerUp={handleImageWindowDragEnd}
              onPointerCancel={handleImageWindowDragEnd}
              className="flex h-11 flex-none cursor-move touch-none select-none items-center justify-between gap-2 border-b border-slate-800 bg-slate-950 px-10"
            >
              <div className="min-w-0">
                <p className="truncate text-[11px] font-black text-slate-200">🖼️ 문제 이미지</p>
                <p className="hidden truncate text-[8px] font-bold text-slate-500 sm:block">상단 바를 끌어 이동 · 모서리를 끌어 크기 조절</p>
              </div>
              <div className="flex flex-none items-center gap-1.5">
                {isDrawMode ? (
                  <>
                    {drawStrokes.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setDrawStrokes([])}
                        onPointerDown={(e) => e.stopPropagation()}
                        aria-label="필기 지우기"
                        title="필기 지우기"
                        className="h-7 rounded-lg border border-slate-800 bg-slate-900 px-2 text-[9px] font-black text-slate-400 transition-colors hover:text-white"
                      >
                        지우기
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={exitDrawMode}
                      onPointerDown={(e) => e.stopPropagation()}
                      aria-label="이동/확대 모드로 전환"
                      title="이동/확대 모드로 전환"
                      className="h-7 rounded-lg border border-indigo-500/40 bg-indigo-500/20 px-2 text-[9px] font-black text-indigo-300 transition-colors hover:text-white"
                    >
                      🔍 이동/확대
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={resetImageZoom}
                      onPointerDown={(e) => e.stopPropagation()}
                      aria-label="문제 이미지 확대 초기화"
                      title="확대 초기화"
                      className="h-7 rounded-lg border border-slate-800 bg-slate-900 px-2 text-[9px] font-black text-slate-400 transition-colors hover:text-white"
                    >
                      맞춤
                    </button>
                    <button
                      type="button"
                      onClick={enterDrawMode}
                      onPointerDown={(e) => e.stopPropagation()}
                      aria-label="필기 모드로 전환"
                      title="필기 모드로 전환(1x로 초기화됩니다)"
                      className="h-7 rounded-lg border border-slate-800 bg-slate-900 px-2 text-[9px] font-black text-slate-400 transition-colors hover:text-white"
                    >
                      ✏️ 필기
                    </button>
                  </>
                )}
              </div>
            </div>

            <div
              ref={drawContainerRef}
              className={`relative flex min-h-0 flex-1 touch-none select-none items-center justify-center overflow-hidden bg-black ${isDrawMode ? 'cursor-crosshair' : ''}`}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={handleTouchEnd}
              onPointerDown={handleDrawPointerDown}
              onPointerMove={handleDrawPointerMove}
              onPointerUp={handleDrawPointerUp}
              onPointerCancel={handleDrawPointerUp}
              onDoubleClick={isDrawMode ? undefined : resetImageZoom}
              onWheel={(e) => {
                if (isDrawMode) return;
                e.preventDefault();
                updateImageScale(scale + (e.deltaY < 0 ? 0.2 : -0.2));
              }}
            >
              <img
                src={selectedEntry.imageUrl}
                alt="확대된 문제 이미지"
                draggable={false}
                className="max-h-full max-w-full pointer-events-none select-none object-contain"
                style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${scale})` }}
              />
              {drawStrokes.length > 0 && (
                <svg className="pointer-events-none absolute inset-0 h-full w-full">
                  {drawStrokes.map((stroke, i) => (
                    <polyline
                      key={i}
                      points={stroke.map(p => `${p.x},${p.y}`).join(' ')}
                      fill="none"
                      stroke="#f87171"
                      strokeWidth={3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}
                </svg>
              )}
              {isDrawMode && (
                <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-slate-950/80 px-3 py-1 text-[9px] font-bold text-slate-300">
                  손가락/마우스로 그어서 표시해 보세요 (저장되지 않아요)
                </div>
              )}
            </div>

            <div className="flex h-14 flex-none items-center justify-between gap-3 border-t border-slate-800 bg-slate-950 px-10">
              <div className="flex flex-none items-center gap-1">
                <button
                  type="button"
                  onClick={() => updateImageScale(scale - 0.25)}
                  disabled={isDrawMode}
                  aria-label="문제 이미지 축소"
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-xs font-black text-slate-300 hover:text-white disabled:opacity-30"
                >
                  −
                </button>
                <span className="w-11 text-center text-[9px] font-black text-amber-400">{scale.toFixed(1)}x</span>
                <button
                  type="button"
                  onClick={() => updateImageScale(scale + 0.25)}
                  disabled={isDrawMode}
                  aria-label="문제 이미지 확대"
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-xs font-black text-slate-300 hover:text-white disabled:opacity-30"
                >
                  +
                </button>
              </div>
              <button
                type="button"
                onClick={closeImageWindow}
                aria-label="문제 이미지 참고창 닫기"
                className="flex h-9 flex-none items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 text-[10px] font-black text-slate-200 transition-all hover:border-rose-400/50 hover:bg-rose-500/15 hover:text-rose-200 active:scale-95"
              >
                <span aria-hidden="true">✕</span>
                <span>문제창 닫기</span>
              </button>
            </div>

            {IMAGE_WINDOW_RESIZE_HANDLES.map((handle) => (
              <button
                key={handle.corner}
                type="button"
                aria-label={handle.label}
                title={handle.label}
                onPointerDown={(e) => handleImageWindowResizeStart(e, handle.corner)}
                onPointerMove={handleImageWindowResizeMove}
                onPointerUp={handleImageWindowResizeEnd}
                onPointerCancel={handleImageWindowResizeEnd}
                className={`absolute z-20 flex h-9 w-9 touch-none p-1.5 text-slate-500 transition-colors hover:text-amber-300 focus-visible:text-amber-300 focus-visible:outline-none ${handle.className}`}
              >
                <span className={`block h-3.5 w-3.5 border-current ${handle.iconClassName}`} />
              </button>
            ))}
          </section>
        </div>,
        document.body,
      )}

      {/* Next 화살표 버튼 (복습하기 세션 때만 우측 스크린 하단에 플로팅 + 크기만 컴팩트화) */}
      {isReviewSession && hasNextEntry && nextEntry && onSelectEntry && (
        <button
          onClick={() => onSelectEntry(nextEntry)}
          className="fixed right-3 sm:right-6 top-[62%] -translate-y-1/2 z-[60] w-9 h-14 sm:w-11 sm:h-18 rounded-xl bg-indigo-600/95 hover:bg-indigo-500 border border-indigo-500/50 flex flex-col items-center justify-center text-white shadow-2xl active:scale-95 transition-all group animate-fade-in backdrop-blur-sm"
          title="다음 미완료 오답 복습"
        >
          <span className="text-base sm:text-lg font-bold group-hover:translate-x-0.5 transition-transform">&rarr;</span>
          <span className="text-[7.5px] sm:text-[8px] font-black uppercase tracking-wider mt-0.5 select-none">Next</span>
        </button>
      )}

      {/* ⏳ 복습 연속 클릭 방지 쿨다운 알림 커스텀 모달 (스캐폴딩 알림창 디자인 톤앤매너 통일) */}
      {isCooldownNoticeOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-xs bg-slate-900 border border-amber-500/40 rounded-3xl p-5 shadow-2xl space-y-4 text-center animate-scale-up">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto">
              <span className="text-2xl animate-bounce">⏳</span>
            </div>

            <div className="space-y-1">
              <h3 className="text-sm font-black text-white">
                방금 이 문제의 복습을 체크하셨습니다!
              </h3>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                해설을 천천히 읽어보신 후 잠시 뒤에 다음 복습을 체크해 주세요. ✨
              </p>
            </div>

            <button
              onClick={() => setIsCooldownNoticeOpen(false)}
              className="w-full py-2.5 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-350 hover:to-amber-450 text-slate-950 font-black text-xs transition-all shadow-lg shadow-amber-500/20"
            >
              확인
            </button>
          </div>
        </div>
      )}

      {/* 🎯 정답 수정 팝업 — editFinalAnswer/handleSave를 그대로 재사용 (새 저장 경로 없음, '저장'은 로컬 확정만).
          이동식 문제 참고창(z-[9997], document.body에 portal)에 가려지지 않도록 동일하게 portal + 더 높은 z-index 사용. */}
      {answerDraft !== null && createPortal(
        <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-xs bg-slate-900 border border-amber-500/40 rounded-3xl p-5 shadow-2xl space-y-4 animate-scale-up">
            <div className="space-y-1">
              <h3 className="text-sm font-black text-white flex items-center space-x-1.5">
                <span>🎯</span>
                <span>정답 수정</span>
              </h3>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                AI가 구한 정답이 틀렸다면 여기서 고쳐주세요. '저장'을 누르면 임시 반영되고, 실제 기록은 모달 하단 '저장하기'를 눌러야 완료됩니다.
              </p>
            </div>
            <input
              type="text"
              autoFocus
              value={answerDraft}
              onChange={e => setAnswerDraft(e.target.value)}
              placeholder="예: x = 3, y = -2"
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-600 outline-none focus:border-amber-500 transition-colors"
            />
            <div className="flex space-x-2">
              <button
                onClick={() => setAnswerDraft(null)}
                className="flex-1 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-all active:scale-95"
              >
                취소
              </button>
              <button
                onClick={() => { setEditFinalAnswer(answerDraft || ''); setAnswerDraft(null); }}
                className="flex-1 py-2.5 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-350 hover:to-amber-450 text-slate-950 font-black text-xs transition-all shadow-lg shadow-amber-500/20"
              >
                저장
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 손 필기 / 펜슬 풀이 오버레이 — 저장하면 스캐폴딩(본인 풀이)으로 등록됨 */}
      {isHandwritingOpen && (
        <HandwritingOverlay
          mistakeId={selectedEntry.id}
          studentId={selectedEntry.userId || ''}
          currentUserId={currentUserId || ''}
          onClose={() => setIsHandwritingOpen(false)}
          onSaved={() => setScaffoldingRefreshKey(k => k + 1)}
        />
      )}
    </div>
  );
};
