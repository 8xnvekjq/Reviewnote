import { useEffect, useRef, useState } from 'react';
import type { RewardsAdapter, WeeklyReward } from '../logic/gamePoints';
import { Window } from './GamePanels';
import './weeklyRewards.css';

// 한 번의 입장에서는 재렌더나 효과 재실행에도 조회·확인을 한 번만 한다.
export function createWeeklyRewardsEntry(adapter: RewardsAdapter) {
  let pending: Promise<WeeklyReward[]> | undefined;
  let acknowledged = false;
  return {
    pending: () => {
      pending ??= Promise.resolve().then(() => adapter.pending()).catch(() => []);
      return pending.then(items => acknowledged ? [] : items);
    },
    ack(ids: readonly string[]) {
      if (acknowledged) return;
      acknowledged = true;
      void Promise.resolve().then(() => adapter.ack(ids)).catch(() => { /* 다음 입장에서 다시 확인할 수 있어요. */ });
    },
  };
}

export function WeeklyRewards({ ready, rewards }: { ready: boolean; rewards?: RewardsAdapter }) {
  const entry = useRef<ReturnType<typeof createWeeklyRewardsEntry> | null>(null);
  const [items, setItems] = useState<WeeklyReward[]>([]);
  useEffect(() => {
    if (!ready || !rewards) return;
    entry.current ??= createWeeklyRewardsEntry(rewards);
    let active = true;
    void entry.current.pending().then(value => { if (active) setItems(value); });
    return () => { active = false; };
  }, [ready, rewards]);
  if (!items.length) return null;
  const close = () => {
    entry.current?.ack(items.map(item => item.id));
    setItems([]);
  };
  return <Window title="주간 보상이 도착했어요!" small onClose={close}>
    <div className="pwp-panel-content pwp-weekly-rewards" data-testid="weekly-rewards">
      <div className="pwp-weekly-celebration" aria-hidden="true">✦ 🏆 ✦</div>
      <p>지난주에도 즐겁게 함께했어요!</p>
      <ul>{items.map(item => <li key={item.id}><span>{item.label}</span><strong>+{item.points} P</strong></li>)}</ul>
      <p className="pwp-weekly-total">총 <strong>+{items.reduce((sum, item) => sum + item.points, 0)} P</strong></p>
      <button type="button" onClick={close}>확인</button>
    </div>
  </Window>;
}
