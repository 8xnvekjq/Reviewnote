export const FASHION = {
  blouse_black: { slot:'top',kind:'blouse',colors:['#23232c','#41404b','#65616e','#171923'] },
  blouse_ivory: { slot:'top',kind:'blouse',colors:['#9b8c78','#eee5d3','#fff8e7','#78695c'] },
  blouse_rose: { slot:'top',kind:'blouse',colors:['#7d4d58','#b97886','#d69ba4','#653e4c'] },
  bootcut_blue: { slot:'bottom',kind:'bootcut',colors:['#304b5c','#587b8f','#8da5b0','#b9a37d'] },
  bootcut_charcoal: { slot:'bottom',kind:'bootcut',colors:['#292d36','#4c5360','#79818b','#a99478'] },
  bootcut_cream: { slot:'bottom',kind:'bootcut',colors:['#958571','#dbcfb6','#f2e9d6','#a27e52'] },
} as const;
export function fashionFor(slot: string | null, key: string | null) {
  if (!key || !Object.hasOwn(FASHION,key)) return null;
  const item=FASHION[key as keyof typeof FASHION];
  return item.slot===slot ? item : null;
}
