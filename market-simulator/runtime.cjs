// Process-local TypeScript loading; no browser, Metro, install step, or global loader.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('../frontend/node_modules/typescript');
const roots = ['src', '../frontend/src/game', '../frontend/src/behavior'].map(p => path.resolve(__dirname, p) + path.sep);
let installed = false;
function register() {
  if (installed) return;
  installed = true;
  const previous = require.extensions['.ts'];
  require.extensions['.ts'] = (module, filename) => {
    if (!roots.some(root => path.resolve(filename).startsWith(root))) {
      if (previous) return previous(module, filename);
      throw new Error('Simulator loader only supports simulator and shared game/behavior modules.');
    }
    const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      fileName: filename,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true, resolveJsonModule: true },
    });
    module._compile(outputText, filename);
  };
}
register();
module.exports = { register };
