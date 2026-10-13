const PHONE_ASPECT_RATIO = 390 / 750;
export const PHONE_CASE_BORDER = 2;
export const PHONE_SCREEN_INSET = 8;

/** One physical frame for every app; short viewports scale the whole interface together. */
export function getGamePhoneLayout(viewportWidth: number, viewportHeight: number) {
  const width = Math.max(1, Math.min(360, viewportWidth - 32, (viewportHeight - 48) * PHONE_ASPECT_RATIO));
  const height = width / PHONE_ASPECT_RATIO;
  const innerWidth = Math.max(1, width - PHONE_SCREEN_INSET * 2);
  const innerHeight = Math.max(1, height - PHONE_SCREEN_INSET * 2);
  const contentScale = Math.min(1, innerWidth / 280);
  const caseRadius = Math.min(44, width * 0.12);
  const screenRadius = Math.max(0, caseRadius - PHONE_SCREEN_INSET);
  return { width, height, caseRadius, screenRadius, contentScale, contentWidth: innerWidth / contentScale, contentHeight: innerHeight / contentScale,
    contentLeft: (innerWidth - innerWidth / contentScale) / 2, contentTop: (innerHeight - innerHeight / contentScale) / 2 };
}
