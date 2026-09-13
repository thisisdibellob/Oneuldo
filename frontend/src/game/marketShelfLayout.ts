/** Four columns with complete labels and 44px controls; artwork keeps its source ratio. */
export function getMarketShelfLayout(
  width: number, height: number, productCount: number, safeHeight = 0, fontScale = 1,
  measuredViewportHeight?: number,
) {
  const bayWidth = Math.min(Math.max(width, 1), 1240);
  const columns = 4;
  const rowCount = Math.max(1, Math.ceil(productCount / columns));
  const compactRows = width >= 640 && height <= 500;
  const scale = Math.max(1, fontScale);
  const sideInset = Math.max(12, bayWidth * 32 / 1536 + 6);
  const itemWidth = (bayWidth - sideInset * 2) / columns;
  const tagHeight = Math.ceil(58 * scale + 6);
  const buttonHeight = Math.max(44, Math.ceil(23 * scale + 16));
  const minimumRowHeight = compactRows
    ? Math.max(tagHeight, buttonHeight, 40) + 8
    : 6 + 40 + tagHeight + 4 + buttonHeight + 4;
  const availableHeight = Math.max(1, measuredViewportHeight ?? (height - 144 - safeHeight));
  const spacing = 8 + Math.max(0, rowCount - 1) * 4;
  const fitRowHeight = Math.floor((availableHeight - spacing) / rowCount);
  const rowHeight = Math.max(minimumRowHeight, Math.min(compactRows ? 92 : 252, fitRowHeight));
  const surfaceY = compactRows ? rowHeight - 8 : rowHeight - tagHeight - 4 - buttonHeight - 4;
  const imageHeight = bayWidth * 1024 / 1536;
  const artworkSize = compactRows
    ? Math.max(24, Math.min(48, itemWidth * 0.25, surfaceY - 6))
    : Math.max(24, Math.min(itemWidth - 12, surfaceY - 6, 156));
  const contentHeight = rowCount * rowHeight + spacing;
  return {
    bayWidth, columns, rowCount, compactRows, rowHeight, surfaceY, imageHeight, sideInset, itemWidth,
    imageTop: surfaceY - bayWidth * 760 / 1536,
    artworkSize, tagHeight, buttonHeight, contentHeight, availableHeight,
    overflows: contentHeight > availableHeight + 1,
  };
}
