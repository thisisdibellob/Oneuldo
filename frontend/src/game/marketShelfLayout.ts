/** Geometry for the 1536 × 1024 empty shelf artwork (no perspective scaling).
 * Crop unused headroom instead of stretching the image separately on each axis.
 * Products stand at source y=760; labels and controls have their own fixed space.
 */
export function getMarketShelfLayout(width: number, height: number, productCount: number, safeHeight = 0) {
  const bayWidth = Math.min(Math.max(width, 1), 1240);
  const columns = 4;
  const rowCount = Math.max(1, Math.ceil(productCount / columns));
  const rowHeight = Math.max(252, Math.min(304, 132 + bayWidth * 760 / 1536, (height - 224 - safeHeight) / rowCount));
  const surfaceY = rowHeight - 132;
  const imageHeight = bayWidth * 1024 / 1536;
  const sideInset = Math.max(12, bayWidth * 32 / 1536 + 6);
  const itemWidth = (bayWidth - sideInset * 2) / columns;
  return {
    bayWidth, columns, rowHeight, surfaceY, imageHeight, sideInset, itemWidth,
    imageTop: surfaceY - bayWidth * 760 / 1536,
    artworkSize: Math.min(itemWidth - 12, surfaceY - 24, 156),
  };
}
