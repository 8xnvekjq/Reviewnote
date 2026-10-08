// 새 Pixel World 진입(모든 학생) — 예전 Pixel World와 똑같은 방식으로 학생의 실제 외형(usePixelShop)과
// 데리고 다니는 펫(usePet), 밭 상태(useFarm)를 불러와 Phaser 셸에 넘긴다. 돌봄과 출품은 기존 훅/RPC만 사용한다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchPixelFurniturePlacement, savePixelRoomLayout } from '../../utils/pixelShop';
import type { Placement } from '../pixel-room/model';
import { furnitureRows } from './logic/roomEditing';
import { savedFurniture } from './logic/savedFurniture';
import { useFurnitureSync } from './ui/useFurnitureSync';
import type { FurnitureApi } from './ui/useFurnitureSync';
import { hasNewerBuild } from '../../utils/appVersion';
import { usePixelShop } from '../pixel-room/usePixelShop';
import { usePet } from '../pixel-room/pet/usePet';
import { useFarmInventory } from '../pixel-room/farm/useFarmInventory';
import { submitFarmCrop, fetchWeeklyCropContest } from '../../utils/pixelFarm';
import { useFarm } from '../pixel-room/farm/useFarm';
import { FARM_BEDS, farmMoisture, farmStage } from '../pixel-room/farm/farmModel';
import { pickScarecrowLine } from '../pixel-room/farm/scarecrowLines';
import { supabase } from '../../services/supabase';
import { createFishingAdapter } from './ui/fishingAdapter';
import { parseClockOverride } from './logic/worldClock';
import type { FishingOverride } from './ui/fishingAdapter';
import { GameShell } from './GameShell';
import type { BedLook } from './game/sceneAssets';
import './gameShell.css';

// 가구 배치의 유일한 기준은 서버(pixel_furniture_placement). 로컬 저장소는 읽지도 쓰지도 않는다.
const serverFurniture: FurnitureApi = { load: fetchPixelFurniturePlacement, save: savePixelRoomLayout };

interface Props {
  isAdmin?: boolean;
  userId: string;
  pointsBalance: number;
  onExit: () => void;
  /** 구매 RPC가 서버에서 차감한 뒤 돌려준 새 잔액 — App이 화면 포인트를 서버 값에 맞춘다. */
  onPixelPurchase?: (newBalance: number) => void;
  /** 출품 RPC가 서버에서 point_adjustment에 더한 보상 점수 — App이 같은 양을 반영한다. */
  onPointsReward?: (rewardPoints: number) => void;
}

export default function PixelWorldPhaser({ userId, pointsBalance, onExit, onPixelPurchase, onPointsReward, isAdmin = false }: Props) {
  // 관리자(선생님)만 ?pwClock=HH:MM / ?pwWeather= 로 시간·날씨를 바꿔 볼 수 있다. 서버도 한 번 더 확인한다.
  const clockOverride = useMemo(() => fishingOverride(location.search, isAdmin), [isAdmin]);
  const fishingAdapter = useMemo(() => createFishingAdapter(supabase, clockOverride), [clockOverride, userId]);
  const shop = usePixelShop(userId, pointsBalance, onPixelPurchase);
  const pet = usePet(userId);
  const farm = useFarm();
  const inventory = useFarmInventory(userId);
  const harvestCount = farm.snapshot?.harvestCount;
  useEffect(() => { if (harvestCount !== undefined) void inventory.refresh(); }, [harvestCount, inventory.refresh]);
  // 처음·내 방 입장·탭 복귀 때 서버에서 다시 읽고, 저장 전에는 다른 기기의 변경을 확인한다(ui/useFurnitureSync).
  const room = useFurnitureSync(userId, serverFurniture);
  const roomError = room.error;
  const furniture = useMemo(() => savedFurniture(room.rows ?? [], shop.catalog, shop.ownedIds), [room.rows, shop.catalog, shop.ownedIds]);
  const saveFurniture = async (layout: Placement[]) => {
    await room.save(furnitureRows(layout, shop.catalog, shop.ownedIds));
  };
  const { refresh: refreshRoom } = room;
  // 오래 켜 둔 기기가 예전 배포를 계속 돌리지 않도록, 들어올 때와 다시 보일 때 새 버전을 확인한다.
  const [outdated, setOutdated] = useState(false);
  const checkVersion = useCallback(() => { void hasNewerBuild().then(newer => { if (newer) setOutdated(true); }); }, []);
  const onScene = useCallback((id: string) => { if (id === 'room') { refreshRoom(); checkVersion(); } }, [refreshRoom, checkVersion]);
  useEffect(() => {
    checkVersion();
    const visible = () => { if (document.visibilityState === 'visible') checkVersion(); };
    document.addEventListener('visibilitychange', visible);
    return () => document.removeEventListener('visibilitychange', visible);
  }, [checkVersion]);
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
    <button type="button" onClick={room.retry}>다시 불러오기</button>
    <button type="button" onClick={onExit}>나가기</button></div>;
  if (!appearance || !pet.ready || !room.rows) return <div className="pwp-root pwp-loading" role="status">앞마당으로 가는 중…</div>;
  return <>{outdated && <div className="pwp-update" role="alert" style={UPDATE_STYLE}>새 버전이 나왔어요. 새로고침하면 다른 기기와 같은 화면이 돼요.
    <button type="button" onClick={() => location.reload()} style={{ marginLeft: 8, font: 'inherit', fontWeight: 800 }}>새로고침</button></div>}
  <GameShell onSceneChange={onScene} fishingAdapter={fishingAdapter} clockOverride={clockOverride} userId={userId} appearance={appearance} pet={!pet.error && pet.active && shop.ownedIds.has(pet.active) ? pet.active : null} balance={shop.balance} beds={beds} furniture={furniture}
    onSaveFurniture={saveFurniture} scarecrowLine={scarecrowLine} onExit={onExit} panels={{ shop, pet }} farmAdapter={{ farm, inventory, contest: fetchWeeklyCropContest, submit: async id => {
      const result = await submitFarmCrop(id);
      if (result.ok) { onPointsReward?.(result.rewardPoints); shop.reload(); }
      return result;
    } }} /></>;
}

const UPDATE_STYLE = { position: 'fixed', left: '50%', top: 'max(56px, calc(env(safe-area-inset-top) + 56px))', transform: 'translateX(-50%)', zIndex: 2147483001,
  background: '#fff4d9', color: '#3b2a1a', border: '2px solid #3b2a1a', borderRadius: 8, padding: '8px 12px', fontWeight: 700, fontSize: 14, maxWidth: 'calc(100vw - 32px)' } as const;

function bedsKey(snapshot: ReturnType<typeof useFarm>['snapshot'], now: number): string {
  return FARM_BEDS.map((_, index) => {
    const crop = snapshot?.plots.find(plot => plot.index === index)?.crop ?? null;
    return `${farmStage(crop, now)}/${farmMoisture(crop, now)}`;
  }).join(',');
}

/** 관리자만 주소의 ?pwClock=HH:MM / ?pwWeather=clear|cloudy|rain 을 쓴다. 규칙은 logic/worldClock.ts 하나. */
export function fishingOverride(search: string, isAdmin: boolean): FishingOverride | undefined {
  return isAdmin ? parseClockOverride(search) ?? undefined : undefined;
}
