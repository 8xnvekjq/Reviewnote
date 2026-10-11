import { useCallback, useEffect, useRef, useState } from 'react';
import { equipPixelHand, fetchPixelBag, sellPixelBag } from '../../../utils/pixelBag';
import type { Bag, BagItemKind, HandState } from '../logic/bag';

/** 가방 상태. 잡거나 수확·출품하면 refresh, 광장 상점에서 sell. 판매로 포인트가 바뀌면 onPointsChanged.
 *  equip: 손 칸(낚싯대·잠자리채·맨손) 바꾸기 — 바뀌면 onHandChanged(낚싯대 표시 등 다시 읽기). */
export function useBag(userId: string, onPointsChanged?: () => void, onHandChanged?: (hand: HandState) => void) {
  const [bag, setBag] = useState<Bag | null>(null);
  const [busy, setBusy] = useState(false);
  const pointsChanged = useRef(onPointsChanged); pointsChanged.current = onPointsChanged;
  const handChanged = useRef(onHandChanged); handChanged.current = onHandChanged;
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const epoch = ++generation.current;
    const next = await fetchPixelBag();
    if (next && epoch === generation.current) setBag(next);
  }, []);
  useEffect(() => { setBag(null); void refresh(); }, [userId, refresh]);
  const sell = useCallback(async (items: { kind: BagItemKind; ref: string; qty: number }[] | null) => {
    setBusy(true);
    try {
      const result = await sellPixelBag(items);
      generation.current++;
      // 판매 응답의 가방에는 손 칸이 없다 — 지금 손은 그대로 둔다.
      const sold = result.bag;
      if (sold) setBag(current => current ? { ...sold, hand: current.hand, rod: current.rod, netOwned: current.netOwned, rods: current.rods } : sold); else void refresh();
      if (result.ok && result.awarded > 0) pointsChanged.current?.();
      return result;
    } finally { setBusy(false); }
  }, [refresh]);
  const equip = useCallback(async (itemId: string | null) => {
    setBusy(true);
    try {
      const result = await equipPixelHand(itemId);
      if (result.ok) {
        generation.current++;
        const { ok: _ok, ...hand } = result;
        setBag(current => current ? { ...current, ...hand } : current);
        handChanged.current?.(hand);
      }
      return result;
    } finally { setBusy(false); }
  }, []);
  return { bag, busy, refresh, sell, equip };
}
export type BagState = ReturnType<typeof useBag>;
