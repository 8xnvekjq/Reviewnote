import type { PixelItem, PublicAvatarAppearance } from '../../pixel-room/shop/types';

export type PanelKind = 'shop' | 'wardrobe';
export function panelItems(catalog: readonly PixelItem[], category: string, owned?: ReadonlySet<string>) {
  return catalog.filter(item => (category === 'all' || item.slot === category) && (!owned || owned.has(item.itemId)));
}
export function pointsShort(price: number, balance: number) { return Math.max(0, price - balance); }
export function itemState(item: PixelItem, owned: ReadonlySet<string>, appearance: PublicAvatarAppearance, pet: string | null) {
  if (!owned.has(item.itemId)) return 'available';
  return (item.category === 'avatar' && appearance[item.slot as keyof PublicAvatarAppearance] === item.assetKey)
    || (item.category === 'pet' && pet === item.itemId) ? 'equipped' : 'owned';
}
export function panelFrozen(panel: string | null, dialogue: boolean) { return panel !== null || dialogue; }
