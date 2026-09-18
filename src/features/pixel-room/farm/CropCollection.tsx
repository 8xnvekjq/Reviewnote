import { formatHarvestDate, sizeLabel } from './farmModel';
import type { HarvestedCrop } from './farmModel';
import { TomatoSprite } from './TomatoSprite';
import type { useFarmInventory } from './useFarmInventory';

const CROP_NAMES: Record<string, string> = { tomato: '토마토' };

// The "농작물" tab — a read-only collection, styled like the existing shop/wardrobe catalog grid
// (.pr-catalog) so it feels like the same system, not a bolted-on separate screen. Nothing here is
// purchasable/equippable; each card is just a record of one past harvest.
export function CropCollection({ inventory }: { inventory: ReturnType<typeof useFarmInventory> }) {
  if (inventory.error) return <div className="pr-shop-empty">
    <p>농작물 목록을 불러오지 못했어요.</p>
    <button type="button" className="rn-button rn-button-secondary" onClick={() => void inventory.refresh()}>다시 확인</button>
  </div>;
  if (!inventory.crops) return <p className="pr-tool-hint">농작물을 확인하고 있어요…</p>;
  if (inventory.crops.length === 0) return <div className="pr-shop-empty">
    <p>아직 수확한 작물이 없어요. 밭에 토마토를 심고 키워보세요!</p>
  </div>;
  return <div className="pr-catalog pr-crop-collection">
    {inventory.crops.map((crop: HarvestedCrop) => <div key={crop.id} className="pr-crop-card">
      <span className="pr-catalog-art"><TomatoSprite stage="ripe" moisture="normal" /></span>
      <strong>{CROP_NAMES[crop.cropType] ?? crop.cropType}</strong>
      <small>{sizeLabel(crop.sizeScore)} · {crop.sizeScore}/100</small>
      <small>{formatHarvestDate(crop.harvestedAt)} 수확</small>
    </div>)}
  </div>;
}
