import { getMarketShelfLayout } from '../src/game/marketShelfLayout';

describe('진열대 화면 비례와 12칸 맞춤', () => {
  it.each([
    [320, 568], [320, 932], [375, 667], [390, 844], [430, 932], [768, 1024], [1024, 768], [1920, 1080],
  ])('%i × %i에서 배경 비율과 상품 바닥, 두 줄 이름 및 터치 영역을 보존한다', (width, height) => {
    const layout = getMarketShelfLayout(width, height, 12, 34);
    expect(layout.columns).toBe(4);
    expect(layout.rowCount).toBe(3);
    expect(layout.bayWidth).toBeLessThanOrEqual(width);
    expect(layout.bayWidth / layout.imageHeight).toBeCloseTo(1536 / 1024);
    expect(layout.imageTop).toBeLessThanOrEqual(0.000001);
    expect(layout.imageTop + layout.bayWidth * 760 / 1536).toBeCloseTo(layout.surfaceY);
    expect(layout.itemWidth * layout.columns + layout.sideInset * 2).toBeCloseTo(layout.bayWidth);
    expect(layout.artworkSize).toBeLessThanOrEqual(layout.itemWidth - 12);
    expect(layout.artworkSize).toBeLessThanOrEqual(layout.surfaceY - 6);
    expect(layout.artworkSize).toBeGreaterThanOrEqual(40);
    expect(layout.buttonHeight).toBeGreaterThanOrEqual(44);
    expect(layout.surfaceY + layout.tagHeight + 4 + layout.buttonHeight + 4).toBeCloseTo(layout.rowHeight);
  });

  it.each([[375, 812, 81], [390, 844, 93], [1024, 768, 34], [844, 390, 0]])(
    '%i × %i에서는 12개 모두 실제 이용 공간에 들어간다', (width, height, safeHeight) => {
      const layout = getMarketShelfLayout(width, height, 12, safeHeight);
      expect(layout.contentHeight).toBeLessThanOrEqual(layout.availableHeight + 1);
      expect(layout.overflows).toBe(false);
      expect(layout.columns).toBe(4);
      expect(layout.rowCount).toBe(3);
    },
  );

  it('짧은 화면과 큰 글자는 버튼이나 글씨를 더 줄이지 않고 스크롤로 전환한다', () => {
    const small = getMarketShelfLayout(320, 568, 12, 34);
    const largerText = getMarketShelfLayout(375, 812, 12, 81, 1.8);
    expect(small.overflows).toBe(true);
    expect(largerText.overflows).toBe(true);
    expect(largerText.tagHeight).toBeGreaterThan(small.tagHeight);
    expect(largerText.buttonHeight).toBeGreaterThanOrEqual(44);
  });

  it('장바구니를 펼쳐 공간이 줄면 측정한 높이를 기준으로 스크롤한다', () => {
    const expanded = getMarketShelfLayout(375, 812, 12, 0, 1, 350);
    expect(expanded.availableHeight).toBe(350);
    expect(expanded.overflows).toBe(true);
    expect(getMarketShelfLayout(375, 812, 12, 0, 1, 668).overflows).toBe(false);
  });
});
