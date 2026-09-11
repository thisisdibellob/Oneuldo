import { getMarketShelfLayout } from '../src/game/marketShelfLayout';

describe('진열대 화면 비례', () => {
  it.each([
    [320, 568], [320, 932], [375, 667], [390, 844], [430, 932], [768, 1024], [1024, 768], [1920, 1080],
  ])('%i × %i에서도 양쪽 기둥과 이미지 비율, 상품 바닥 높이를 유지한다', (width, height) => {
    const layout = getMarketShelfLayout(width, height, 6, 34);
    expect(layout.bayWidth).toBeLessThanOrEqual(width);
    expect(layout.bayWidth / layout.imageHeight).toBeCloseTo(1536 / 1024);
    expect(layout.imageTop).toBeLessThanOrEqual(0.000001);
    expect(layout.imageTop + layout.bayWidth * 760 / 1536).toBeCloseTo(layout.surfaceY);
    expect(layout.itemWidth * layout.columns + layout.sideInset * 2).toBeCloseTo(layout.bayWidth);
    expect(layout.sideInset).toBeGreaterThan(layout.bayWidth * 32 / 1536);
    expect(layout.artworkSize).toBeLessThanOrEqual(layout.itemWidth - 12);
    expect(layout.artworkSize).toBeLessThanOrEqual(layout.surfaceY - 24);
    expect(layout.artworkSize).toBeGreaterThan(60);
    // Two-line names cannot push the products or quantity buttons off the shelf.
    expect(layout.surfaceY + 78 + 4 + 44 + 6).toBeCloseTo(layout.rowHeight);
  });

  it('모든 화면에서 한 줄 네 상품을 배치한다', () => {
    expect(getMarketShelfLayout(375, 812, 12).columns).toBe(4);
    expect(getMarketShelfLayout(1024, 768, 6).columns).toBe(4);
  });
});
