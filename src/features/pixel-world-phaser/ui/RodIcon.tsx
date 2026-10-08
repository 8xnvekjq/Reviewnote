import { rodDisplay } from '../../pixel-room/shop/rods';
import type { RodEquipment } from '../../pixel-room/shop/rods';
const icons = import.meta.glob('../assets/fishing/rod_*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export function RodIcon({ rod }: { rod?: RodEquipment | null }) {
  const display = rodDisplay(rod);
  return <img className="pwp-rod-icon" src={icons[`../assets/fishing/${display.itemId}.png`]} alt="" width={48} height={48} draggable={false} />;
}
