import { getMarketHudActionsRect, getMarketHudControlLift, getMarketHudOcclusionRect, getMarketHudTopInset } from '../src/game/marketHudLayout';
import { GAME_ACTION_BUTTON_LAYOUT } from '../src/game/gameControlLayout';
import { marketProducts } from '../src/game/scenarios';

const presentation = { viewport: { width: 390, height: 600 }, fontScale: 1, safeArea: { top: 0, bottom: 0 } };

test('catalog units stay within the replay HUD quantity wrapping bound', () => {
  for (const product of marketProducts) expect([...(product.salesUnit ?? '개')].length).toBeLessThanOrEqual(2);
});

test.each([320, 375, 390, 600, 768])('map-enabled lower actions also clear the map circle at width %i', width => {
  const row = getMarketHudActionsRect({ viewport: { width, height: 844 } });
  const a = GAME_ACTION_BUTTON_LAYOUT;
  const lift = getMarketHudControlLift(width);
  const map = { left: width - a.right - a.size - 12 - 58, right: width - a.right - a.size - 12,
    top: 844 - a.bottom - (a.size - 58) / 2 - 58 - lift, bottom: 844 - a.bottom - (a.size - 58) / 2 - lift };
  expect(row.right > map.left && row.left < map.right && row.bottom > map.top && row.top < map.bottom).toBe(false);
});

test.each([320, 375, 390, 768, 1440])('lower shopping actions stay centred and clear of the action at width %i', width => {
  const p = { viewport: { width, height: 844 }, fontScale: 1 };
  const row = getMarketHudActionsRect(p), action = GAME_ACTION_BUTTON_LAYOUT;
  expect((row.left + row.right) / 2).toBe(width / 2);
  expect((row.right - row.left - 8) / 2).toBeGreaterThanOrEqual(44);
  const lift = getMarketHudControlLift(width);
  const actionLeft = width - action.right - action.size, actionTop = 844 - action.bottom - action.size - lift;
  const overlaps = row.right > actionLeft && row.left < width - action.right && row.bottom > actionTop && row.top < 844 - action.bottom - lift;
  expect(overlaps).toBe(false);
  expect(844 - row.bottom).toBeGreaterThanOrEqual(112);
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
