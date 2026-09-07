import { useState, useEffect, useMemo, useRef, lazy } from 'react';
import type { ActiveTab, MistakeEntry, MistakeAnalysis } from './types';
import { ROOT_CAUSE_OPTIONS, resolveNeedsHelp } from './types';
import { CameraScanner } from './components/CameraScanner';
import type { CropPercent } from './utils/guideBoxCrop';
import { AuthScreen } from './components/AuthScreen';
import { supabase, isSupabaseConfigured } from './services/supabase';
import { SupabaseConfigWarning } from './components/SupabaseConfigWarning';
import { AppShell } from './app/AppShell';
import { Screen } from './app/ScreenRouter';
import { OverlayHost } from './app/OverlayHost';
import { LazyScreenBoundary } from './app/LazyScreenBoundary';
import { useCheckpointGeneration } from './features/checkpoints/useCheckpointGeneration';
import { useMistakeAnalysis } from './features/mistakes/useMistakeAnalysis';
import { useMistakes, mapDbMistakeRow } from './features/mistakes/useMistakes';
import { useReviewState } from './features/mistakes/useReviewState';
import { Header } from './components/Header';
import { MistakeList } from './components/MistakeList';
import { BottomNavigation } from './components/BottomNavigation';
import { StudentGuide } from './components/StudentGuide';
import { HiddenMistakesPanel } from './components/HiddenMistakesPanel';
import { RecentActivityFeed } from './components/RecentActivityFeed';
import { ScaffoldingListPanel } from './components/ScaffoldingListPanel';
import type { UnseenScaffoldingItem } from './components/NewScaffoldingModal';
import type { NoticeModalState } from './components/CustomNoticeModal';
import { getTitleBadgeStyle, GACHA_ITEMS } from './utils/gachaCatalog';
import { getRandomCheer } from './utils/aiVoiceCheers';
import type { EquippedItems } from './types';
import { applyThemeColor } from './utils/theme';
import { loadStreakState, reconcileStreakState, getKSTDateString, type StreakState } from './utils/streak';

// PR9: 관리자 전용 화면(AdminPanel/ScaffoldingPanel)과 럭키상점(GachaStore)은 첫 화면(오답노트
// 목록)을 보여주는 데는 필요 없는데, 지금까지는 일반 import라 학생 계정에서도 초기 번들에
// 그대로 포함되고 있었다(런타임에는 isAdmin 게이트/탭 조건으로 렌더링만 막고 있었을 뿐, 다운로드
// 자체는 막지 못함 — 실측: 이 3개를 지연 로드로 바꾸자 메인 청크가 gzip 기준 약 18.79kB
// 줄었고, 그중 관리자 전용 두 화면만 따로 떼면 gzip 11.24kB가 학생 계정에서는 아예 다운로드되지
// 않는다). named export라 lazy()에 바로 못 넣고 default로 매핑해야 한다.
const AdminPanel = lazy(() => import('./components/AdminPanel').then(m => ({ default: m.AdminPanel })));
const ScaffoldingPanel = lazy(() => import('./components/ScaffoldingPanel').then(m => ({ default: m.ScaffoldingPanel })));
const GachaStore = lazy(() => import('./components/GachaStore').then(m => ({ default: m.GachaStore })));

interface ProfileDirectoryRow {
  id: string;
  username: string | null;
  nickname: string | null;
  display_name: string | null;
  school_grade: string | null;
  last_seen_at: string | null;
  equipped_title: string | null;
  equipped_stamp: string | null;
}

function App() {
  // If Supabase credentials are not configured, block and show the setup guide
  if (!isSupabaseConfigured) {
    return <SupabaseConfigWarning />;
  }

  const [session, setSession] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<string>('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('notes');
  const [mistakes, setMistakes] = useState<MistakeEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<MistakeEntry | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false); // 사진 업로드(handleCropComplete) 전용 — AI 진단 자체는 useMistakeAnalysis의 analyzingEntryId로 별도 추적.

  // 매일 연속 복습 스트릭 상태 (🔥 Streak 관리)
  const [streakState, setStreakState] = useState<StreakState>(() => loadStreakState());
  // 학생 커스텀 닉네임 상태 (실제 이름 display_name 과 보존 분리)
  const [myNickname, setMyNickname] = useState<string>('');
  // 닉네임 변경권 보유 여부
  const [hasNameChangeTicket, setHasNameChangeTicket] = useState<boolean>(false);
  // AI 이름 변경권으로 바꾼 커스텀 AI 페르소나 이름 (비어있으면 기본값 '밤티' 사용)
  const [customAiName, setCustomAiName] = useState<string>('');
  const [hasAiNameChangeTicket, setHasAiNameChangeTicket] = useState<boolean>(false);
  // ⚡ 콤보 부스터 5배 버프 만료 시각 (서버 profiles.combo_booster_expires_at 기준 — 클라이언트가
  // 임의로 조작할 수 없도록 activate_combo_booster RPC로만 값이 설정됨)
  const [comboBoosterExpiresAt, setComboBoosterExpiresAt] = useState<string | null>(null);
  // 럭키상점 점수 아래에 보여줄 AI 말투 응원 한 줄 (가장 최근 복습 체크의 O/X/★ 결과에 맞춰 매번 새로 뽑음)
  const [currentCheerLine, setCurrentCheerLine] = useState<string>(() => getRandomCheer());
  // userId -> displayName map (admin 전용)
  const [profilesMap, setProfilesMap] = useState<Record<string, string>>({});
  // 유튜브 매칭용 강의 마스터 리스트 상태
  const [youtubeLectures, setYoutubeLectures] = useState<any[]>([]);
  // 단원별 선생님 실제 강의 접근법 가이드 카탈로그 (solve 프롬프트 보강용)
  const [teacherApproachGuides, setTeacherApproachGuides] = useState<{ grade: string; chapter: string; guideText: string }[]>([]);
  // 주간 최다 오답 완료 챔피언 상태 (1~3위)
  const [weeklyChampions, setWeeklyChampions] = useState<any[]>([]);
  // 명예의 전당 순위권(top3) 밖이어도 본인 점수/순위를 볼 수 있도록 별도 보관
  const [myWeeklyStanding, setMyWeeklyStanding] = useState<{ rank: number; score: number; completedCount: number } | null>(null);
  // loadWeeklyChampions 호출 경합(race) 방지용 — 가장 최근에 시작한 요청 번호만 결과를 반영
  const weeklyChampionsRequestIdRef = useRef(0);
  // 🎯 일일 복습 퀘스트: 오늘 새로 체크한 복습 개수 (5개 달성 시 서버에서 콤보 포인트 보너스 자동 지급)
  const [dailyReviewCount, setDailyReviewCount] = useState(0);
  // 🏅 명예의 전당 주간 1/2/3등 누적 횟수 — 주간 점수는 초기화되지만 이 기록은 영구히 남는다
  const [weeklyMedals, setWeeklyMedals] = useState({ gold: 0, silver: 0, bronze: 0 });
  // 분석통계 탭 학생 필터 상태 (어드민 전용)
  const [statsStudentFilter, setStatsStudentFilter] = useState<string>('all');
  // 분석통계 탭 기간 필터 상태 (디폴트: 'all' 전체기간)
  const [statsPeriodFilter, setStatsPeriodFilter] = useState<'all' | '90' | '30'>('all');
  // 분석통계 탭 과목 아코디언 상태 (grade -> true/false)
  const [statsExpandedGrades, setStatsExpandedGrades] = useState<Record<string, boolean>>({});
  // userId -> schoolGrade map (AI 학년별 분류 최적화용)
  const [profilesGradeMap, setProfilesGradeMap] = useState<Record<string, string>>({});
  // userId -> equippedStamp map (유저별 레어 도장 표출용)
  const [profilesStampMap, setProfilesStampMap] = useState<Record<string, string>>({});
  const [scaffoldedMistakeIds, setScaffoldedMistakeIds] = useState<Set<string>>(new Set()); // 스캐폴딩 힌트가 첨부된 오답 id 집합
  // Supabase system_config 테이블에서 로드한 Gemini API Key 상태 (무료키는 레이트리밋 문제로 배제하고 유료키만 사용)
  // 다른 학생들의 실시간 복습 현황 목록
  const [peerActivities, setPeerActivities] = useState<any[]>([]);
  // 실시간 접속(활동) 중인 학생 목록
  const [onlineUsers, setOnlineUsers] = useState<any[]>([]);
  // 현재 "복습하기" 퀵 버튼을 눌러 순차 복습 세션을 진행 중인지 여부
  const [isReviewSession, setIsReviewSession] = useState<boolean>(false);
  // 인쇄할 완료 오답 리스트 임시 보관 상태
  const [printItems, setPrintItems] = useState<MistakeEntry[] | null>(null);
  // 개별 오답의 인쇄 형식 상태 (id -> true: 텍스트로 인쇄, false/undefined: 이미지로 인쇄)
  const [printAsTextMap, setPrintAsTextMap] = useState<Record<string, boolean>>({});
  // 인쇄할 아이템 선택 ID 목록 상태
  const [selectedPrintIds, setSelectedPrintIds] = useState<string[]>([]);
  // 수업자료 리스트 모달 팝업 상태
  const [isSlideListOpen, setIsSlideListOpen] = useState(false);

  // 럭키 상점 장착 아이템 및 포인트 상태 (LocalStorage 관리)
  const [equippedItems, setEquippedItems] = useState<EquippedItems>(() => {
    try {
      const saved = localStorage.getItem('reviewnote_equipped_items');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // 장착한 테마(hex)가 바뀔 때마다(최초 로드 복원 포함) 앱 전체 indigo 배색에 즉시 반영.
  // UR 등급처럼 두 색을 함께 묘사하는 테마는 카탈로그의 themeAccentValue를 테두리/액센트에 추가로 입힌다.
  useEffect(() => {
    const matchedTheme = GACHA_ITEMS.find(item => item.category === 'THEME' && item.effectValue === equippedItems.theme);
    applyThemeColor(equippedItems.theme, matchedTheme?.themeAccentValue);
  }, [equippedItems.theme]);

  // 복습 O/X/★ 체크할 때마다(플로팅 포인트 이벤트와 동일 시점) 장착 중인 AI 말투 + 그 결과에 맞는
  // 응원 한 줄을 새로 뽑아서 럭키상점 점수 아래에 보여준다. 매번 새로 뽑으므로 같은 결과가
  // 반복돼도 문구가 겹치지 않는다 (사전에 준비해둔 문구 풀에서 무작위 선택 — API 호출 없음).
  useEffect(() => {
    const handleReviewCheck = (e: Event) => {
      const detail = (e as CustomEvent<{ reviewState?: string }>).detail;
      setCurrentCheerLine(getRandomCheer(equippedItems.aiVoice, detail?.reviewState as any));
    };
    window.addEventListener('reviewnote_show_floating_points', handleReviewCheck);
    return () => window.removeEventListener('reviewnote_show_floating_points', handleReviewCheck);
  }, [equippedItems.aiVoice]);

  const [pointAdjustment, setPointAdjustment] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('reviewnote_point_adj');
      return saved ? Number(saved) : 0;
    } catch {
      return 0;
    }
  });

  const handleEquipItem = (category: keyof EquippedItems, value: string | undefined) => {
    setEquippedItems(prev => {
      const updated = { ...prev, [category]: value };
      try {
        localStorage.setItem('reviewnote_equipped_items', JSON.stringify(updated));
      } catch (e) {
        console.error(e);
      }
      // DB와 모든 장착 상태 실시간 동기화 (칭호, 스탬프, 테마, AI말투)
      if (session?.user?.id) {
        const colMap: Record<string, string> = {
          title: 'equipped_title',
          stamp: 'equipped_stamp',
          theme: 'equipped_theme',
          aiVoice: 'equipped_ai_voice',
        };
        const colName = colMap[category];
        if (colName) {
          supabase
            .from('profiles')
            .update({ [colName]: value || null })
            .eq('id', session.user.id)
            .then(() => {
              if (category === 'title') loadWeeklyChampions();
            });
        }
      }
      return updated;
    });
  };

  const handleDeductPoints = (amount: number) => {
    setPointAdjustment(prev => {
      const next = prev - amount;
      try {
        localStorage.setItem('reviewnote_point_adj', String(next));
      } catch (e) {
        console.error(e);
      }
      // 기기를 바꿔도 쓴 점수가 정확히 반영되도록 서버에도 동기화
      if (session?.user?.id) {
        supabase.from('profiles').update({ point_adjustment: next }).eq('id', session.user.id).then(({ error }) => {
          if (error) console.error('Failed to sync point adjustment to server:', error);
        });
      }
      return next;
    });
  };

  // DB 지정 보너스 점수 (어드민 또는 이벤트 적립)
  const [myBonusPoints, setMyBonusPoints] = useState<number>(0);
  const [streakMilestoneClaimed, setStreakMilestoneClaimed] = useState<number>(0); // 이번 스트릭 런에서 이미 지급받은 콤보 보너스 마일스톤 (0/3/7/14/28)

  // 현재 표시 가능한 럭키상점 보유 콤보 점수.
  // 예전엔 "완료 오답 개수 * 10점"을 매번 mistakes 배열에서 실시간으로 다시 계산했는데,
  // 이제는 handleUpdateReviews에서 복습 단계(O/X/★)가 바뀔 때마다 그 자리에서 bonus_points에
  // 실시간·영구 적립하는 방식으로 바꿨다 (자세한 배점은 handleUpdateReviews의 pointsForStage 참고).
  // 그래서 여기서는 mistakes를 다시 훑지 않고 bonus_points를 그대로 잔액으로 쓴다.
  const currentDisplayPoints = Math.max(0, (myBonusPoints || 0) + pointAdjustment);
  
  const prevTabRef = useRef(activeTab);

  // 3차 복습 완료 보관함 탭 활성화 시 아직 인쇄되지 않은 카드만 디폴트로 체크 선택
  useEffect(() => {
    if (activeTab === 'completed' && prevTabRef.current !== 'completed') {
      const completedList = mistakes.filter(m => m.reviews?.filter(r => r === 'O').length === 3);
      const unprintedIds = completedList
        .filter(m => !m.analysis?.printed)
        .map(m => m.id);
      setSelectedPrintIds(unprintedIds);
    }
    prevTabRef.current = activeTab;
  }, [activeTab, mistakes]);

  // State for image cropping flow
  const [tempCapturedImage, setTempCapturedImage] = useState<string | null>(null);
  const [tempInitialCrop, setTempInitialCrop] = useState<CropPercent | undefined>(undefined);

  // 🎁 럭키상점 활용법 안내 모달 상태
  const [isStoreGuideOpen, setIsStoreGuideOpen] = useState(false);

  // 접속/로그인 시 럭키상점 활용 가이드 팝업 자동 노출 (v1.16 기준 최초 1회)
  useEffect(() => {
    if (session?.user) {
      const seen = localStorage.getItem('reviewnote_seen_store_guide_v16');
      if (!seen) {
        setIsStoreGuideOpen(true);
      }
    }
  }, [session?.user]);

  // 상점 활용 가이드 열기 이벤트 수신
  useEffect(() => {
    const handleOpenGuide = () => {
      setIsStoreGuideOpen(true);
    };
    window.addEventListener('reviewnote_open_store_guide', handleOpenGuide);
    return () => {
      window.removeEventListener('reviewnote_open_store_guide', handleOpenGuide);
    };
  }, []);

  const handleCloseStoreGuide = () => {
    setIsStoreGuideOpen(false);
    try {
      localStorage.setItem('reviewnote_seen_store_guide_v16', 'true');
    } catch (e) {
      console.error(e);
    }
  };

  // 🔔 전역 커스텀 알림 모달 상태 (웹 브라우저 native alert 완전 대체)
  const [noticeModal, setNoticeModal] = useState<NoticeModalState>({
    isOpen: false,
    title: '',
    message: '',
  });

  const showNoticeModal = (info: Omit<NoticeModalState, 'isOpen'>) => {
    setNoticeModal({
      isOpen: true,
      ...info,
    });
  };

  const closeNoticeModal = () => {
    setNoticeModal((prev) => ({ ...prev, isOpen: false }));
  };

  // 💡 신규 스캐폴딩(선생님 맞춤 힌트) 안내 모달 상태
  const [unseenScaffoldings, setUnseenScaffoldings] = useState<UnseenScaffoldingItem[]>([]);
  const [isNewScaffoldingModalOpen, setIsNewScaffoldingModalOpen] = useState(false);
  // checkUnseenScaffoldings 호출 경합(race) 방지용 — loadWeeklyChampions와 동일한 패턴으로, 가장
  // 최근 요청 번호만 결과를 반영한다. 팝업을 닫아 읽음 처리한 뒤에도 그 전에 시작된 오래된 조회가
  // 늦게 도착하면 방금 닫은 팝업을 다시 열어버리는 경합이 있었음 — handleCloseNewScaffoldingModal에서도
  // 이 번호를 올려서 그 시점 이전에 시작된 응답은 전부 무효화한다.
  const unseenScaffoldingsRequestIdRef = useRef(0);

  // 💡 DB 기반 미확인 신규 스캐폴딩 힌트 조회 (is_read === false)
  const checkUnseenScaffoldings = async () => {
    const userId = session?.user?.id;
    if (!userId || isAdmin) return;
    const requestId = ++unseenScaffoldingsRequestIdRef.current;

    try {
      const { data: rows, error } = await supabase
        .from('mistake_scaffoldings')
        .select('*')
        .eq('student_id', userId)
        .neq('teacher_id', userId) // 본인이 자기 풀이로 셀프 업로드한 건 "선생님 힌트 도착" 알림 대상이 아님
        .or('is_read.is.null,is_read.eq.false')
        .order('created_at', { ascending: false });

      if (error || !rows || rows.length === 0) return;

      const mistakeIds = Array.from(new Set(rows.map((r: any) => r.mistake_id)));
      const { data: mistakeRows } = await supabase
        .from('mistakes')
        .select('*')
        .in('id', mistakeIds);

      const mistakeMap: Record<string, any> = {};
      (mistakeRows || []).forEach((m: any) => {
        mistakeMap[m.id] = m;
      });

      const items: UnseenScaffoldingItem[] = [];
      rows.forEach((r: any) => {
        const m = mistakeMap[r.mistake_id];
        if (!m) return;
        const entry: MistakeEntry = {
          id: m.id,
          title: m.title,
          imageUrl: m.image_url,
          userId: m.user_id,
          date: m.date,
          updatedAt: m.updated_at,
          analysis: m.analysis,
          reviews: m.reviews,
          grade: m.grade,
          chapter: m.chapter,
          rootCauses: m.root_causes,
          userActionPlan: m.user_action_plan,
        };

        items.push({
          id: r.id,
          mistakeId: r.mistake_id,
          mistakeTitle: m.title,
          grade: m.grade,
          chapter: m.chapter,
          latestCaption: r.caption || '선생님 풀이 힌트',
          created_at: r.created_at,
          mistakeEntry: entry,
        });
      });

      // 이 응답을 시작한 뒤 더 최신 요청이 있었거나(재조회 몰림) 그 사이 팝업이 닫혔다면
      // (handleCloseNewScaffoldingModal이 번호를 올림) 늦게 도착한 이 결과는 버린다.
      if (items.length > 0 && requestId === unseenScaffoldingsRequestIdRef.current) {
        setUnseenScaffoldings(items);
        setIsNewScaffoldingModalOpen(true);
      }
    } catch (err) {
      console.error('Failed to check unseen scaffoldings:', err);
    }
  };

  // mistakes_live_sync 채널(아래)이 세션 id에만 의존해 구독을 한 번 걸어두는데, 그 콜백이
  // 구독 당시의 checkUnseenScaffoldings 클로저(= 그 시점의 isAdmin 값)를 그대로 붙잡고 있었다.
  // 로그인 직후 isAdmin이 비동기 RPC로 뒤늦게 true로 바뀌어도 그 이후 콜백은 여전히 옛 false를
  // 기준으로 판단해버리는 stale closure 문제라, 매 렌더마다 최신 함수를 담아두고 그 ref를 통해서만
  // 호출한다.
  const checkUnseenScaffoldingsRef = useRef(checkUnseenScaffoldings);
  checkUnseenScaffoldingsRef.current = checkUnseenScaffoldings;

  useEffect(() => {
    if (session?.user?.id && !isAdmin) {
      checkUnseenScaffoldings();
    }
  }, [session?.user?.id, isAdmin]);

  const handleCloseNewScaffoldingModal = async () => {
    unseenScaffoldingsRequestIdRef.current++; // 아직 도착 안 한 이전 조회 결과를 전부 무효화
    setIsNewScaffoldingModalOpen(false);
    const userId = session?.user?.id;
    if (!userId || unseenScaffoldings.length === 0) return;

    try {
      const targetIds = unseenScaffoldings.map((item) => item.id);
      // 수파베이스 DB 상에서 읽음(is_read = true) 처리하여 기기가 달라져도 중복 팝업 안 뜸
      await supabase
        .from('mistake_scaffoldings')
        .update({ is_read: true })
        .in('id', targetIds);
    } catch (e) {
      console.error('Failed to mark scaffoldings as read:', e);
    }
    setUnseenScaffoldings([]);
  };

  // 주간 최다 오답 완료 챔피언 정보 로드 + 내 점수 동시 갱신 (하이브리드 1주 이월 및 리셋 롤오버)
  // userIdOverride: 로그인 직후 fetchUserData가 넘겨주는 "방금 막 확정된" 세션 id. 이게 없으면
  // 컴포넌트 state의 session을 읽는데, 로그인 첫 호출 시점엔 setSession()이 아직 리렌더링에 반영되기
  // 전이라 session이 null인 채로 이 함수가 실행돼서 "나의 순위"가 영구적으로 null(순위 밖)에
  // 고정돼버리는 버그가 있었다 — 이후 뭔가(복습, 실시간 이벤트 등)가 다시 호출해주기 전까지는 안 고쳐짐.
  const loadWeeklyChampions = async (userIdOverride?: string) => {
    // 이 함수가 실시간 구독/본인 액션 등 여러 곳에서 거의 동시에 여러 번 호출될 수 있어서, 네트워크
    // 지연에 따라 "먼저 시작했지만 늦게 도착한" 오래된 응답이 방금 갱신된 최신 상태를 덮어써 버리는
    // 경합 문제가 있었다 — 이게 "실시간 순위/점수가 가끔 갱신 안 되고 옛날 값에 멈춰있는" 원인이었다.
    // 요청마다 고유 번호를 매겨서, 그 사이 더 최신 호출이 있었으면 이 응답은 그냥 버린다.
    const requestId = ++weeklyChampionsRequestIdRef.current;
    try {
      // 🏅 주가 바뀐 뒤 아직 지난주 1/2/3등 메달이 집계되지 않았으면 여기서 확정 (매번 호출해도
      // 서버에서 이미 처리된 주인지 확인 후 스킵하므로 안전 — 별도 크론 없이 앱 사용 자체가 트리거)
      supabase.rpc('finalize_last_week_medals_if_needed').then(({ error: medalError }) => {
        if (medalError) console.error('Failed to finalize weekly medals:', medalError);
      });

      // 이번 주 안전한 랭킹 RPC 조회. 지난주 점수를 이월해서 채워 넣지 않는다 — 이번 주에 아무것도
      // 안 한 학생이 지난주 성적 덕에 명예의전당에 끼어 있으면 "이번 주 노력"의 의미가 없어진다.
      // 실제로 이번 주 활동한 사람만, 그 인원이 1~2명뿐이어도 그대로 보여준다.
      const { data, error } = await supabase
        .rpc('get_weekly_leaderboard')
        .order('score', { ascending: false });

      if (error) throw error;
      if (requestId !== weeklyChampionsRequestIdRef.current) return; // 더 최신 호출이 이미 진행 중 — 이 응답은 폐기

      const activeThisWeek = (data || []).filter((item: any) => item.score > 0);
      setWeeklyChampions(activeThisWeek.slice(0, 3));

      // 순위권(top3) 밖이어도 본인 순위/점수는 항상 확인 가능하도록 전체 목록에서 내 위치를 별도로 계산
      const myUserId = userIdOverride || session?.user?.id;
      const myIndex = myUserId ? activeThisWeek.findIndex((item: any) => item.user_id === myUserId) : -1;
      setMyWeeklyStanding(
        myIndex >= 0
          ? { rank: myIndex + 1, score: activeThisWeek[myIndex].score, completedCount: activeThisWeek[myIndex].weekly_completed_count }
          : null
      );
    } catch (err) {
      if (requestId !== weeklyChampionsRequestIdRef.current) return;
      console.error('loadWeeklyChampions failed:', err);
      setWeeklyChampions([]);
      setMyWeeklyStanding(null);
    }
  };

  // Check admin status against the private server-side allow-list.
  // profiles.is_admin is retained only as a synchronized display/filter field.
  const fetchAdminStatus = async () => {
    try {
      const { data, error } = await supabase.rpc('is_current_user_admin');
      if (error) throw error;
      setIsAdmin(data === true);
    } catch (err) {
      console.error('Failed to verify admin status:', err);
      setIsAdmin(false);
    }
  };

  // Supabase로부터 55개 강의 및 타임라인 정보를 한 번에 읽어와 매칭용 구조로 가공
  const loadYoutubeLectures = async () => {
    try {
      const { data: lectures } = await supabase.from('youtube_lectures').select('*');
      const { data: timelines } = await supabase.from('youtube_timelines').select('*').order('start_seconds', { ascending: true });

      if (lectures) {
        const mapped = lectures.map(l => {
          const chapters = (timelines || [])
            .filter(t => t.lecture_id === l.id)
            .map(t => ({
              startSeconds: t.start_seconds,
              chapterTitle: t.chapter_title
            }));

          // 1. 설명(description)에서 명시적 과목명 추출 (하드코딩 배제 및 정확성 보장)
          let derivedGrade = '기타';
          const desc = l.description || '';
          const knownGrades = ['공통수학1', '공통수학2', '대수', '미적분Ⅰ', '미적분Ⅱ', '확률과 통계', '기하', '중3-1', '중3-2'];
          for (const grade of knownGrades) {
            if (desc.includes(grade)) {
              derivedGrade = grade;
              break;
            }
          }

          // 2. 설명에 없을 시 제목/키워드 분석 매핑 (범용 '고1', '고2' 등 하드코딩 배제)
          if (derivedGrade === '기타') {
            const matchPool = (l.title + ' ' + desc).toLowerCase().replace(/\s+/g, '');
            if (matchPool.includes('공통수학2') || matchPool.includes('공수2')) {
              derivedGrade = '공통수학2';
            } else if (matchPool.includes('공통수학1') || matchPool.includes('공수1')) {
              derivedGrade = '공통수학1';
            } else if (matchPool.includes('확률과통계') || matchPool.includes('확통')) {
              derivedGrade = '확률과 통계';
            } else if (matchPool.includes('대수')) {
              derivedGrade = '대수';
            } else if (matchPool.includes('미적분ⅱ') || matchPool.includes('미적분2')) {
              derivedGrade = '미적분Ⅱ';
            } else if (matchPool.includes('미적분ⅰ') || matchPool.includes('미적분1') || matchPool.includes('미적분')) {
              derivedGrade = '미적분Ⅰ';
            } else if (matchPool.includes('기하')) {
              derivedGrade = '기하';
            } else if (matchPool.includes('중3-1') || matchPool.includes('중31')) {
              derivedGrade = '중3-1';
            } else if (matchPool.includes('중3-2') || matchPool.includes('중32')) {
              derivedGrade = '중3-2';
            }
          }

          return {
            videoId: l.video_id,
            title: l.title,
            grade: derivedGrade,
            chapters: chapters.length > 0 ? chapters : undefined
          };
        });
        setYoutubeLectures(mapped);
      }
    } catch (err) {
      console.error('Error loading youtube lectures:', err);
    }
  };

  // 단원별 선생님 실제 강의 접근법 가이드 카탈로그 로드 (검증된 소수 단원만 등록됨 — 없으면 매칭 안 되고 넘어감)
  const loadTeacherApproachGuides = async () => {
    try {
      const { data } = await supabase.from('teacher_approach_guides').select('grade, chapter, guide_text');
      setTeacherApproachGuides((data || []).map(row => ({
        grade: row.grade,
        chapter: row.chapter,
        guideText: row.guide_text
      })));
    } catch (err) {
      console.error('Error loading teacher approach guides:', err);
    }
  };

  // Monitor Supabase Authentication States.
  // Supabase는 onAuthStateChange를 구독하는 즉시 현재 세션으로 한 번 콜백을 실행해준다
  // ('INITIAL_SESSION' 이벤트). 그런데 여기서 별도로 getSession().then(...)도 같은 로직을
  // 중복 실행하고 있어서, 로그인 상태로 앱을 켤 때마다 fetchUserData(내부에서 순차 DB
  // 조회 4번) + fetchAdminStatus + loadYoutubeLectures + loadWeeklyChampions +
  // fetchDiagnosisStats가 전부 두 번씩 실행되고 있었다 — 로딩이
  // 느려진 원인 중 하나. onAuthStateChange 하나로 통합해서 중복 요청을 없앤다.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        const username = session.user.email?.split('@')[0] || 'User';
        setCurrentUser(username);
        fetchUserData(session.user.id); // 내부에서 loadWeeklyChampions/fetchPeerActivities도 같이 호출함
        fetchAdminStatus();
        loadYoutubeLectures(); // 유튜브 강의 데이터 로드
        loadTeacherApproachGuides(); // 단원별 선생님 강의 접근법 가이드 로드
        fetchDiagnosisStats(); // 평균 진단 소요시간 조회
      } else {
        setCurrentUser('');
        setIsAdmin(false);
        setMistakes([]);
        setYoutubeLectures([]);
        setTeacherApproachGuides([]);
        setWeeklyChampions([]);
        setWeeklyMedals({ gold: 0, silver: 0, bronze: 0 });
        setEquippedItems({});
        setComboBoosterExpiresAt(null);
        setMyNickname('');
        try {
          localStorage.removeItem('reviewnote_equipped_items');
          localStorage.removeItem('reviewnote_point_adj');
        } catch (e) {
          console.error(e);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // 인벤토리 상태 변경 시 (가챠 보물 획득/사용 시) 닉네임 변경권 수량 및 콤보 부스터 만료시각 실시간 재조회
  useEffect(() => {
    const handleInvUpdated = () => {
      if (session?.user?.id) {
        checkNameChangeTicket(session.user.id);
        supabase
          .from('profiles')
          .select('combo_booster_expires_at')
          .eq('id', session.user.id)
          .maybeSingle()
          .then(({ data }) => {
            if (data) setComboBoosterExpiresAt(data.combo_booster_expires_at || null);
          });
      }
    };
    window.addEventListener('reviewnote_inventory_updated', handleInvUpdated);
    return () => {
      window.removeEventListener('reviewnote_inventory_updated', handleInvUpdated);
    };
  }, [session?.user?.id]);

  // ── 실시간 온라인 상태 업데이트 ────────────────────────────
  useEffect(() => {
    if (!session?.user) return;

    const updateLastSeen = async () => {
      try {
        await supabase
          .from('profiles')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('id', session.user.id);
      } catch (err) {
        console.error('Failed to update last_seen_at:', err);
      }
    };
    updateLastSeen();

    const timer = setInterval(updateLastSeen, 120000); // 2분 주기
    return () => clearInterval(timer);
  }, [session]);

  // ── 실시간 온라인 사용자 리스트 폴링 ──────────────────────────
  useEffect(() => {
    if (!session?.user) {
      setOnlineUsers([]);
      return;
    }

    const fetchOnlineUsers = async () => {
      try {
        const fiveMinutesAgo = new Date(Date.now() - 300000).toISOString();
        const { data, error } = await supabase.rpc('get_profile_directory');

        if (error) throw error;
        if (data) {
          const directory = data as ProfileDirectoryRow[];
          const mapped = directory
            .filter(p => !!p.last_seen_at && p.last_seen_at >= fiveMinutesAgo)
            .map(p => ({
              id: p.id,
              display_name: p.display_name,
              nickname: p.nickname,
              username: p.username || 'User'
            }));
          setOnlineUsers(mapped);
        }
      } catch (err) {
        console.error('Error fetching online users:', err);
      }
    };

    fetchOnlineUsers();
    const interval = setInterval(fetchOnlineUsers, 30000); // 30초 폴링
    return () => clearInterval(interval);
  }, [session]);

  // Fetch mistakes from Supabase
  const fetchUserData = async (targetUserId?: string) => {
    try {
      const targetId = targetUserId || session?.user?.id;

      loadWeeklyChampions(targetId); // 최신 챔피언 정보 동기화 (로그인 직후 session state 반영 전이어도 정확한 id로)
      fetchPeerActivities(); // 실시간 친구들 복습 현황 로드

      // 서로 결과에 의존하지 않는 4개의 조회를 순차 대기가 아니라 동시에 실행 — 로그인 유저
      // 프로필/전체 오답/전체 학생 이름맵/스캐폴딩을 하나씩 기다렸다가 다음 걸 시작하던 게
      // 로딩을 4배 가까이 느리게 만들던 원인이었다.
      const [mistakesRes, profileRes, allProfilesRes, scaffoldingRes] = await Promise.all([
        // Fetch all mistakes (RLS handles filtering: normal users see own, admin sees all)
        supabase.from('mistakes').select('*').order('date', { ascending: false }),
        targetId
          ? supabase
              .from('profiles')
              .select('email, nickname, display_name, bonus_points, point_adjustment, equipped_title, equipped_stamp, equipped_theme, equipped_ai_voice, current_streak, streak_last_review_date, streak_shields, streak_milestone_claimed, custom_ai_name, combo_booster_expires_at, pending_gift_notice, daily_review_date, daily_review_count, weekly_gold_count, weekly_silver_count, weekly_bronze_count')
              .eq('id', targetId)
              .maybeSingle()
          : Promise.resolve({ data: null } as { data: null }),
        // 이름·학년·스탬프만 노출하는 안전한 학생 디렉터리 RPC (관리자 계정은 여기서 의도적으로
        // 제외됨 — 아래 profilesMap 보강 블록 참고)
        supabase.rpc('get_profile_directory'),
        // 스캐폴딩 힌트가 첨부된 오답 id 집합 (RLS가 본인 것만/관리자는 전체를 알아서 걸러줌)
        supabase.from('mistake_scaffoldings').select('mistake_id'),
      ]);

      if (mistakesRes.error) throw mistakesRes.error;
      const dbMistakes = mistakesRes.data;

      // 로그인 유저의 닉네임 및 보너스 점수 로드
      if (targetId) {
        const myProfile = profileRes.data;
        if (myProfile) {
          setMyNickname(myProfile.nickname || myProfile.display_name || '');
          setCustomAiName(myProfile.custom_ai_name || '');
          setEquippedItems({
            title: myProfile.equipped_title || undefined,
            stamp: myProfile.equipped_stamp || undefined,
            theme: myProfile.equipped_theme || undefined,
            aiVoice: myProfile.equipped_ai_voice || undefined,
          });
          setMyBonusPoints(myProfile.bonus_points || 0);
          setComboBoosterExpiresAt(myProfile.combo_booster_expires_at || null);

          // 🎯 일일 복습 퀘스트: 날짜가 바뀌었으면(서버에 어제 값이 남아있어도) 화면상으론 0부터 다시 시작
          setDailyReviewCount(myProfile.daily_review_date === getKSTDateString() ? (myProfile.daily_review_count || 0) : 0);

          // 🏅 명예의 전당 주간 메달 누적 횟수
          setWeeklyMedals({
            gold: myProfile.weekly_gold_count || 0,
            silver: myProfile.weekly_silver_count || 0,
            bronze: myProfile.weekly_bronze_count || 0,
          });

          // 🎁 선생님이 보낸 선물/공지가 있으면 한 번 띄우고 서버에서 즉시 비운다 (재접속 시 중복 노출 방지)
          const giftNotice = myProfile.pending_gift_notice as { title?: string; message?: string; icon?: string; badge?: string } | null;
          if (giftNotice) {
            showNoticeModal({
              title: giftNotice.title || '알림',
              message: giftNotice.message || '',
              icon: giftNotice.icon,
              badge: giftNotice.badge,
            });
            supabase.from('profiles').update({ pending_gift_notice: null }).eq('id', targetId).then(() => {});
          }

          // 🎟️ 럭키상점에서 쓴 점수(포인트 차감치)를 서버 기준으로 복원 — 기기를 바꿔도 잔액이 정확하게 유지됨
          const dbPointAdjustment = myProfile.point_adjustment ?? 0;
          setPointAdjustment(dbPointAdjustment);
          try {
            localStorage.setItem('reviewnote_point_adj', String(dbPointAdjustment));
          } catch (e) {
            console.error(e);
          }

          // 🔥 연속 복습 스트릭: 기기를 바꿔도 안 끊기도록 서버 값과 로컬(localStorage) 값을 합쳐 반영
          const dbStreak: StreakState | null = myProfile.streak_last_review_date
            ? {
                currentStreak: myProfile.current_streak || 0,
                lastReviewDate: myProfile.streak_last_review_date,
                shieldsCount: myProfile.streak_shields || 0,
              }
            : null;
          setStreakState(prev => reconcileStreakState(dbStreak, prev));
          setStreakMilestoneClaimed(myProfile.streak_milestone_claimed || 0);
        }
        // 닉네임 변경권 보유 여부 확인 (Header에 버튼 노출 제어)
        checkNameChangeTicket(targetId);
        // AI 이름 변경권 보유 여부 확인
        checkAiNameChangeTicket(targetId);
      }

      const profiles = (allProfilesRes.data || []) as ProfileDirectoryRow[];
      const pMap: Record<string, string> = {};
      const gMap: Record<string, string> = {};
      const sMap: Record<string, string> = {};
      profiles.forEach((p) => {
        const username = p.username || p.id.slice(0, 8);
        const displayName = p.display_name?.trim();
        pMap[p.id] = displayName ? `${displayName} (${username})` : username;
        gMap[p.id] = p.school_grade || '';
        if (p.equipped_stamp) {
          sMap[p.id] = p.equipped_stamp;
        }
      });

      // 🛡️ get_profile_directory RPC는 관리자 계정을 의도적으로 제외한다(학생에게 관리자 정보가
      // 노출되지 않게 하는 보안 정책 — RPC/마이그레이션은 그대로 유지). 그 결과 관리자 본인의
      // 이름이 pMap에 없어서, "학생별 통계 조회"·"나의 오답노트" 이름 배지 등에서 관리자 자신이
      // UUID 앞자리로 보이는 부작용이 있었다. 이미 별도로 가져온 "내 프로필"(행 소유자 직접
      // 조회라 RLS상 항상 읽을 수 있음)로 내 항목 하나만 pMap에 보강한다 — 다른 사용자 항목에는
      // 전혀 영향 없다(학생 계정으로 로그인해도 이 블록은 자기 자신의 항목만 채운다).
      if (targetId && profileRes.data) {
        const myProfileForMap = profileRes.data as { display_name?: string | null; email?: string | null };
        const myUsername = myProfileForMap.email?.split('@')[0] || targetId.slice(0, 8);
        const myDisplayName = myProfileForMap.display_name?.trim();
        pMap[targetId] = myDisplayName ? `${myDisplayName} (${myUsername})` : myUsername;
      }

      setProfilesMap(pMap);
      setProfilesGradeMap(gMap);
      setProfilesStampMap(sMap);

      const scaffoldingRows = scaffoldingRes.data;
      setScaffoldedMistakeIds(new Set((scaffoldingRows || []).map((r: any) => r.mistake_id)));

      setMistakes((dbMistakes || []).map(mapDbMistakeRow));
    } catch (err) {
      console.error('Error loading Supabase user data:', err);
    }
  };

  // 🔄 오답노트 데이터의 fetch(경량 refresh)/CRUD — src/features/mistakes/useMistakes로 이동.
  // mistakes/selectedEntry 자체의 소유권은 계속 App.tsx에 남는다(이유는 훅 파일 주석 참고).
  const {
    refreshMistakesLight,
    handleDeleteMistake,
    handleToggleHidden,
  } = useMistakes({
    setMistakes,
    setSelectedEntry,
    setScaffoldedMistakeIds,
    showNoticeModal,
    onMistakeDeleted: () => loadWeeklyChampions(), // MVP 챔피언 배너 즉각 갱신
  });

  // 내 닉네임 수정 함수 (실제 이름 display_name은 변경되지 않고 nickname 컬럼만 업데이트)
  const handleUpdateNickname = async (newNick: string) => {
    if (!session?.user?.id) return;
    const trimmed = newNick.trim();
    if (!trimmed) return;

    // 닉네임 변경권 재확인
    const { data: ticketRow } = await supabase
      .from('user_items')
      .select('quantity')
      .eq('user_id', session.user.id)
      .eq('item_id', 'item_name_change')
      .maybeSingle();

    if (!ticketRow || ticketRow.quantity < 1) {
      showNoticeModal({
        title: '🏷️ 닉네임 변경권이 없습니다!',
        message: '럭키 상점에서 뽑기를 통해 획득하세요.',
        badge: '럭키상점',
        icon: '🏷️',
      });
      return;
    }

    try {
      // 닉네임 변경
      const { error } = await supabase
        .from('profiles')
        .update({ nickname: trimmed, updated_at: new Date().toISOString() })
        .eq('id', session.user.id);
      if (error) throw error;

      // 변경권 1개 차감
      const newQty = Math.max(0, ticketRow.quantity - 1);
      await supabase
        .from('user_items')
        .update({ quantity: newQty })
        .eq('user_id', session.user.id)
        .eq('item_id', 'item_name_change');

      setMyNickname(trimmed);
      setHasNameChangeTicket(newQty > 0);
      window.dispatchEvent(new CustomEvent('reviewnote_inventory_updated'));
      loadWeeklyChampions();
      showNoticeModal({
        title: '✅ 닉네임 변경 완료!',
        message: `'${trimmed}'(으)로 닉네임이 성공적으로 변경되었습니다.\n(잔여 변경권: ${newQty}개)`,
        badge: '닉네임 변경',
        icon: '✨',
      });
    } catch (err: any) {
      showNoticeModal({
        title: '닉네임 변경 실패',
        message: err.message,
        badge: '오류',
        icon: '⚠️',
      });
    }
  };

  // 보물가방에서 닉네임 변경권 사용 시 호출 (중앙 커스텀 팝업 모달 호출)
  const handleUseNameChangeTicket = () => {
    window.dispatchEvent(new CustomEvent('reviewnote_open_nickname_modal'));
  };

  // 닉네임 변경권 보유 여부 확인
  const checkNameChangeTicket = async (targetUserId?: string) => {
    const targetId = targetUserId || session?.user?.id;
    if (!targetId) return;
    const { data } = await supabase
      .from('user_items')
      .select('quantity')
      .eq('user_id', targetId)
      .eq('item_id', 'item_name_change')
      .maybeSingle();
    setHasNameChangeTicket(!!(data && data.quantity > 0));
  };

  // AI 이름 변경권을 사용해 AI 페르소나 이름을 변경 (닉네임 변경과 동일한 패턴)
  const handleUpdateAiName = async (newName: string) => {
    if (!session?.user?.id) return;
    const trimmed = newName.trim();
    if (!trimmed) return;

    const { data: ticketRow } = await supabase
      .from('user_items')
      .select('quantity')
      .eq('user_id', session.user.id)
      .eq('item_id', 'item_ai_name_change')
      .maybeSingle();

    if (!ticketRow || ticketRow.quantity < 1) {
      showNoticeModal({
        title: '🎭 AI 이름 변경권이 없습니다!',
        message: '럭키 상점에서 뽑기를 통해 획득하세요.',
        badge: '럭키상점',
        icon: '🎭',
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ custom_ai_name: trimmed })
        .eq('id', session.user.id);
      if (error) throw error;

      const newQty = Math.max(0, ticketRow.quantity - 1);
      await supabase
        .from('user_items')
        .update({ quantity: newQty })
        .eq('user_id', session.user.id)
        .eq('item_id', 'item_ai_name_change');

      setCustomAiName(trimmed);
      setHasAiNameChangeTicket(newQty > 0);
      window.dispatchEvent(new CustomEvent('reviewnote_inventory_updated'));
      showNoticeModal({
        title: '✅ AI 이름 변경 완료!',
        message: `'${trimmed}'(으)로 AI 이름이 성공적으로 변경되었습니다.\n(잔여 변경권: ${newQty}개)`,
        badge: 'AI 이름 변경',
        icon: '🤖',
      });
    } catch (err: any) {
      showNoticeModal({
        title: 'AI 이름 변경 실패',
        message: err.message,
        badge: '오류',
        icon: '⚠️',
      });
    }
  };

  // 보물가방에서 AI 이름 변경권 사용 시 호출 (닉네임 변경과 동일한 중앙 커스텀 팝업 모달 패턴)
  const handleUseAiNameChangeTicket = () => {
    window.dispatchEvent(new CustomEvent('reviewnote_open_ai_name_modal'));
  };

  // AI 이름 변경권 보유 여부 확인
  const checkAiNameChangeTicket = async (targetUserId?: string) => {
    const targetId = targetUserId || session?.user?.id;
    if (!targetId) return;
    const { data } = await supabase
      .from('user_items')
      .select('quantity')
      .eq('user_id', targetId)
      .eq('item_id', 'item_ai_name_change')
      .maybeSingle();
    setHasAiNameChangeTicket(!!(data && data.quantity > 0));
  };



  // Fetch recent peer review activities through the authenticated safe RPC.
  const fetchPeerActivities = async () => {
    try {
      const { data, error } = await supabase
        .rpc('get_recent_peer_activities')
        .limit(10);

      if (error) throw error;
      setPeerActivities(data || []);
    } catch (err) {
      console.error('Failed to load peer activities:', err);
    }
  };

  // Refresh peer activities when Completed reviews tab is opened
  useEffect(() => {
    if (activeTab === 'completed' && session?.user) {
      fetchPeerActivities();
    }
  }, [activeTab, session]);

  // 🔄 오답노트 실시간 동기화: mistakes 또는 mistake_scaffoldings(선생님 힌트 첨부)에 변화가
  // 생기면 새로고침 없이 자동으로 다시 불러온다. RLS가 이미 본인 것만/관리자는 전체를 걸러주므로
  // 여기서는 그냥 항상 다시 조회하면 되는데, 프로필·전체 학생 이름맵까지 전부 다시 읽는 무거운
  // fetchUserData 대신 mistakes/스캐폴딩만 다시 읽는 refreshMistakesLight를 쓴다 (같은 값이 반복
  // 갱신될 때마다 필요 이상으로 여러 테이블을 다시 조회하지 않도록).
  useEffect(() => {
    if (!session?.user?.id) return;
    const channel = supabase
      .channel('mistakes_live_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mistakes' }, () => {
        refreshMistakesLight();
        loadWeeklyChampions();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mistake_scaffoldings' }, () => {
        refreshMistakesLight();
        checkUnseenScaffoldingsRef.current();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id]);

  // 🧭 단계형 풀이 체크리스트 생성/재생성/상태 갱신 — src/features/checkpoints/useCheckpointGeneration로
  // 이동. 이 훅은 selectedEntry를 읽기 전용으로만 참조하며, mistakes/selectedEntry 자체의
  // 소유권은 계속 App.tsx에 남는다(안전장치는 훅 파일의 주석 참고, 전부 그대로 보존됨).
  const {
    checkpointRegenStatus,
    generateAndSaveSolutionCheckpoints,
    regenerateCheckpointsWithProgress,
    handleUpdateCheckpointStatus,
  } = useCheckpointGeneration({
    selectedEntry,
    setMistakes,
    setSelectedEntry,
    showNoticeModal,
  });

  // AI 분석(classify → extract/solve) 파이프라인 — src/features/mistakes/useMistakeAnalysis로
  // 이동. generateAndSaveSolutionCheckpoints(위 체크포인트 훅의 반환값)를 그대로 넘겨받아 분석
  // 완료 직후 eager 생성을 트리거한다(순환 의존 없이 단방향으로만 연결).
  const {
    analyzingEntryId,
    averageWaitMs,
    fetchDiagnosisStats,
    handleStartAnalysis,
  } = useMistakeAnalysis({
    mistakes,
    setMistakes,
    setSelectedEntry,
    profilesGradeMap,
    youtubeLectures,
    customAiName,
    aiVoice: equippedItems.aiVoice,
    teacherApproachGuides,
    showNoticeModal,
    generateAndSaveSolutionCheckpoints,
  });

  // Intercept camera capture and start cropping flow
  const handleCameraCapture = (base64Image: string, initialCrop?: CropPercent) => {
    setTempCapturedImage(base64Image);
    setTempInitialCrop(initialCrop);
  };

  // 완료 오답 일괄 인쇄 트리거 핸들러
  const handlePrintCompleted = () => {
    const completedList = mistakes.filter(m => m.reviews?.filter(r => r === 'O').length === 3);
    const toPrint = completedList.filter(m => selectedPrintIds.includes(m.id));
    if (toPrint.length === 0) return;

    setPrintItems(toPrint);

    // React가 DOM을 마운트하고 이미지를 적재할 때까지 250ms 대기 후 인쇄 다이얼로그 실행
    setTimeout(async () => {
      // 1. 인쇄 다이얼로그 띄움 (사용자 인쇄 액션 대기)
      window.print();
      
      // 2. 인쇄창이 닫힌 후에 비로소 인쇄 완료(printed: true) 처리 및 DB/상태 동기화
      await handleMarkAsPrinted(toPrint.map(m => m.id));
      
      // 3. 인쇄 임시 아이템 초기화
      setPrintItems(null);
    }, 250);
  };

  // 인쇄 완료 처리 (Supabase DB 및 로컬 상태 동기화)
  const handleMarkAsPrinted = async (ids: string[]) => {
    try {
      const promises = mistakes
        .filter(m => ids.includes(m.id))
        .map(async (m) => {
          const updatedAnalysis: MistakeAnalysis = {
            solvingProcess: m.analysis?.solvingProcess || '',
            ...m.analysis,
            printed: true
          };

          const { error } = await supabase
            .from('mistakes')
            .update({
              analysis: updatedAnalysis
            })
            .eq('id', m.id);

          if (error) throw error;
          return { id: m.id, updatedAnalysis };
        });

      const results = await Promise.all(promises);

      setMistakes(prev => prev.map(m => {
        const match = results.find(r => r.id === m.id);
        if (match) {
          return { ...m, analysis: match.updatedAnalysis };
        }
        return m;
      }));
    } catch (err) {
      console.error('Failed to mark as printed:', err);
    }
  };

  // 인쇄 선택 토글 핸들러
  const handleTogglePrintSelect = (id: string) => {
    setSelectedPrintIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // 인쇄 전체 선택/해제 핸들러
  const handleToggleAllPrintSelect = () => {
    const completedList = mistakes.filter(m => m.reviews?.filter(r => r === 'O').length === 3);
    if (selectedPrintIds.length === completedList.length) {
      setSelectedPrintIds([]);
    } else {
      setSelectedPrintIds(completedList.map(m => m.id));
    }
  };

  // 인쇄 모드 (텍스트/이미지) 토글 핸들러
  const handleTogglePrintAsText = (id: string) => {
    setPrintAsTextMap(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Process crop completion, upload to Storage, and insert database record
  const handleCropComplete = async (blob: Blob) => {
    // 이미 업로드가 진행 중이면 무시한다 — 크롭 화면 자체의 연타는 배치 렌더로
    // 즉시 언마운트되어 안전하지만, 업로드 중에 카메라 탭으로 돌아가 새 사진을
    // 또 확정하면 이 함수가 겹쳐 호출될 수 있어 별도로 막아야 한다.
    if (isUploadingPhoto) return;
    setTempCapturedImage(null);
    setTempInitialCrop(undefined);
    if (!session?.user) return;

    setIsUploadingPhoto(true);
    try {
      const fileExt = blob.type.split('/')[1] || 'jpg';
      const fileName = `${session.user.id}/${Date.now()}.${fileExt}`;

      // 1. Upload to Supabase Storage bucket
      const { error: uploadError } = await supabase.storage
        .from('problem-images')
        .upload(fileName, blob, {
          contentType: blob.type
        });

      if (uploadError) throw uploadError;

      // 2. Get Public URL
      const { data: { publicUrl } } = supabase.storage
        .from('problem-images')
        .getPublicUrl(fileName);

      // 3. Save DB Record
      const newEntryTitle = `스캔된 문제 #${mistakes.length + 1}`;
      const { data: dbEntry, error: insertError } = await supabase
        .from('mistakes')
        .insert({
          user_id: session.user.id,
          title: newEntryTitle,
          image_url: publicUrl,
          analysis: null,
          reviews: ['', '', ''],
          grade: null,
          chapter: null,
          root_causes: [],
          user_action_plan: null,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      const newEntry: MistakeEntry = {
        id: dbEntry.id,
        userId: dbEntry.user_id,
        title: dbEntry.title,
        imageUrl: dbEntry.image_url,
        date: dbEntry.date,
        analysis: undefined,
        reviews: ['', '', ''],
        rootCauses: [],
      };
      
      setMistakes(prev => [newEntry, ...prev]);
      applyDailyStreakUpdate(); // 신규 오답 등록도 그날의 연속 복습 스트릭으로 인정
      setActiveTab('notes');
      setSelectedEntry(newEntry); // Open modal immediately
    } catch (err: any) {
      console.error(err);
      showNoticeModal({
        title: '업로드 실패',
        message: '스캔 이미지 클라우드 업로드 실패: ' + err.message,
        badge: '오류',
        icon: '⚠️',
      });
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  // O/X/★ 복습 상태머신 + 포인트/스트릭/콤보부스터/일일퀘스트 — src/features/mistakes/useReviewState로
  // 이동. mistakes/selectedEntry 자체의 소유권은 계속 App.tsx에 남는다.
  const {
    applyDailyStreakUpdate,
    handleUpdateReviews,
  } = useReviewState({
    mistakes,
    setMistakes,
    setSelectedEntry,
    session,
    streakState,
    setStreakState,
    streakMilestoneClaimed,
    setStreakMilestoneClaimed,
    setMyBonusPoints,
    setDailyReviewCount,
    comboBoosterExpiresAt,
    showNoticeModal,
    regenerateCheckpointsWithProgress,
    fetchPeerActivities,
    loadWeeklyChampions,
  });

  // 가장 옛날에 등록되었으나 아직 3회 오답 완료하지 않은 카드부터 복습 세션 시작
  const handleStartReviewSession = () => {
    if (!session?.user || mistakes.length === 0) return;

    // 미완료 상태 (O 개수가 3개 미만인 오답 필터링)
    const uncompleted = mistakes.filter(m => {
      const oCount = m.reviews?.filter(r => r === 'O').length || 0;
      return oCount < 3;
    });

    if (uncompleted.length === 0) {
      showNoticeModal({
        title: '🎉 완벽합니다!',
        message: '현재 복습할 남은 오답이 없습니다. 모든 복습을 완주하셨습니다! 🐱',
        badge: '복습 완주',
        icon: '🎉',
      });
      return;
    }

    // 등록 시각(m.date) 기준 오름차순(가장 오래된 것 먼저) 정렬
    const sorted = [...uncompleted].sort((a, b) => {
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });

    // 가장 오래된 오답을 타겟으로 모달 즉시 활성화
    setIsReviewSession(true);
    setSelectedEntry(sorted[0]);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setCurrentUser('');
    setIsAdmin(false);
    setSession(null);
    setMistakes([]);
    setProfilesMap({});
    setEquippedItems({});
    setMyNickname('');
    try {
      localStorage.removeItem('reviewnote_equipped_items');
      localStorage.removeItem('reviewnote_point_adj');
    } catch (e) {
      console.error(e);
    }
    setActiveTab('notes');
  };

  // ── 통계 계산 ──────────────────────────────────────────────────
  const filteredMistakesForStats = useMemo(() => {
    let list = mistakes;
    if (isAdmin) {
      if (statsStudentFilter !== 'all') {
        list = mistakes.filter(m => m.userId === statsStudentFilter);
      }
    } else {
      if (session?.user) {
        list = mistakes.filter(m => m.userId === session.user.id);
      } else {
        list = [];
      }
    }

    if (statsPeriodFilter === 'all') {
      return list;
    }

    const days = statsPeriodFilter === '90' ? 90 : 30;
    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() - days);
    const limitDateStr = limitDate.toISOString();

    return list.filter(m => m.date && m.date >= limitDateStr);
  }, [mistakes, isAdmin, statsStudentFilter, statsPeriodFilter, session]);

  const stats = useMemo(() => {
    const gradeCounts: Record<string, number> = {};
    const chapterCounts: Record<string, number> = {};
    const causeCounts: Record<string, number> = {};

    filteredMistakesForStats.forEach(m => {
      if (m.grade) gradeCounts[m.grade] = (gradeCounts[m.grade] || 0) + 1;
      if (m.chapter && m.grade) {
        const key = `${m.grade} > ${m.chapter}`;
        chapterCounts[key] = (chapterCounts[key] || 0) + 1;
      }
      (m.rootCauses || []).forEach(c => {
        causeCounts[c] = (causeCounts[c] || 0) + 1;
      });
    });

    const totalGrade = Object.values(gradeCounts).reduce((a, b) => a + b, 0);
    const totalCause = Object.values(causeCounts).reduce((a, b) => a + b, 0);
    const topChapters = Object.entries(chapterCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    return { gradeCounts, causeCounts, totalGrade, totalCause, topChapters };
  }, [filteredMistakesForStats]);

  const bubbleChartData = useMemo(() => {
    // 실제로 등록된 과목들만 세로축 지정 (가변)
    const activeGrades = Array.from(
      new Set(filteredMistakesForStats.map(m => m.grade).filter(Boolean))
    ).sort() as string[];

    return activeGrades.map(grade => {
      // 해당 과목에 속한 고유 단원들
      const chaptersInGrade = Array.from(
        new Set(
          filteredMistakesForStats
            .filter(m => m.grade === grade && m.chapter)
            .map(m => m.chapter)
        )
      ).sort() as string[];

      // 단원 정보가 없는 오답이 있다면 '기타/미분류' 단원 추가
      const hasNoChapter = filteredMistakesForStats.some(m => m.grade === grade && !m.chapter);
      if (hasNoChapter) {
        chaptersInGrade.push('기타/미분류');
      }

      const chapterRows = chaptersInGrade.map(chapter => {
        const rowStats = ROOT_CAUSE_OPTIONS.map(opt => {
          const count = filteredMistakesForStats.filter(m => {
            const matchGrade = m.grade === grade;
            const matchChapter = chapter === '기타/미분류' ? !m.chapter : m.chapter === chapter;
            const matchCause = m.rootCauses?.includes(opt.id);
            return matchGrade && matchChapter && matchCause;
          }).length;

          return {
            id: opt.id,
            label: opt.label,
            count
          };
        });

        return {
          chapter,
          stats: rowStats
        };
      });

      return {
        grade,
        rows: chapterRows
      };
    });
  }, [filteredMistakesForStats]);

  const maxCountInBubbles = useMemo(() => {
    let maxVal = 0;
    bubbleChartData.forEach(gGroup => {
      gGroup.rows.forEach(row => {
        row.stats.forEach(cell => {
          if (cell.count > maxVal) maxVal = cell.count;
        });
      });
    });
    return Math.max(maxVal, 1);
  }, [bubbleChartData]);

  const maskId = (username: string) => {
    if (!username) return '';
    if (username.length <= 3) return username;
    return username.slice(0, 3) + '*'.repeat(username.length - 3);
  };

  if (!currentUser) {
    return <AuthScreen onLogin={(username) => setCurrentUser(username)} />;
  }

  return (
    <div className="h-full flex flex-col bg-app-main text-slate-100 select-none transition-colors duration-300">
      <AppShell
        header={(
          <Header
            currentUser={currentUser}
            userId={session?.user?.id}
            nickname={myNickname}
            onLogout={handleLogout}
            onUpdateNickname={handleUpdateNickname}
            hasNameChangeTicket={hasNameChangeTicket}
            onUpdateAiName={handleUpdateAiName}
            hasAiNameChangeTicket={hasAiNameChangeTicket}
            myScore={currentDisplayPoints}
            onOpenStore={() => setActiveTab('store')}
            equippedTitle={equippedItems.title}
            weeklyMedals={weeklyMedals}
            streakDays={streakState.currentStreak}
            comboBoosterExpiresAt={comboBoosterExpiresAt}
            isAdmin={isAdmin}
            onSelectTab={(tab) => setActiveTab(tab)}
          />
        )}
        bottomNav={(
          <BottomNavigation
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            isAdmin={isAdmin}
            onlineUsers={onlineUsers}
            onStartReviewSession={handleStartReviewSession}
            onOpenSlideList={() => setIsSlideListOpen(true)}
            dailyReviewCount={dailyReviewCount}
          />
        )}
      >
        <Screen when={activeTab === 'store'}>
          <LazyScreenBoundary>
            <GachaStore
              userId={session?.user?.id || ''}
              userPoints={currentDisplayPoints}
              onDeductPoints={handleDeductPoints}
              equippedItems={equippedItems}
              onEquipItem={handleEquipItem}
              onUseNameChangeTicket={handleUseNameChangeTicket}
              onUseAiNameChangeTicket={handleUseAiNameChangeTicket}
              aiPersonaName={customAiName || '밤티'}
              comboBoosterExpiresAt={comboBoosterExpiresAt}
              cheerLine={currentCheerLine}
            />
          </LazyScreenBoundary>
        </Screen>

        <Screen when={activeTab === 'notes'}>
          <>
            {/* 명예의 전당 배너 */}
            {weeklyChampions && weeklyChampions.length > 0 ? (
              <div className="bg-gradient-to-b from-slate-900/95 via-slate-900/90 to-slate-900/95 border border-amber-500/30 rounded-2xl p-2.5 mb-3 shadow-[0_0_15px_rgba(245,158,11,0.08)] animate-fade-in space-y-2">
                {/* 헤더 타이틀 */}
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5">
                  <div className="flex items-center space-x-1.5">
                    <span className="text-sm">👑</span>
                    <h3 className="text-[11px] font-black text-amber-400 uppercase tracking-wider">
                      {weeklyChampions[0]?.isLastWeek ? '🏆 명예의 전당 (지난주 MVP)' : '🏆 명예의 전당 (주간 복습 랭킹)'}
                    </h3>
                  </div>
                  <span className="text-[8.5px] text-slate-500 font-bold">매주 월요일 갱신</span>
                </div>

                {/* 순위권(top3) 밖이어도 내 점수는 항상 보이는 한 줄 — 관리자 계정은 애초에 명예의
                    전당 집계(weekly_leaderboard 뷰)에서 제외되므로, "순위 밖·0점"이 마치 실시간
                    갱신이 안 되는 버그처럼 보이지 않도록 별도 안내 문구로 대체한다. */}
                {session?.user && (
                  <div className="flex items-center justify-between bg-slate-955/60 border border-slate-800/70 rounded-xl px-2.5 py-1">
                    <span className="text-[9px] text-slate-500 font-bold">🙋 나의 순위</span>
                    {isAdmin ? (
                      <span className="text-[9px] font-bold text-slate-500">관리자 계정은 랭킹 집계 제외</span>
                    ) : (
                      <span className="text-[10px] font-black text-indigo-300">
                        {myWeeklyStanding ? `${myWeeklyStanding.rank}위` : '순위 밖'}
                        <span className="text-slate-400 font-bold ml-1">
                          · {myWeeklyStanding ? `${Math.round(myWeeklyStanding.score)}점` : '0점'}
                        </span>
                      </span>
                    )}
                  </div>
                )}

                {/* 1등 / 2등 / 3등 3줄 세로 명예의 전당 리스트 */}
                <div className="space-y-1">
                  {[0, 1, 2].map((idx) => {
                    const champ = weeklyChampions[idx];
                    const isFirst = idx === 0;
                    const isSecond = idx === 1;

                    const medal = isFirst ? '🥇 1등' : isSecond ? '🥈 2등' : '🥉 3등';
                    const medalStyle = isFirst
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : isSecond
                      ? 'bg-slate-400/20 text-slate-200 border-slate-400/30'
                      : 'bg-amber-700/20 text-amber-400 border-amber-700/30';

                    const rowBg = isFirst
                      ? 'bg-gradient-to-r from-amber-500/10 via-slate-900 to-slate-900 border-amber-500/40 shadow-md'
                      : 'bg-slate-955/70 border-slate-850';

                    const isMe = champ && (champ.username === currentUser || champ.user_id === currentUser);
                    const activeTitle = (isMe && equippedItems.title) ? equippedItems.title : (champ?.title || undefined);
                    const titleBadge = activeTitle ? getTitleBadgeStyle(activeTitle) : null;

                    const nameToDisplay = champ?.nickname || champ?.display_name;
                    const studentDisplayName = champ
                      ? (nameToDisplay ? nameToDisplay : maskId(champ.username))
                      : null;

                    return (
                      <div
                        key={idx}
                        className={`p-1.5 px-2.5 rounded-xl border flex items-center justify-between space-x-2 whitespace-nowrap overflow-x-auto no-scrollbar transition-all ${rowBg}`}
                      >
                        {/* Left: 메달 + 칭호 + 학생 이름 (말줄임 truncate 처리) */}
                        <div className="flex items-center space-x-1.5 min-w-0 flex-1">
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full border flex-none ${medalStyle}`}>
                            {medal}
                          </span>

                          {champ && champ.score > 0 ? (
                            <>
                              {/* 칭호 배지 */}
                              {activeTitle && titleBadge && (
                                <span className={`text-[8px] font-black border px-1.5 py-0.2 rounded-full flex items-center space-x-0.5 flex-none ${titleBadge.style}`}>
                                  <span>{titleBadge.icon}</span>
                                  <span>{activeTitle}</span>
                                </span>
                              )}

                              {/* 긴 이름 말줄임(...) 표출 */}
                              <span
                                className={`font-black truncate max-w-[85px] sm:max-w-[140px] ${isFirst ? 'text-white text-[11px]' : 'text-slate-200 text-[10px]'}`}
                                title={studentDisplayName || ''}
                              >
                                {studentDisplayName}
                              </span>

                              {/* 🏅 역대 명예의 전당 주간 1/2/3등 누적 횟수 (압축 표시) */}
                              {(champ.weekly_gold_count > 0 || champ.weekly_silver_count > 0 || champ.weekly_bronze_count > 0) && (
                                <span
                                  className="text-[8px] font-black text-slate-400 flex items-center space-x-1 flex-none"
                                  title="역대 명예의 전당 주간 1/2/3등 횟수"
                                >
                                  {champ.weekly_gold_count > 0 && <span>🥇{champ.weekly_gold_count}</span>}
                                  {champ.weekly_silver_count > 0 && <span>🥈{champ.weekly_silver_count}</span>}
                                  {champ.weekly_bronze_count > 0 && <span>🥉{champ.weekly_bronze_count}</span>}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-600 italic flex-none">
                              도전 대기 중... 🐱
                            </span>
                          )}
                        </div>

                        {/* Right: 완료 X개 + X점 (단일 행 표출) */}
                        {champ && champ.score > 0 && (
                          <div className="flex items-center space-x-1.5 flex-none text-right whitespace-nowrap pl-1">
                            <span className="text-[9px] text-slate-400 font-medium">
                              완료 {champ.weekly_completed_count}개
                            </span>
                            <span className={`font-black ${isFirst ? 'text-amber-400 text-[11.5px]' : 'text-slate-300 text-[10.5px]'}`}>
                              {Math.round(champ.score)}점
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* 두 주 연속 복습 완료자가 전혀 없을 때: 동기부여 공백 배너 제공 */
              <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-3 mb-3 shadow-lg shadow-indigo-950/5 animate-fade-in space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <span className="text-xl animate-pulse flex-none">👑</span>
                    <div className="min-w-0 leading-tight">
                      <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">복습왕 리그</div>
                      <div className="text-xs font-bold text-slate-300 mt-0.5">
                        이번주 첫 복습왕의 주인공이 되어보세요!
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex-none pl-3 border-l border-slate-800/50">
                    <span className="text-[8px] text-indigo-400 font-black bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
                      도전 대기 중
                    </span>
                  </div>
                </div>

                {/* 순위권(top3) 밖이어도 내 점수는 항상 보이는 한 줄 — 관리자 계정은 애초에 명예의
                    전당 집계(weekly_leaderboard 뷰)에서 제외되므로, "순위 밖·0점"이 마치 실시간
                    갱신이 안 되는 버그처럼 보이지 않도록 별도 안내 문구로 대체한다. */}
                {session?.user && (
                  <div className="flex items-center justify-between bg-slate-955/60 border border-slate-800/70 rounded-xl px-2.5 py-1">
                    <span className="text-[9px] text-slate-500 font-bold">🙋 나의 순위</span>
                    {isAdmin ? (
                      <span className="text-[9px] font-bold text-slate-500">관리자 계정은 랭킹 집계 제외</span>
                    ) : (
                      <span className="text-[10px] font-black text-indigo-300">
                        {myWeeklyStanding ? `${myWeeklyStanding.rank}위` : '순위 밖'}
                        <span className="text-slate-400 font-bold ml-1">
                          · {myWeeklyStanding ? `${Math.round(myWeeklyStanding.score)}점` : '0점'}
                        </span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 🏆 취약 단원 분석 진입점 — 기존 stats useMemo를 그대로 재사용, 새 계산 없음.
                전체메뉴 드로어를 열어야만 존재를 알 수 있던 '분석통계'를 메인 화면에서
                한 번에 열람할 수 있도록 진입 경로를 2탭에서 1탭으로 줄인다. */}
            {stats.topChapters.length > 0 && (
              <button
                onClick={() => setActiveTab('stats')}
                className="w-full flex items-center justify-between gap-2 bg-slate-900/60 border border-slate-800 rounded-2xl px-3.5 py-2.5 mb-3 text-left hover:border-indigo-500/40 hover:bg-slate-900 transition-colors group"
              >
                <div className="flex items-center space-x-2 min-w-0">
                  <span className="text-base flex-none">🏆</span>
                  <div className="min-w-0 leading-tight">
                    <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">가장 많이 등록된 취약 단원</div>
                    <div className="text-xs font-bold text-slate-200 truncate">{stats.topChapters[0][0]}</div>
                  </div>
                </div>
                <span className="text-[10px] text-indigo-400 font-black flex-none group-hover:text-indigo-300">
                  분석 보기 →
                </span>
              </button>
            )}

            <MistakeList
              mistakes={[...mistakes]
                .filter(m => !m.isHidden)
                .filter(m => !(m.reviews?.filter(r => r === 'O').length === 3))
                .sort((a, b) => {
                // "도움 필요"(needsHelp) 문제를 상단 고정 — 단, 어드민은 전체 학생의 오답을 다
                // 보므로(RLS) 여기서 고정하면 모든 학생의 도움 필요 문제가 계속 쌓여 스크롤이
                // 길어진다. 어드민은 날짜순 정렬만 적용하고, 고정은 본인 화면(학생)에서만 한다.
                if (!isAdmin) {
                  const aNeedsHelp = resolveNeedsHelp(a.reviews, a.analysis?.needsHelp);
                  const bNeedsHelp = resolveNeedsHelp(b.reviews, b.analysis?.needsHelp);

                  if (aNeedsHelp && !bNeedsHelp) return -1;
                  if (bNeedsHelp && !aNeedsHelp) return 1;
                }

                return new Date(b.date).getTime() - new Date(a.date).getTime();
              })}
            onSelectEntry={(entry) => {
              setIsReviewSession(false);
              setSelectedEntry(entry);
            }}
            onDeleteMistake={handleDeleteMistake}
            onAddClick={() => setActiveTab('camera')}
            title="나의 오답노트"
            emptyMessage="아직 등록된 오답이 없습니다. 아래 카메라 버튼을 눌러 수학 문제를 촬영하고 AI의 맞춤 분석을 받아보세요."
            isAdmin={isAdmin}
            profilesMap={profilesMap}
            currentUserId={session?.user?.id}
            equippedStamp={equippedItems.stamp}
            profilesStampMap={profilesStampMap}
            scaffoldedMistakeIds={scaffoldedMistakeIds}
            onToggleHidden={handleToggleHidden}
            checkpointRegenStatusMap={checkpointRegenStatus}
            onRetryCheckpointGeneration={regenerateCheckpointsWithProgress}
          />
          </>
        </Screen>

        <Screen when={activeTab === 'completed'}>
          <MistakeList
            mistakes={mistakes.filter(m => !m.isHidden).filter(m => {
              const oCount = m.reviews?.filter(r => r === 'O').length || 0;
              if (oCount === 3) return true; // 3차 완주는 상시 노출
              
              // 어드민인 경우, 3칸 다 채웠지만 O가 3개가 아닌 오답(예: XOO, OXO 등)도 추가 노출
              if (isAdmin) {
                const isStampsFilled = m.reviews && m.reviews.every(r => r !== '');
                return isStampsFilled && oCount < 3;
              }
              return false;
            })}
            onSelectEntry={(entry) => {
              setIsReviewSession(false);
              setSelectedEntry(entry);
            }}
            onDeleteMistake={handleDeleteMistake}
            onAddClick={() => setActiveTab('camera')}
            onPrintClick={handlePrintCompleted}
            title="복습 완료 보관함"
            hideAddButton={true}
            emptyMessage="아직 완전히 복습 완료(O 3회 달성)된 오답이 없습니다. 열심히 오답을 복습하여 정복해 보세요!"
            isAdmin={isAdmin}
            profilesMap={profilesMap}
            currentUserId={session?.user?.id}
            viewMode="list"
            peerActivities={peerActivities}
            printAsTextMap={printAsTextMap}
            onTogglePrintAsText={handleTogglePrintAsText}
            selectedPrintIds={selectedPrintIds}
            onTogglePrintSelect={handleTogglePrintSelect}
            onToggleAllPrintSelect={handleToggleAllPrintSelect}
            equippedStamp={equippedItems.stamp}
            profilesStampMap={profilesStampMap}
            scaffoldedMistakeIds={scaffoldedMistakeIds}
          />
        </Screen>

        <Screen when={activeTab === 'camera' && !tempCapturedImage}>
          <CameraScanner
            onCapture={handleCameraCapture}
            onClose={() => setActiveTab('notes')}
          />
        </Screen>

        <Screen when={activeTab === 'hidden'}>
          <HiddenMistakesPanel
            mistakes={mistakes.filter(m => m.isHidden)}
            onSelectEntry={(entry) => {
              setIsReviewSession(false);
              setSelectedEntry(entry);
            }}
            onUnhide={(id) => handleToggleHidden(id, false)}
          />
        </Screen>

        <Screen when={activeTab === 'admin' && isAdmin}>
          <LazyScreenBoundary>
            <AdminPanel onSelectTab={(tab) => setActiveTab(tab)} />
          </LazyScreenBoundary>
        </Screen>

        <Screen when={activeTab === 'guide'}>
          <StudentGuide />
        </Screen>

        <Screen when={activeTab === 'activity'}>
          <RecentActivityFeed />
        </Screen>

        {/* ── 분석통계 탭 ── */}
        <Screen when={activeTab === 'stats'}>
          <div className="space-y-6 w-full overflow-x-hidden min-w-0">
            <div>
              <h2 className="text-lg font-bold text-white">📊 나의 약점 분석</h2>
              <p className="text-xs text-slate-400 mt-0.5">총 {filteredMistakesForStats.length}개의 오답 기록 기반</p>
            </div>

            {/* 어드민인 경우 학생 필터 셀렉터 추가 - 모바일 overflow 방지를 위해 세로 flex-col 배치 */}
            {isAdmin && (
              <div className="flex flex-col space-y-2 bg-slate-900 border border-slate-800 p-3.5 rounded-2xl shadow-sm min-w-0">
                <span className="text-xs text-slate-300 font-extrabold flex-none">👤 학생별 통계 조회</span>
                <select
                  value={statsStudentFilter}
                  onChange={e => setStatsStudentFilter(e.target.value)}
                  className="w-full min-w-0 px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white outline-none focus:border-indigo-500 transition-colors cursor-pointer font-bold"
                >
                  <option value="all">전체 학생 합계 ({mistakes.length}개)</option>
                  {Array.from(new Set(mistakes.map(m => m.userId).filter(Boolean) as string[]))
                    .map(uid => {
                      const name = profilesMap[uid] || uid.slice(0, 8);
                      const cnt = mistakes.filter(m => m.userId === uid).length;
                      return <option key={uid} value={uid}>{name} ({cnt}개)</option>;
                    })}
                </select>
              </div>
            )}

            {filteredMistakesForStats.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed border-slate-800 rounded-2xl bg-slate-900/20">
                <div className="text-3xl mb-3">📊</div>
                <p className="text-slate-300 font-medium text-sm">아직 분석할 데이터가 없습니다</p>
                <p className="text-xs text-slate-500 mt-1">오답을 등록하고 실수 원인을 체크해 주세요.</p>
              </div>
            ) : (
              <>
                {/* 아코디언 범주형 버블 차트 (Categorical Bubble Chart) */}
                <div className="bg-[#0e1322] border border-slate-800/80 rounded-2xl p-5 space-y-4 shadow-[0_4px_30px_rgba(0,0,0,0.4)] backdrop-blur-md">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800/60 pb-3">
                    <div className="flex items-center space-x-1.5">
                      <span className="text-base select-none">🫧</span>
                      <h3 className="text-sm font-extrabold text-white">단원별 취약 버블 분석</h3>
                    </div>
                    {/* 기간 필터 토글 탭 */}
                    <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-850 space-x-1 w-fit select-none">
                      {(['all', '90', '30'] as const).map(p => {
                        const label = p === 'all' ? '전체누적' : p === '90' ? '90일' : '30일';
                        const isAct = statsPeriodFilter === p;
                        return (
                          <button
                            key={p}
                            onClick={() => setStatsPeriodFilter(p)}
                            className={`px-2.5 py-1 rounded-lg text-[9px] font-black transition-all ${
                              isAct ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {bubbleChartData.length === 0 ? (
                    <p className="text-xs text-slate-500 py-6 text-center">해당 기간 내 분석된 약점 데이터가 없습니다.</p>
                  ) : (
                    <div className="space-y-4 max-w-[360px] mx-auto w-full">
                      {bubbleChartData.map(gGroup => {
                        const isExpanded = statsExpandedGrades[gGroup.grade] !== false; // 기본값: 펼침
                        return (
                          <div key={gGroup.grade} className="border border-slate-800/60 rounded-2xl overflow-hidden bg-slate-950/20">
                            {/* 아코디언 헤더 */}
                            <button
                              onClick={() => setStatsExpandedGrades(prev => ({ ...prev, [gGroup.grade]: !isExpanded }))}
                              className="w-full flex items-center justify-between px-4 py-3 bg-slate-900/40 hover:bg-slate-900/70 transition-colors border-b border-slate-850/40 text-left"
                            >
                              <span className="text-xs font-black text-indigo-400">📚 {gGroup.grade}</span>
                              <span className="text-[9px] text-slate-500 font-extrabold">{isExpanded ? '▲ 접기' : '▼ 펼치기'}</span>
                            </button>

                            {/* 아코디언 컨텐츠 */}
                            {isExpanded && (
                              <div className="p-3.5 space-y-4">
                                {/* 가로 헤더 (실수 유형) */}
                                <div className="flex items-center text-[9px] text-slate-500 font-black">
                                  <div className="w-20 flex-none text-right pr-2">단원명</div>
                                  <div className="flex-1 grid grid-cols-5 gap-2 text-center justify-items-center">
                                    {ROOT_CAUSE_OPTIONS.map(opt => {
                                      const labelClean = opt.label.replace(/[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, '').trim();
                                      return (
                                        <div key={opt.id} className="w-full max-w-[40px] truncate text-[8px] tracking-tighter text-slate-400 font-black text-center">
                                          {labelClean}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>

                                {/* 단원별 버블 가로 행 */}
                                <div className="space-y-3.5">
                                  {gGroup.rows.map(row => (
                                    <div key={row.chapter} className="flex items-center">
                                      {/* 단원명 (왼쪽 고정 컬럼) */}
                                      <div className="w-20 flex-none text-[9px] font-black text-slate-400 truncate pr-2 text-right tracking-tight" title={row.chapter}>
                                        {row.chapter}
                                      </div>

                                      {/* 5칸 버블 격자 */}
                                      <div className="flex-1 grid grid-cols-5 gap-2 justify-items-center items-center">
                                        {row.stats.map(cell => {
                                          const count = cell.count;
                                          const ratio = count / maxCountInBubbles;
                                          let bubbleClass = '';
                                          let bgStyle: React.CSSProperties = {};

                                          if (count === 0) {
                                            // 0회: 아주 옅은 오프 상태
                                            bubbleClass = 'w-1.5 h-1.5 bg-slate-800/80 rounded-full hover:bg-slate-700 transition-all';
                                          } else {
                                            // 1회 이상: 방울 크기 비율 적용
                                            const size = Math.round(12 + (ratio * 16)); // 최소 12px ~ 최대 28px
                                            bgStyle = { width: `${size}px`, height: `${size}px` };

                                            if (ratio <= 0.25) {
                                              bubbleClass = 'rounded-full border border-emerald-500/50 bg-emerald-500/20 text-emerald-300 shadow-[0_0_6px_rgba(16,185,129,0.2)]';
                                            } else if (ratio <= 0.50) {
                                              bubbleClass = 'rounded-full border border-yellow-500/50 bg-yellow-500/30 text-yellow-300 shadow-[0_0_8px_rgba(245,158,11,0.25)]';
                                            } else if (ratio <= 0.75) {
                                              bubbleClass = 'rounded-full border border-orange-500/60 bg-orange-500/40 text-orange-300 shadow-[0_0_10px_rgba(249,115,22,0.3)]';
                                            } else {
                                              bubbleClass = 'rounded-full border border-rose-300 bg-rose-500 text-white shadow-[0_0_12px_rgba(244,63,94,0.75)]';
                                            }
                                          }

                                          return (
                                            <div
                                              key={cell.id}
                                              style={bgStyle}
                                              className={`flex items-center justify-center transition-all duration-300 hover:scale-115 active:scale-95 cursor-pointer relative group ${bubbleClass}`}
                                            >
                                              {/* 호버 시 툴팁 대응 */}
                                              {count > 0 && (
                                                <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-900 border border-slate-800 text-[8px] text-indigo-300 px-1.5 py-0.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10 shadow-lg font-bold">
                                                  {count}회
                                                </span>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* 하단 범례 안내 */}
                      <div className="flex justify-between items-center text-[8.5px] text-slate-500 pt-3 border-t border-slate-800/60 font-bold select-none">
                        <div className="flex items-center space-x-1.5">
                          <span className="w-1.5 h-1.5 bg-slate-800 rounded-full"></span>
                          <span>적음 (low)</span>
                          <span>➔</span>
                          <span>많음 (high)</span>
                          {/* 범례 미니 버블 나열 */}
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/20 border border-emerald-500/50"></span>
                          <span className="w-3 h-3 rounded-full bg-yellow-500/30 border border-yellow-500/50"></span>
                          <span className="w-3.5 h-3.5 rounded-full bg-orange-500/40 border border-orange-500/60"></span>
                          <span className="w-4 h-4 rounded-full bg-rose-500 border border-rose-300" style={{ boxShadow: '0 0 6px rgba(244, 63, 94, 0.7)' }}></span>
                        </div>
                        <span className="text-[8px] text-slate-400">
                          {statsPeriodFilter === 'all' ? '전체 누적 통계' : statsPeriodFilter === '90' ? '최근 90일 데이터' : '최근 30일 데이터'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* 취약 단원 TOP 5 */}
                {stats.topChapters.length > 0 && (
                  <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
                    <h3 className="text-sm font-extrabold text-emerald-400">🏆 취약 단원 TOP {stats.topChapters.length}</h3>
                    {stats.topChapters.map(([key, count], i) => (
                      <div key={key} className="flex items-center space-x-3 bg-slate-950/50 rounded-xl p-3 border border-slate-800/60">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black flex-none ${
                          i === 0 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                          i === 1 ? 'bg-slate-500/20 text-slate-300 border border-slate-600/30' :
                          i === 2 ? 'bg-orange-700/20 text-orange-400 border border-orange-700/30' :
                          'bg-slate-800 text-slate-500'
                        }`}>{i + 1}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-white truncate">{key}</p>
                        </div>
                        <div className="text-xs font-black text-red-400 flex-none">{count}개</div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </Screen>

        {/* Tab: 🧩 힌트 모음 (스캐폴딩 탐색기) */}
        <Screen when={activeTab === 'scaffolding'}>
          {isAdmin ? (
            <LazyScreenBoundary>
              <ScaffoldingPanel
                isAdmin={isAdmin}
                onOpenDetailModal={(entry) => setSelectedEntry(entry)}
              />
            </LazyScreenBoundary>
          ) : (
            <ScaffoldingListPanel
              currentUserId={session?.user?.id || currentUser || ''}
              isAdmin={isAdmin}
              onSelectMistake={(entry) => setSelectedEntry(entry)}
            />
          )}
        </Screen>
      </AppShell>

      <OverlayHost
        selectedEntry={selectedEntry}
        mistakes={mistakes}
        peerActivities={peerActivities}
        analyzingEntryId={analyzingEntryId}
        averageWaitMs={averageWaitMs}
        youtubeLectures={youtubeLectures}
        isReviewSession={isReviewSession}
        checkpointRegenStatus={checkpointRegenStatus}
        equippedStamp={equippedItems.stamp}
        profilesStampMap={profilesStampMap}
        currentUserId={session?.user?.id || currentUser || ''}
        isAdmin={isAdmin}
        aiPersonaName={customAiName || '밤티'}
        comboBoosterExpiresAt={comboBoosterExpiresAt}
        onCloseDetailModal={() => {
          setIsReviewSession(false);
          setSelectedEntry(null);
        }}
        onDeleteMistake={handleDeleteMistake}
        onStartAnalysis={handleStartAnalysis}
        onUpdateReviews={handleUpdateReviews}
        onUpdateCheckpointStatus={handleUpdateCheckpointStatus}
        onRetryCheckpointGeneration={regenerateCheckpointsWithProgress}
        onSelectEntry={setSelectedEntry}
        onUpdateDetailEntry={(updated) => {
          setMistakes(prev => prev.map(m => m.id === updated.id ? updated : m));
          setSelectedEntry(updated);
        }}
        tempCapturedImage={tempCapturedImage}
        tempInitialCrop={tempInitialCrop}
        onCropComplete={handleCropComplete}
        onCancelCrop={() => {
          setTempCapturedImage(null);
          setTempInitialCrop(undefined);
        }}
        isSlideListOpen={isSlideListOpen}
        onCloseSlideList={() => setIsSlideListOpen(false)}
        printItems={printItems}
        printAsTextMap={printAsTextMap}
        isStoreGuideOpen={isStoreGuideOpen}
        onCloseStoreGuide={handleCloseStoreGuide}
        onGoToStore={() => setActiveTab('store')}
        isNewScaffoldingModalOpen={isNewScaffoldingModalOpen}
        unseenScaffoldings={unseenScaffoldings}
        onCloseNewScaffoldingModal={handleCloseNewScaffoldingModal}
        onGoToScaffoldingClinic={() => setActiveTab('scaffolding')}
        noticeModal={noticeModal}
        onCloseNotice={closeNoticeModal}
        aiVoice={equippedItems.aiVoice}
        isUploadingPhoto={isUploadingPhoto}
      />

    </div>
  );
}

export default App;
