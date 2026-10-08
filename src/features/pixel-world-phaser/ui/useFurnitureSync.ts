// 내 방 가구 배치의 기준은 서버 하나다. 이 훅이 서버 값을 읽고, 다시 읽고, 저장한다.
// - 처음 들어올 때 읽는다(실패하면 error — 빈 방으로 보여 주지 않는다).
// - 내 방에 들어갈 때(refresh), 탭/앱이 다시 보일 때 다시 읽는다 → 다른 기기에서 바꾼 배치를 따라잡는다.
// - 저장은 방 전체를 바꾸므로, 저장 직전에 서버를 한 번 더 읽어 이 기기가 본 배치와 다르면
//   (다른 기기가 그 사이 바꿨으면) 덮어쓰지 않고 서버 배치를 불러온 뒤 다시 놓게 한다.
// - 늦게 도착한 조회가 방금 저장한 배치를 되돌리지 않게 createLayoutGate로 막는다.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FurniturePlacementRow, SavePixelRoomLayoutResult } from '../../../utils/pixelShop';
import { createLayoutGate, sameLayout } from '../logic/savedFurniture';

export interface FurnitureApi {
  load(userId: string): Promise<FurniturePlacementRow[]>;
  save(rows: FurniturePlacementRow[]): Promise<SavePixelRoomLayoutResult>;
}

export const FURNITURE_CHANGED_MESSAGE = '다른 기기에서 바뀐 방 배치를 불러왔어요. 다시 놓아 주세요.';
const SAVE_FAILED_MESSAGE = '방 배치를 저장하지 못했어요. 다시 시도해 주세요.';

export function useFurnitureSync(userId: string, api: FurnitureApi) {
  const [placement, setPlacement] = useState<{ userId: string; rows: FurniturePlacementRow[] } | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const gate = useRef(createLayoutGate());
  // 이 기기가 마지막으로 서버에서 확인한(또는 저장에 성공한) 배치 — 저장 전 비교 기준.
  const base = useRef<{ userId: string; rows: FurniturePlacementRow[] } | null>(null);
  const userRef = useRef(userId); userRef.current = userId;

  const apply = useCallback((owner: string, rows: FurniturePlacementRow[]) => {
    base.current = { userId: owner, rows };
    setPlacement({ userId: owner, rows });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    const ticket = gate.current.startRead();
    api.load(userId).then(rows => {
      if (!cancelled && gate.current.canApply(ticket)) apply(userId, rows);
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [userId, retry, api, apply]);

  /** 조용히 다시 읽기 — 실패하면 지금 보이는 배치를 그대로 둔다(다음 기회에 다시 읽는다). */
  const refresh = useCallback(() => {
    const owner = userRef.current;
    if (base.current?.userId !== owner) return;
    const ticket = gate.current.startRead();
    api.load(owner).then(rows => {
      if (userRef.current !== owner || !gate.current.canApply(ticket)) return;
      if (base.current && sameLayout(base.current.rows, rows)) return;
      apply(owner, rows);
    }).catch(() => {});
  }, [api, apply]);

  useEffect(() => {
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    // iPad Safari는 앱을 다시 열 때 페이지를 메모리에서 그대로 꺼내기도 한다(pageshow.persisted).
    const shown = (event: PageTransitionEvent) => { if (event.persisted) refresh(); };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('pageshow', shown);
    return () => {
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('pageshow', shown);
    };
  }, [refresh]);

  const save = useCallback(async (rows: FurniturePlacementRow[]) => {
    const owner = userRef.current;
    gate.current.startWrite();
    try {
      const current = await api.load(owner).catch(() => { throw new Error(SAVE_FAILED_MESSAGE); });
      if (userRef.current !== owner) throw new Error(SAVE_FAILED_MESSAGE);
      if (!base.current || base.current.userId !== owner || !sameLayout(base.current.rows, current)) {
        apply(owner, current);
        throw new Error(FURNITURE_CHANGED_MESSAGE);
      }
      const result = await api.save(rows);
      if (!result.ok) throw new Error(SAVE_FAILED_MESSAGE);
      if (userRef.current === owner) apply(owner, rows);
    } finally { gate.current.endWrite(); }
  }, [api, apply]);

  const ready = placement?.userId === userId;
  return { rows: ready ? placement.rows : null, error, retry: () => setRetry(value => value + 1), refresh, save };
}
