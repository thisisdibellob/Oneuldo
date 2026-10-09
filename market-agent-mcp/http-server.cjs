#!/usr/bin/env node
const { OneuldoMarketHttpService } = require('./src/http-service.cjs');

const service = new OneuldoMarketHttpService();
let closing = false;

async function shutdown() {
  if (closing) return;
  closing = true;
  await service.close();
  process.exit(0);
}

service.start().then(({ mcpUrl, browserUrl }) => {
  process.stderr.write(`[oneuldoMarket] shared service ready\n`);
  process.stderr.write(`[oneuldoMarket] MCP: ${mcpUrl}\n`);
  process.stderr.write(`[oneuldoMarket] browser: ${browserUrl}\n`);
}).catch((error) => {
  const code = error?.code === 'EADDRINUSE' ? 'BRIDGE_PORT_IN_USE' : 'SERVICE_START_FAILED';
  process.stderr.write(`[oneuldoMarket] ${code}: ${error.message}\n`);
  process.exit(1);
});

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
