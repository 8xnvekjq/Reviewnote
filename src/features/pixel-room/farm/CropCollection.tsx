import { useState } from 'react';
import { computeSubmitReward, formatHarvestDate, sizeLabel } from './farmModel';
import type { HarvestedCrop } from './farmModel';
import { TomatoSprite } from './TomatoSprite';
import { submitFarmCrop } from '../../../utils/pixelFarm';
import type { useFarmInventory } from './useFarmInventory';

const CROP_NAMES: Record<string, string> = { tomato: '토마토' };

/** One card's own submit flow — local to that card so one crop submitting never disables the rest
 * of the grid, and a transient "출품 완료" line replaces the button briefly before the card settles
 * into its permanent 'submitted' badge (inventory.refresh() below re-fetches the real row, so this
 * local state is just the in-between feedback, never the source of truth). */
function CropCard({ crop, onSubmitted }: { crop: HarvestedCrop; onSubmitted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState<number | null>(null);
  const [error, setError] = useState('');

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError('');
    const result = await submitFarmCrop(crop.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.reason === 'already_submitted' ? '이미 출품된 작물이에요.' : result.message);
      onSubmitted(); // Refresh anyway — our local 'stored' view may just be stale (e.g. another tab already submitted it).
      return;
    }
    setJustSubmitted(result.rewardPoints);
    onSubmitted();
  }

  return <div className="pr-crop-card">
    <span className="pr-catalog-art"><TomatoSprite stage="ripe" moisture="normal" /></span>
    <strong>{CROP_NAMES[crop.cropType] ?? crop.cropType}</strong>
    <small>{sizeLabel(crop.sizeScore)} · {crop.sizeScore}/100</small>
    <small>{formatHarvestDate(crop.harvestedAt)} 수확</small>
    {crop.status === 'submitted' ? <span className="pr-crop-badge pr-crop-badge-submitted">
      🏅 출품됨 · +{crop.rewardPoints}P
    </span> : justSubmitted !== null ? <span className="pr-crop-badge pr-crop-badge-submitted">
      🎉 출품 완료! +{justSubmitted}P
    </span> : <>
      <button type="button" className="pr-crop-submit" disabled={busy} onClick={() => void submit()}>
        {busy ? '출품 중…' : `출품하기 (+${computeSubmitReward(crop.sizeScore)}P)`}
      </button>
      {error && <small className="pr-crop-error" role="status">{error}</small>}
    </>}
  </div>;
}

// The "농작물" tab — a read-only collection, styled like the existing shop/wardrobe catalog grid
// (.pr-catalog) so it feels like the same system, not a bolted-on separate screen. 'stored' crops
// can be submitted for a one-time reward (see CropCard); 'submitted' crops become a permanent
// trophy card — no other action is ever offered on either.
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
    {inventory.crops.map((crop: HarvestedCrop) => <CropCard key={crop.id} crop={crop} onSubmitted={() => void inventory.refresh()} />)}
  </div>;
}
