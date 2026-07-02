import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import logoImg from '../assets/logo.jpg';

interface AuthScreenProps {
  onLogin: (username: string) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onLogin }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Load remembered email on mount
  useEffect(() => {
    const savedEmail = localStorage.getItem('reviewnote_remembered_email');
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError('이메일 주소를 입력해 주세요.');
      return;
    }
    if (!password || password.length < 6) {
      setError('비밀번호는 최소 6글자 이상이어야 합니다.');
      return;
    }

    setLoading(true);

    try {
      if (isSignUp) {
        // Sign Up Flow
        if (password !== confirmPassword) {
          setError('비밀번호가 서로 일치하지 않습니다.');
          setLoading(false);
          return;
        }

        const { data, error: signUpError } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              display_name: cleanEmail.split('@')[0]
            }
          }
        });

        if (signUpError) {
          throw signUpError;
        }

        // If email confirmation is enabled, session will be null and user needs to confirm
        if (data.user && !data.session) {
          setSuccessMessage(
            '인증 이메일이 발송되었습니다! 입력하신 이메일의 편지함을 확인해 인증 링크를 클릭하신 뒤 로그인해 주세요.'
          );
          setIsSignUp(false); // Switch to login screen
          setPassword('');
          setConfirmPassword('');
        } else {
          // If confirmation is disabled, log in directly
          if (rememberMe) {
            localStorage.setItem('reviewnote_remembered_email', cleanEmail);
          } else {
            localStorage.removeItem('reviewnote_remembered_email');
          }
          onLogin(cleanEmail.split('@')[0]);
        }
      } else {
        // Login Flow
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password
        });

        if (signInError) {
          if (signInError.message.includes('Invalid login credentials')) {
            throw new Error('이메일 또는 비밀번호가 일치하지 않습니다.');
          }
          if (signInError.message.includes('Email not confirmed')) {
            throw new Error('이메일 인증이 아직 완료되지 않았습니다. 이메일 편지함을 확인해 주세요.');
          }
          throw signInError;
        }

        // Save or remove email to/from localStorage
        if (rememberMe) {
          localStorage.setItem('reviewnote_remembered_email', cleanEmail);
        } else {
          localStorage.removeItem('reviewnote_remembered_email');
        }

        onLogin(cleanEmail.split('@')[0]);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || '인증 과정에서 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex items-center justify-center p-6 bg-slate-950">
      <div className="w-full max-w-md bg-slate-900/60 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl backdrop-blur-md animate-scale-up">
        
        {/* App Logo */}
        <div className="text-center space-y-2">
          <div className="flex flex-col items-center space-y-3">
            <img 
              src={logoImg} 
              alt="더쿠수학 로고" 
              className="h-16 w-auto object-contain rounded-2xl shadow-lg border border-slate-800/80" 
            />
            <h2 className="text-xl font-extrabold text-white bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
              AI 수학 오답노트
            </h2>
          </div>
          <p className="text-xs text-slate-400">
            {isSignUp 
              ? '이메일 가입으로 나만의 클라우드 분석 노트를 시작하세요' 
              : '로그인하여 클라우드에 백업된 분석 기록을 확인하세요'}
          </p>
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs text-slate-400 font-bold block">이메일 주소</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@email.com"
              className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm text-white placeholder-slate-600 outline-none transition-all"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-slate-400 font-bold block">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm text-white placeholder-slate-600 outline-none transition-all"
              required
            />
          </div>

          {isSignUp && (
            <div className="space-y-1">
              <label className="text-xs text-slate-400 font-bold block">비밀번호 확인</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm text-white placeholder-slate-600 outline-none transition-all"
                required
              />
            </div>
          )}

          {/* Remember Email Checkbox */}
          {!isSignUp && (
            <div className="flex items-center space-x-2 py-1">
              <input
                type="checkbox"
                id="rememberMe"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-slate-800 bg-slate-950 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0 outline-none accent-indigo-500 cursor-pointer"
              />
              <label htmlFor="rememberMe" className="text-xs text-slate-400 cursor-pointer select-none">
                이메일 기억하기
              </label>
            </div>
          )}

          {error && (
            <div className="p-3.5 rounded-xl text-xs bg-red-500/10 text-red-400 border border-red-500/20 text-center leading-relaxed">
              ⚠️ {error}
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 rounded-xl text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-center leading-relaxed font-semibold">
              ✉️ {successMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 mt-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none transition-all text-sm font-bold text-white shadow-lg shadow-indigo-600/20"
          >
            {loading ? '인증 진행 중...' : isSignUp ? '회원가입 및 인증 메일 전송' : '로그인'}
          </button>
        </form>

        {/* View Switcher Toggle */}
        <div className="text-center pt-2">
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError(null);
              setSuccessMessage(null);
              setPassword('');
              setConfirmPassword('');
            }}
            className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
          >
            {isSignUp ? '이미 계정이 있으신가요? 로그인하기' : '처음이신가요? 이메일 회원가입하기'}
          </button>
        </div>

      </div>
    </div>
  );
};
