// 복습에서 O를 찍으면 서버 트리거가 지식의 조각을 준다. 저장 직후 잔액을 다시 읽어 늘어난 만큼을
// 알린다(지급 규칙은 서버에만 둔다 — 여기서 미리 계산하면 '칸마다 한 번' 규칙과 어긋날 수 있다).
import { fetchKnowledgeShards } from './knowledgeShards';

export const SHARD_GAIN_EVENT = 'knowledge-shards-gained';
export interface ShardGain { gained: number; balance: number }

let lastBalance: number | null = null;
let chain: Promise<void> = Promise.resolve();

/** 잔액을 다시 읽고, 이전보다 늘었으면 SHARD_GAIN_EVENT를 보낸다. resetBaseline이면(로그인 직후) 기준값만 잡는다. */
export function checkShardGain(resetBaseline = false) {
  chain = chain.then(async () => {
    if (resetBaseline) lastBalance = null;
    const value = await fetchKnowledgeShards();
    if (!value) return;
    const gained = lastBalance == null ? 0 : Math.round((value.balance - lastBalance) * 100) / 100;
    lastBalance = value.balance;
    if (gained > 0) window.dispatchEvent(new CustomEvent<ShardGain>(SHARD_GAIN_EVENT, { detail: { gained, balance: value.balance } }));
  }).catch(() => {});
  return chain;
}
