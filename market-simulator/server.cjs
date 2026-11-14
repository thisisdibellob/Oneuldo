#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline');
require('./runtime.cjs').register();
const { ReplayBridge, loadReplayConfig } = require('./replay-bridge.cjs');
const { beginGeneration, withDiagnostics } = require('./generation-journal.cjs');
const { checkArguments, readJson, saveTrace } = require('./tools/common.cjs');
const { LearnerContextLoader } = require('./learner-context-loader.cjs');
// Tool modules in public catalog order. Legacy modules are frozen and kept for reproduction.
const modules = {
  feedback: require('./tools/legacy/feedback.cjs'),
  actorPlan: require('./tools/actorPlan.cjs'),
  wholeTrace: require('./tools/wholeTrace.cjs'),
  personas: require('./tools/personas.cjs'),
  validation: require('./tools/validation.cjs'),
  generateTrace: require('./tools/legacy/generateTrace.cjs'),
  trace: require('./tools/trace.cjs'),
  replay: require('./tools/replay.cjs'),
  learning: require('./tools/legacy/learning.cjs'),
};
// Profiles limit which tools are listed and callable. 'all' keeps the original
// public catalog (authoring tools callable but unlisted).
const PROFILES = {
  all: { modules: Object.keys(modules), listHidden: false },
  generation: { modules: ['wholeTrace', 'personas', 'trace'], listHidden: true },
  validation: { modules: ['wholeTrace', 'personas', 'trace', 'validation'], listHidden: true },
  replay: { modules: ['personas', 'trace', 'replay'], listHidden: false },
};
const definitions = Object.values(modules).flatMap(module => module.definitions);
const authoringDefinitions = Object.values(modules).flatMap(module => module.hiddenDefinitions ?? []);
const owners = new Map(Object.entries(modules).flatMap(([key, module]) =>
  [...module.definitions, ...(module.hiddenDefinitions ?? [])].map(tool => [tool.name, { key, module, tool }])));
function resolveProfile(name = process.env.MARKET_SIM_PROFILE ?? 'all') {
  const profile = PROFILES[name];
  if (!profile) throw new Error(`Unknown tool profile: ${name} (expected ${Object.keys(PROFILES).join(' | ')})`);
  const keys = new Set(profile.modules);
  const listed = Object.entries(modules).filter(([key]) => keys.has(key))
    .flatMap(([, module]) => [...module.definitions, ...(profile.listHidden ? module.hiddenDefinitions ?? [] : [])]);
  return { name, keys, listed };
}
function createService(options = {}) {
  const profile = resolveProfile(options.profile);
  let bridge = options.bridge ?? null, starting = null, closing = false;
  const learnerContexts = new LearnerContextLoader();
  const planSessions = new Map();
  const feedbackSessions = new Map(), feedbackBegins = new Map();
  const wholeTraceSessions = new Map();
  const ownerId = crypto.randomUUID();
  const validate = options.validateTrace ?? ((trace, snapshot) => require('./src/traceValidation.ts').validateTrace(trace, snapshot));
  const generate = options.generateTrace ?? (args => require('./src/simulator.ts').generateTrace(args));
  async function generateAndSave(settings, snapshot, outputPath, onFailure) {
    const destination = path.resolve(outputPath ?? path.join(__dirname, 'output', `trace-${crypto.randomUUID()}.json`));
    let journal, stage = 'generation';
    try {
      const persona = require('./src/personas.ts').getPersona(settings.personaId);
      journal = beginGeneration(destination, snapshot, settings, { personaVersion: persona.version,
        actorPolicyVersion: require('./src/llmPolicy.ts').attentionActorPolicyVersion(settings) });
      const trace = await generate({ ...settings, snapshot, onCheckpoint: entry => journal.checkpoint(entry),
        onActorDecisionAccepted: () => settings.onActorDecisionAccepted?.(),
        onActorDecisionApplied: after => settings.onActorDecisionApplied?.(after) });
      const validation = validate(trace, snapshot);
      if (!validation.valid) throw new Error(`Generated trace invalid: ${validation.errors.join('; ')}`);
      stage = 'persistence';
      const result = saveTrace(trace, snapshot, destination);
      journal.complete(trace);
      return { ...result, diagnosticDirectory: journal.diagnosticDirectory };
    } catch (error) {
      try { journal?.fail(stage); } catch { /* Keep the original failure and the already captured evidence. */ }
      onFailure?.(stage);
      throw journal ? withDiagnostics(error, journal.diagnosticDirectory) : error;
    }
  }
  async function getBridge() {
    if (!bridge) bridge = new ReplayBridge(loadReplayConfig(), { validateTrace: validate });
    if (!starting) starting = bridge.start().catch(error => { starting = null; throw error; });
    await starting;
    return bridge;
  }
  async function getSnapshot(args) {
    if ([args.tabId, args.snapshot, args.snapshotFilePath].filter(Boolean).length !== 1) throw new Error('Provide exactly one of tabId, snapshot, or snapshotFilePath.');
    return args.tabId ? (await getBridge()).snapshot(args.tabId) : args.snapshot ?? readJson(args.snapshotFilePath);
  }
  // Binds a learner archive read to the exact snapshot and app tab it was verified against.
  const actorBindingFields=['tabId','epoch','appOrigin','backendOrigin','memberId','targetEnv','connectedAt','ready','visible','snapshotId','questInstanceId','sessionId','replayId'];
  async function captureLearnerBinding(args,snapshot) {
    const canonical=require('../frontend/src/game/marketReplayTrace.ts').canonicalMarketReplayJson;
    let app=null;
    if(args.tabId){const tab=(await getBridge()).list().sessions.find(item=>item.tabId===args.tabId);
      if(!tab||!tab.ready||tab.replayId)throw new Error('Actor app is not ready for learner verification');
      app=Object.fromEntries(actorBindingFields.map(field=>[field,tab[field]]));}
    return {snapshot:canonical(snapshot),app};
  }
  async function assertLearnerBinding(args,binding,context) {
    await learnerContexts.assertCurrent(context);
    const canonical=require('../frontend/src/game/marketReplayTrace.ts').canonicalMarketReplayJson;
    if(canonical(await getSnapshot(args))!==binding.snapshot)throw new Error('Actor snapshot changed during learner verification');
    if(args.tabId){const tab=(await getBridge()).list().sessions.find(item=>item.tabId===args.tabId);
      if(!tab||!tab.ready||tab.replayId||JSON.stringify(Object.fromEntries(actorBindingFields.map(field=>[field,tab[field]])))!==JSON.stringify(binding.app))
        throw new Error('Actor app binding changed during learner verification');}
    if(closing)throw new Error('Actor planning service is closing');
  }
  async function invokeTool(name, args = {}) {
    const owner = owners.get(name);
    if (!owner) throw new Error(`Unknown tool: ${name}`);
    if (!profile.keys.has(owner.key)) throw new Error(`Tool ${name} is not available in the ${profile.name} profile`);
    checkArguments(args, owner.tool.inputSchema);
    return owner.module.invoke(name, args, { getSnapshot, getBridge, validate, generate, generateAndSave, ownerId,
      planSessions, feedbackSessions, feedbackBegins, wholeTraceSessions, learnerContexts, captureLearnerBinding, assertLearnerBinding });
  }
  async function dispatch(message) {
    if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') return { jsonrpc: '2.0', id: message?.id ?? null, error: { code: -32600, message: 'Invalid Request' } };
    if (message.id === undefined) return null;
    let result;
    if (message.method === 'initialize') result = { protocolVersion: ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'].includes(message.params?.protocolVersion) ? message.params.protocolVersion : '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'oneuldo-market-replay', version: '2.0.0' } };
    else if (message.method === 'ping') result = {};
    else if (message.method === 'tools/list') result = { tools: profile.listed };
    else if (message.method === 'tools/call') {
      try { const value = await invokeTool(message.params?.name, message.params?.arguments ?? {}); result = { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value, isError: false }; }
      catch (error) { result = { content: [{ type: 'text', text: error.message }], isError: true }; }
    } else return { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Method not found' } };
    return { jsonrpc: '2.0', id: message.id, result };
  }
  return { invokeTool, dispatch, close: async () => {
    closing=true;await learnerContexts.close();
    for (const record of feedbackSessions.values()) if (!record.session.status.complete) record.session.close();
    await Promise.allSettled([...feedbackSessions.values()].map(record=>record.done));
    if (bridge) await bridge.close();
  }, getBridge };
}
const service = createService();
function start() {
  const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  const pending = new Set();
  input.on('line', line => {
    if (!line.trim()) return;
    let message;
    try { if (Buffer.byteLength(line) > 4 * 1024 * 1024) throw new Error('too large'); message = JSON.parse(line); }
    catch { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid JSON or request exceeds 4 MiB; use a file path.' } }) + '\n'); return; }
    const task = service.dispatch(message).then(response => { if (response) process.stdout.write(JSON.stringify(response) + '\n'); }).finally(() => pending.delete(task));
    pending.add(task);
  });
  input.on('close', async () => { await Promise.allSettled(pending); await service.close(); });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await service.close(); process.exit(0); });
}
module.exports = { definitions, authoringDefinitions, PROFILES, createService, ...service, start };
if (require.main === module) start();
