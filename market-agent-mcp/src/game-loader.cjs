const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '../..');
const frontendRoot = path.join(projectRoot, 'frontend');
const gameRoot = path.join(frontendRoot, 'src/game') + path.sep;
const typescriptPath = path.join(frontendRoot, 'node_modules/typescript');

function installGameTypeScriptLoader() {
  if (!fs.existsSync(typescriptPath)) {
    throw new Error('frontend/node_modules/typescript가 없습니다. 먼저 frontend 의존성을 설치해 주세요.');
  }
  const ts = require(typescriptPath);
  const previous = require.extensions['.ts'];
  require.extensions['.ts'] = (module, filename) => {
    const resolved = path.resolve(filename);
    if (!resolved.startsWith(gameRoot)) {
      if (previous) return previous(module, filename);
      throw new Error(`MCP 서버는 frontend/src/game 밖의 TypeScript를 불러오지 않습니다: ${resolved}`);
    }
    const source = fs.readFileSync(filename, 'utf8');
    const { outputText, diagnostics } = ts.transpileModule(source, {
      fileName: filename,
      reportDiagnostics: true,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        moduleResolution: ts.ModuleResolutionKind.Node10,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        resolveJsonModule: true,
      },
    });
    const errors = diagnostics?.filter((item) => item.category === ts.DiagnosticCategory.Error) ?? [];
    if (errors.length) {
      throw new Error(errors.map((item) => ts.flattenDiagnosticMessageText(item.messageText, '\n')).join('\n'));
    }
    module._compile(outputText, filename);
  };
}

let cached;
function loadGame() {
  if (cached) return cached;
  installGameTypeScriptLoader();
  cached = {
    session: require(path.join(gameRoot, 'marketSession.ts')),
    environment: require(path.join(gameRoot, 'marketEnvironment.ts')),
    scenarios: require(path.join(gameRoot, 'scenarios.ts')),
  };
  return cached;
}

module.exports = { loadGame, projectRoot };
