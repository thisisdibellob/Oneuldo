import { getGamePhoneLayout, PHONE_SCREEN_INSET } from '../src/game/phoneLayout';

it.each([[375, 812], [375, 612], [1280, 720], [844, 390], [320, 568]])('휴대폰 비율을 유지하고 %s×%s 화면 안에 들어간다', (width, height) => {
  const frame = getGamePhoneLayout(width, height);
  expect(frame.width / frame.height).toBeCloseTo(390 / 750);
  expect(frame.width).toBeLessThanOrEqual(width - 32);
  expect(frame.height).toBeLessThanOrEqual(height - 48);
  expect(frame.contentWidth).toBeGreaterThanOrEqual(280);
  expect(frame.contentWidth * frame.contentScale).toBeCloseTo(frame.width - 16);
  expect(frame.contentHeight * frame.contentScale).toBeCloseTo(frame.height - 16);
  expect(frame.screenRadius + PHONE_SCREEN_INSET).toBeCloseTo(frame.caseRadius);
});
