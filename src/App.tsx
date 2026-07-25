import { useState, useEffect, useMemo, useRef } from 'react';
import type { ActiveTab, MistakeEntry, ReviewState, MistakeAnalysis } from './types';
import { ROOT_CAUSE_OPTIONS, SOLVING_PLACEHOLDER_TEXT } from './types';
import { CameraScanner } from './components/CameraScanner';
import { classifyMistakeWithGemini, solveMistakeWithGemini, extractProblemWithGemini, prepareGeminiImage } from './services/gemini';
import { AuthScreen } from './components/AuthScreen';
import { supabase, isSupabaseConfigured } from './services/supabase';
import { base64ToBlob } from './utils/image';
import { SupabaseConfigWarning } from './components/SupabaseConfigWarning';
import { Header } from './components/Header';
import { MistakeList } from './components/MistakeList';
import { MistakeDetailModal } from './components/MistakeDetailModal';
import { BottomNavigation } from './components/BottomNavigation';
import { ImageCropper } from './components/ImageCropper';
import { AdminPanel } from './components/AdminPanel';
import { StudentGuide } from './components/StudentGuide';
import { LaTeXRenderer } from './components/LaTeXRenderer';
import { SlideListModal } from './components/SlideListModal';
import { GachaStore } from './components/GachaStore';
import type { EquippedItems } from './types';
import { loadStreakState, recordReviewStreak, type StreakState } from './utils/streak';

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
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // 매일 연속 복습 스트릭 상태 (🔥 Streak 관리)
  const [streakState, setStreakState] = useState<StreakState>(() => loadStreakState());
  // 학생 커스텀 닉네임 상태 (실제 이름 display_name 과 보존 분리)
  const [myNickname, setMyNickname] = useState<string>('');
  // 닉네임 변경권 보유 여부
  const [hasNameChangeTicket, setHasNameChangeTicket] = useState<boolean>(false);
  // userId -> displayName map (admin 전용)
  const [profilesMap, setProfilesMap] = useState<Record<string, string>>({});
  // 유튜브 매칭용 강의 마스터 리스트 상태
  const [youtubeLectures, setYoutubeLectures] = useState<any[]>([]);
  // 주간 최다 오답 완료 챔피언 상태 (1~3위)
  const [weeklyChampions, setWeeklyChampions] = useState<any[]>([]);
  // 내 주간 점수 (Supabase weekly_leaderboard DB 뷰 기반 — 배너와 동일 소스)
  const [myWeeklyScoreFromDB, setMyWeeklyScoreFromDB] = useState<number>(0);
  // 분석통계 탭 학생 필터 상태 (어드민 전용)
  const [statsStudentFilter, setStatsStudentFilter] = useState<string>('all');
  // 분석통계 탭 기간 필터 상태 (디폴트: 'all' 전체기간)
  const [statsPeriodFilter, setStatsPeriodFilter] = useState<'all' | '90' | '30'>('all');
  // 분석통계 탭 과목 아코디언 상태 (grade -> true/false)
  const [statsExpandedGrades, setStatsExpandedGrades] = useState<Record<string, boolean>>({});
  // userId -> schoolGrade map (AI 학년별 분류 최적화용)
  const [profilesGradeMap, setProfilesGradeMap] = useState<Record<string, string>>({});
  // Supabase system_config 테이블에서 로드한 Gemini API Key 상태 (무료키는 레이트리밋 문제로 배제하고 유료키만 사용)
  const [paidGeminiKey, setPaidGeminiKey] = useState<string>('');
  // AI 진단 평균 소요시간(ms) — diagnosis_stats 테이블의 전역 누적치 기반, 오답 카드 삭제와 무관하게 유지됨
  const [averageWaitMs, setAverageWaitMs] = useState<number | null>(null);
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
      return next;
    });
  };

  // DB 지정 보너스 점수 (어드민 또는 이벤트 적립)
  const [myBonusPoints, setMyBonusPoints] = useState<number>(0);

  // 현재 표시 가능한 복습 콤보 보유 점수 (DB 뷰 점수 + DB 보너스 점수 + 상점 사용 포인트 차감치)
  const currentDisplayPoints = Math.max(0, (myWeeklyScoreFromDB || 0) + (myBonusPoints || 0) + pointAdjustment);
  
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

  // 내 주간 점수 조회 (Supabase weekly_leaderboard 뷰 — 배너·어드민과 동일 소스 통일)
  const fetchMyWeeklyScore = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('weekly_leaderboard')
        .select('score')
        .eq('user_id', userId)
        .maybeSingle();
      if (!error && data) {
        setMyWeeklyScoreFromDB(Math.round(data.score ?? 0));
      } else {
        setMyWeeklyScoreFromDB(0);
      }
    } catch {
      setMyWeeklyScoreFromDB(0);
    }
  };

  // State for image cropping flow
  const [tempCapturedImage, setTempCapturedImage] = useState<string | null>(null);

  // 주간 최다 오답 완료 챔피언 정보 로드 + 내 점수 동시 갱신 (하이브리드 1주 이월 및 리셋 롤오버)
  const loadWeeklyChampions = async () => {
    try {
      // 1. 이번 주 랭킹 뷰 전체 조회
      const { data, error } = await supabase
        .from('weekly_leaderboard')
        .select('*')
        .order('score', { ascending: false });

      if (error) throw error;

      // 이번주 점수가 0 초과인 데이터만 추출
      const activeThisWeek = (data || []).filter((item: any) => item.score > 0).map((item: any) => ({ ...item, isLastWeek: false }));

      if (activeThisWeek.length >= 3) {
        setWeeklyChampions(activeThisWeek.slice(0, 3));
        return;
      }

      // 이번 주 복습 완료자가 3명 미만이면 지난주 랭킹(RLS 우회)에서 부족한 인원을 이월 보충
      const { data: lastWeekData, error: lastWeekError } = await supabase
        .from('last_weekly_leaderboard')
        .select('*')
        .order('score', { ascending: false });

      if (!lastWeekError && lastWeekData) {
        const activeLastWeek = lastWeekData
          .filter((item: any) => item.score > 0)
          .map((item: any) => ({ ...item, isLastWeek: true }));

        // 이미 이번 주 랭킹에 들어있는 유저는 중복 제거
        const existingUserIds = new Set(activeThisWeek.map(u => u.user_id));
        const fillFromLastWeek = activeLastWeek.filter(u => !existingUserIds.has(u.user_id));

        const combined = [...activeThisWeek, ...fillFromLastWeek].slice(0, 3);
        setWeeklyChampions(combined);
      } else if (activeThisWeek.length > 0) {
        setWeeklyChampions(activeThisWeek);
      } else {
        // 3. 지난주마저 점수가 없으면 배너를 비워 동기부여 유도
        setWeeklyChampions([]);
      }

      // 이번 주 점수가 없으면 내 점수도 0
      setMyWeeklyScoreFromDB(0);
    } catch (err) {
      console.error('loadWeeklyChampions failed:', err);
      setWeeklyChampions([]);
      setMyWeeklyScoreFromDB(0);
    }
  };

  // Check admin status from profiles table
  const fetchAdminStatus = async (userId: string) => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', userId)
        .single();
      setIsAdmin(data?.is_admin === true);
    } catch {
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

  // Monitor Supabase Authentication States
  useEffect(() => {
    // 1. Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        const username = session.user.email?.split('@')[0] || 'User';
        setCurrentUser(username);
        fetchUserData();
        fetchAdminStatus(session.user.id);
        loadYoutubeLectures(); // 유튜브 강의 데이터 로드
        loadWeeklyChampions(); // 주간 챔피언 로드
        fetchMyWeeklyScore(session.user.id); // 내 주간 점수 DB 조회
        fetchGeminiApiKeys(); // 동적 API 키 로드
        fetchDiagnosisStats(); // 평균 진단 소요시간 조회
      }
    });

    // 2. Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        const username = session.user.email?.split('@')[0] || 'User';
        setCurrentUser(username);
        fetchUserData();
        fetchAdminStatus(session.user.id);
        loadYoutubeLectures(); // 유튜브 강의 데이터 로드
        loadWeeklyChampions(); // 주간 챔피언 로드
        fetchMyWeeklyScore(session.user.id); // 내 주간 점수 DB 조회
        fetchGeminiApiKeys(); // 동적 API 키 로드
        fetchDiagnosisStats(); // 평균 진단 소요시간 조회
      } else {
        setCurrentUser('');
        setIsAdmin(false);
        setMistakes([]);
        setYoutubeLectures([]);
        setWeeklyChampions([]);
        setPaidGeminiKey('');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

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
        const { data, error } = await supabase
          .from('profiles')
          .select('id, display_name, nickname, email')
          .gte('last_seen_at', fiveMinutesAgo)
          .eq('is_admin', false); // 학생들만 집계

        if (error) throw error;
        if (data) {
          const mapped = data.map(p => ({
            id: p.id,
            display_name: p.display_name,
            nickname: p.nickname,
            username: p.email?.split('@')[0] || 'User'
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

  // Supabase system_config 로부터 Gemini API Key들을 로드
  const fetchGeminiApiKeys = async () => {
    try {
      const { data, error } = await supabase
        .from('system_config')
        .select('key, value');
      if (error) throw error;
      
      (data || []).forEach((row: any) => {
        // 무료키(gemini_api_key)는 레이트리밋으로 인한 지연/오류 문제로 더 이상 사용하지 않고, 유료키만 사용합니다.
        if (row.key === 'gemini_api_key_paid') {
          setPaidGeminiKey(row.value || '');
        }
      });
    } catch (err) {
      console.error('Failed to load Gemini API Keys from Supabase config:', err);
    }
  };

  // diagnosis_stats 테이블(전역 누적, 오답 카드 삭제와 무관하게 유지됨)에서 평균 진단 소요시간 조회
  const fetchDiagnosisStats = async () => {
    try {
      const { data, error } = await supabase
        .from('diagnosis_stats')
        .select('total_count, total_duration_ms')
        .eq('id', 1)
        .single();
      if (error) throw error;
      // 표본이 너무 적으면(3건 미만) 신뢰하기 어려운 값이라 아직 노출하지 않음
      setAverageWaitMs(data && data.total_count >= 3 ? data.total_duration_ms / data.total_count : null);
    } catch (err) {
      console.error('Failed to load diagnosis stats from Supabase:', err);
    }
  };

  // Fetch mistakes from Supabase
  const fetchUserData = async () => {
    try {
      loadWeeklyChampions(); // 최신 챔피언 정보 동기화
      fetchPeerActivities(); // 실시간 친구들 복습 현황 로드
      // Fetch all mistakes (RLS handles filtering: normal users see own, admin sees all)
      const { data: dbMistakes, error: mistakesError } = await supabase
        .from('mistakes')
        .select('*')
        .order('date', { ascending: false });

      if (mistakesError) throw mistakesError;

      // 로그인 유저의 닉네임 및 보너스 점수 로드
      if (session?.user?.id) {
        const { data: myProfile } = await supabase
          .from('profiles')
          .select('nickname, display_name, bonus_points')
          .eq('id', session.user.id)
          .maybeSingle();
        if (myProfile) {
          setMyNickname(myProfile.nickname || myProfile.display_name || '');
          const bonus = myProfile.bonus_points || 0;
          setMyBonusPoints(bonus);
          if (bonus > 0) {
            setPointAdjustment(0);
            try {
              localStorage.removeItem('reviewnote_point_adj');
            } catch (e) {
              console.error(e);
            }
          }
        }
        // 닉네임 변경권 보유 여부 확인 (Header에 버튼 노출 제어)
        checkNameChangeTicket();
      }

      // Fetch all profiles for admin name mapping (display_name, school_grade 포함)
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, display_name, school_grade');

      const pMap: Record<string, string> = {};
      const gMap: Record<string, string> = {};
      (profiles || []).forEach((p: any) => {
        const username = p.email?.split('@')[0] || p.id.slice(0, 8);
        const displayName = p.display_name?.trim();
        pMap[p.id] = displayName ? `${displayName} (${username})` : username;
        gMap[p.id] = p.school_grade || '';
      });
      setProfilesMap(pMap);
      setProfilesGradeMap(gMap);

      const mappedMistakes: MistakeEntry[] = (dbMistakes || []).map((m: any) => ({
        id: m.id,
        userId: m.user_id,
        title: m.title,
        imageUrl: m.image_url,
        date: m.date,
        updatedAt: m.updated_at,
        analysis: m.analysis || undefined,
        reviews: m.reviews || ['', '', ''],
        grade: m.grade || undefined,
        chapter: m.chapter || undefined,
        rootCauses: m.root_causes || [],
        userActionPlan: m.user_action_plan || undefined,
      }));
      setMistakes(mappedMistakes);
    } catch (err) {
      console.error('Error loading Supabase user data:', err);
    }
  };
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
      alert('🏷️ 닉네임 변경권이 없습니다!\n럭키 상점에서 뽑기를 통해 획득하세요.');
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
      const newQty = ticketRow.quantity - 1;
      await supabase
        .from('user_items')
        .update({ quantity: newQty })
        .eq('user_id', session.user.id)
        .eq('item_id', 'item_name_change');

      setMyNickname(trimmed);
      setHasNameChangeTicket(newQty > 0);
      loadWeeklyChampions();
      alert(`✅ 닉네임이 '${trimmed}'(으)로 변경되었습니다!\n(잔여 변경권: ${newQty}개)`);
    } catch (err: any) {
      alert(`닉네임 변경에 실패했습니다: ${err.message}`);
    }
  };

  // 보물가방에서 닉네임 변경권 사용 시 호출
  const handleUseNameChangeTicket = async () => {
    if (!session?.user?.id) return;
    const newNick = prompt('새로운 닉네임을 입력하세요 (실제 이름은 변경되지 않습니다):', myNickname || '');
    if (newNick !== null && newNick.trim()) {
      await handleUpdateNickname(newNick.trim());
    }
  };

  // 닉네임 변경권 보유 여부 확인
  const checkNameChangeTicket = async () => {
    if (!session?.user?.id) return;
    const { data } = await supabase
      .from('user_items')
      .select('quantity')
      .eq('user_id', session.user.id)
      .eq('item_id', 'item_name_change')
      .maybeSingle();
    setHasNameChangeTicket(!!(data && data.quantity > 0));
  };

  // Fetch recent peer review activities from read-only VIEW
  const fetchPeerActivities = async () => {
    try {
      const { data, error } = await supabase
        .from('recent_peer_activities')
        .select('*')
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

  // Start analysis trigger (유료키 전용 — 무료키는 레이트리밋으로 인한 지연/오류가 잦아 배제)
  const handleStartAnalysis = async (entry: MistakeEntry) => {
    const paidKey = paidGeminiKey;

    if (!paidKey) {
      alert('Supabase 보안 테이블(system_config)에 유료 API 키(gemini_api_key_paid)가 등록되지 않았습니다. Supabase 대시보드에서 키 설정을 완료해 주세요.');
      return;
    }

    setIsAnalyzing(true);
    // 진단 전체(classify+extract+solve) 소요 시간을 재서 평균 대기시간 계산에 사용
    const analysisStartTime = Date.now();
    try {
      const studentGrade = entry.userId ? (profilesGradeMap[entry.userId] || '') : '';

      // 이미지 다운로드 + 리사이즈/압축은 진단당 단 한 번만 수행하고 classify/extract/solve에서 재사용합니다.
      // (과거에는 1차/2차 호출이 각자 이미지를 재다운로드+재압축해서 진단 시간이 두 배로 늘어났었음)
      const image = await prepareGeminiImage(entry.imageUrl);

      // 문제 지문(OCR)/바운딩박스 추출은 과목·단원과 무관한 작업이라 classify와 완전히 동시에 시작합니다.
      const extractPromise = extractProblemWithGemini(image, paidKey);
      // classify가 끝날 때까지 extractPromise를 아직 await하지 않으므로, 그 사이 실패하더라도
      // "unhandled promise rejection" 경고가 뜨지 않도록 별도 채널로 미리 캐치해둔다 (실제 처리는 solveStep에서).
      extractPromise.catch(() => {});

      const updated = await classifyStep(entry, paidKey, studentGrade, image);
      await solveStep(updated, paidKey, studentGrade, image, extractPromise, analysisStartTime);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'AI 분석 실행 중 오류가 발생했습니다.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // --- 1단계: 과목/단원 및 유튜브 딥링크 1차 판단 + DB/로컬 상태 갱신 ---
  const classifyStep = async (
    entry: MistakeEntry,
    apiKey: string,
    studentGrade: string | undefined,
    image: { mimeType: string; base64Data: string }
  ): Promise<MistakeEntry> => {
    const firstResult = await classifyMistakeWithGemini(image, apiKey, youtubeLectures, studentGrade);

    // 1단계 결과를 기반으로 Supabase DB에 과목, 단원, 유튜브 매칭 필드 우선 업데이트
    const partialAnalysis: MistakeAnalysis = {
      solvingProcess: SOLVING_PLACEHOLDER_TEXT,
      matchedVideoId: firstResult.matchedVideoId,
      matchedStartSeconds: firstResult.matchedStartSeconds,
      matchedChapterTitle: firstResult.matchedChapterTitle,
    };

    const { error: firstUpdateError } = await supabase
      .from('mistakes')
      .update({
        title: firstResult.title,
        grade: firstResult.grade || entry.grade || null,
        chapter: firstResult.chapter || entry.chapter || null,
        analysis: partialAnalysis,
        root_causes: entry.rootCauses || [],
        user_action_plan: entry.userActionPlan || null,
      })
      .eq('id', entry.id);

    if (firstUpdateError) throw firstUpdateError;

    const updatedEntry: MistakeEntry = {
      ...entry,
      title: firstResult.title,
      grade: firstResult.grade || entry.grade,
      chapter: firstResult.chapter || entry.chapter,
      analysis: partialAnalysis,
    };

    // 로컬 상태 1차 갱신 (화면에 과목/단원 및 유튜브 딥링크가 바로 노출됨)
    setMistakes(prev => prev.map(m => m.id === entry.id ? updatedEntry : m));
    setSelectedEntry(updatedEntry);

    return updatedEntry;
  };

  // --- 2단계: 문제 풀이(스트리밍) + 문제 지문/바운딩박스 추출을 동시 진행 + DB/로컬 상태 갱신 ---
  const solveStep = async (
    updatedEntry: MistakeEntry,
    apiKey: string,
    studentGrade: string | undefined,
    image: { mimeType: string; base64Data: string },
    extractPromise: ReturnType<typeof extractProblemWithGemini>,
    analysisStartTime: number
  ): Promise<void> => {
    // 풀이가 생성되는 대로 상세 모달에 실시간으로 흘려보냄 (완성될 때까지 기다리지 않음)
    const onProgress = (partialSolvingProcess: string) => {
      setSelectedEntry(prev => {
        if (!prev || prev.id !== updatedEntry.id) return prev;
        return { ...prev, analysis: { ...prev.analysis, solvingProcess: partialSolvingProcess } };
      });
    };

    // 이 학생이 같은 단원에서 이번 건을 포함해 몇 번째 오답을 등록했는지 계산 (이미 로드된 목록으로 즉시 계산, 추가 조회 없음)
    // → solve 인사말에서 자연스러운 격려/환영 멘트를 녹이는 데 사용
    const sameChapterMistakeCount = updatedEntry.chapter
      ? mistakes.filter(m => m.userId === updatedEntry.userId && m.grade === updatedEntry.grade && m.chapter === updatedEntry.chapter).length
      : undefined;

    // 이 학생의 과거 오답들(현재 건 제외)에서 가장 자주 체크된 실수 원인을 찾아, 2회 이상 반복된 경우만
    // "반복되는 실수 패턴"으로 4단계 총평에 녹여준다 (이미 로드된 목록으로 즉시 계산, 추가 조회 없음)
    const rootCauseCounts: Record<string, number> = {};
    mistakes
      .filter(m => m.userId === updatedEntry.userId && m.id !== updatedEntry.id)
      .forEach(m => {
        (m.rootCauses || []).forEach(causeId => {
          rootCauseCounts[causeId] = (rootCauseCounts[causeId] || 0) + 1;
        });
      });
    let recurringRootCause: { label: string; count: number } | undefined;
    Object.entries(rootCauseCounts).forEach(([causeId, count]) => {
      if (count >= 2 && (!recurringRootCause || count > recurringRootCause.count)) {
        const option = ROOT_CAUSE_OPTIONS.find(o => o.id === causeId);
        if (option) {
          // 라벨의 이모지 접두사(예: "🧠 개념 부족")는 떼고 순수 텍스트만 프롬프트에 전달
          recurringRootCause = { label: option.label.split(' ').slice(1).join(' '), count };
        }
      }
    });

    const [secondResult, extractResult] = await Promise.all([
      solveMistakeWithGemini(
        image,
        apiKey,
        updatedEntry.grade || '',
        updatedEntry.chapter || '',
        studentGrade,
        onProgress,
        sameChapterMistakeCount,
        recurringRootCause
      ),
      extractPromise
    ]);

    const finalAnalysis: MistakeAnalysis = {
      ...updatedEntry.analysis,
      solvingProcess: secondResult.solvingProcess,
      problemText: extractResult.problemText,
      problemBox: extractResult.problemBox,
      mistakeSummary: secondResult.mistakeSummary || undefined,
      modelUsed: 'gemini-2.5-flash',
      durationMs: Date.now() - analysisStartTime
    };

    const { error: secondUpdateError } = await supabase
      .from('mistakes')
      .update({
        analysis: finalAnalysis,
      })
      .eq('id', updatedEntry.id);

    if (secondUpdateError) throw secondUpdateError;

    const finalEntry: MistakeEntry = {
      ...updatedEntry,
      analysis: finalAnalysis
    };

    // 로컬 상태 2차 갱신 (상세 해설 로딩 완료 노출)
    setMistakes(prev => prev.map(m => m.id === updatedEntry.id ? finalEntry : m));
    setSelectedEntry(finalEntry);

    // 평균 대기시간 통계에 이번 진단 소요시간 반영 (오답 카드 삭제와 무관하게 영구 누적).
    // 통계 기록 실패는 진단 자체의 성공/실패에 영향을 주면 안 되므로 별도로 감싸서 처리.
    try {
      const { error: statsError } = await supabase.rpc('record_diagnosis_duration', {
        duration_ms: finalAnalysis.durationMs
      });
      if (statsError) throw statsError;
      await fetchDiagnosisStats();
    } catch (err) {
      console.error('Failed to record diagnosis duration stats:', err);
    }
  };

  // Intercept camera capture and start cropping flow
  const handleCameraCapture = (base64Image: string) => {
    setTempCapturedImage(base64Image);
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
  const handleCropComplete = async (croppedBase64: string) => {
    setTempCapturedImage(null);
    if (!session?.user) return;

    setIsAnalyzing(true);
    try {
      const blob = base64ToBlob(croppedBase64);
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
      setActiveTab('notes');
      setSelectedEntry(newEntry); // Open modal immediately
    } catch (err: any) {
      console.error(err);
      alert('스캔 이미지 클라우드 업로드 실패: ' + err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Delete mistake from Supabase & local state
  const handleDeleteMistake = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('이 오답 기록을 삭제하시겠습니까?')) {
      try {
        const { error } = await supabase
          .from('mistakes')
          .delete()
          .eq('id', id);

        if (error) throw error;

        setMistakes(prev => prev.filter(m => m.id !== id));
        setSelectedEntry(null);
        loadWeeklyChampions(); // MVP 챔피언 배너 즉각 갱신
      } catch (err: any) {
        console.error(err);
        alert('삭제 실패: ' + err.message);
      }
    }
  };

  // Update reviews list in Supabase & local state
  const handleUpdateReviews = async (id: string, newReviews: ReviewState[]) => {
    try {
      const targetEntry = mistakes.find(m => m.id === id);
      if (!targetEntry) return;

      const oldReviews = targetEntry.reviews || ['', '', ''];
      const oldReviewDates = targetEntry.analysis?.reviewDates || ['', '', ''];

      // 1. 기존에 'O' 였던 칸들의 날짜정보를 순서대로 수집
      const existingODates: string[] = [];
      oldReviews.forEach((r, idx) => {
        if (r === 'O' && oldReviewDates[idx]) {
          existingODates.push(oldReviewDates[idx]);
        }
      });

      // 2. newReviews 에 대응하여 currentDates 정렬 조립
      const currentDates = ['', '', ''];
      let oCounter = 0;

      for (let i = 0; i < 3; i++) {
        const state = newReviews[i];
        const oldState = oldReviews[i];

        if (state === '') {
          currentDates[i] = '';
        } else if (state === 'O') {
          // O 인 경우:
          // 기존에 'O' 였던 개수 범위 내의 도장은 예전 맞춘 시간 슬라이딩 정비
          if (oCounter < existingODates.length) {
            currentDates[i] = existingODates[oCounter];
            oCounter++;
          } else {
            // 새로 찍힌 O 이면 신규 타임스탬프 기록
            const now = new Date();
            const dateStr = `${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            currentDates[i] = dateStr;
          }
        } else {
          // X 또는 star 인 경우
          if (state === oldState && oldReviewDates[i]) {
            currentDates[i] = oldReviewDates[i];
          } else {
            const now = new Date();
            const dateStr = `${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            currentDates[i] = dateStr;
          }
        }
      }

      const updatedAnalysis: MistakeAnalysis = {
        solvingProcess: targetEntry.analysis?.solvingProcess || '',
        ...targetEntry.analysis,
        reviewDates: currentDates
      };

      const { error } = await supabase
        .from('mistakes')
        .update({ 
          reviews: newReviews,
          analysis: updatedAnalysis,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;

      const updatedEntry = {
        ...targetEntry,
        reviews: newReviews,
        analysis: updatedAnalysis
      };

      setMistakes(prev => prev.map(m => m.id === id ? updatedEntry : m));
      setSelectedEntry(prev => prev && prev.id === id ? updatedEntry : prev);
      
      // 매일 연속 복습 스트릭 갱신 (🔥 Daily Streak)
      const unlockedItemIds: string[] = (() => {
        try {
          const saved = localStorage.getItem('reviewnote_unlocked_items');
          return saved ? JSON.parse(saved) : [];
        } catch {
          return [];
        }
      })();
      const hasShieldItem = unlockedItemIds.includes('item_streak_shield');
      const { updatedState, shieldUsed } = recordReviewStreak(streakState, hasShieldItem);
      setStreakState(updatedState);

      if (shieldUsed) {
        alert("🛡️ [스트릭 방어 성공!] 어제 복습을 놓쳤지만, 럭키상점에서 보유한 '스트릭 방어권'이 자동으로 발동되어 🔥 연속 복습 기록이 안전하게 보호되었습니다!");
      }

      // Refresh peer activities locally
      fetchPeerActivities();
      loadWeeklyChampions(); // MVP 챔피언 배너 즉각 갱신
      if (session?.user?.id) fetchMyWeeklyScore(session.user.id); // 내 점수 즉각 갱신
    } catch (err: any) {
      console.error('Failed to update reviews:', err);
      // Fallback: update local React state anyway for immediate validation
      const targetEntry = mistakes.find(m => m.id === id);
      if (targetEntry) {
        const currentDates = [...(targetEntry.analysis?.reviewDates || ['', '', ''])];
        const oldReviews = targetEntry.reviews || ['', '', ''];
        for (let i = 0; i < 3; i++) {
          if (newReviews[i] !== '' && oldReviews[i] === '') {
            const now = new Date();
            const dateStr = `${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            currentDates[i] = dateStr;
          } else if (newReviews[i] === '') {
            currentDates[i] = '';
          }
        }
        const updatedAnalysis: MistakeAnalysis = {
          solvingProcess: targetEntry.analysis?.solvingProcess || '',
          ...targetEntry.analysis,
          reviewDates: currentDates
        };
        const updatedEntry = {
          ...targetEntry,
          reviews: newReviews,
          analysis: updatedAnalysis
        };
        setMistakes(prev => prev.map(m => m.id === id ? updatedEntry : m));
        setSelectedEntry(prev => prev && prev.id === id ? updatedEntry : prev);
      }
    }
  };

  // 가장 옛날에 등록되었으나 아직 3회 오답 완료하지 않은 카드부터 복습 세션 시작
  const handleStartReviewSession = () => {
    if (!session?.user || mistakes.length === 0) return;

    // 미완료 상태 (O 개수가 3개 미만인 오답 필터링)
    const uncompleted = mistakes.filter(m => {
      const oCount = m.reviews?.filter(r => r === 'O').length || 0;
      return oCount < 3;
    });

    if (uncompleted.length === 0) {
      alert('🎉 완벽합니다! 현재 복습할 남은 오답이 없습니다. 모두 완료했습니다! 🐱');
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
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 select-none">
      
      {/* Top Header */}
      <Header 
        currentUser={currentUser} 
        nickname={myNickname}
        onLogout={handleLogout} 
        onUpdateNickname={hasNameChangeTicket ? handleUpdateNickname : undefined}
        myScore={currentDisplayPoints} 
        onOpenStore={() => setActiveTab('store')}
        equippedTitle={equippedItems.title}
        streakDays={streakState.currentStreak}
      />

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto px-4 py-6 pb-28">
        {activeTab === 'store' && (
          <GachaStore
            userId={session?.user?.id || ''}
            userPoints={currentDisplayPoints}
            onDeductPoints={handleDeductPoints}
            equippedItems={equippedItems}
            onEquipItem={handleEquipItem}
            onUseNameChangeTicket={handleUseNameChangeTicket}
          />
        )}

        {activeTab === 'notes' && (
          <>
            {/* 명예의 전당 배너 (1등, 2등, 3등 3줄 세로 노출 + 칭호 & 풀네임 표시) */}
            {weeklyChampions && weeklyChampions.length > 0 ? (
              <div className="bg-gradient-to-b from-slate-900/95 via-slate-900/90 to-slate-900/95 border border-amber-500/30 rounded-2xl p-4 mb-4 shadow-[0_0_20px_rgba(245,158,11,0.1)] animate-fade-in space-y-3">
                {/* 헤더 타이틀 */}
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                  <div className="flex items-center space-x-2">
                    <span className="text-xl animate-bounce">👑</span>
                    <h3 className="text-xs font-black text-amber-400 uppercase tracking-wider">
                      {weeklyChampions[0]?.isLastWeek ? '🏆 명예의 전당 (지난주 복습 MVP)' : '🏆 명예의 전당 (주간 복습 랭킹)'}
                    </h3>
                  </div>
                  <span className="text-[9px] text-slate-500 font-bold">매주 월요일 갱신</span>
                </div>

                {/* 1등 / 2등 / 3등 3줄 세로 명예의 전당 리스트 */}
                <div className="space-y-2">
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

                    // 칭호 희귀도별 화려한 이펙트 스타일 구분
                    const getTitleBadgeStyle = (title: string) => {
                      if (title.includes('수학의 신')) {
                        return {
                          style: 'bg-gradient-to-r from-amber-400 via-pink-500 to-purple-500 text-white border-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.5)] animate-pulse',
                          icon: '👑'
                        };
                      }
                      if (title.includes('킬러문항') || title.includes('포식자')) {
                        return {
                          style: 'bg-gradient-to-r from-amber-500/25 via-yellow-500/35 to-amber-500/25 text-amber-300 border-amber-400/60 shadow-[0_0_8px_rgba(251,191,36,0.35)]',
                          icon: '⚔️'
                        };
                      }
                      if (title.includes('계산') || title.includes('달인')) {
                        return {
                          style: 'bg-gradient-to-r from-purple-500/25 to-indigo-500/25 text-purple-300 border-purple-400/50 shadow-[0_0_6px_rgba(168,85,247,0.25)]',
                          icon: '🔮'
                        };
                      }
                      return {
                        style: 'bg-slate-800/90 text-sky-300 border-slate-700',
                        icon: '🦉'
                      };
                    };

                    const titleBadge = activeTitle ? getTitleBadgeStyle(activeTitle) : null;

                    const nameToDisplay = champ?.nickname || champ?.display_name;
                    const studentDisplayName = champ
                      ? (nameToDisplay ? `${nameToDisplay} 학생` : `${maskId(champ.username)} 학생`)
                      : null;

                    return (
                      <div
                        key={idx}
                        className={`p-2.5 rounded-xl border flex items-center justify-between space-x-2 whitespace-nowrap overflow-x-auto no-scrollbar transition-all ${rowBg}`}
                      >
                        {/* Left: 메달 + 칭호 + 학생 이름 (단일 행 고정) */}
                        <div className="flex items-center space-x-1.5 flex-none min-w-0">
                          <span className={`text-[9.5px] font-black px-1.5 py-0.5 rounded-full border flex-none ${medalStyle}`}>
                            {medal}
                          </span>

                          {champ && champ.score > 0 ? (
                            <>
                              {/* 칭호 배지 */}
                              {activeTitle && titleBadge && (
                                <span className={`text-[8.5px] font-black border px-1.5 py-0.2 rounded-full flex items-center space-x-0.5 flex-none ${titleBadge.style}`}>
                                  <span>{titleBadge.icon}</span>
                                  <span>{activeTitle}</span>
                                </span>
                              )}

                              {/* 풀 네임 (단일 행 표출) */}
                              <span className={`font-black flex-none ${isFirst ? 'text-white text-[11.5px]' : 'text-slate-200 text-[10.5px]'}`}>
                                {studentDisplayName}
                              </span>
                            </>
                          ) : (
                            <span className="text-[10.5px] font-bold text-slate-600 italic flex-none">
                              도전 대기 중... 🐱
                            </span>
                          )}
                        </div>

                        {/* Right: 완료 X개 + X점 (단일 행 표출) */}
                        {champ && champ.score > 0 && (
                          <div className="flex items-center space-x-1.5 flex-none text-right whitespace-nowrap pl-1">
                            <span className="text-[9.5px] text-slate-400 font-medium">
                              완료 {champ.weekly_completed_count}개
                            </span>
                            <span className={`font-black ${isFirst ? 'text-amber-400 text-[12px]' : 'text-slate-300 text-[11px]'}`}>
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
              <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-3 mb-4 flex items-center justify-between shadow-lg shadow-indigo-950/5 animate-fade-in">
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
            )}

            <MistakeList
              mistakes={[...mistakes]
                .filter(m => !(m.reviews?.filter(r => r === 'O').length === 3))
                .sort((a, b) => {
                const aStruggles = a.reviews ? a.reviews.filter(r => r === 'X' || r === 'star').length : 0;
                const bStruggles = b.reviews ? b.reviews.filter(r => r === 'X' || r === 'star').length : 0;
                
                if (aStruggles === 3 && bStruggles !== 3) return -1;
                if (bStruggles === 3 && aStruggles !== 3) return 1;
                
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
          />
          </>
        )}

        {activeTab === 'completed' && (
          <MistakeList
            mistakes={mistakes.filter(m => {
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
          />
        )}

        {activeTab === 'camera' && !tempCapturedImage && (
          <CameraScanner 
            onCapture={handleCameraCapture}
            onClose={() => setActiveTab('notes')}
          />
        )}

        {activeTab === 'admin' && isAdmin && (
          <AdminPanel />
        )}

        {activeTab === 'guide' && !isAdmin && (
          <StudentGuide />
        )}

        {/* ── 분석통계 탭 ── */}
        {activeTab === 'stats' && (
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
        )}
      </main>

      {/* Selected Entry Detail Modal */}
      {selectedEntry && (
        <MistakeDetailModal
          selectedEntry={selectedEntry}
          allEntries={mistakes}
          peerActivities={peerActivities}
          isAnalyzing={isAnalyzing}
          averageWaitMs={averageWaitMs}
          youtubeLectures={youtubeLectures}
          onClose={() => {
            setIsReviewSession(false);
            setSelectedEntry(null);
          }}
          onDeleteMistake={handleDeleteMistake}
          onStartAnalysis={handleStartAnalysis}
          onUpdateReviews={handleUpdateReviews}
          onSelectEntry={setSelectedEntry}
          isReviewSession={isReviewSession}
          onUpdateEntry={(updated) => {
            setMistakes(prev => prev.map(m => m.id === updated.id ? updated : m));
            setSelectedEntry(updated);
          }}
        />
      )}

      {/* Interactive Image Cropper Bounding Box overlay */}
      {tempCapturedImage && (
        <ImageCropper
          imageSrc={tempCapturedImage}
          onCropComplete={handleCropComplete}
          onCancel={() => setTempCapturedImage(null)}
        />
      )}

      {/* Floating Glassmorphic Bottom Navigation Bar */}
      <BottomNavigation 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        isAdmin={isAdmin} 
        onlineUsers={onlineUsers}
        onStartReviewSession={handleStartReviewSession}
        onOpenSlideList={() => setIsSlideListOpen(true)}
      />

      {/* 수업자료 모달 다이얼로그 */}
      <SlideListModal
        isOpen={isSlideListOpen}
        onClose={() => setIsSlideListOpen(false)}
      />

      {/* 인쇄 전용 2열 세로 구분선 레이아웃 (@media print 시에만 노출) */}
      {printItems && printItems.length > 0 && (
        <div className="print-only-layout hidden">
          {/* 정갈한 학습지 타이틀 */}
          <div className="border-b-2 border-slate-850 pb-2.5 mb-6 flex justify-between items-end">
            <div>
              <h1 className="text-base font-extrabold text-slate-900 tracking-tight">더쿠키수학 오답노트</h1>
              <p className="text-[8px] text-slate-500 font-mono mt-0.5">완료된 문제 모아찍기 학습지</p>
            </div>
            <div className="text-right text-[8px] text-slate-500 font-mono">
              <span>인쇄일: {new Date().toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' }).replace(/\s/g, '')}</span>
            </div>
          </div>

          <div className="print-column-wrapper">
            {printItems.map((entry) => {
              const cleanTitle = (entry.title || '').replace(/\$[^$]+\$/g, '').replace(/[#*`_]/g, '').slice(0, 16);
              const formattedDate = entry.date 
                ? new Date(entry.date).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' }).replace(/\s/g, '')
                : '—';
              
              const isTextPrint = printAsTextMap[entry.id];
              const hasProblemText = !!entry.analysis?.problemText;

              return (
                <div key={entry.id} className="print-card-item">
                  {/* 단정한 헤더 이력 바 */}
                  <div className="flex justify-between items-center text-[7px] text-slate-500 border-b border-slate-200 pb-1 mb-1.5 font-mono">
                    <span className="font-bold text-slate-800">[{entry.grade || '공통'} ➔ {entry.chapter || '기타'}] {cleanTitle}...</span>
                    <span>등록: {formattedDate}</span>
                  </div>
                  {/* 문제 영역 (텍스트 또는 이미지) */}
                  {isTextPrint && hasProblemText ? (
                    <div className="text-[10px] text-slate-900 leading-relaxed font-sans select-text whitespace-pre-line py-1 border border-slate-100 rounded px-2 bg-slate-50/30">
                      <LaTeXRenderer text={entry.analysis!.problemText || ''} className="text-[10px] text-slate-900 leading-relaxed" isPrintMode={true} />
                    </div>
                  ) : (
                    <img src={entry.imageUrl} alt={entry.title} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
