import { useState, useEffect, useMemo, useRef } from 'react';
import type { ActiveTab, MistakeEntry, ReviewState, MistakeAnalysis } from './types';
import { ROOT_CAUSE_OPTIONS } from './types';
import { CameraScanner } from './components/CameraScanner';
import { classifyMistakeWithGemini, solveMistakeWithGemini } from './services/gemini';
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
  // userId -> displayName map (admin 전용)
  const [profilesMap, setProfilesMap] = useState<Record<string, string>>({});
  // 유튜브 매칭용 강의 마스터 리스트 상태
  const [youtubeLectures, setYoutubeLectures] = useState<any[]>([]);
  // 주간 최다 오답 완료 챔피언 상태 (1~3위)
  const [weeklyChampions, setWeeklyChampions] = useState<any[]>([]);
  // 분석통계 탭 학생 필터 상태 (어드민 전용)
  const [statsStudentFilter, setStatsStudentFilter] = useState<string>('all');
  // userId -> schoolGrade map (AI 학년별 분류 최적화용)
  const [profilesGradeMap, setProfilesGradeMap] = useState<Record<string, string>>({});
  // 다른 학생들의 실시간 복습 현황 목록
  const [peerActivities, setPeerActivities] = useState<any[]>([]);
  // 인쇄할 완료 오답 리스트 임시 보관 상태
  const [printItems, setPrintItems] = useState<MistakeEntry[] | null>(null);
  // 개별 오답의 인쇄 형식 상태 (id -> true: 텍스트로 인쇄, false/undefined: 이미지로 인쇄)
  const [printAsTextMap, setPrintAsTextMap] = useState<Record<string, boolean>>({});
  // 인쇄할 아이템 선택 ID 목록 상태
  const [selectedPrintIds, setSelectedPrintIds] = useState<string[]>([]);
  
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

  // 이번주 월요일 00:00 KST UTC 경계 날짜 구하기 (내 실시간 주간 점수 계산용)
  const myWeeklyScore = useMemo(() => {
    if (!currentUser || mistakes.length === 0) return { total: 0, completed: 0, score: 0 };

    const now = new Date();
    const kstTime = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const day = kstTime.getUTCDay();
    const diff = kstTime.getUTCDate() - day + (day === 0 ? -6 : 1);
    const mondayKst = new Date(Date.UTC(kstTime.getUTCFullYear(), kstTime.getUTCMonth(), diff, 0, 0, 0));
    const thisMondayUtc = new Date(mondayKst.getTime() - 9 * 60 * 60 * 1000);

    // 이번 주 월요일 이후 등록된 본인 오답 수 (신규 등록)
    const myWeeklyMistakes = mistakes.filter(m => {
      const mDate = new Date(m.date);
      return mDate >= thisMondayUtc;
    });

    const total = myWeeklyMistakes.length;
    
    // 이번 주 월요일 이후 최종 완료(reviews 'O' 3개)된 본인 오답 수 (등록일 무관)
    const completed = mistakes.filter(m => {
      const isCompleted = m.reviews && m.reviews.filter(r => r === 'O').length === 3;
      if (!isCompleted) return false;
      const updateDate = new Date(m.updatedAt || m.date);
      return updateDate >= thisMondayUtc;
    }).length;

    const rate = total > 0 ? (completed / total) : 1.0;
    const score = (completed * 10) + (rate * 100);

    return {
      total,
      completed,
      score: Math.round(score)
    };
  }, [currentUser, mistakes]);

  // State for image cropping flow
  const [tempCapturedImage, setTempCapturedImage] = useState<string | null>(null);

  // 주간 최다 오답 완료 챔피언 정보 로드 (하이브리드 1주 이월 및 리셋 롤오버)
  const loadWeeklyChampions = async () => {
    try {
      // 1. 이번 주 랭킹 뷰 조회 (최대 3명)
      const { data, error } = await supabase
        .from('weekly_leaderboard')
        .select('*')
        .order('score', { ascending: false })
        .limit(3);

      if (error) throw error;

      if (data && data.length > 0 && data[0].score > 0) {
        const mapped = data.map((item: any) => ({ ...item, isLastWeek: false }));
        setWeeklyChampions(mapped);
        return;
      }

      // 2. 이번 주 데이터가 없으면 지난주 랭킹 뷰(RLS 우회) 조회 (최대 3명)
      const { data: lastWeekData, error: lastWeekError } = await supabase
        .from('last_weekly_leaderboard')
        .select('*')
        .order('score', { ascending: false })
        .limit(3);

      if (lastWeekError) throw lastWeekError;

      if (lastWeekData && lastWeekData.length > 0 && lastWeekData[0].score > 0) {
        const mapped = lastWeekData.map((item: any) => ({ ...item, isLastWeek: true }));
        setWeeklyChampions(mapped);
        return;
      }

      // 3. 지난주마저 점수가 없으면 배너를 비워 동기부여 유도
      setWeeklyChampions([]);
    } catch (err) {
      console.error('loadWeeklyChampions failed:', err);
      setWeeklyChampions([]);
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
      } else {
        setCurrentUser('');
        setIsAdmin(false);
        setMistakes([]);
        setYoutubeLectures([]);
        setWeeklyChampions([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

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

  // Start analysis trigger with automatic paid fallback
  const handleStartAnalysis = async (entry: MistakeEntry) => {
    const freeKey = import.meta.env.VITE_GEMINI_API_KEY || '';
    const paidKey = import.meta.env.VITE_GEMINI_API_KEY_PAID || '';

    if (!freeKey && !paidKey) {
      alert('관리자 서버에 Gemini API Key가 등록되지 않았습니다. Vercel 환경 변수 설정을 완료해 주세요.');
      return;
    }

    setIsAnalyzing(true);
    try {
      const studentGrade = entry.userId ? (profilesGradeMap[entry.userId] || '') : '';
      if (freeKey) {
        try {
          await runAnalysisFlow(entry, freeKey, studentGrade);
        } catch (err) {
          console.warn('Free API Key failed. Retrying with Paid API Key...', err);
          if (paidKey) {
            await runAnalysisFlow(entry, paidKey, studentGrade);
          } else {
            throw err;
          }
        }
      } else if (paidKey) {
        await runAnalysisFlow(entry, paidKey, studentGrade);
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'AI 분석 실행 중 오류가 발생했습니다.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Gemini API analysis flow & database updating
  const runAnalysisFlow = async (entry: MistakeEntry, apiKey: string, studentGrade?: string) => {
    // --- 1단계: 과목/단원 및 유튜브 딥링크 1차 판단 ---
    const firstResult = await classifyMistakeWithGemini(entry.imageUrl, apiKey, youtubeLectures, studentGrade);
    
    // 1단계 결과를 기반으로 Supabase DB에 과목, 단원, 유튜브 매칭 필드 우선 업데이트
    const partialAnalysis: MistakeAnalysis = {
      solvingProcess: "### 1단계: 문제 이해하기\nAI가 정밀 문제 해설 및 힌트를 분석 중입니다... 잠시만 기다려 주세요.",
      hints: ["해설 분석 중...", "해설 분석 중...", "해설 분석 중..."],
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

    let updatedEntry: MistakeEntry = {
      ...entry,
      title: firstResult.title,
      grade: firstResult.grade || entry.grade,
      chapter: firstResult.chapter || entry.chapter,
      analysis: partialAnalysis,
    };

    // 로컬 상태 1차 갱신 (화면에 과목/단원 및 유튜브 딥링크가 바로 노출됨)
    setMistakes(prev => prev.map(m => m.id === entry.id ? updatedEntry : m));
    setSelectedEntry(updatedEntry);

    // --- 2단계: 문제 풀이 및 힌트 2차 정밀 분석 ---
    const secondResult = await solveMistakeWithGemini(
      entry.imageUrl, 
      apiKey, 
      updatedEntry.grade || '', 
      updatedEntry.chapter || '', 
      studentGrade
    );

    const finalAnalysis: MistakeAnalysis = {
      ...partialAnalysis,
      solvingProcess: secondResult.solvingProcess,
      hints: secondResult.hints,
      problemText: secondResult.problemText,
      problemBox: secondResult.problemBox,
      mistakeSummary: secondResult.mistakeSummary || undefined,
      modelUsed: 'gemini-2.5-flash'
    };

    const { error: secondUpdateError } = await supabase
      .from('mistakes')
      .update({
        analysis: finalAnalysis,
      })
      .eq('id', entry.id);

    if (secondUpdateError) throw secondUpdateError;

    updatedEntry = {
      ...updatedEntry,
      analysis: finalAnalysis
    };

    // 로컬 상태 2차 갱신 (상세 해설 및 힌트 로딩 완료 노출)
    setMistakes(prev => prev.map(m => m.id === entry.id ? updatedEntry : m));
    setSelectedEntry(updatedEntry);
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

      const currentDates = [...(targetEntry.analysis?.reviewDates || ['', '', ''])];
      const oldReviews = targetEntry.reviews || ['', '', ''];

      for (let i = 0; i < 3; i++) {
        if (newReviews[i] !== '' && oldReviews[i] === '') {
          const now = new Date();
          const dateStr = `${now.getMonth() + 1}/${now.getDate()}`;
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
      
      // Refresh peer activities locally
      fetchPeerActivities();
      loadWeeklyChampions(); // MVP 챔피언 배너 즉각 갱신
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
            const dateStr = `${now.getMonth() + 1}/${now.getDate()}`;
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
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString();

    let list = mistakes;
    if (isAdmin && statsStudentFilter !== 'all') {
      list = mistakes.filter(m => m.userId === statsStudentFilter);
    }
    return list.filter(m => m.date && m.date >= thirtyDaysAgoStr);
  }, [mistakes, isAdmin, statsStudentFilter]);

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

  const heatmapData = useMemo(() => {
    // 실제로 등록된 과목들만 세로축 지정 (유동적 가변)
    const activeGrades = Array.from(
      new Set(filteredMistakesForStats.map(m => m.grade).filter(Boolean))
    ) as string[];

    // 각 과목별 실수 원인 카운트 집계
    const matrix = activeGrades.map(grade => {
      const rowStats = ROOT_CAUSE_OPTIONS.map(opt => {
        const count = filteredMistakesForStats.filter(
          m => m.grade === grade && m.rootCauses?.includes(opt.id)
        ).length;
        return {
          id: opt.id,
          label: opt.label,
          count
        };
      });

      return {
        grade,
        stats: rowStats
      };
    });

    return matrix;
  }, [filteredMistakesForStats]);

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
      <Header currentUser={currentUser} onLogout={handleLogout} myScore={myWeeklyScore.score} />

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto px-4 py-6 pb-28">
        {activeTab === 'notes' && (
          <>
            {/* 주간 복습왕 배너 (전체 학생 오픈 / 1주 이월 및 리셋 롤오버) */}
            {weeklyChampions && weeklyChampions.length > 0 ? (
              <div className="bg-gradient-to-b from-slate-900/90 via-slate-900/95 to-slate-900/90 border border-amber-500/30 rounded-2xl p-4 mb-4 shadow-[0_0_15px_rgba(245,158,11,0.08)] animate-fade-in flex flex-col space-y-3">
                {/* 1등 MVP */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <span className="text-2xl animate-bounce flex-none">👑</span>
                    <div className="min-w-0 leading-tight">
                      <div className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">
                        {weeklyChampions[0].isLastWeek ? '지난주 복습 MVP' : '이번주 최다 오답 완료'}
                      </div>
                      <div className="flex items-center space-x-1.5 mt-0.5 min-w-0">
                        <span className="text-xs font-black text-white truncate">
                          {weeklyChampions[0].display_name 
                            ? `${weeklyChampions[0].display_name} 학생` 
                            : `${maskId(weeklyChampions[0].username)} 학생`}
                        </span>
                        <span className="text-[8px] font-black bg-amber-500/10 text-amber-300 border border-amber-500/20 px-1.5 py-0.5 rounded-full flex items-center flex-none">
                          {weeklyChampions[0].isLastWeek ? '⭐ 지난주 MVP' : '⭐ 주간 MVP'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex-none pl-3 border-l border-slate-800/80">
                    <span className="text-[10px] text-slate-500 block">종합 점수</span>
                    <span className="text-xs font-black text-amber-400">
                      {Math.round(weeklyChampions[0].score)}점
                    </span>
                    <span className="text-[9px] text-slate-400 block mt-0.5">
                      완료 {weeklyChampions[0].weekly_completed_count}개 ({Math.round(weeklyChampions[0].completion_rate * 100)}%)
                    </span>
                  </div>
                </div>

                {/* 2등 & 3등 작게 노출 */}
                <div className="border-t border-slate-800/80 pt-2.5 flex items-center justify-between text-[10px] text-slate-400">
                  {/* 2위 */}
                  <div className="flex-1 flex items-center space-x-1 min-w-0 pr-2">
                    <span className="flex-none font-bold text-slate-500">🥈 2위:</span>
                    {weeklyChampions[1] && weeklyChampions[1].score > 0 ? (
                      <span className="font-extrabold text-slate-300 truncate">
                        {weeklyChampions[1].display_name || maskId(weeklyChampions[1].username)}
                        <span className="font-normal text-slate-500 text-[9px] ml-1">({Math.round(weeklyChampions[1].score)}점)</span>
                      </span>
                    ) : (
                      <span className="text-slate-600 font-bold flex items-center space-x-1">
                        <span>'-')?</span>
                        <span className="text-[8px] font-normal text-slate-700">(대기)</span>
                      </span>
                    )}
                  </div>

                  {/* 3위 */}
                  <div className="flex-1 flex items-center space-x-1 min-w-0 pl-2 border-l border-slate-800/40">
                    <span className="flex-none font-bold text-slate-500">🥉 3위:</span>
                    {weeklyChampions[2] && weeklyChampions[2].score > 0 ? (
                      <span className="font-extrabold text-slate-300 truncate">
                        {weeklyChampions[2].display_name || maskId(weeklyChampions[2].username)}
                        <span className="font-normal text-slate-500 text-[9px] ml-1">({Math.round(weeklyChampions[2].score)}점)</span>
                      </span>
                    ) : (
                      <span className="text-slate-600 font-bold flex items-center space-x-1">
                        <span>'-')?</span>
                        <span className="text-[8px] font-normal text-slate-700">(대기)</span>
                      </span>
                    )}
                  </div>
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
            onSelectEntry={(entry) => setSelectedEntry(entry)}
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
            mistakes={mistakes.filter(m => m.reviews?.filter(r => r === 'O').length === 3)}
            onSelectEntry={(entry) => setSelectedEntry(entry)}
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
                {/* 나의 약점 분석 매트릭스 (격자형 히트맵) */}
                <div className="bg-[#0e1322] border border-slate-800/80 rounded-2xl p-5 space-y-4 shadow-[0_4px_30px_rgba(0,0,0,0.4)] backdrop-blur-md">
                  <div className="flex items-center space-x-1.5">
                    <span className="text-base select-none">🧩</span>
                    <h3 className="text-sm font-extrabold text-white">수학 오답 분석 매트릭스</h3>
                  </div>

                  {heatmapData.length === 0 ? (
                    <p className="text-xs text-slate-500 py-4 text-center">최근 30일 내 분석된 약점 데이터가 없습니다.</p>
                  ) : (
                    <div className="space-y-4">
                      {/* 가로 헤더 (5대 실수 유형 이름) */}
                      <div className="flex items-center text-[10px] text-slate-500 font-extrabold">
                        {/* 왼쪽 여백 (과목명 컬럼 크기 확보) */}
                        <div className="w-16 flex-none"></div>
                        {/* 5칸 격자 컬럼 헤더 */}
                        <div className="flex-1 grid grid-cols-5 gap-2 text-center">
                          {ROOT_CAUSE_OPTIONS.map(opt => {
                            // 이모지와 공백을 소거한 순수 4글자 텍스트 추출
                            const labelClean = opt.label.replace(/[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, '').trim();
                            return (
                              <div key={opt.id} className="truncate text-[8px] sm:text-[9px] tracking-tight text-slate-400 font-extrabold">
                                {labelClean}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* 세로 행 (과목별 격자선) */}
                      <div className="space-y-3">
                        {heatmapData.map(row => (
                          <div key={row.grade} className="flex items-center">
                            {/* 과목명 (왼쪽 고정 컬럼) */}
                            <div className="w-16 flex-none text-xs font-black text-slate-400 truncate pr-2 text-right tracking-tight">
                              {row.grade}
                            </div>
                            {/* 5칸 칩 격자 */}
                            <div className="flex-1 grid grid-cols-5 gap-2">
                              {row.stats.map(cell => {
                                const count = cell.count;
                                let bgStyle: React.CSSProperties = {};
                                let chipClass = '';

                                if (count === 0) {
                                  // 0회: 아주 옅은 꺼진 상태
                                  chipClass = 'bg-[#101524] border-[#182136]/50 text-slate-800';
                                } else if (count === 1) {
                                  // 1회: 옅은 퍼플
                                  chipClass = 'bg-indigo-500/10 border-indigo-500/20';
                                } else if (count === 2) {
                                  // 2회: 중간 퍼플
                                  chipClass = 'bg-indigo-500/30 border-indigo-500/40';
                                } else if (count === 3) {
                                  // 3회: 진한 퍼플 + 은은한 네온 글로우
                                  chipClass = 'bg-indigo-500/60 border-indigo-400/60';
                                  bgStyle = {
                                    boxShadow: '0 0 8px rgba(99, 102, 241, 0.4)'
                                  };
                                } else {
                                  // 4회 이상: 최고 밝기 네온 글로우
                                  chipClass = 'bg-indigo-500 border-indigo-300';
                                  bgStyle = {
                                    boxShadow: '0 0 15px rgba(99, 102, 241, 0.7)'
                                  };
                                }

                                return (
                                  <div
                                    key={cell.id}
                                    style={bgStyle}
                                    className={`h-9 border rounded-xl flex items-center justify-center transition-all duration-300 hover:scale-102 hover:-translate-y-0.5 cursor-pointer relative group ${chipClass}`}
                                    title={`${row.grade} - ${cell.label}: ${count}회 발생`}
                                  >
                                    {/* 개수 텍스트는 칩 내부에서 제거 */}
                                    
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

                      {/* 하단 범례 안내 */}
                      <div className="flex justify-between items-center text-[9px] text-slate-500 pt-3 border-t border-slate-800/60 font-bold">
                        <div className="flex items-center space-x-1.5">
                          <span className="w-2 h-2 bg-[#101524] border border-[#182136]/50 rounded-[2px]"></span>
                          <span>적음 (low)</span>
                          <span>➔</span>
                          <span>많음 (high)</span>
                          {/* 퍼플 4단계 채도 변화 범례 */}
                          <span className="w-2 h-2 rounded-[2px] bg-indigo-500/10 border border-indigo-500/20"></span>
                          <span className="w-2 h-2 rounded-[2px] bg-indigo-500/30 border border-indigo-500/40"></span>
                          <span className="w-2 h-2 rounded-[2px] bg-indigo-500/60 border border-indigo-400/60" style={{ boxShadow: '0 0 3px rgba(99, 102, 241, 0.3)' }}></span>
                          <span className="w-2.5 h-2.5 rounded-[2px] bg-indigo-500 border border-indigo-300" style={{ boxShadow: '0 0 6px rgba(99, 102, 241, 0.6)' }}></span>
                        </div>
                        <span>최근 30일 데이터</span>
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
          youtubeLectures={youtubeLectures}
          onClose={() => setSelectedEntry(null)}
          onDeleteMistake={handleDeleteMistake}
          onStartAnalysis={handleStartAnalysis}
          onUpdateReviews={handleUpdateReviews}
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
      <BottomNavigation activeTab={activeTab} setActiveTab={setActiveTab} isAdmin={isAdmin} />

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
