const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { z } = require('zod');

const INSTRUCTIONS = '장보기 화면 기반 실험 도구입니다. 표시할 브라우저 URL에 고유 browserId를 넣고 같은 browserId로 market_bridge_status와 market_start를 호출하세요. 매 행동 후 observation 전체를 현재 화면으로 취급하세요. 이동은 market_move만 사용하며 한 번에 최대 32px입니다. 화면에 공개되지 않은 정답을 추정하거나 export 결과를 같은 세션 행동에 사용하지 마세요. 중단할 때는 market_stop을 호출해 기록과 제어권을 정리하세요.';

const sessionId = z.string().min(1).describe('market_start가 반환한 세션 ID');
const browserId = z.string().min(1).max(200).describe('오른쪽에 연 브라우저 URL의 marketAgentBrowserId 값');
const actionEnvelope = {
  sessionId,
  actionId: z.string().min(1).describe('재시도 시에도 같은 값을 사용하는 멱등성 ID'),
  expectedRevision: z.number().int().min(0).describe('직전에 관찰한 revision'),
  at: z.string().datetime().optional(),
  decisionSummary: z.string().max(500).optional(),
};
const timestamp = { at: z.string().datetime().optional() };
const action = z.union([
  z.object({ type: z.literal('interact'), station: z.string().min(1), ...timestamp }).strict(),
  z.object({ type: z.enum(['add', 'remove', 'requestReturn']), productId: z.string().min(1), quantity: z.number().int().min(1).max(99).optional(), ...timestamp }).strict(),
  z.object({ type: z.enum(['checkout', 'requestCashier']), checkoutId: z.enum(['checkout', 'checkout-2']).optional(), ...timestamp }).strict(),
  z.object({ type: z.enum(['submit', 'retry', 'giveUp', 'skipRating', 'closeStation', 'viewCart', 'viewHelp', 'closeView', 'continueBriefing']), ...timestamp }).strict(),
  z.object({ type: z.literal('rate'), difficulty: z.number().int().min(1).max(5), interest: z.number().int().min(1).max(5), ...timestamp }).strict(),
]);

function success(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }], structuredContent: value };
}

function failure(error) {
  const value = { error: { code: error?.code ?? 'INTERNAL_ERROR', message: error?.message ?? String(error), ...(error?.details ? { details: error.details } : {}) } };
  return { ...success(value), isError: true };
}

function owner(extra) {
  if (!extra.sessionId) {
    const error = new Error('Streamable HTTP MCP 세션 ID가 없습니다. Codex의 MCP 연결을 다시 시작해 주세요.');
    error.code = 'MCP_SESSION_REQUIRED';
    throw error;
  }
  return extra.sessionId;
}

function guarded(handler) {
  return async (input, extra) => {
    try { return success(await handler(input, extra)); }
    catch (error) { return failure(error); }
  };
}

function createOneuldoMcpServer(runtime, lease, bridge) {
  const server = new McpServer({ name: 'oneuldo-market-agent', version: '0.3.0' }, { instructions: INSTRUCTIONS });

  server.registerTool('market_bridge_status', {
    description: '공유 MCP/브라우저 브리지의 연결 상태와 현재 Codex 작업의 제어권 상태를 확인합니다.',
    inputSchema: z.object({ browserId: browserId.optional() }).strict(),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  }, guarded(async (_input, extra) => ({
    schemaVersion: 'oneuldo.market.bridge-status.v1',
    transport: 'streamable-http',
    browser: bridge.status(_input.browserId),
    control: lease.describe(owner(extra)),
  })));

  server.registerTool('market_start', {
    description: '연결된 실제 브라우저에서 새 장보기 AI 세션을 시작하고 화면 전체를 표현한 최초 관찰값을 반환합니다.',
    inputSchema: z.object({
      browserId, agentModel: z.string().min(1), personaId: z.string().min(1), personaVersion: z.string().optional(), notes: z.string().optional(),
      sessionId: z.string().min(1).optional(), startedAt: z.string().datetime().optional(), maxSteps: z.number().int().min(1).max(100000).default(2000),
      config: z.record(z.string(), z.unknown()).optional(),
    }).strict(),
    annotations: { openWorldHint: false },
  }, guarded(async (input, extra) => {
    const requester = owner(extra);
    const target = bridge.status(input.browserId).target;
    if (target && !target.authenticated) {
      const error = new Error('오른쪽 오늘도 화면에서 먼저 로그인해 주세요.');
      error.code = 'AUTH_REQUIRED';
      error.details = { browserId: input.browserId, view: target.view };
      throw error;
    }
    const existing = lease.describe(requester);
    if (existing.controlledByCurrentClient && existing.sessionId && existing.browserId) {
      await runtime.stop({
        browserId: existing.browserId,
        sessionId: existing.sessionId,
        reason: 'replaced-by-new-session',
      });
      lease.releaseOwner(requester);
    }
    lease.acquire(requester);
    try {
      const result = await runtime.start(input);
      lease.bind(requester, result?.sessionId ?? result?.observation?.sessionId, input.browserId);
      return result;
    } catch (error) {
      lease.releaseOwner(requester);
      throw error;
    }
  }));

  server.registerTool('market_observe', {
    description: '현재 게임 화면 전체를 다시 읽습니다. 지도, 좌표, 사람·시설·장애물, HUD, 현재 패널과 공개된 상품·재고·장바구니를 포함합니다.',
    inputSchema: z.object({ sessionId }).strict(),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  }, guarded(async (input, extra) => {
    const targetBrowserId = lease.assertSession(owner(extra), input.sessionId);
    return runtime.observe({ ...input, browserId: targetBrowserId });
  }));

  server.registerTool('market_move', {
    description: '플레이어를 상대 좌표로 한 번 이동합니다. 직선거리 최대 32px이며 자동 경로 탐색이나 목적지 순간이동은 제공하지 않습니다.',
    inputSchema: z.object({ ...actionEnvelope, dx: z.number().min(-32).max(32), dy: z.number().min(-32).max(32) }).strict(),
    annotations: { openWorldHint: false },
  }, guarded(async (input, extra) => {
    const targetBrowserId = lease.assertSession(owner(extra), input.sessionId);
    return runtime.move({ ...input, browserId: targetBrowserId });
  }));

  server.registerTool('market_act', {
    description: '현재 화면에서 브리핑 진행, 상호작용, 담기·반납, 장바구니·도움말, 계산, 재시도·포기·평가 행동 하나를 수행합니다.',
    inputSchema: z.object({ ...actionEnvelope, action }).strict(),
    annotations: { openWorldHint: false },
  }, guarded(async (input, extra) => {
    const targetBrowserId = lease.assertSession(owner(extra), input.sessionId);
    return runtime.act({ ...input, browserId: targetBrowserId });
  }));

  server.registerTool('market_stop', {
    description: '현재 AI 장보기 세션을 중단 처리하고 기존 행동 로그 저장을 마친 뒤 브라우저 화면과 제어권을 초기화합니다.',
    inputSchema: z.object({ sessionId, reason: z.string().max(500).optional() }).strict(),
    annotations: { openWorldHint: false },
  }, guarded(async (input, extra) => {
    const requester = owner(extra);
    const targetBrowserId = lease.assertSession(requester, input.sessionId);
    try {
      return await runtime.stop({ ...input, browserId: targetBrowserId });
    } finally {
      lease.releaseOwner(requester);
    }
  }));

  server.registerTool('market_export_episode', {
    description: '종료된 세션의 전체 연구·감사 에피소드를 반환하고 현재 Codex 작업의 브라우저 제어권을 반환합니다.',
    inputSchema: z.object({ sessionId }).strict(),
    annotations: { openWorldHint: false },
  }, guarded(async (input, extra) => {
    const requester = owner(extra);
    const targetBrowserId = lease.assertSession(requester, input.sessionId);
    const result = await runtime.exportEpisode({ ...input, browserId: targetBrowserId });
    lease.releaseOwner(requester);
    return result;
  }));

  return server;
}

module.exports = { createOneuldoMcpServer, INSTRUCTIONS };
