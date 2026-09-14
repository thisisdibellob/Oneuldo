const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = path.resolve(__dirname, '..');
const config = require('../metro.config');
const asPatterns = value => Array.isArray(value) ? value : value ? [value] : [];
const patterns = asPatterns(config.resolver.blockList);
const rootPosix = projectRoot.replaceAll('\\', '/');
const rootWindows = rootPosix.replaceAll('/', '\\');

function isBlocked(filePath) {
  return patterns.some(pattern => {
    assert.ok(pattern instanceof RegExp, 'Metro blockList entries must stay regular expressions');
    pattern.lastIndex = 0;
    return pattern.test(filePath);
  });
}

function assertBoundary(filePath, expected) {
  assert.equal(isBlocked(filePath), expected, 'Direct file-map path: ' + filePath);
  // Expo's FallbackWatcher normalizes Windows separators before matching.
  assert.equal(isBlocked(filePath.replaceAll('\\', '/')), expected, 'Watcher POSIX path: ' + filePath);
}

test('ignores only the project export root in absolute and watcher-relative forms', () => {
  for (const prefix of ['', rootPosix + '/', rootWindows + '\\']) {
    for (const suffix of ['dist', 'dist/', 'dist/assets/index.js', 'dist\\assets\\images\\future-export.png']) {
      assertBoundary(prefix + suffix, true);
    }
  }
});

test('keeps runtime artwork, app source and dependency dist folders available', () => {
  const relativePaths = [
    'App.tsx',
    'src/game/gameAssets.ts',
    'src/dist/ordinary-source.ts',
    'assets/images/game/buildings/village/runtime/bld_market_v1.png',
    'assets/images/game/market/products/runtime/product_milk.png',
    'assets/images/game/market/interior/retail-v4/fridge-empty.png',
    'assets/fonts/pretendard.woff2',
    'assets/audio/apple-cider.m4a',
    'node_modules/example-package/dist/index.js',
    'node_modules/@example/package/dist/index.js',
    'dist-backup/retained-file.png',
    'distribution/source.ts',
  ];
  for (const relativePath of relativePaths) {
    assertBoundary(relativePath, false);
    assertBoundary(rootPosix + '/' + relativePath, false);
    assertBoundary(rootWindows + '\\' + relativePath.replaceAll('/', '\\'), false);
  }
});

test('preserves existing Metro exclusions and web/native asset support', () => {
  const defaults = getDefaultConfig(projectRoot);
  for (const original of asPatterns(defaults.resolver.blockList)) {
    assert.ok(patterns.some(pattern => pattern.source === original.source && pattern.flags === original.flags),
      'Existing Metro exclusion removed: ' + original);
  }
  for (const extension of ['woff2', 'otf', 'ttf', 'png', 'm4a']) {
    assert.ok(config.resolver.assetExts.includes(extension), 'Asset support removed: ' + extension);
  }
});
