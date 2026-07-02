import React, { useState } from 'react';

interface AuthScreenProps {
  onLogin: (username: string) => void;
}

interface UserRecord {
  username: string;
  passwordHash: string;
}

// Native SHA-256 Hashing Helper for secure client-side password storage
const hashPassword = async (password: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
};

export const AuthScreen: React.FC<AuthScreenProps> = ({ onLogin }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Load existing users from LocalStorage
  const getUsers = (): UserRecord[] => {
    try {
      const data = localStorage.getItem('ai_mistakes_users');
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  };

  // Save users array to LocalStorage
  const saveUsers = (users: UserRecord[]) => {
    localStorage.setItem('ai_mistakes_users', JSON.stringify(users));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    const cleanUsername = username.trim().toLowerCase();
    if (!cleanUsername || cleanUsername.length < 3) {
      setError('아이디는 최소 3글자 이상이어야 합니다.');
      return;
    }
    if (!password || password.length < 4) {
      setError('비밀번호는 최소 4글자 이상이어야 합니다.');
      return;
    }

    setLoading(true);

    try {
      const users = getUsers();
      const passHash = await hashPassword(password);

      if (isSignUp) {
        // Sign Up Flow
        if (password !== confirmPassword) {
          setError('비밀번호가 서로 일치하지 않습니다.');
          setLoading(false);
          return;
        }

        // Check Duplication
        const userExists = users.some((u) => u.username === cleanUsername);
        if (userExists) {
          setError('이미 존재하는 아이디입니다.');
          setLoading(false);
          return;
        }

        // Create new user
        const newUser: UserRecord = {
          username: cleanUsername,
          passwordHash: passHash
        };
        saveUsers([...users, newUser]);
        
        // Log in immediately
        onLogin(cleanUsername);
      } else {
        // Login Flow
        const user = users.find((u) => u.username === cleanUsername);
        if (!user || user.passwordHash !== passHash) {
          setError('아이디 또는 비밀번호가 잘못되었습니다.');
          setLoading(false);
          return;
        }

        // Login success
        onLogin(cleanUsername);
      }
    } catch (err) {
      console.error(err);
      setError('인증 프로세스 도중 기술적 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex items-center justify-center p-6 bg-slate-950">
      <div className="w-full max-w-md bg-slate-900/60 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl backdrop-blur-md animate-scale-up">
        
        {/* App Logo */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-indigo-600 to-emerald-400 flex items-center justify-center font-bold text-2xl text-white shadow-xl shadow-indigo-500/20">
            ∑
          </div>
          <h2 className="text-2xl font-extrabold text-white bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            AI 수학 오답노트
          </h2>
          <p className="text-xs text-slate-400">
            {isSignUp ? '간편 회원가입으로 나만의 분석 노트를 시작하세요' : '로그인하여 분석 기록을 확인하세요'}
          </p>
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs text-slate-400 font-bold block">아이디</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
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

          {error && (
            <div className="p-3.5 rounded-xl text-xs bg-red-500/10 text-red-400 border border-red-500/20 text-center">
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 mt-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none transition-all text-sm font-bold text-white shadow-lg shadow-indigo-600/20"
          >
            {loading ? '인증 진행 중...' : isSignUp ? '회원가입 및 시작' : '로그인'}
          </button>
        </form>

        {/* View Switcher Toggle */}
        <div className="text-center pt-2">
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError(null);
              setUsername('');
              setPassword('');
              setConfirmPassword('');
            }}
            className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
          >
            {isSignUp ? '이미 계정이 있으신가요? 로그인하기' : '처음이신가요? 간편 회원가입하기'}
          </button>
        </div>

      </div>
    </div>
  );
};
