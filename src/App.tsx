import { useState, useEffect } from 'react';
import type { ActiveTab, MistakeEntry } from './types';
import { CameraScanner } from './components/CameraScanner';
import { encryptApiKey, decryptApiKey } from './utils/crypto';
import { analyzeMistakeWithGemini } from './services/gemini';
import { AuthScreen } from './components/AuthScreen';
import { LaTeXRenderer } from './components/LaTeXRenderer';
import { supabase } from './services/supabase';

// Helper to convert Base64 Data URL to Blob for Storage upload
const base64ToBlob = (base64DataUrl: string): Blob => {
  const parts = base64DataUrl.split(';base64,');
  const contentType = parts[0].split(':')[1];
  const raw = window.atob(parts[1]);
  const rawLength = raw.length;
  const uInt8Array = new Uint8Array(rawLength);
  for (let i = 0; i < rawLength; ++i) {
    uInt8Array[i] = raw.charCodeAt(i);
  }
  return new Blob([uInt8Array], { type: contentType });
};

function App() {
  const [session, setSession] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<string>('');
  const [activeTab, setActiveTab] = useState<ActiveTab>('notes');
  const [mistakes, setMistakes] = useState<MistakeEntry[]>([]);
  const [encryptedApiKey, setEncryptedApiKey] = useState<string>('');
  
  // App-level state for temporary decrypted API key (lasts for the session)
  const [decryptedKey, setDecryptedKey] = useState<string>(() => {
    return sessionStorage.getItem('gemini_api_key_temp') || '';
  });

  // Modal and Form States
  const [selectedEntry, setSelectedEntry] = useState<MistakeEntry | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [unlockPin, setUnlockPin] = useState('');
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Monitor Supabase Authentication States
  useEffect(() => {
    // 1. Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        const username = session.user.email?.split('@')[0] || 'User';
        setCurrentUser(username);
        fetchUserData(session.user.id);
      }
    });

    // 2. Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        const username = session.user.email?.split('@')[0] || 'User';
        setCurrentUser(username);
        fetchUserData(session.user.id);
      } else {
        setCurrentUser('');
        setMistakes([]);
        setEncryptedApiKey('');
        setDecryptedKey('');
        sessionStorage.removeItem('gemini_api_key_temp');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch mistakes & API key profile from Supabase
  const fetchUserData = async (userId: string) => {
    try {
      // Fetch mistakes table
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
        analysis: m.analysis || undefined
      }));
      setMistakes(mappedMistakes);

      // Fetch profile encrypted key
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('encrypted_api_key')
        .eq('id', userId)
        .maybeSingle();

      if (profileData && !profileError) {
        setEncryptedApiKey(profileData.encrypted_api_key || '');
      }
    } catch (err) {
      console.error('Error loading Supabase user data:', err);
    }
  };

  // Format date helper
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
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
    if (!session?.user) return;

    try {
      const encrypted = await encryptApiKey(apiKeyInput.trim(), pinInput);
      
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: session.user.id,
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
    setStatusMessage(null);
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
      setStatusMessage({ text: err.message || 'AI 분석 실행 중 오류가 발생했습니다.', isError: true });
      alert(err.message || 'AI 분석 실행 중 오류가 발생했습니다.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Handle camera capture, upload to Storage, and insert database record
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
          analysis: null
        })
        .select()
        .single();

      if (insertError) throw insertError;

      const newEntry: MistakeEntry = {
        id: dbEntry.id,
        title: dbEntry.title,
        imageUrl: dbEntry.image_url,
        date: dbEntry.date,
        analysis: undefined
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setCurrentUser('');
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
      <header className="safe-top flex-none border-b border-slate-800 bg-slate-900/90 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-emerald-400 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
            ∑
          </div>
          <h1 className="text-lg font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
            AI 수학 오답노트
          </h1>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-[10px] text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-full border border-slate-700 font-bold max-w-[80px] truncate">
            👤 {currentUser}
          </span>
          <button 
            onClick={handleLogout}
            className="text-[10px] text-red-400 hover:text-red-300 font-bold bg-red-950/20 px-2.5 py-0.5 rounded-full border border-red-900/30 transition-colors"
          >
            로그아웃
          </button>
          
          {import.meta.env.VITE_GEMINI_API_KEY ? (
            <span className="flex items-center space-x-1 text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full text-[10px] border border-indigo-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
              <span>Env Key 활성화됨</span>
            </span>
          ) : decryptedKey ? (
            <span className="flex items-center space-x-1 text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full text-[10px] border border-emerald-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              <span>보안 잠금해제됨</span>
            </span>
          ) : encryptedApiKey ? (
            <span className="flex items-center space-x-1 text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full text-[10px] border border-amber-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
              <span>보안 암호화됨</span>
            </span>
          ) : (
            <span className="text-[10px] text-slate-500 border border-slate-800 px-2 py-0.5 rounded-full">
              API Key 미등록
            </span>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto px-4 py-6 pb-24">
        
        {activeTab === 'notes' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">나의 오답노트</h2>
                <p className="text-xs text-slate-400 mt-1">총 {mistakes.length}개의 분석된 취약점이 있습니다.</p>
              </div>
              <button 
                onClick={() => setActiveTab('camera')}
                className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white transition-all shadow-md shadow-indigo-600/20"
              >
                + 새 오답 추가
              </button>
            </div>

            {/* List of Mistakes */}
            {mistakes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed border-slate-800 rounded-2xl p-6 bg-slate-900/20 animate-scale-up">
                <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center text-2xl mb-4 text-slate-500">
                  📓
                </div>
                <p className="text-slate-300 font-medium">아직 등록된 오답이 없습니다</p>
                <p className="text-xs text-slate-500 mt-1 max-w-xs leading-relaxed">
                  아래 카메라 버튼을 눌러 수학 문제를 촬영하고 AI의 맞춤 분석을 받아보세요.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {mistakes.map((entry) => (
                  <div 
                    key={entry.id}
                    onClick={() => setSelectedEntry(entry)}
                    className="group bg-slate-900/50 hover:bg-slate-900 border border-slate-800 hover:border-indigo-500/40 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 transform active:scale-[0.98]"
                  >
                    <div className="aspect-[16/9] w-full bg-slate-950 relative overflow-hidden flex items-center justify-center">
                      <img 
                        src={entry.imageUrl} 
                        alt={entry.title}
                        className="w-full h-full object-cover opacity-80 group-hover:scale-105 transition-transform duration-500" 
                      />
                      <button
                        onClick={(e) => handleDeleteMistake(entry.id, e)}
                        className="absolute top-2 left-2 w-7 h-7 rounded-full bg-black/60 hover:bg-red-600 flex items-center justify-center text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        🗑️
                      </button>
                      <div className="absolute top-2 right-2 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-950/80 backdrop-blur-sm border border-slate-800 text-slate-300">
                        {formatDate(entry.date)}
                      </div>
                    </div>
                    <div className="p-4">
                      <h3 className="font-bold text-white line-clamp-1 group-hover:text-indigo-400 transition-colors">
                        {entry.title}
                      </h3>
                      {entry.analysis ? (
                        <p className="text-xs text-slate-400 mt-1.5 line-clamp-2 leading-relaxed">
                          🔍 {entry.analysis.mistakeDetail}
                        </p>
                      ) : (
                        <p className="text-xs text-amber-400 mt-1.5 font-medium flex items-center">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mr-1.5 animate-pulse"></span>
                          AI 분석 미완료 (스캔됨)
                        </p>
                      )}
                      <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-800/60">
                        <span className="text-[10px] text-slate-500">
                          {entry.analysis ? 'AI 피드백 완료' : '분석 대기 중'}
                        </span>
                        <span className="text-xs text-indigo-400 font-semibold group-hover:translate-x-1 transition-transform inline-flex items-center">
                          {entry.analysis ? '상세보기' : '분석하기'} &rarr;
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'camera' && (
          <CameraScanner 
            onCapture={handleCameraCapture}
            onClose={() => setActiveTab('notes')}
          />
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
                  <label className="text-xs text-slate-400 font-medium">Gemini API Key</label>
                  <input 
                    type="password" 
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="AIzaSy..." 
                    className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm text-white placeholder-slate-600 outline-none transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 font-medium">앱 복호화 PIN (4~6자리 숫자)</label>
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
              <div className="divide-y divide-slate-800/60 text-xs">
                <div className="flex justify-between py-2.5">
                  <span className="text-slate-400">버전</span>
                  <span className="text-slate-200 font-medium">v1.1.0 (PWA + Supabase)</span>
                </div>
                <div className="flex justify-between py-2.5">
                  <span className="text-slate-400">인증 및 데이터베이스</span>
                  <span className="text-emerald-400 font-medium">Supabase Cloud</span>
                </div>
                <div className="flex justify-between py-2.5">
                  <span className="text-slate-400">보안 수준</span>
                  <span className="text-emerald-400 font-medium">AES-GCM 암호화</span>
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
                      className="px-2 py-1 bg-red-950 border border-red-800 text-red-400 rounded-lg text-[10px]"
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
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4">
          <div className="w-full max-w-xl bg-slate-900 border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-slide-up">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/80 sticky top-0">
              <div className="pr-4 flex-1">
                <span className="text-[10px] text-slate-500 font-bold block uppercase tracking-wider">{formatDate(selectedEntry.date)}</span>
                <h3 className="font-bold text-white text-base line-clamp-1">{selectedEntry.title}</h3>
              </div>
              <button 
                onClick={() => setSelectedEntry(null)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 active:scale-90 flex items-center justify-center text-slate-400 text-lg transition-all flex-none"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Problem Image Preview */}
              <div className="aspect-[16/9] w-full rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center relative">
                <img src={selectedEntry.imageUrl} alt={selectedEntry.title} className="w-full h-full object-cover" />
                <button
                  onClick={(e) => handleDeleteMistake(selectedEntry.id, e)}
                  className="absolute bottom-3 right-3 px-3 py-1.5 rounded-xl bg-red-600/90 hover:bg-red-600 text-white text-xs font-semibold shadow-lg backdrop-blur-sm transition-all"
                >
                  기록 삭제
                </button>
              </div>

              {isAnalyzing ? (
                <div className="py-12 flex flex-col items-center justify-center space-y-4">
                  <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-white">처리 중...</p>
                    <p className="text-xs text-slate-400 mt-1">클라우드 미디어 처리 또는 AI 클리닉 진단을 작동하고 있습니다.</p>
                  </div>
                </div>
              ) : selectedEntry.analysis ? (
                <div className="space-y-5 animate-scale-up">
                  {/* Item 1 */}
                  <div className="space-y-1.5">
                    <h4 className="text-sm font-extrabold text-indigo-400 flex items-center">
                      <span className="mr-1.5">✓</span> [문제 풀이 과정]
                    </h4>
                    <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800/60">
                      <LaTeXRenderer text={selectedEntry.analysis.solvingProcess} className="text-sm md:text-base" />
                    </div>
                  </div>
                  {/* Item 2 */}
                  <div className="space-y-1.5">
                    <h4 className="text-sm font-extrabold text-amber-400 flex items-center">
                      <span className="mr-1.5">⚠️</span> [실수한 지점 상세 분석]
                    </h4>
                    <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800/60">
                      <LaTeXRenderer text={selectedEntry.analysis.mistakeDetail} className="text-sm md:text-base" />
                    </div>
                  </div>
                  {/* Item 3 */}
                  <div className="space-y-1.5">
                    <h4 className="text-sm font-extrabold text-red-400 flex items-center">
                      <span className="mr-1.5">🎯</span> [근본적인 틀린 이유]
                    </h4>
                    <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800/60">
                      <LaTeXRenderer text={selectedEntry.analysis.rootCause} className="text-sm md:text-base" />
                    </div>
                  </div>
                  {/* Item 4 */}
                  <div className="space-y-1.5">
                    <h4 className="text-sm font-extrabold text-emerald-400 flex items-center">
                      <span className="mr-1.5">🛡️</span> [향후 재발 방지 대책]
                    </h4>
                    <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800/60">
                      <LaTeXRenderer text={selectedEntry.analysis.actionPlan} className="text-sm md:text-base" />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-8 bg-slate-950/60 rounded-2xl border border-slate-800 p-6 text-center space-y-4">
                  <div className="text-3xl">🤖</div>
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-white">AI 수학 클리닉 진단</p>
                    <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
                      아직 오답 원인이 분석되지 않았습니다. 등록한 API Key를 통해 4가지 핵심 원인 진단을 진행합니다.
                    </p>
                  </div>
                  <button 
                    onClick={() => handleStartAnalysis(selectedEntry)}
                    className="px-6 py-2.5 rounded-full bg-gradient-to-r from-indigo-600 to-indigo-500 active:scale-95 transition-all text-xs font-bold text-white shadow-md shadow-indigo-600/20"
                  >
                    AI 분석 시작하기
                  </button>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800/80 bg-slate-950/60 flex space-x-3">
              <button 
                onClick={() => setSelectedEntry(null)}
                className="flex-1 py-3 rounded-xl border border-slate-800 hover:border-slate-700 active:scale-95 transition-all text-xs font-semibold text-slate-300"
              >
                닫기
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Unlock API Key PIN Modal */}
      {showUnlockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <form 
            onSubmit={handleUnlockKey}
            className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-2xl animate-scale-up"
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
                className="w-full px-4 py-3 text-center tracking-widest text-lg rounded-xl bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-white placeholder-slate-600 outline-none transition-all"
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

      {/* Floating Glassmorphic Bottom Navigation Bar */}
      <nav className="fixed bottom-4 left-4 right-4 z-40 h-16 rounded-2xl border border-slate-800/80 bg-slate-900/75 backdrop-blur-lg flex items-center justify-around px-4 shadow-xl shadow-black/40">
        
        {/* Tab 1: Notes List */}
        <button 
          onClick={() => setActiveTab('notes')}
          className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all ${activeTab === 'notes' ? 'text-indigo-400 scale-105' : 'text-slate-500 hover:text-slate-300'}`}
        >
          <span className="text-lg">📓</span>
          <span className="text-[10px] font-bold mt-0.5">오답노트</span>
        </button>

        {/* Tab 2: Floating Camera Trigger */}
        <button 
          onClick={() => setActiveTab('camera')}
          className={`flex items-center justify-center w-14 h-14 rounded-full transition-all -translate-y-4 shadow-lg ${activeTab === 'camera' ? 'bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white scale-110 shadow-indigo-600/40 ring-4 ring-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-750 shadow-black/50 ring-4 ring-slate-950 hover:scale-105'}`}
        >
          <span className="text-xl">📷</span>
        </button>

        {/* Tab 3: Settings */}
        <button 
          onClick={() => setActiveTab('settings')}
          className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all ${activeTab === 'settings' ? 'text-indigo-400 scale-105' : 'text-slate-500 hover:text-slate-300'}`}
        >
          <span className="text-lg">⚙️</span>
          <span className="text-[10px] font-bold mt-0.5">설정</span>
        </button>

      </nav>

    </div>
  );
}

export default App;
