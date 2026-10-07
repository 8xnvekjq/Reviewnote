// 새 Pixel World(베타) 진입 — 지금 Pixel World와 똑같은 방식으로 학생의 실제 외형(usePixelShop)과
// 데리고 다니는 펫(usePet), 밭 상태(useFarm)를 불러와 Phaser 셸에 넘긴다. 서버 쓰기는 하지 않는다.
import { useCallback, useMemo, useRef } from 'react';
import { usePixelShop } from '../pixel-room/usePixelShop';
import { usePet } from '../pixel-room/pet/usePet';
import { useFarm } from '../pixel-room/farm/useFarm';
import { FARM_BEDS, farmMoisture, farmStage } from '../pixel-room/farm/farmModel';
import { pickScarecrowLine } from '../pixel-room/farm/scarecrowLines';
import { GameShell } from './GameShell';
import type { BedLook } from './game/sceneAssets';
import './gameShell.css';

interface Props { userId: string; pointsBalance: number; onExit: () => void }

export default function PixelWorldPhaser({ userId, pointsBalance, onExit }: Props) {
  const shop = usePixelShop(userId, pointsBalance);
  const pet = usePet(userId);
  const farm = useFarm();
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
  if (!appearance || !pet.ready) return <div className="pwp-root pwp-loading" role="status">앞마당으로 가는 중…</div>;
  return <GameShell appearance={appearance} pet={pet.active} balance={shop.balance} beds={beds}
    scarecrowLine={scarecrowLine} onExit={onExit} />;
}

function bedsKey(snapshot: ReturnType<typeof useFarm>['snapshot'], now: number): string {
  return FARM_BEDS.map((_, index) => {
    const crop = snapshot?.plots.find(plot => plot.index === index)?.crop ?? null;
    return `${farmStage(crop, now)}/${farmMoisture(crop, now)}`;
  }).join(',');
}
