import { useEffect, useState } from 'react';
import { equipPixelItem, fetchEquippedAppearance, fetchOwnedPixelItemIds, fetchPixelCatalog, purchasePixelItem } from '../../utils/pixelShop';
import { PIXEL_CATALOG } from './shop/catalog';
import type { PixelAvatarSlot, PixelItem, PublicAvatarAppearance, PurchasePixelItemResult } from './shop/types';

const EMPTY_APPEARANCE: PublicAvatarAppearance = { top: null, bottom: null, shoes: null, hair: null, eyes: null };

export type PurchaseOutcome = PurchasePixelItemResult & { equipFailed?: boolean };

/** Owns the ownership/equip/balance state for the Pixel World shop, backed by the real
 * src/utils/pixelShop.ts (Worker A's economy RPCs) now that integration is complete. */
export function usePixelShop(userId: string, initialBalance: number, onBalanceChange?: (balance: number) => void) {
  const [ownedIds, setOwnedIds] = useState<Set<string>>(new Set());
  const [equipped, setEquipped] = useState<PublicAvatarAppearance>(EMPTY_APPEARANCE);
  // 컴파일된 PIXEL_CATALOG를 초기값으로 즉시 보여주고(로딩 깜빡임 없음), 서버가 응답하면 그 값으로
  // 교체한다 — 화면이 실제로 참조하는 가격/카탈로그가 서버와 어긋날 수 있다는 지적을 반영: 가격이
  // 나중에 바뀌면 이 fetch가 그 변경을 반영한다(구매 자체의 안전성은 항상 RPC의 서버 조회가
  // 보장하므로, 여기 실패해도 화면이 정적 카탈로그로 계속 동작하는 정도의 영향만 있다).
  const [catalog, setCatalog] = useState<PixelItem[]>(PIXEL_CATALOG as unknown as PixelItem[]);
  const [balance, setBalance] = useState(initialBalance);
  const [ready, setReady] = useState(false);
  // 진짜 "새 계정이라 아무것도 없음"과 "불러오다 실패함"을 구분한다 — 구분 안 하면 네트워크
  // 오류가 조용히 "아직 아무것도 안 산 상태"로 보여서, 이미 산 아이템이 순간적으로 사라진 것처럼
  // 보이거나(실제로는 조회 실패일 뿐) 재시도할 방법이 없었다.
  const [loadError, setLoadError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  // Parent (App.tsx) is the source of truth for the point balance shown everywhere else in the
  // app — a fresh value there (e.g. from earned review points) should always win over whatever
  // this hook computed from its own last purchase.
  useEffect(() => { setBalance(initialBalance); }, [initialBalance]);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setLoadError(false);
    Promise.all([fetchOwnedPixelItemIds(userId), fetchEquippedAppearance(userId)])
      .then(([ids, appearance]) => {
        if (cancelled) return;
        setOwnedIds(new Set(ids));
        setEquipped(appearance);
        setReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setReady(true);
        setLoadError(true);
      });
    // 카탈로그는 별도 요청 — 실패해도 위 보유/장착 조회와 무관하게 정적 폴백으로 계속 동작하면
    // 되므로 Promise.all에 묶어서 전체를 실패시키지 않는다.
    fetchPixelCatalog().then(rows => { if (!cancelled && rows.length > 0) setCatalog(rows); }).catch(() => {});
    return () => { cancelled = true; };
  }, [userId, reloadToken]);

  const reload = () => setReloadToken(token => token + 1);

  // itemId(카탈로그 키, 예: 'top_sage')는 소유권 확인용으로 서버에 보내고, assetKey(예: 'sage')는
  // 화면 렌더링(PublicAvatarAppearance.top 등)에 쓴다 — 둘을 섞으면 장착 직후 낙관적 업데이트가
  // 스프라이트에 없는 값을 가리키게 된다. 실패하면 직전 값으로 되돌린다 — "장착했다"고 화면에
  // 보여준 채로 서버는 실패한 상태가 남으면(예: 새로고침 후 원래대로 돌아옴) 학생이 혼란스럽다.
  async function equip(slot: PixelAvatarSlot, itemId: string | null, assetKey: string | null): Promise<boolean> {
    let previousValue: string | null = null;
    setEquipped(previous => { previousValue = previous[slot]; return { ...previous, [slot]: assetKey }; });
    try {
      const result = await equipPixelItem(slot, itemId);
      if (result.ok) return true;
      setEquipped(previous => ({ ...previous, [slot]: previousValue }));
      return false;
    } catch {
      setEquipped(previous => ({ ...previous, [slot]: previousValue }));
      return false;
    }
  }

  async function purchase(item: PixelItem): Promise<PurchaseOutcome> {
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
    // 전환)에서 이어서 담당한다. 장착이 실패해도 구매 자체는 이미 성공했으므로 ok:true는 유지하고,
    // equipFailed로 호출부가 문구를 다르게 보여줄 수 있게 한다.
    if (item.category === 'avatar') {
      const equipOk = await equip(item.slot as PixelAvatarSlot, item.itemId, item.assetKey);
      if (!equipOk) return { ...result, equipFailed: true };
    }
    return result;
  }

  return { ownedIds, equipped, catalog, balance, ready, loadError, reload, equip, purchase };
}
