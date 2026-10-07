// 새 Pixel World 진입(모든 학생) — 예전 Pixel World와 똑같은 방식으로 학생의 실제 외형(usePixelShop)과
// 데리고 다니는 펫(usePet), 밭 상태(useFarm)를 불러와 Phaser 셸에 넘긴다. 돌봄과 출품은 기존 훅/RPC만 사용한다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchPixelFurniturePlacement, savePixelRoomLayout } from '../../utils/pixelShop';
import type { Placement } from '../pixel-room/model';
import { furnitureRows } from './logic/roomEditing';
import type { FurniturePlacementRow } from '../../utils/pixelShop';
import { savedFurniture } from './logic/savedFurniture';
import { usePixelShop } from '../pixel-room/usePixelShop';
import { usePet } from '../pixel-room/pet/usePet';
import { useFarmInventory } from '../pixel-room/farm/useFarmInventory';
import { submitFarmCrop, fetchWeeklyCropContest } from '../../utils/pixelFarm';
import { useFarm } from '../pixel-room/farm/useFarm';
import { FARM_BEDS, farmMoisture, farmStage } from '../pixel-room/farm/farmModel';
import { pickScarecrowLine } from '../pixel-room/farm/scarecrowLines';
import { GameShell } from './GameShell';
import type { BedLook } from './game/sceneAssets';
import './gameShell.css';

interface Props {
  userId: string;
  pointsBalance: number;
  onExit: () => void;
  /** 구매 RPC가 서버에서 차감한 뒤 돌려준 새 잔액 — App이 화면 포인트를 서버 값에 맞춘다. */
  onPixelPurchase?: (newBalance: number) => void;
  /** 출품 RPC가 서버에서 point_adjustment에 더한 보상 점수 — App이 같은 양을 반영한다. */
  onPointsReward?: (rewardPoints: number) => void;
}

export default function PixelWorldPhaser({ userId, pointsBalance, onExit, onPixelPurchase, onPointsReward }: Props) {
  const shop = usePixelShop(userId, pointsBalance, onPixelPurchase);
  const pet = usePet(userId);
  const farm = useFarm();
  const inventory = useFarmInventory(userId);
  const harvestCount = farm.snapshot?.harvestCount;
  useEffect(() => { if (harvestCount !== undefined) void inventory.refresh(); }, [harvestCount, inventory.refresh]);
  const [placement, setPlacement] = useState<{ userId: string; rows: FurniturePlacementRow[] } | null>(null);
  const [roomError, setRoomError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setRoomError(false);
    // 기존 방과 같은 서버 조회만 사용한다. 로컬 배치 이관/저장은 기존 방에서 맡는다.
    fetchPixelFurniturePlacement(userId).then(rows => {
      if (!cancelled) setPlacement({ userId, rows });
    }).catch(() => { if (!cancelled) setRoomError(true); });
    return () => { cancelled = true; };
  }, [userId, retry]);
  const furniture = useMemo(() => savedFurniture(placement?.userId === userId ? placement.rows : [],
    shop.catalog, shop.ownedIds), [placement, userId, shop.catalog, shop.ownedIds]);
  const saveFurniture = async (layout: Placement[]) => {
    const rows = furnitureRows(layout, shop.catalog, shop.ownedIds);
    const result = await savePixelRoomLayout(rows);
    if (!result.ok) throw new Error('방 배치를 저장하지 못했어요. 다시 시도해 주세요.');
    setPlacement({ userId, rows });
  };
  const farmRef = useRef(farm); farmRef.current = farm;
  // farm.now는 1초마다 바뀌지만, 밭 그림은 단계/촉촉함이 실제로 바뀔 때만 다시 만든다(문자열 키로 접기).
  const key = bedsKey(farm.snapshot, farm.now);
  const beds = useMemo<BedLook[]>(() => key.split(',').map(part => {
    const [stage, moisture] = part.split('/');
    return { stage, moisture } as BedLook;
  }), [key]);
  const scarecrowLine = useCallback(() => pickScarecrowLine(farmRef.current.snapshot, farmRef.current.now), []);
  // 외형은 서버 확인이 끝난 뒤에 한 번만 장면을 만든다(기본 모습으로 먼저 떴다가 바뀌는 깜빡임 방지).
  const appearance = shop.ready ? shop.equipped : null;
  if (roomError) return <div className="pwp-root pwp-loading" role="alert">방 배치를 불러오지 못했어요.
    <button type="button" onClick={() => setRetry(value => value + 1)}>다시 불러오기</button>
    <button type="button" onClick={onExit}>나가기</button></div>;
  if (!appearance || !pet.ready || placement?.userId !== userId) return <div className="pwp-root pwp-loading" role="status">앞마당으로 가는 중…</div>;
  return <GameShell userId={userId} appearance={appearance} pet={!pet.error && pet.active && shop.ownedIds.has(pet.active) ? pet.active : null} balance={shop.balance} beds={beds} furniture={furniture}
    onSaveFurniture={saveFurniture} scarecrowLine={scarecrowLine} onExit={onExit} panels={{ shop, pet }} farmAdapter={{ farm, inventory, contest: fetchWeeklyCropContest, submit: async id => {
      const result = await submitFarmCrop(id);
      if (result.ok) { onPointsReward?.(result.rewardPoints); shop.reload(); }
      return result;
    } }} />;
}

function bedsKey(snapshot: ReturnType<typeof useFarm>['snapshot'], now: number): string {
  return FARM_BEDS.map((_, index) => {
    const crop = snapshot?.plots.find(plot => plot.index === index)?.crop ?? null;
    return `${farmStage(crop, now)}/${farmMoisture(crop, now)}`;
  }).join(',');
}
