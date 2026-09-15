import { useEffect, useRef, useState } from 'react';
import { equipPixelItem, fetchEquippedAppearance, fetchOwnedPixelItemIds, fetchPixelCatalog, purchasePixelItem, setPixelBaseAppearance } from '../../utils/pixelShop';
import { PIXEL_CATALOG } from './shop/catalog';
import type { PixelAvatarSlot, PixelItem, PublicAvatarAppearance, PurchasePixelItemResult } from './shop/types';

const EMPTY_APPEARANCE: PublicAvatarAppearance = { top: null, bottom: null, shoes: null, hair: null, eyes: null, skin: null };

export type PurchaseOutcome = PurchasePixelItemResult & { equipFailed?: boolean };

/** Owns the ownership/equip/balance state for the Pixel World shop, backed by the real
 * src/utils/pixelShop.ts (Worker A's economy RPCs) now that integration is complete. */
export function usePixelShop(userId: string, initialBalance: number, onBalanceChange?: (balance: number) => void) {
  const mutationLock = useRef(false);
  const mounted = useRef(true);
  const [mutating, setMutating] = useState(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
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
    fetchPixelCatalog().then(rows => { if (!cancelled && rows.length > 0) setCatalog(rows.filter(row => PIXEL_CATALOG.some(known => known.itemId === row.itemId && known.slot === row.slot && known.assetKey === row.assetKey))); }).catch(() => {});
    return () => { cancelled = true; };
  }, [userId, reloadToken]);

  const reload = () => setReloadToken(token => token + 1);

  // Render only server-confirmed equipment. Refresh after the RPC instead of optimistic
  // slot writes, so rapid clicks/failures cannot leave an appearance the server never stored.
  async function equipConfirmed(slot: PixelAvatarSlot, itemId: string | null): Promise<boolean> {
    try {
      const result = await equipPixelItem(slot, itemId);
      if (!result.ok) return false;
      const appearance = await fetchEquippedAppearance(userId);
      if (!mounted.current) return false;
      setEquipped(appearance);
      return true;
    } catch { if (mounted.current) setLoadError(true); return false; }
  }
  async function equip(slot: PixelAvatarSlot, itemId: string | null): Promise<boolean> {
    if (mutationLock.current || !ready || loadError) return false;
    mutationLock.current = true; setMutating(true);
    try { return await equipConfirmed(slot, itemId); }
    finally { mutationLock.current = false; if (mounted.current) setMutating(false); }
  }

  // 무료 기본 appearance(피부색/눈동자색) — 소유권이 없으니 equip과 달리 카탈로그/ownedIds에는
  // 손대지 않는다. 같은 "서버 확인 후 재조회" 패턴(낙관적 갱신 없음)을 그대로 따른다.
  async function setBaseAppearance(skinTone: string | null, eyeColor: string | null): Promise<boolean> {
    if (mutationLock.current || !ready || loadError) return false;
    mutationLock.current = true; setMutating(true);
    try {
      const result = await setPixelBaseAppearance(skinTone, eyeColor);
      if (!result.ok) return false;
      const appearance = await fetchEquippedAppearance(userId);
      if (!mounted.current) return false;
      setEquipped(appearance);
      return true;
    } catch { if (mounted.current) setLoadError(true); return false; }
    finally { mutationLock.current = false; if (mounted.current) setMutating(false); }
  }

  async function purchase(item: PixelItem): Promise<PurchaseOutcome> {
    if (mutationLock.current || !ready || loadError) return { ok: false, reason: 'unknown', message: '이전 처리를 마친 뒤 다시 시도해 주세요.' };
    mutationLock.current = true; setMutating(true);
    try {
      const result = await purchasePixelItem(item.itemId);
      if (!mounted.current) return { ok: false, reason: 'unknown', message: '계정 화면이 변경되었어요. 다시 입장해 구매 결과를 확인해 주세요.' };
      if (!result.ok) { if (result.reason === 'already_owned') reload(); return result; }
      setOwnedIds(previous => new Set(previous).add(item.itemId));
      setBalance(result.newBalance);
      onBalanceChange?.(result.newBalance);
      if (item.category === 'avatar') {
        const equipOk = await equipConfirmed(item.slot as PixelAvatarSlot, item.itemId);
        if (!equipOk) return { ...result, equipFailed: true };
      }
      return result;
    } catch { return { ok: false, reason: 'unknown', message: '구매 결과를 확인하지 못했어요. 다시 불러온 뒤 확인해 주세요.' }; }
    finally { mutationLock.current = false; if (mounted.current) setMutating(false); }
  }

  return { ownedIds, equipped, catalog, balance, ready, loadError, reload, equip, purchase, setBaseAppearance, mutating };
}
