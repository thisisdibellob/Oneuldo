/** Geometry shared by MarketHud's styles and the replay's world occlusion. */
export const MARKET_HUD_LAYOUT = {
  horizontalPadding: 12,
  maxWidth: 420,
  borderWidth: 1,
  embeddedTop: 112,
  embeddedSafeAreaGap: 64,
  headerMinHeight: 44,
  titleLineHeight: 24,
  noteMinHeight: 62,
  notePaddingBottom: 10,
  itemNameLines: 2,
  itemNameLineHeight: 18,
  itemQuantityLineHeight: 20,
  itemQuantityFontSize: 16,
  itemMaxWidth: 128,
  itemGap: 3,
  cartWidth: 70,
  cartMinHeight: 52,
  cartIconSize: 24,
  cartGap: 2,
  cartLabelFontSize: 11,
  cartLabelLineHeight: 15,
  /** Longest note-row button label: "전체 목록" (5 incl. space) beside "장바구니" (4). */
  cartLabelMaxCharacters: 5,
} as const;

export type MarketHudRect = { left: number; top: number; right: number; bottom: number };

export function getMarketHudTopInset(safeAreaTop = 0, embedded = true): number {
  return embedded
    ? Math.max(MARKET_HUD_LAYOUT.embeddedTop, safeAreaTop + MARKET_HUD_LAYOUT.embeddedSafeAreaGap)
    : Math.max(12, safeAreaTop);
}

/**
 * Embedded shopping HUD, in the same viewport coordinates as the world camera.
 * Names can occupy two lines; ReplayPresentation has no measured text layout,
 * so reserve that full height even when every name fits on one line. At scale 1
 * this bounds the actual 108..115px card with a 115px rectangle. At larger font
 * scales also reserve wrapping for the longest note-row button label and production
 * quantities (1..99 plus at most two unit characters). Pretendard's digits and
 * Korean glyphs fit within one em; use that upper bound, not estimated text
 * measurements. Arbitrary component-only text is outside the replay contract.
 * The viewport's height and bottom safe area do not reposition this card.
 */
export function getMarketHudOcclusionRect(presentation: {
  viewport: { width: number; height: number };
  fontScale?: number;
  safeArea?: { top: number; bottom: number };
}): MarketHudRect {
  const layout = MARKET_HUD_LAYOUT;
  const fontScale = presentation.fontScale ?? 1;
  const width = Math.min(presentation.viewport.width - 2 * layout.horizontalPadding, layout.maxWidth);
  const left = (presentation.viewport.width - width) / 2;
  const top = getMarketHudTopInset(presentation.safeArea?.top);
  const headerHeight = Math.max(layout.headerMinHeight, layout.titleLineHeight * fontScale);
  const wrappedLines = (characters: number, width: number, fontSize: number) =>
    Math.ceil(characters / Math.max(1, Math.floor(width / (fontSize * fontScale))));
  const quantityLines = wrappedLines(4, layout.itemMaxWidth, layout.itemQuantityFontSize);
  const itemHeight = (layout.itemNameLines * layout.itemNameLineHeight
    + quantityLines * layout.itemQuantityLineHeight) * fontScale + layout.itemGap;
  const cartHeight = Math.max(layout.cartMinHeight, layout.cartIconSize + layout.cartGap
    + wrappedLines(layout.cartLabelMaxCharacters, layout.cartWidth, layout.cartLabelFontSize) * layout.cartLabelLineHeight * fontScale);
  const noteHeight = Math.max(layout.noteMinHeight,
    Math.max(itemHeight, cartHeight) + layout.notePaddingBottom);
  return { left, top, right: left + width, bottom: top + 2 * layout.borderWidth + headerHeight + noteHeight };
}
