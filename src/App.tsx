import { useState, useEffect, useMemo } from 'react';
import type { ActiveTab, MistakeEntry, ReviewState } from './types';
import { ROOT_CAUSE_OPTIONS, GRADE_LIST } from './types';
import { CameraScanner } from './components/CameraScanner';
import { analyzeMistakeWithGemini } from './services/gemini';
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

  // State for image cropping flow
  const [tempCapturedImage, setTempCapturedImage] = useState<string | null>(null);

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
      } else {
        setCurrentUser('');
        setIsAdmin(false);
        setMistakes([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch mistakes from Supabase
  const fetchUserData = async () => {
    try {
      // Fetch all mistakes (RLS handles filtering: normal users see own, admin sees all)
      const { data: dbMistakes, error: mistakesError } = await supabase
        .from('mistakes')
        .select('*')
        .order('date', { ascending: false });

      if (mistakesError) throw mistakesError;

      // Fetch all profiles for admin name mapping (display_name 포함)
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, display_name');

      const pMap: Record<string, string> = {};
      (profiles || []).forEach((p: any) => {
        const username = p.email?.split('@')[0] || p.id.slice(0, 8);
        const displayName = p.display_name?.trim();
        pMap[p.id] = displayName ? `${displayName} (${username})` : username;
      });
      setProfilesMap(pMap);

      const mappedMistakes: MistakeEntry[] = (dbMistakes || []).map((m: any) => ({
        id: m.id,
        userId: m.user_id,
        title: m.title,
        imageUrl: m.image_url,
        date: m.date,
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
      if (freeKey) {
        try {
          await runAnalysisFlow(entry, freeKey);
        } catch (err: any) {
          const errorMsg = err?.message || '';
          const isQuotaError = 
            errorMsg.includes('429') || 
            errorMsg.toUpperCase().includes('RESOURCE_EXHAUSTED') || 
            errorMsg.includes('quota') || 
            errorMsg.includes('limit');

          if (paidKey && isQuotaError) {
            console.warn('Free API Key limit hit. Retrying with Paid API Key...');
            await runAnalysisFlow(entry, paidKey);
          } else {
            throw err;
          }
        }
      } else {
        await runAnalysisFlow(entry, paidKey);
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'AI 분석 실행 중 오류가 발생했습니다.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Gemini API analysis flow & database updating
  const runAnalysisFlow = async (entry: MistakeEntry, apiKey: string) => {
    const result = await analyzeMistakeWithGemini(entry.imageUrl, apiKey);
    
    // Update mistake database record (including auto-classified grade/chapter)
    const { error: updateError } = await supabase
      .from('mistakes')
      .update({
        title: result.title,
        analysis: result.analysis,
        grade: result.grade || null,
        chapter: result.chapter || null,
      })
      .eq('id', entry.id);

    if (updateError) throw updateError;

    const updatedEntry: MistakeEntry = {
      ...entry,
      title: result.title,
      analysis: result.analysis,
      grade: result.grade,
      chapter: result.chapter,
    };

    setMistakes(prev => prev.map(m => m.id === entry.id ? updatedEntry : m));
    setSelectedEntry(updatedEntry);
  };

  // Intercept camera capture and start cropping flow
  const handleCameraCapture = (base64Image: string) => {
    setTempCapturedImage(base64Image);
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
      } catch (err: any) {
        console.error(err);
        alert('삭제 실패: ' + err.message);
      }
    }
  };

  // Update reviews list in Supabase & local state
  const handleUpdateReviews = async (id: string, newReviews: ReviewState[]) => {
    try {
      const { error } = await supabase
        .from('mistakes')
        .update({ reviews: newReviews })
        .eq('id', id);

      if (error) throw error;

      setMistakes(prev => prev.map(m => m.id === id ? { ...m, reviews: newReviews } : m));
      setSelectedEntry(prev => prev && prev.id === id ? { ...prev, reviews: newReviews } : prev);
    } catch (err: any) {
      console.error('Failed to update reviews:', err);
      // Fallback: update local React state anyway for immediate validation
      setMistakes(prev => prev.map(m => m.id === id ? { ...m, reviews: newReviews } : m));
      setSelectedEntry(prev => prev && prev.id === id ? { ...prev, reviews: newReviews } : prev);
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
  const stats = useMemo(() => {
    const gradeCounts: Record<string, number> = {};
    const chapterCounts: Record<string, number> = {};
    const causeCounts: Record<string, number> = {};

    mistakes.forEach(m => {
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
  }, [mistakes]);

  if (!currentUser) {
    return <AuthScreen onLogin={(username) => setCurrentUser(username)} />;
  }

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 select-none">
      
      {/* Top Header */}
      <Header currentUser={currentUser} onLogout={handleLogout} />

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto px-4 py-6 pb-24">
        {activeTab === 'notes' && (
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
        )}

        {activeTab === 'completed' && (
          <MistakeList
            mistakes={mistakes.filter(m => m.reviews?.filter(r => r === 'O').length === 3)}
            onSelectEntry={(entry) => setSelectedEntry(entry)}
            onDeleteMistake={handleDeleteMistake}
            onAddClick={() => setActiveTab('camera')}
            title="복습 완료 보관함"
            hideAddButton={true}
            emptyMessage="아직 완전히 복습 완료(O 3회 달성)된 오답이 없습니다. 열심히 오답을 복습하여 정복해 보세요!"
            isAdmin={isAdmin}
            profilesMap={profilesMap}
            currentUserId={session?.user?.id}
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

        {/* ── 분석통계 탭 ── */}
        {activeTab === 'stats' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-white">📊 나의 약점 분석</h2>
              <p className="text-xs text-slate-400 mt-0.5">총 {mistakes.length}개의 오답 기록 기반</p>
            </div>

            {mistakes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed border-slate-800 rounded-2xl bg-slate-900/20">
                <div className="text-3xl mb-3">📊</div>
                <p className="text-slate-300 font-medium text-sm">아직 분석할 데이터가 없습니다</p>
                <p className="text-xs text-slate-500 mt-1">오답을 등록하고 실수 원인을 체크해 주세요.</p>
              </div>
            ) : (
              <>
                {/* 과목별 오답 분포 */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
                  <h3 className="text-sm font-extrabold text-indigo-400">📚 과목별 오답 분포</h3>
                  {stats.totalGrade === 0 ? (
                    <p className="text-xs text-slate-500">AI 분석을 실행하면 과목이 자동 분류됩니다.</p>
                  ) : (
                    GRADE_LIST.filter(g => stats.gradeCounts[g]).map(grade => {
                      const count = stats.gradeCounts[grade] || 0;
                      const pct = Math.round((count / stats.totalGrade) * 100);
                      return (
                        <div key={grade} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-300 font-medium">{grade}</span>
                            <span className="text-slate-400">{count}개 ({pct}%)</span>
                          </div>
                          <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-indigo-600 to-indigo-400 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* 실수 유형별 분포 */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
                  <h3 className="text-sm font-extrabold text-amber-400">⚠️ 나의 실수 유형 분석</h3>
                  {stats.totalCause === 0 ? (
                    <p className="text-xs text-slate-500">오답 상세창에서 실수 원인을 체크해 주세요.</p>
                  ) : (
                    ROOT_CAUSE_OPTIONS.map(opt => {
                      const count = stats.causeCounts[opt.id] || 0;
                      const pct = Math.round((count / stats.totalCause) * 100);
                      return (
                        <div key={opt.id} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-300 font-medium">{opt.label}</span>
                            <span className="text-slate-400">{count}회 ({pct}%)</span>
                          </div>
                          <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })
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
          isAnalyzing={isAnalyzing}
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

    </div>
  );
}

export default App;
