#!/usr/bin/env node
const readline = require('node:readline');
const { MarketAgentRuntime } = require('./src/runtime.cjs');

if (process.env.ONEULDO_MARKET_RUNTIME !== 'local') {
  process.stderr.write('[oneuldoMarket] STDIO_BROWSER_MODE_REMOVED: npm start로 공유 HTTP 서비스를 실행하고 Codex MCP URL을 http://127.0.0.1:8765/mcp 로 변경하세요.\n');
  process.exit(78);
}
const runtime = new MarketAgentRuntime();

const sessionIdProperty = { type: 'string', minLength: 1, description: 'market_start가 반환한 세션 ID' };
const actionEnvelopeProperties = {
  sessionId: sessionIdProperty,
  actionId: { type: 'string', minLength: 1, description: '재시도 시에도 같은 값을 사용하는 멱등성 ID' },
  expectedRevision: { type: 'integer', minimum: 0, description: '직전에 관찰한 revision. 상태 충돌을 막기 위해 권장됩니다.' },
  at: { type: 'string', format: 'date-time', description: '선택적인 행동 발생 시각' },
  decisionSummary: { type: 'string', maxLength: 500, description: '선택 사항인 짧은 행동 이유. 내부 추론이 아니라 관찰 가능한 자기보고로만 저장됩니다.' },
};

const tools = [
  {
    name: 'market_start',
    description: '새 장보기 AI 세션을 시작하고 화면 전체를 표현한 최초 관찰값을 반환합니다. 합성 출처 식별을 위해 모델과 페르소나 정보가 필수입니다.',
    inputSchema: {
      type: 'object', additionalProperties: false,
      required: ['agentModel', 'personaId'],
      properties: {
        agentModel: { type: 'string', minLength: 1 },
        personaId: { type: 'string', minLength: 1 },
        personaVersion: { type: 'string' },
        notes: { type: 'string' },
        sessionId: { type: 'string', minLength: 1 },
        startedAt: { type: 'string', format: 'date-time' },
        maxSteps: { type: 'integer', minimum: 1, maximum: 100000, default: 2000 },
        config: {
          type: 'object',
          description: '기존 MarketSessionConfig의 일부. provenance, sessionId, startedAt은 서버가 합성 세션 값으로 덮어씁니다.',
          additionalProperties: true,
        },
      },
    },
  },
  {
    name: 'market_observe',
    description: '현재 게임 화면에서 알 수 있는 전체 상태를 다시 읽습니다. 지도, 좌표, 보이는 사람·시설·장애물, HUD, 현재 패널과 공개된 상품·재고·장바구니를 포함합니다.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['sessionId'], properties: { sessionId: sessionIdProperty } },
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  {
    name: 'market_move',
    description: '플레이어를 상대 좌표로 한 번 이동합니다. 직선거리 최대 32px이며 충돌과 화면 상태를 게임 엔진이 검증합니다. 자동 경로 탐색이나 목적지 이동은 제공하지 않습니다.',
    inputSchema: {
      type: 'object', additionalProperties: false,
      required: ['sessionId', 'actionId', 'expectedRevision', 'dx', 'dy'],
      properties: {
        ...actionEnvelopeProperties,
        dx: { type: 'number', minimum: -32, maximum: 32 },
        dy: { type: 'number', minimum: -32, maximum: 32 },
      },
    },
  },
  {
    name: 'market_act',
    description: '현재 화면에서 상호작용, 담기·반납, 장바구니·도움말, 계산, 재시도·포기·평가 행동 하나를 수행합니다. 이동과 순간이동은 이 도구에서 허용하지 않습니다.',
    inputSchema: {
      type: 'object', additionalProperties: false,
      required: ['sessionId', 'actionId', 'expectedRevision', 'action'],
      properties: {
        ...actionEnvelopeProperties,
        action: {
          oneOf: [
            { type: 'object', additionalProperties: false, required: ['type', 'station'], properties: { type: { const: 'interact' }, station: { type: 'string' }, at: { type: 'string', format: 'date-time' } } },
            { type: 'object', additionalProperties: false, required: ['type', 'productId'], properties: { type: { enum: ['add', 'remove', 'requestReturn'] }, productId: { type: 'string' }, quantity: { type: 'integer', minimum: 1, maximum: 99 }, at: { type: 'string', format: 'date-time' } } },
            { type: 'object', additionalProperties: false, required: ['type'], properties: { type: { enum: ['checkout', 'requestCashier'] }, checkoutId: { enum: ['checkout', 'checkout-2'] }, at: { type: 'string', format: 'date-time' } } },
            { type: 'object', additionalProperties: false, required: ['type'], properties: { type: { enum: ['submit', 'retry', 'giveUp', 'skipRating', 'closeStation', 'viewCart', 'viewHelp', 'closeView', 'continueBriefing'] }, at: { type: 'string', format: 'date-time' } } },
            { type: 'object', additionalProperties: false, required: ['type', 'difficulty', 'interest'], properties: { type: { const: 'rate' }, difficulty: { type: 'integer', minimum: 1, maximum: 5 }, interest: { type: 'integer', minimum: 1, maximum: 5 }, at: { type: 'string', format: 'date-time' } } },
          ],
        },
      },
    },
  },
  {
    name: 'market_export_episode',
    description: '성공 또는 포기로 끝난 세션의 전체 연구·감사 에피소드를 반환합니다. 진행 중 세션에서는 거부됩니다. 이 결과를 같은 세션의 다음 행동 결정에 사용하면 안 됩니다.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['sessionId'], properties: { sessionId: sessionIdProperty } },
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
];

function success(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}

function rpcError(id, code, message, data) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } })}\n`);
}

function toolResult(value) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  };
}

function toolFailure(error) {
  const value = {
    error: {
      code: error.code ?? 'INTERNAL_ERROR',
      message: error.message ?? String(error),
      ...(error.details ? { details: error.details } : {}),
    },
  };
  return { ...toolResult(value), isError: true };
}

async function callTool(name, args) {
  if (name === 'market_start') return runtime.start(args);
  if (name === 'market_observe') return runtime.observe(args);
  if (name === 'market_move') return runtime.move(args);
  if (name === 'market_act') return runtime.act(args);
  if (name === 'market_export_episode') return runtime.exportEpisode(args);
  const error = new Error(`알 수 없는 도구입니다: ${name}`);
  error.code = 'TOOL_NOT_FOUND';
  throw error;
}

async function handle(message) {
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    if (message?.id !== undefined) rpcError(message.id, -32600, 'Invalid Request');
    return;
  }
  if (message.method === 'notifications/initialized' || message.method === 'notifications/cancelled') return;
  if (message.method === 'initialize') {
    success(message.id, {
      protocolVersion: message.params?.protocolVersion ?? '2025-06-18',
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'oneuldo-market-agent', version: '0.1.0' },
      instructions: '장보기 화면 기반 실험 도구입니다. 먼저 market_start를 호출하세요. 매 행동 후 반환되는 observation 전체를 현재 화면으로 취급하세요. 이동은 market_move만 사용하며 한 번에 최대 32px입니다. 자동 경로 이동 도구는 없습니다. 화면에 공개되지 않은 정답을 추정하거나 export 결과를 같은 세션 행동에 사용하지 마세요.',
    });
    return;
  }
  if (message.method === 'tools/list') {
    success(message.id, { tools });
    return;
  }
  if (message.method === 'tools/call') {
    try {
      success(message.id, toolResult(await callTool(message.params?.name, message.params?.arguments ?? {})));
    } catch (error) {
      success(message.id, toolFailure(error));
    }
    return;
  }
  if (message.id !== undefined) rpcError(message.id, -32601, 'Method not found');
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on('line', (line) => {
  if (!line.trim()) return;
  let message;
  try { message = JSON.parse(line); }
  catch { rpcError(null, -32700, 'Parse error'); return; }
  void handle(message).catch((error) => rpcError(message.id ?? null, -32603, error.message));
});
