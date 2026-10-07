import type { FurnitureType, Placement } from '../../pixel-room/model';
import { ownedFurniture } from '../logic/roomEditing';
import { FURNITURE_NAMES } from '../logic/roomLines';
import { Window } from './GamePanels';
import type { PanelAdapter } from './GamePanels';
import { PanelArt } from './PanelArt';

export function FurniturePanel({ furniture, shop, pending, message, onClose, onPick, onStore }: {
  furniture: readonly Placement[]; shop: PanelAdapter['shop']; pending: boolean; message: string;
  onClose: () => void; onPick: (type: FurnitureType) => void; onStore: (type: FurnitureType) => void;
}) {
  const items = ownedFurniture(shop.catalog, shop.ownedIds);
  return <Window title="가구" onClose={onClose}>
    <p className="pwp-panel-summary">가구를 골라 원하는 빈 칸을 눌러 주세요.</p>
    <div className="pwp-panel-content"><div className="pwp-item-grid">
      {items.map(item => {
        const type = item.assetKey as FurnitureType;
        const placed = furniture.some(entry => entry.type === type);
        return <article className="pwp-item" key={item.itemId} data-room-item={type}>
          <button type="button" disabled={pending} onClick={() => onPick(type)} aria-label={FURNITURE_NAMES[type]}>
            <span className="pwp-item-art" aria-hidden="true"><PanelArt furniture={type} /></span>
            <strong>{FURNITURE_NAMES[type]}</strong><span>{placed ? '배치 중' : '보관 중'}</span>
          </button>
          {placed && <button type="button" disabled={pending} onClick={() => onStore(type)}>보관함에 넣기</button>}
        </article>;
      })}
      {!items.length && <p>상점에서 구매한 가구를 여기에 보관해요.</p>}
    </div></div>
    {message && <p role="status" aria-live="polite">{message}</p>}
  </Window>;
}
