import type { HelpFeedbackArrival } from '../api';
import { helpRewardText } from './presentation';

// 로그인할 때 '내 풀이에 피드백이 왔어요' 알림(도와준 학생용, 친구 풀이 도착 알림과 같은 모양).
// [서로 도와주기에서 보기]는 서로 도와주기 탭('내가 보낸 풀이')으로 데려간다.
export function HelpFeedbackModal({ feedbacks, onGoToHelp, onClose }: {
  feedbacks: HelpFeedbackArrival[]; onGoToHelp: () => void; onClose: () => void;
}) {
  const likes = feedbacks.filter(item => item.feedback === 'like').length;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in" role="dialog" aria-modal="true" aria-label="풀이 피드백 도착" data-testid="help-feedback-modal">
      <div className="w-full max-w-sm bg-slate-900 border border-emerald-500/40 rounded-3xl p-5 shadow-2xl space-y-3.5 max-h-[85vh] overflow-y-auto no-scrollbar animate-scale-up">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2.5">
            <span className="text-2xl animate-bounce">{likes ? '👍' : '🤔'}</span>
            <div>
              <h3 className="text-sm font-black text-white">{likes ? '내 풀이가 친구에게 도움이 됐어요!' : '내 풀이에 피드백이 왔어요'}</h3>
              <p className="text-[10px] text-emerald-300 font-bold">피드백 {feedbacks.length}개{likes ? ` · 👍 ${likes}개` : ''}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white text-xs font-bold px-2 py-1 rounded-lg" aria-label="닫기">✕</button>
        </div>
        <ul className="space-y-2">
          {feedbacks.slice(0, 3).map(item => (
            <li key={item.solution_id} className="flex items-center gap-3 p-2.5 rounded-2xl bg-slate-950 border border-slate-800">
              {item.image_url && <img src={item.image_url} alt="" className="h-12 w-12 flex-none rounded-lg bg-white object-contain" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-extrabold text-slate-200">{item.feedback === 'like' ? '👍 도움 됐어요' : '🤔 이해 못 했어요'}</p>
                <p className="text-[10.5px] text-emerald-300">{helpRewardText(item.feedback, item.reward, Number(item.shards) || 0)}</p>
              </div>
            </li>
          ))}
          {feedbacks.length > 3 && <li className="text-center text-[10.5px] text-slate-400">외 {feedbacks.length - 3}개</li>}
        </ul>
        <button type="button" onClick={onGoToHelp} className="w-full rounded-2xl bg-emerald-600 py-3 text-sm font-black text-white active:scale-[.98]">서로 도와주기에서 보기</button>
      </div>
    </div>
  );
}
