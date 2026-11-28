const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
// This is an independent app: no game, backend, reports or browser-profile watches.
const escapedRoot = __dirname.split(/[\\/]/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\\\/]');
config.resolver.blockList = [new RegExp('^' + escapedRoot + '[\\\\/]dist(?:[\\\\/]|$)')];
module.exports = config;
