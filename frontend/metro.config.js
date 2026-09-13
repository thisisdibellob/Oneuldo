const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// Full-glyph WOFF2 is web-only; native font assets remain OTF/TTF.
if (!config.resolver.assetExts.includes('woff2')) {
  config.resolver.assetExts.push('woff2');
}

// Exported bundles/assets are generated output, never app source. Watching this
// tree on Windows floods FallbackWatcher with change/delete notifications and
// blocks Metro's HTTP responses. Keep normal source/node_modules watching.
const escapedRoot = __dirname.split(/[\\/]/)
  .map(segment => segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('[\\\\/]');
const exportOutput = new RegExp('^(?:' + escapedRoot + '[\\\\/])?dist(?:[\\\\/]|$)');
const existingBlockList = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existingBlockList) ? existingBlockList : existingBlockList ? [existingBlockList] : []),
  exportOutput,
];

module.exports = config;
