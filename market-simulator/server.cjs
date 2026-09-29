#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline');
require('./runtime.cjs').register();
const { ReplayBridge, loadReplayConfig } = require('./replay-bridge.cjs');
const string = { type: 'string', minLength: 1 };
const seed = { anyOf: [string, { type: 'number' }] };
const object = { type: 'object' };
const llm = { type: 'object', additionalProperties: false, properties: { baseUrl: string, model: string, apiKeyEnv: string, maxCalls: { type: 'integer', minimum: 1, maximum: 2000 }, timeoutMs: { type: 'integer', minimum: 1, maximum: 300000 } } };
const schema = (properties, required = []) => ({ type: 'object', additionalProperties: false, properties, required });
const definitions = [
  { name: 'list_personas', description: 'List available personas for intent trace generation.', inputSchema: schema({}), annotations: { readOnlyHint: true } },
  { name: 'generate_trace', description: 'Generate an intent-level trace for a registered tab mission or explicit snapshot. Stochastic generation is offline. Saves JSON; never uploads gameplay logs.', inputSchema: schema({ personaId: string, seed, tabId: string, snapshot: object, snapshotFilePath: string, outputPath: string, mode: { enum: ['stochastic', 'llm'] }, maxActions: { type: 'integer', minimum: 1, maximum: 2000 }, timeBudgetMs: { type: 'integer', minimum: 1000, maximum: 3600000 }, attentionExperience: schema({ visit: { enum: ['first-play', 'revisit'] }, previousLayoutKey: string, memory: object }, ['visit']), llm }, ['personaId', 'seed']) },
  { name: 'validate_trace', description: 'Validate a trace and its target mission snapshot with the shared schema and game guards.', inputSchema: schema({ trace: object, traceFilePath: string, tabId: string, snapshot: object, snapshotFilePath: string }), annotations: { readOnlyHint: true } },
  { name: 'pair_app_session', description: 'Issue a five-minute, one-use pairing URL for one allowlisted local/staging test account. Open it in the development web app and log in with that account.', inputSchema: schema({ appOrigin: string, backendOrigin: string, memberId: string }, ['appOrigin', 'backendOrigin', 'memberId']) },
  { name: 'list_app_sessions', description: 'List authenticated development app tabs, mission readiness and per-tab replay status.', inputSchema: schema({}), annotations: { readOnlyHint: true } },
  { name: 'play_trace', description: 'Send a complete validated trace to one authenticated app tab for real-time replay through existing user inputs. One active replay per tab and test account.', inputSchema: schema({ tabId: string, trace: object, traceFilePath: string }, ['tabId']) },
  { name: 'replay_status', description: 'Read progress and smoothness measurements for a replay.', inputSchema: schema({ replayId: string, tabId: string }), annotations: { readOnlyHint: true } },
  { name: 'stop_replay', description: 'Stop replay on the selected tab and release its virtual input through the app.', inputSchema: schema({ tabId: string }, ['tabId']) },
];
function checkArguments(value, contract, at = 'arguments') {
  if (contract.anyOf) { if (!contract.anyOf.some(option => { try { checkArguments(value, option, at); return true; } catch { return false; } })) throw new Error(`${at}: invalid value`); return; }
  if (contract.enum && !contract.enum.includes(value)) throw new Error(`${at}: expected ${contract.enum.join(' | ')}`);
  if (contract.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${at}: expected object`);
    for (const key of contract.required ?? []) if (!Object.hasOwn(value, key)) throw new Error(`${at}.${key}: required`);
    for (const [key, child] of Object.entries(value)) {
      if (Object.hasOwn(contract.properties ?? {}, key)) checkArguments(child, contract.properties[key], `${at}.${key}`);
      else if (contract.additionalProperties === false) throw new Error(`${at}.${key}: unknown argument`);
    }
  }
  if (contract.type === 'string' && (typeof value !== 'string' || !value.trim())) throw new Error(`${at}: expected nonempty string`);
  if (['number', 'integer'].includes(contract.type)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || (contract.type === 'integer' && !Number.isInteger(value))) throw new Error(`${at}: expected ${contract.type}`);
    if ((contract.minimum !== undefined && value < contract.minimum) || (contract.maximum !== undefined && value > contract.maximum)) throw new Error(`${at}: out of range`);
  }
}
function readJson(file) { return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')); }
function readTrace(args) {
  if (Boolean(args.trace) === Boolean(args.traceFilePath)) throw new Error('Provide exactly one of trace or traceFilePath.');
  return args.trace ?? readJson(args.traceFilePath);
}
function createService(options = {}) {
  let bridge = options.bridge ?? null, starting = null;
  const ownerId = crypto.randomUUID();
  const validate = options.validateTrace ?? ((trace, snapshot) => require('./src/traceValidation.ts').validateTrace(trace, snapshot));
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
  async function invokeTool(name, args = {}) {
    const tool = definitions.find(item => item.name === name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    checkArguments(args, tool.inputSchema);
    if (name === 'list_personas') {
      const personas = require('./src/personas.ts').listPersonas();
      return { personas: personas.map(({ prompt, ...profile }) => profile) };
    }
    if (name === 'generate_trace') {
      const snapshot = await getSnapshot(args);
      const { tabId, snapshot: supplied, snapshotFilePath, outputPath, ...settings } = args;
      const trace = await require('./src/simulator.ts').generateTrace({ ...settings, snapshot });
      const validation = validate(trace, snapshot);
      if (!validation.valid) throw new Error(`Generated trace invalid: ${validation.errors.join('; ')}`);
      const destination = path.resolve(outputPath ?? path.join(__dirname, 'output', `trace-${crypto.randomUUID()}.json`));
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      const snapshotDestination = `${destination}.snapshot.json`;
      fs.writeFileSync(snapshotDestination, JSON.stringify(snapshot, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
      try { fs.writeFileSync(destination, JSON.stringify(trace, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); }
      catch (error) { fs.unlinkSync(snapshotDestination); throw error; }
      return { outputPath: destination, snapshotFilePath: snapshotDestination, traceId: trace.traceId, personaId: trace.personaId, personaVersion: trace.personaVersion, steps: trace.steps.length, target: trace.target };
    }
    if (name === 'validate_trace') return validate(readTrace(args), await getSnapshot(args));
    const active = await getBridge();
    if (name === 'pair_app_session') return active.pair(args);
    if (name === 'list_app_sessions') return active.list();
    if (name === 'play_trace') return active.play(args.tabId, readTrace(args), ownerId);
    if (name === 'replay_status') return active.status(args);
    if (name === 'stop_replay') return active.stop(args.tabId, ownerId);
    throw new Error('Unsupported tool.');
  }
  async function dispatch(message) {
    if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') return { jsonrpc: '2.0', id: message?.id ?? null, error: { code: -32600, message: 'Invalid Request' } };
    if (message.id === undefined) return null;
    let result;
    if (message.method === 'initialize') result = { protocolVersion: ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'].includes(message.params?.protocolVersion) ? message.params.protocolVersion : '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'oneuldo-market-replay', version: '2.0.0' } };
    else if (message.method === 'ping') result = {};
    else if (message.method === 'tools/list') result = { tools: definitions };
    else if (message.method === 'tools/call') {
      try { const value = await invokeTool(message.params?.name, message.params?.arguments ?? {}); result = { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value, isError: false }; }
      catch (error) { result = { content: [{ type: 'text', text: error.message }], isError: true }; }
    } else return { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Method not found' } };
    return { jsonrpc: '2.0', id: message.id, result };
  }
  return { invokeTool, dispatch, close: async () => { if (bridge) await bridge.close(); }, getBridge };
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
module.exports = { definitions, createService, ...service, start };
if (require.main === module) start();
