import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const requireFromProject = createRequire(import.meta.url);
const expoPackage = requireFromProject.resolve('expo/package.json');
const expoCliPackage = requireFromProject.resolve('@expo/cli/package.json', {
  paths: [expoPackage],
});
const requireFromExpoCli = createRequire(expoCliPackage);
const qrcode = requireFromExpoCli('qrcode-terminal');
const cloudflaredPath =
  process.env.CLOUDFLARED_PATH ||
  join(process.env.LOCALAPPDATA || '', 'Programs', 'cloudflared', 'cloudflared.exe');
const expoCliPath = join(projectRoot, 'node_modules', 'expo', 'bin', 'cli');
const expoStateDir = join(projectRoot, '.expo');
const tunnelInfoPath = join(expoStateDir, 'cloudflare-tunnel.json');

mkdirSync(expoStateDir, { recursive: true });
rmSync(tunnelInfoPath, { force: true });

if (!existsSync(cloudflaredPath)) {
  console.error('Cloudflare Tunnel을 찾지 못했습니다.');
  console.error(`확인할 경로: ${cloudflaredPath}`);
  process.exit(1);
}

let cloudflared;
let expo;
let shuttingDown = false;
let tunnelLog = '';

function killTree(child) {
  if (!child?.pid || child.killed) return;

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  killTree(expo);
  killTree(cloudflared);
  process.exit(exitCode);
}

function startExpo(tunnelUrl) {
  const expoUrl = tunnelUrl.replace(/^https:\/\//, 'exps://');

  writeFileSync(
    tunnelInfoPath,
    JSON.stringify({ tunnelUrl, expoUrl, createdAt: new Date().toISOString() }, null, 2),
  );
  console.log('\nCloudflare 터널이 연결됐습니다.');
  console.log(`Expo Go 주소: ${expoUrl}\n`);
  qrcode.generate(expoUrl, { small: true }, (code) => console.log(code));
  console.log('Expo Go로 QR을 스캔하세요. 종료하려면 Ctrl+C를 누르세요.\n');

  expo = spawn(process.execPath, [expoCliPath, 'start', '--localhost', '--clear'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      EXPO_PACKAGER_PROXY_URL: tunnelUrl,
    },
    stdio: 'inherit',
  });

  expo.once('error', (error) => {
    console.error(`Expo 실행 실패: ${error.message}`);
    shutdown(1);
  });
  expo.once('exit', (code) => shutdown(code ?? 0));
}

console.log('Expo용 Cloudflare 터널을 연결하고 있습니다...');

cloudflared = spawn(
  cloudflaredPath,
  ['tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:8081'],
  {
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

const tunnelTimeout = setTimeout(() => {
  console.error('Cloudflare 터널 연결 시간이 초과됐습니다.');
  if (tunnelLog.trim()) console.error(tunnelLog.trim());
  shutdown(1);
}, 30000);

function readTunnelOutput(chunk) {
  const text = chunk.toString();
  tunnelLog = `${tunnelLog}${text}`.slice(-5000);
  const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);

  if (match && !expo) {
    clearTimeout(tunnelTimeout);
    startExpo(match[0]);
  }
}

cloudflared.stdout.on('data', readTunnelOutput);
cloudflared.stderr.on('data', readTunnelOutput);
cloudflared.once('error', (error) => {
  clearTimeout(tunnelTimeout);
  console.error(`Cloudflare Tunnel 실행 실패: ${error.message}`);
  shutdown(1);
});
cloudflared.once('exit', (code) => {
  if (!shuttingDown && !expo) {
    clearTimeout(tunnelTimeout);
    console.error(`Cloudflare Tunnel이 연결 전에 종료됐습니다. 종료 코드: ${code ?? 1}`);
    if (tunnelLog.trim()) console.error(tunnelLog.trim());
    shutdown(code ?? 1);
  }
});

process.once('SIGINT', () => {
  console.log('\n개발 서버를 종료합니다.');
  shutdown(0);
});
process.once('SIGTERM', () => shutdown(0));
