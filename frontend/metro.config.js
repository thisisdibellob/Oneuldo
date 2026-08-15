const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');
const config = getDefaultConfig(projectRoot);

// pnpm keeps the virtual store at the repository root to avoid Windows'
// native-build path-length limit. Metro must be allowed to follow it.
config.watchFolders = [...(config.watchFolders ?? []), workspaceRoot];
config.resolver.unstable_enableSymlinks = true;

module.exports = config;
