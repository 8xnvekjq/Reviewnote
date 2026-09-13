import { useEffect, useState } from 'react';
import { equipPixelItem, fetchEquippedAppearance, fetchOwnedPixelItemIds, purchasePixelItem } from '../../utils/pixelShop';
import type { PixelAvatarSlot, PixelItem, PublicAvatarAppearance, PurchasePixelItemResult } from './shop/types';

const EMPTY_APPEARANCE: PublicAvatarAppearance = { top: null, bottom: null, shoes: null, hair: null, eyes: null };

/** Owns the ownership/equip/balance state for the Pixel World shop and talks to Worker A's
 * pixelShop.ts module (src/utils/pixelShop.ts — stubbed until integration). A failed fetch
 * (including the pre-integration stub, which always throws) degrades to "owns nothing yet,
 * default look" — the same state a brand-new student would genuinely see — so the shop UI
 * never crashes when run standalone in this worktree. */
export function usePixelShop(userId: string, initialBalance: number, onBalanceChange?: (balance: number) => void) {
  const [ownedIds, setOwnedIds] = useState<Set<string>>(new Set());
  const [equipped, setEquipped] = useState<PublicAvatarAppearance>(EMPTY_APPEARANCE);
  const [balance, setBalance] = useState(initialBalance);
  const [ready, setReady] = useState(false);

  // Parent (App.tsx) is the source of truth for the point balance shown everywhere else in the
  // app — a fresh value there (e.g. from earned review points) should always win over whatever
  // this hook computed from its own last purchase.
  useEffect(() => { setBalance(initialBalance); }, [initialBalance]);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    Promise.all([
      fetchOwnedPixelItemIds(userId).catch(() => [] as string[]),
      fetchEquippedAppearance(userId).catch(() => EMPTY_APPEARANCE),
    ]).then(([ids, appearance]) => {
      if (cancelled) return;
      setOwnedIds(new Set(ids));
      setEquipped(appearance);
      setReady(true);
    });
    return () => { cancelled = true; };
  }, [userId]);

  async function equip(slot: PixelAvatarSlot, itemId: string | null) {
    setEquipped(previous => ({ ...previous, [slot]: itemId }));
    try {
      const result = await equipPixelItem(slot, itemId);
      if (!result.ok) throw new Error('equip rejected');
    } catch {
      // 서버 반영에 실패해도 로컬 표시는 유지한다 — 다음 장착/구매 액션에서 다시 서버로 보내진다.
    }
  }

  async function purchase(item: PixelItem): Promise<PurchasePixelItemResult> {
    let result: PurchasePixelItemResult;
    try {
      result = await purchasePixelItem(item.itemId);
    } catch {
      return { ok: false, reason: 'unknown', message: '구매를 처리하지 못했어요. 잠시 후 다시 시도해 주세요.' };
    }
    if (!result.ok) return result;
    setOwnedIds(previous => new Set(previous).add(item.itemId));
    setBalance(result.newBalance);
    onBalanceChange?.(result.newBalance);
    // 아바타 아이템은 구매 즉시 장착까지 끝내야 "바로 장착"이 된다 — 가구는 배치할 칸을
    // 직접 골라야 하므로(기존 배치 UX 재사용) 여기서는 장착만 처리하고, 배치 시작은 호출부(패널
    // 전환)에서 이어서 담당한다.
    if (item.category === 'avatar') await equip(item.slot as PixelAvatarSlot, item.assetKey);
    return result;
  }

  return { ownedIds, equipped, balance, ready, equip, purchase };
}
