import { useEffect, useRef, useState } from 'react';
import { supabase } from '../services/supabase';
import { migrateScaffoldingStep } from '../features/mistakes/scaffoldingImages';

export function ScaffoldingImageMigration() {
  const stop = useRef(false);
  const active = useRef(false);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState('기존 이미지를 3건씩 확인하며 옮깁니다. 중단 후 다시 실행할 수 있습니다.');
  useEffect(() => () => { stop.current = true; }, []);
  const run = async () => {
    if (active.current) return;
    active.current = true; stop.current = false; setRunning(true);
    let checked = 0, migrated = 0, cursor = '';
    try {
      // UI 권한뿐 아니라 서버의 관리자 판정도 확인한다.
      const { data: admin, error: adminError } = await supabase.rpc('is_current_user_admin');
      if (adminError || !admin) throw new Error('관리자 계정으로 로그인해 주세요.');
      while (!stop.current) {
        let query = supabase.from('mistake_scaffoldings').select('id').order('id').limit(3);
        if (cursor) query = query.gt('id', cursor);
        const { data: ids, error } = await query;
        if (error) throw error;
        if (!ids?.length) break;
        for (const { id } of ids) {
          if (stop.current) break;
          const result = await migrateScaffoldingStep(supabase, id);
          checked++; if (result === 'migrated') migrated++;
          cursor = id;
          setNotice(`확인 ${checked}건 · 이동 ${migrated}건`);
          await new Promise(resolve => setTimeout(resolve, 300));
        }
        await new Promise(resolve => setTimeout(resolve, 700));
      }
      setNotice(`${stop.current ? '중단' : '완료'}: 확인 ${checked}건 · 이동 ${migrated}건. 다시 실행하면 이미 옮긴 이미지는 건너뜁니다.`);
    } catch (error) {
      setNotice(`확인 ${checked}건 · 이동 ${migrated}건. 오류로 중단했습니다: ${error instanceof Error ? error.message : '저장소와 권한을 확인해 주세요.'} 다시 실행할 수 있습니다.`);
    } finally { active.current = false; setRunning(false); }
  };
  return <div className="rounded-xl border border-slate-700 p-4 space-y-2">
    <button type="button" disabled={running} onClick={() => void run()} className="px-3 py-2 rounded bg-purple-700 disabled:opacity-50">스캐폴딩 이미지 저장공간으로 옮기기</button>
    {running && <button type="button" onClick={() => { stop.current = true; }} className="ml-3 px-3 py-2 rounded bg-slate-700">중단</button>}
    <p role="status" aria-live="polite" className="text-sm text-slate-300">{notice}</p>
  </div>;
}
