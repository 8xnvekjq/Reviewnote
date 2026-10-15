import type { HelpArrival } from '../api';

// 로그인할 때 '내 질문에 친구 풀이가 도착했어요' 알림(선생님 힌트 도착 알림과 같은 모양).
// [서로 도와주기에서 보기]는 서로 도와주기 탭의 '내가 도움 요청한 문제'로 데려간다.
export function HelpArrivalModal({ arrivals, onGoToHelp, onClose }: {
  arrivals: HelpArrival[]; onGoToHelp: () => void; onClose: () => void;
}) {
  const total = arrivals.reduce((sum, item) => sum + item.count, 0);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in" role="dialog" aria-modal="true" aria-label="친구 풀이 도착" data-testid="help-arrival-modal">
      <div className="w-full max-w-sm bg-slate-900 border border-indigo-500/40 rounded-3xl p-5 shadow-2xl space-y-3.5 max-h-[85vh] overflow-y-auto no-scrollbar animate-scale-up">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2.5">
            <span className="text-2xl animate-bounce">🙋</span>
            <div>
              <h3 className="text-sm font-black text-white">내 질문에 친구 풀이가 도착했어요!</h3>
              <p className="text-[10px] text-indigo-300 font-bold">새 풀이 {total}개</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white text-xs font-bold px-2 py-1 rounded-lg" aria-label="닫기">✕</button>
        </div>
        <ul className="space-y-2">
          {arrivals.slice(0, 3).map(item => (
            <li key={item.request_id} className="flex items-center gap-3 p-2.5 rounded-2xl bg-slate-950 border border-slate-800">
              {item.image_url && <img src={item.image_url} alt="" className="h-12 w-12 flex-none rounded-lg bg-white object-contain" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-extrabold text-slate-200">{item.title || '내 오답 문제'}</p>
                <p className="text-[10.5px] text-indigo-300">풀이 {item.count}개 도착</p>
              </div>
            </li>
          ))}
          {arrivals.length > 3 && <li className="text-center text-[10.5px] text-slate-400">외 {arrivals.length - 3}문제</li>}
        </ul>
        <p className="text-[11px] text-slate-400">풀이를 보고 ‘도움 됐어요 / 이해 못 했어요’를 남기면 +3P예요.</p>
        <button type="button" onClick={onGoToHelp} className="w-full rounded-2xl bg-indigo-600 py-3 text-sm font-black text-white active:scale-[.98]">서로 도와주기에서 보기</button>
      </div>
    </div>
  );
}
