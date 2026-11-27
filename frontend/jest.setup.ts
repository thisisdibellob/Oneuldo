// Existing game tests enter the world synchronously; treat player sprites as already preloaded.
// `__tests__/PlayerSpritePreload.test.tsx` resets this to cover the loading gate itself.
jest.mock('./src/game/playerSpritePreload', () => {
  const actual = jest.requireActual('./src/game/playerSpritePreload');
  actual.resetPlayerSpritePreloadForTests(true);
  return actual;
});

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
