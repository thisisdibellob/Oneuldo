import { getMarketHudOcclusionRect, getMarketHudTopInset } from '../src/game/marketHudLayout';
import { marketProducts } from '../src/game/scenarios';

const presentation = { viewport: { width: 390, height: 600 }, fontScale: 1, safeArea: { top: 0, bottom: 0 } };

test('catalog units stay within the replay HUD quantity wrapping bound', () => {
  for (const product of marketProducts) expect([...(product.salesUnit ?? '개')].length).toBeLessThanOrEqual(2);
});

test('embedded HUD reserves two name lines and respects the real card side padding and maximum width', () => {
  expect(getMarketHudOcclusionRect(presentation)).toEqual({ left: 12, right: 378, top: 112, bottom: 227 });
  expect(getMarketHudOcclusionRect({ viewport: { width: 800, height: 900 } }))
    .toEqual({ left: 190, right: 610, top: 112, bottom: 227 });
});

test('top safe area offsets the whole card while viewport height and bottom inset do not reposition it', () => {
  expect(getMarketHudOcclusionRect({ ...presentation, viewport: { width: 390, height: 844 }, safeArea: { top: 70, bottom: 100 } }))
    .toEqual({ left: 12, right: 378, top: 134, bottom: 249 });
  expect(getMarketHudTopInset(70, false)).toBe(70);
  expect(getMarketHudTopInset(0, false)).toBe(12);
});

test('font scaling reserves line height and large-font wrapping without clipping text in the renderer', () => {
  expect(getMarketHudOcclusionRect({ ...presentation, fontScale: 2 })).toEqual({ left: 12, right: 378, top: 112, bottom: 287 });
  // The five-glyph "전체 목록" button label wraps to five lines (icon 24 + gap 2 + 5×60 = 326),
  // which now exceeds the item column (two name lines 144 + two quantity lines 160 + gap 3 = 307).
  expect(getMarketHudOcclusionRect({ ...presentation, fontScale: 4, safeArea: { top: 200, bottom: 0 } }))
    .toEqual({ left: 12, right: 378, top: 264, bottom: 698 });
});
