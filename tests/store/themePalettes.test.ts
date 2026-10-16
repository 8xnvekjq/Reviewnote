import assert from 'node:assert/strict';
import { test } from 'node:test';
import { THEME_PALETTES } from '../../src/utils/themePalettes.ts';
import { GACHA_ITEMS } from '../../src/utils/gachaCatalog.ts';
import { applyThemeColor } from '../../src/utils/theme.ts';

function luminance(hex: string) {
  const channels = hex.slice(1).match(/../g)!.map(c => parseInt(c, 16) / 255)
    .map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}
function contrast(a: string, b: string) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
const themes = GACHA_ITEMS.filter(item => item.category === 'THEME');
test('every catalog theme has a designed palette, with no orphan palettes', () => {
  assert.equal(themes.length, 15);
  assert.deepEqual(Object.keys(THEME_PALETTES).sort(), themes.map(t => t.id).sort());
});
for (const [id, palette] of Object.entries(THEME_PALETTES)) {
  test(`${id}: normal and muted text and primary actions meet 4.5:1`, () => {
    for (const role of ['bg', 'surface', 'elevated', 'header'] as const) {
      for (const text of ['text', 'muted'] as const) {
        assert(contrast(palette[text], palette[role]) >= 4.5, `${text}/${role}: ${contrast(palette[text], palette[role])}`);
      }
    }
    assert(contrast(palette.onAccent, palette.accent) >= 4.5);
  });
}

test('saved hexes resolve case-insensitively; switching and unequipping clear all theme state', () => {
  const properties = new Map<string, string>();
  const classes = new Set<string>();
  const root = {
    style: { setProperty: (key: string, value: string) => properties.set(key, value), removeProperty: (key: string) => properties.delete(key) },
    classList: { add: (...keys: string[]) => keys.forEach(key => classes.add(key)), remove: (...keys: string[]) => keys.forEach(key => classes.delete(key)), toggle: (key: string, enabled: boolean) => enabled ? classes.add(key) : classes.delete(key) },
    dataset: {} as Record<string, string>,
  };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { value: { documentElement: root }, configurable: true });
  const rgb = (hex: string) => hex.slice(1).match(/../g)!.map(c => parseInt(c, 16)).join(' ');
  try {
    for (const theme of themes) {
      applyThemeColor(theme.effectValue.toLowerCase(), theme.themeAccentValue);
      assert.equal(root.dataset.themeId, theme.id);
      assert.equal(properties.get('--theme-bg-main'), rgb(THEME_PALETTES[theme.id].bg));
      assert.equal(classes.has('theme-light'), !!THEME_PALETTES[theme.id].light);
      assert.equal(classes.has('theme-ornament'), !!THEME_PALETTES[theme.id].ornament);
    }
    applyThemeColor('#123456');
    assert.equal(root.dataset.themeId, undefined);
    assert.equal(classes.size, 0);
    assert.equal(properties.get('--theme-bg-main'), '6 18 30');
    assert(!properties.has('--theme-text'));
    applyThemeColor('#123456', '#ABCDEF');
    assert.equal(properties.get('--theme-bg-main'), '8 10 13');
    applyThemeColor('#FFFFFF');
    properties.set('--unrelated', 'preserved');
    classes.add('unrelated');
    applyThemeColor();
    assert.deepEqual([...properties], [['--unrelated', 'preserved']]);
    assert.deepEqual([...classes], ['unrelated']);
    assert.deepEqual(root.dataset, {});
  } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});
