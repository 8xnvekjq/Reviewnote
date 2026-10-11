import { useEffect, useState } from 'react';
import { KnowledgeShardIcon } from './KnowledgeShardIcon';
import { formatShards } from '../utils/knowledgeShards';
import { checkShardGain, SHARD_GAIN_EVENT, type ShardGain } from '../utils/knowledgeShardFeed';

/** 복습으로 지식의 조각을 받으면 화면 아래에 잠깐 "+0.30" 을 띄운다. 로그인한 화면에 한 번만 둔다. */
export function ShardGainToast() {
  const [gain, setGain] = useState<ShardGain | null>(null);
  useEffect(() => {
    void checkShardGain(true); // 이 계정의 기준 잔액
    const onGain = (event: Event) => setGain((event as CustomEvent<ShardGain>).detail);
    window.addEventListener(SHARD_GAIN_EVENT, onGain);
    return () => window.removeEventListener(SHARD_GAIN_EVENT, onGain);
  }, []);
  useEffect(() => {
    if (!gain) return;
    const timer = window.setTimeout(() => setGain(null), 2800);
    return () => window.clearTimeout(timer);
  }, [gain]);
  if (!gain) return null;
  return <div className="rn-shard-toast" role="status" aria-live="polite" data-testid="shard-gain-toast">
    <KnowledgeShardIcon size={22} />
    <span><strong>+{formatShards(gain.gained)}</strong> 지식의 조각</span>
    <small>보유 {formatShards(gain.balance)} · Pixel World 상점에서 써요</small>
  </div>;
}
