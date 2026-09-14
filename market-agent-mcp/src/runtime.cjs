const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { loadGame } = require('./game-loader.cjs');
const { buildObservation } = require('./observation.cjs');

const ALLOWED_ACT_TYPES = new Set([
  'interact', 'add', 'remove', 'requestReturn', 'checkout', 'requestCashier',
  'submit', 'retry', 'giveUp', 'skipRating', 'closeStation', 'viewCart',
  'viewHelp', 'closeView', 'rate',
]);

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function now() { return new Date().toISOString(); }
function makeId(prefix) { return `${prefix}-${crypto.randomUUID()}`; }

class MarketAgentRuntime {
  constructor(options = {}) {
    const game = loadGame();
    this.createAdapter = game.session.createMarketAgentAdapter;
    this.isNearMarketStation = game.environment.isNearMarketStation;
    this.sessions = new Map();
    this.dataDirectory = path.resolve(options.dataDirectory ?? process.env.ONEULDO_MARKET_MCP_DATA_DIR ?? path.join(__dirname, '../data'));
  }

  start(input = {}) {
    const sessionId = input.sessionId ?? makeId('market');
    if (this.sessions.has(sessionId)) throw this.error('SESSION_ALREADY_EXISTS', `이미 존재하는 세션입니다: ${sessionId}`);
    const agentModel = input.agentModel?.trim();
    const personaId = input.personaId?.trim();
    if (!agentModel || !personaId) throw this.error('INVALID_PROVENANCE', 'agentModel과 personaId는 필수입니다.');
    const maxSteps = input.maxSteps ?? 2000;
    if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 100000) {
      throw this.error('INVALID_MAX_STEPS', 'maxSteps는 1~100000 정수여야 합니다.');
    }
    const config = {
      ...(input.config ?? {}),
      sessionId,
      startedAt: input.startedAt ?? now(),
      provenance: {
        ...(input.config?.provenance ?? {}),
        source: 'synthetic',
        agentModel,
        personaId,
        personaVersion: input.personaVersion,
        notes: input.notes,
      },
    };
    const state = {
      sessionId,
      adapter: this.createAdapter(config),
      revision: 0,
      stepCount: 0,
      maxSteps,
      actionResults: new Map(),
      createdAt: now(),
    };
    this.sessions.set(sessionId, state);
    this.appendLog(state, { type: 'session_started', config: { ...config, provenance: config.provenance }, maxSteps });
    return this.result(state, true, null, null);
  }

  observe(input = {}) {
    const state = this.requireSession(input.sessionId);
    return this.result(state, true, null, null);
  }

  move(input = {}) {
    return this.apply(input, { type: 'move', dx: input.dx, dy: input.dy, at: input.at });
  }

  act(input = {}) {
    if (!input.action || !ALLOWED_ACT_TYPES.has(input.action.type)) {
      throw this.error('ACTION_NOT_ALLOWED', `market_act에서 지원하지 않는 행동입니다: ${input.action?.type ?? '없음'}`);
    }
    return this.apply(input, { ...input.action, at: input.action.at ?? input.at });
  }

  apply(input, action) {
    const state = this.requireSession(input.sessionId);
    const actionId = input.actionId ?? makeId('action');
    const duplicate = state.actionResults.get(actionId);
    if (duplicate) return clone(duplicate);
    if (input.expectedRevision !== undefined && input.expectedRevision !== state.revision) {
      throw this.error('STALE_REVISION', `expectedRevision=${input.expectedRevision}, currentRevision=${state.revision}`, {
        currentRevision: state.revision,
      });
    }
    if (state.stepCount >= state.maxSteps) {
      throw this.error('STEP_LIMIT_REACHED', `최대 행동 수 ${state.maxSteps}회에 도달했습니다.`);
    }

    const requestedAt = now();
    this.appendLog(state, {
      type: 'agent_action_requested', actionId, revision: state.revision, action,
      decisionSummary: typeof input.decisionSummary === 'string' ? input.decisionSummary.slice(0, 500) : undefined,
      requestedAt,
    });
    const observation = state.adapter.act(action);
    state.stepCount += 1;
    state.revision += 1;
    const accepted = !observation.lastActionError;
    const response = this.result(state, accepted, actionId, action, requestedAt);
    state.actionResults.set(actionId, response);
    this.appendLog(state, {
      type: 'agent_action_result', actionId, revision: state.revision, accepted,
      error: observation.lastActionError, appliedAt: response.appliedAt,
    });
    if (observation.phase === 'finished') this.persistEpisode(state);
    return clone(response);
  }

  exportEpisode(input = {}) {
    const state = this.requireSession(input.sessionId);
    const episode = state.adapter.exportEpisode();
    const response = {
      schemaVersion: 'oneuldo.market.agent-episode-response.v1',
      sessionId: state.sessionId,
      revision: state.revision,
      stepCount: state.stepCount,
      episode,
    };
    this.writeEpisodeFile(state, episode);
    this.appendLog(state, { type: 'episode_exported', revision: state.revision, outcome: episode.outcome });
    return response;
  }

  persistEpisode(state) {
    try { this.writeEpisodeFile(state, state.adapter.exportEpisode()); }
    catch { /* A rejected finish-like action must not interrupt the MCP response. */ }
  }

  writeEpisodeFile(state, episode) {
    fs.mkdirSync(this.dataDirectory, { recursive: true });
    const safeId = state.sessionId.replace(/[^a-zA-Z0-9._-]/g, '_');
    fs.writeFileSync(path.join(this.dataDirectory, `${safeId}.episode.json`), `${JSON.stringify(episode, null, 2)}\n`, 'utf8');
  }

  result(state, accepted, actionId, action, requestedAt = null) {
    const observation = state.adapter.observe();
    return {
      schemaVersion: 'oneuldo.market.agent-action-response.v1',
      sessionId: state.sessionId,
      actionId,
      revision: state.revision,
      accepted,
      action,
      error: observation.lastActionError ? {
        code: 'ACTION_REJECTED', message: observation.lastActionError, recoverable: true,
      } : null,
      requestedAt,
      appliedAt: now(),
      observation: buildObservation(observation, state, this.isNearMarketStation),
    };
  }

  requireSession(sessionId) {
    if (!sessionId || !this.sessions.has(sessionId)) throw this.error('SESSION_NOT_FOUND', `세션을 찾을 수 없습니다: ${sessionId ?? '없음'}`);
    return this.sessions.get(sessionId);
  }

  appendLog(state, event) {
    fs.mkdirSync(this.dataDirectory, { recursive: true });
    const filename = path.join(this.dataDirectory, `${state.sessionId.replace(/[^a-zA-Z0-9._-]/g, '_')}.jsonl`);
    fs.appendFileSync(filename, `${JSON.stringify({ loggedAt: now(), sessionId: state.sessionId, ...event })}\n`, 'utf8');
  }

  error(code, message, details) {
    const error = new Error(message);
    error.code = code;
    error.details = details;
    return error;
  }
}

module.exports = { MarketAgentRuntime, ALLOWED_ACT_TYPES };
