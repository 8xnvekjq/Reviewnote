import { useState, useEffect } from 'react';
import type { ActiveTab, MistakeEntry, ReviewState } from './types';
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
      const { data: dbMistakes, error: mistakesError } = await supabase
        .from('mistakes')
        .select('*')
        .order('date', { ascending: false });

      if (mistakesError) throw mistakesError;

      const mappedMistakes: MistakeEntry[] = (dbMistakes || []).map((m: any) => ({
        id: m.id,
        title: m.title,
        imageUrl: m.image_url,
        date: m.date,
        analysis: m.analysis || undefined,
        reviews: m.reviews || ['', '', '']
      }));
      setMistakes(mappedMistakes);
    } catch (err) {
      console.error('Error loading Supabase user data:', err);
    }
  };

  // Start analysis trigger
  const handleStartAnalysis = (entry: MistakeEntry) => {
    const envKey = import.meta.env.VITE_GEMINI_API_KEY || '';
    if (envKey) {
      runAnalysisFlow(entry, envKey);
    } else {
      alert('관리자 서버에 Gemini API Key(VITE_GEMINI_API_KEY)가 등록되지 않았습니다. Vercel 환경 변수 설정을 완료해 주세요.');
    }
  };

  // Gemini API analysis flow & database updating
  const runAnalysisFlow = async (entry: MistakeEntry, apiKey: string) => {
    setIsAnalyzing(true);
    try {
      const result = await analyzeMistakeWithGemini(entry.imageUrl, apiKey);
      
      // Update mistake database record
      const { error: updateError } = await supabase
        .from('mistakes')
        .update({
          title: result.title,
          analysis: result.analysis
        })
        .eq('id', entry.id);

      if (updateError) throw updateError;

      const updatedEntry: MistakeEntry = {
        ...entry,
        title: result.title,
        analysis: result.analysis
      };

      setMistakes(prev => prev.map(m => m.id === entry.id ? updatedEntry : m));
      setSelectedEntry(updatedEntry);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'AI 분석 실행 중 오류가 발생했습니다.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Process camera capture, upload directly to Storage, and insert database record (No cropping)
  const handleCameraCapture = async (base64Image: string) => {
    if (!session?.user) return;

    setIsAnalyzing(true);
    try {
      const blob = base64ToBlob(base64Image);
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
          reviews: ['', '', '']
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
        reviews: ['', '', '']
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
    setActiveTab('notes');
  };

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
            mistakes={mistakes.filter(m => !(m.reviews?.filter(r => r === 'O').length === 3))}
            onSelectEntry={(entry) => setSelectedEntry(entry)}
            onDeleteMistake={handleDeleteMistake}
            onAddClick={() => setActiveTab('camera')}
            title="나의 오답노트"
            emptyMessage="아직 등록된 오답이 없습니다. 아래 카메라 버튼을 눌러 수학 문제를 촬영하고 AI의 맞춤 분석을 받아보세요."
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
          />
        )}

        {activeTab === 'camera' && (
          <CameraScanner 
            onCapture={handleCameraCapture}
            onClose={() => setActiveTab('notes')}
          />
        )}

        {activeTab === 'admin' && isAdmin && (
          <AdminPanel />
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
        />
      )}

      {/* Floating Glassmorphic Bottom Navigation Bar */}
      <BottomNavigation activeTab={activeTab} setActiveTab={setActiveTab} isAdmin={isAdmin} />

    </div>
  );
}

export default App;
