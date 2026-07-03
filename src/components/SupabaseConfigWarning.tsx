import React from 'react';

export const SupabaseConfigWarning: React.FC = () => {
  return (
    <div className="h-full flex items-center justify-center p-6 bg-slate-950 text-slate-100 text-center">
      <div className="max-w-md w-full p-8 bg-slate-900/60 border border-slate-800 rounded-3xl space-y-6 shadow-2xl backdrop-blur-md animate-scale-up">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-3xl">
          ⚠️
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-black text-white">Supabase 설정 누락</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            애플리케이션을 구동하기 위한 Supabase 연동 정보가 로컬 환경 파일에 설정되지 않았습니다.
          </p>
        </div>
        <div className="space-y-3 pt-2 text-left">
          <p className="text-xs font-bold text-slate-300">해결 방법:</p>
          <ol className="text-[11px] text-slate-400 space-y-2 list-decimal list-inside leading-relaxed bg-slate-950 p-4 rounded-xl border border-slate-800">
            <li>프로젝트 루트에 <code className="bg-slate-900 px-1 py-0.5 rounded text-white font-mono">.env</code> 파일을 생성합니다.</li>
            <li>아래와 같이 발급받은 Supabase URL과 Key를 작성합니다.</li>
          </ol>
          <div className="bg-slate-950 p-4 rounded-xl text-left font-mono text-[10px] text-indigo-400 border border-slate-850 select-text leading-normal">
            VITE_SUPABASE_URL=https://wcvkmdvrowljypueucwx.supabase.co<br />
            VITE_SUPABASE_ANON_KEY=sb_publishable_BtAepfY-CiPuAsOSxJ_Y8w_ZTNZ7UWI
          </div>
        </div>
      </div>
    </div>
  );
};
