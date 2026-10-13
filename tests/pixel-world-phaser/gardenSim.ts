// 브라우저 하네스용 텃밭 모의 서버 — supabase/migrations/20261020100200_pixel_garden_actions.sql의 규칙을 줄여 옮겼다
// (비·복습 보너스·상한은 서버 시험 garden-server.test.ts가 맡는다). 크기 점수는 늘 82.
import type { FarmCrop, FarmPlot, FarmSnapshot } from '../../src/features/pixel-room/farm/farmModel';
import { CROP_RULES, GARDEN_INDEXES, gardenStage } from '../../src/features/pixel-room/farm/gardenModel';
import type { GardenAction } from '../../src/features/pixel-room/farm/gardenModel';
import type { FarmResult } from '../../src/utils/pixelFarm';

const HOUR = 3600000;
export const kstDay = (t: number) => new Date(t + 9 * HOUR).toISOString().slice(0, 10);

export function gardenFixture(now: number, ripeTomatoAt0 = true): FarmSnapshot {
  return { serverNow: new Date(now).toISOString(), today: kstDay(now), harvestCount: 0, bestSize: null, lastHarvestSize: null, rainToday: false, sprinklerOwned: false,
    plots: GARDEN_INDEXES.map(index => index === 0 && ripeTomatoAt0
      ? { index, revision: 1, soil: 'tilled', wateredOn: null, sprinkler: false, crop: { id: 'ripe', type: 'tomato', plantedAt: new Date(now - 7 * 24 * HOUR).toISOString(), readyAt: new Date(now - 3 * 24 * HOUR).toISOString(), lastWateredOn: kstDay(now - 4 * 24 * HOUR), careCount: 3, reviewGained: 0, harvests: 0 } }
      : { index, revision: 0, soil: 'grass', wateredOn: null, sprinkler: false, crop: null }) };
}

let serial = 0;
export function simulateGarden(snapshot: FarmSnapshot, now: number, index: number, action: GardenAction): FarmResult {
  const today = kstDay(now);
  let result = 'ok';
  let harvest: FarmResult['harvest'];
  let harvestCount = snapshot.harvestCount, lastHarvestSize = snapshot.lastHarvestSize, bestSize = snapshot.bestSize;
  const plots = snapshot.plots.map((plot): FarmPlot => {
    if (plot.index !== index) return plot;
    const p = { ...plot, soil: plot.crop ? 'tilled' as const : plot.soil ?? 'grass' }, c = p.crop;
    const bump = (next: Partial<FarmPlot>) => ({ ...p, ...next, revision: p.revision + 1 });
    if (action === 'till') { if (p.sprinkler) result = 'blocked'; else if (p.soil === 'tilled') result = 'already'; else return bump({ soil: 'tilled' }); }
    else if (action === 'plant_tomato' || action === 'plant_strawberry') {
      const type = action === 'plant_tomato' ? 'tomato' : 'strawberry';
      if (c) result = 'occupied'; else if (p.sprinkler) result = 'blocked'; else if (p.soil !== 'tilled') result = 'untilled';
      else {
        const watered = p.wateredOn === today;
        const crop: FarmCrop = { id: `crop-${++serial}`, type, plantedAt: new Date(now).toISOString(), readyAt: new Date(now + CROP_RULES[type].growHours * HOUR).toISOString(),
          careCount: watered ? 1 : 0, lastWateredOn: watered ? today : null, reviewGained: 0, harvests: 0, maxHarvests: CROP_RULES[type].maxHarvests };
        return bump({ crop });
      }
    } else if (action === 'water') {
      if (p.soil !== 'tilled') result = 'untilled';
      else if (c && gardenStage(c, now) === 'ripe') result = 'ready';
      else if (c ? c.lastWateredOn === today : p.wateredOn === today) result = 'already_watered';
      else return bump({ wateredOn: today, crop: c && { ...c, careCount: c.careCount + 1, lastWateredOn: today } });
    } else if (action === 'harvest') {
      if (!c) result = 'changed';
      else if (gardenStage(c, now) !== 'ripe') result = 'growing';
      else if (c.type === 'strawberry') {
        const harvests = (c.harvests ?? 0) + 1;
        harvest = { cropType: 'strawberry', berries: c.careCount > 0 ? 2 : 1, harvests, maxHarvests: 3 };
        return bump({ crop: harvests >= 3 ? null : { ...c, harvests, careCount: 0, plantedAt: new Date(now).toISOString(), readyAt: new Date(now + 32 * HOUR).toISOString() } });
      } else {
        harvest = { cropType: 'tomato', sizeScore: 82, bonusApplied: false };
        harvestCount++; lastHarvestSize = 82; bestSize = Math.max(bestSize ?? 0, 82);
        return bump({ crop: null });
      }
    } else if (action === 'place_sprinkler') {
      if (!snapshot.sprinklerOwned) result = 'no_sprinkler'; else if (c) result = 'occupied';
      else if (snapshot.plots.some(other => other.sprinkler)) result = 'sprinkler_elsewhere'; else return bump({ sprinkler: true });
    } else if (!p.sprinkler) result = 'changed'; else return bump({ sprinkler: false });
    return p;
  });
  return { ...snapshot, serverNow: new Date(now).toISOString(), today, plots, harvestCount, lastHarvestSize, bestSize, result, ...(harvest ? { harvest } : {}) };
}
