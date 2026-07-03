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
import { ImageCropper } from './components/ImageCropper';
import { AdminPanel } from './components/AdminPanel';
import { encryptApiKey, decryptApiKey } from './utils/crypto';

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
  
  // Encrypted API key states for users
  const [encryptedApiKey, setEncryptedApiKey] = useState<string>('');
  const [decryptedKey, setDecryptedKey] = useState<string>(() => {
    return sessionStorage.getItem('gemini_api_key_temp') || '';
  });

  // Modal and Form States
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [unlockPin, setUnlockPin] = useState('');
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [showApiGuideModal, setShowApiGuideModal] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError: boolean } | null>(null);

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
        setEncryptedApiKey('');
        setDecryptedKey('');
        sessionStorage.removeItem('gemini_api_key_temp');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch mistakes and user profile API key from Supabase
  const fetchUserData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

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

      // Fetch profile encrypted key
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('encrypted_api_key')
        .eq('id', user.id)
        .maybeSingle();

      if (profileData && !profileError) {
        setEncryptedApiKey(profileData.encrypted_api_key || '');
      }
    } catch (err) {
      console.error('Error loading Supabase user data:', err);
    }
  };

  // Securely encrypt and save the API Key to Supabase database profiles table
  const handleSaveApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    if (!apiKeyInput.trim()) {
      setStatusMessage({ text: 'API Key를 입력해 주세요.', isError: true });
      return;
    }
    if (pinInput.length < 4) {
      setStatusMessage({ text: 'PIN 번호는 최소 4자리 이상이어야 합니다.', isError: true });
      return;
    }
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      const encrypted = await encryptApiKey(apiKeyInput.trim(), pinInput);
      
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          encrypted_api_key: encrypted,
          updated_at: new Date().toISOString()
        });

      if (profileError) throw profileError;

      setEncryptedApiKey(encrypted);
      
      // Save temporarily in session storage
      setDecryptedKey(apiKeyInput.trim());
      sessionStorage.setItem('gemini_api_key_temp', apiKeyInput.trim());

      setApiKeyInput('');
      setPinInput('');
      setStatusMessage({ text: 'API Key가 암호화되어 클라우드 프로필에 안전하게 동기화되었습니다.', isError: false });
    } catch (err: any) {
      console.error(err);
      setStatusMessage({ text: `저장 중 오류 발생: ${err.message}`, isError: true });
    }
  };

  // Decrypt Key handler (used when analyzing)
  const handleUnlockKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    if (!encryptedApiKey) {
      setStatusMessage({ text: '저장된 API Key가 없습니다. 설정 탭에서 먼저 등록해 주세요.', isError: true });
      return;
    }

    try {
      const decrypted = await decryptApiKey(encryptedApiKey, unlockPin);
      setDecryptedKey(decrypted);
      sessionStorage.setItem('gemini_api_key_temp', decrypted);
      setShowUnlockModal(false);
      setUnlockPin('');
      
      if (selectedEntry) {
        runAnalysisFlow(selectedEntry, decrypted);
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message || '복호화 실패', isError: true });
    }
  };

  // Start analysis trigger
  const handleStartAnalysis = (entry: MistakeEntry) => {
    const envKey = import.meta.env.VITE_GEMINI_API_KEY || '';
    const activeKey = decryptedKey || envKey;

    if (activeKey) {
      runAnalysisFlow(entry, activeKey);
    } else if (encryptedApiKey) {
      setShowUnlockModal(true);
    } else {
      setActiveTab('settings');
      alert('AI 오답 분석을 진행하려면 먼저 설정 탭에서 Gemini API Key를 등록하거나 .env 파일에 VITE_GEMINI_API_KEY를 설정해야 합니다.');
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
    setEncryptedApiKey('');
    setDecryptedKey('');
    sessionStorage.removeItem('gemini_api_key_temp');
    setActiveTab('notes');
  };

  if (!currentUser) {
    return <AuthScreen onLogin={(username) => setCurrentUser(username)} />;
  }

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 select-none">
      
      {/* Top Header */}
      <Header 
        currentUser={currentUser} 
        onLogout={handleLogout} 
        encryptedApiKey={encryptedApiKey}
        decryptedKey={decryptedKey}
        onShowApiGuide={() => setShowApiGuideModal(true)}
      />

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

        {activeTab === 'camera' && !tempCapturedImage && (
          <CameraScanner 
            onCapture={handleCameraCapture}
            onClose={() => setActiveTab('notes')}
          />
        )}

        {activeTab === 'admin' && isAdmin && (
          <AdminPanel />
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6 max-w-lg mx-auto">
            <div>
              <h2 className="text-xl font-bold text-white">앱 설정</h2>
              <p className="text-xs text-slate-400 mt-1">API 보안 설정 및 앱 환경설정</p>
            </div>

            {/* API Security Card */}
            <form onSubmit={handleSaveApiKey} className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-950 border border-indigo-800 flex items-center justify-center text-xl text-indigo-400">
                  🔑
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">Gemini API 보안 설정</h3>
                  <p className="text-[10px] text-slate-400">클라우드 프로필 저장 시 강력 암호화 적용</p>
                </div>
              </div>
              
              <div className="space-y-3 pt-2">
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 font-medium font-bold flex items-center justify-between">
                    <span>Gemini API Key</span>
                    <button
                      type="button"
                      onClick={() => setShowApiGuideModal(true)}
                      className="text-[10px] text-indigo-400 hover:underline"
                    >
                      발급 방법 보기 ?
                    </button>
                  </label>
                  <input 
                    type="password" 
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="AIzaSy..." 
                    className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm text-white placeholder-slate-600 outline-none transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 font-medium font-bold">앱 복호화 PIN (4~6자리 숫자)</label>
                  <input 
                    type="password" 
                    maxLength={6}
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="숫자 4~6자리 입력" 
                    className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm text-white placeholder-slate-600 outline-none transition-all"
                  />
                  <p className="text-[9px] text-slate-500 leading-normal">
                    * 설정한 PIN은 키 복호화 시 인증 수단으로 사용됩니다. 클라우드에 연동 저장되므로 기기가 바뀌어도 이 PIN만 있으면 언제든 키를 불러와 분석할 수 있습니다.
                  </p>
                </div>

                {statusMessage && (
                  <div className={`p-3 rounded-lg text-xs ${statusMessage.isError ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                    {statusMessage.text}
                  </div>
                )}

                <button 
                  type="submit"
                  className="w-full py-3 mt-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 transition-all text-xs font-bold text-white shadow-md shadow-indigo-600/10"
                >
                  보안 저장하기
                </button>
              </div>
            </form>

            {/* App Info Card */}
            <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 space-y-3">
              <h3 className="font-bold text-white text-sm">애플리케이션 정보</h3>
              <div className="divide-y divide-slate-800/60 text-xs text-slate-300">
                <div className="flex justify-between py-2.5">
                  <span className="text-slate-400">버전</span>
                  <span className="text-slate-200 font-medium">v1.6.0 (PWA + Supabase)</span>
                </div>
                <div className="flex justify-between py-2.5">
                  <span className="text-slate-400">인증 및 데이터베이스</span>
                  <span className="text-emerald-400 font-medium font-bold">Supabase Cloud</span>
                </div>
                <div className="flex justify-between py-2.5">
                  <span className="text-slate-400">보안 수준</span>
                  <span className="text-emerald-400 font-medium font-bold">AES-GCM 암호화</span>
                </div>
                {decryptedKey && (
                  <div className="flex justify-between py-2.5 items-center">
                    <span className="text-slate-400">세션 상태</span>
                    <button 
                      onClick={() => {
                        setDecryptedKey('');
                        sessionStorage.removeItem('gemini_api_key_temp');
                        alert('API Key 세션이 만료되었습니다. 다시 안전하게 잠겼습니다.');
                      }}
                      className="px-2 py-1 bg-red-950 border border-red-800 text-red-400 rounded-lg text-[10px] font-bold"
                    >
                      세션 메모리 잠금
                    </button>
                  </div>
                )}
              </div>
            </div>
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

      {/* Unlock API Key PIN Modal */}
      {showUnlockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <form 
            onSubmit={handleUnlockKey}
            className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-2xl animate-scale-up text-slate-100"
          >
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 text-2xl flex items-center justify-center mx-auto text-amber-400">
                🔒
              </div>
              <h3 className="font-bold text-white text-base">보안 복호화</h3>
              <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
                암호화된 API Key를 로드하기 위해 보안 PIN 코드를 입력해 주세요.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <input 
                type="password" 
                maxLength={6}
                value={unlockPin}
                onChange={(e) => setUnlockPin(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="숫자 4~6자리 PIN 입력" 
                className="w-full px-4 py-3 text-center tracking-widest text-lg rounded-xl bg-slate-950 border border-slate-850 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-white placeholder-slate-600 outline-none transition-all"
              />

              {statusMessage && (
                <div className="p-3 rounded-lg text-xs bg-red-500/10 text-red-400 border border-red-500/20">
                  {statusMessage.text}
                </div>
              )}

              <div className="flex space-x-3 pt-2">
                <button 
                  type="button"
                  onClick={() => {
                    setShowUnlockModal(false);
                    setUnlockPin('');
                    setStatusMessage(null);
                  }}
                  className="flex-1 py-3 rounded-xl border border-slate-800 hover:bg-slate-800 active:scale-95 text-xs font-semibold text-slate-300"
                >
                  취소
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-xs font-bold text-white shadow-md shadow-indigo-600/20"
                >
                  잠금 해제
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Gemini API Key Guide Modal */}
      {showApiGuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-2xl animate-scale-up text-slate-100">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-xl flex items-center justify-center mx-auto text-indigo-400">
                🤖
              </div>
              <h3 className="font-bold text-white text-base">Gemini API 키 발급 가이드</h3>
              <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
                AI 오답노트의 자동 취약점 진단 기능을 이용하려면 무료 Google Gemini API 키가 필요합니다.
              </p>
            </div>

            <div className="space-y-3 pt-2 text-left text-xs text-slate-300">
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3.5 leading-relaxed">
                <div className="flex items-start space-x-2.5">
                  <span className="w-5 h-5 rounded-full bg-indigo-900 text-indigo-300 text-[10px] font-bold flex items-center justify-center flex-none mt-0.5">1</span>
                  <p>
                    아래 <strong>\'API 키 발급하러 가기\'</strong> 버튼을 클릭하여 Google AI Studio 사이트로 이동합니다 (구글 계정 필요).
                  </p>
                </div>
                <div className="flex items-start space-x-2.5">
                  <span className="w-5 h-5 rounded-full bg-indigo-900 text-indigo-300 text-[10px] font-bold flex items-center justify-center flex-none mt-0.5">2</span>
                  <p>
                    로그인 후 상단의 <strong>"Get API key"</strong> 또는 <strong>"Create API key"</strong> 버튼을 클릭하여 새 키를 발급받습니다.
                  </p>
                </div>
                <div className="flex items-start space-x-2.5">
                  <span className="w-5 h-5 rounded-full bg-indigo-900 text-indigo-300 text-[10px] font-bold flex items-center justify-center flex-none mt-0.5">3</span>
                  <p>
                    발급된 키(<code className="bg-slate-900 px-1.5 py-0.5 rounded text-indigo-400 text-[10px] font-mono">AIzaSy...</code>)를 복사한 후, 오답노트 <strong>[설정]</strong> 탭에서 PIN 번호와 함께 등록합니다.
                  </p>
                </div>
              </div>

              <div className="flex space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowApiGuideModal(false)}
                  className="flex-1 py-3 rounded-xl border border-slate-800 hover:bg-slate-800 active:scale-95 text-xs font-semibold text-slate-300"
                >
                  닫기
                </button>
                <a 
                  href="https://aistudio.google.com/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 active:scale-95 text-xs font-bold text-white text-center shadow-md shadow-indigo-600/20 flex items-center justify-center"
                >
                  API 키 발급하기 &rarr;
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Glassmorphic Bottom Navigation Bar */}
      <BottomNavigation activeTab={activeTab} setActiveTab={setActiveTab} isAdmin={isAdmin} />

    </div>
  );
}

export default App;
