#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline');
require('./runtime.cjs').register();
const { listPersonas, generateEpisode, generateBatch } = require('./src/simulator.ts');
const { validateGeneratedEpisode, validateGeneratedJsonlFile } = require('./src/schemaValidation.ts');
const { exportToBackend } = require('./src/backendExport.ts');

const string = { type: 'string', minLength: 1 };
const seed = { anyOf: [string, { type: 'number' }] };
const llm = { type: 'object', additionalProperties: false, properties: { baseUrl: string, model: string, apiKeyEnv: string, maxCalls: { type: 'integer', minimum: 1, maximum: 10000 }, timeoutMs: { type: 'integer', minimum: 1, maximum: 300000 } } };
const episodeProperties = {
  personaId: string, seed, environmentSeed: seed, difficulty: { enum: ['family', 'exact'] },
  mode: { enum: ['stochastic', 'llm'] }, startedAt: string,
  maxActions: { type: 'integer', minimum: 1, maximum: 10000 },
  timeBudgetMs: { type: 'integer', minimum: 1000 }, llm,
};
const { personaId: singleEpisodePersona, ...batchEpisodeProperties } = episodeProperties;
const definitions = [
  { name: 'list_personas', description: 'List synthetic shopping personas and policy parameters. No browser, app, or network required.', inputSchema: { type: 'object', additionalProperties: false, properties: {} }, annotations: { readOnlyHint: true } },
  { name: 'generate_episode', description: 'Simulate one complete synthetic episode and save JSONL. Stochastic mode is offline; llm mode explicitly enables model API calls. Returns a compact summary and output path.', inputSchema: { type: 'object', required: ['personaId', 'seed'], additionalProperties: false, properties: { ...episodeProperties, outputPath: string } } },
  { name: 'generate_batch', description: 'Generate episodes in parallel workers and save JSONL. Use distinct seed values for new samples; repeat the same seed for reproduction. No backend upload.', inputSchema: { type: 'object', required: ['count', 'seed', 'outputPath'], additionalProperties: false, properties: { ...batchEpisodeProperties, count: { type: 'integer', minimum: 1, maximum: 100000 }, personaMix: { type: 'object', minProperties: 1, additionalProperties: { type: 'number', exclusiveMinimum: 0 } }, outputPath: string, concurrency: { type: 'integer', minimum: 1, maximum: 32 } } } },
  { name: 'validate_episode_schema', description: 'Validate a generated {episode,behaviorLogs,trace,summary} object or a JSONL file against actual frontend TypeScript contracts, synthetic provenance and sequence invariants.', inputSchema: { type: 'object', additionalProperties: false, properties: { episode: { type: 'object' }, batchFilePath: string } }, annotations: { readOnlyHint: true } },
  { name: 'export_to_backend', description: 'Explicitly upload validated JSONL to an isolated configured local/staging backend in batches of 50. Requires MARKET_SIM_TARGETS configuration with isolated:true. Production is disabled.', inputSchema: { type: 'object', required: ['batchFilePath', 'targetEnv'], additionalProperties: false, properties: { batchFilePath: string, targetEnv: { enum: ['local', 'staging'] }, maxRetries: { type: 'integer', minimum: 0, maximum: 5 } } } },
];
function checkArguments(value, schema, at = 'arguments') {
  if (schema.anyOf) {
    if (!schema.anyOf.some((item) => { try { checkArguments(value, item, at); return true; } catch { return false; } })) throw new Error(`${at}: invalid value`);
    return;
  }
  if (schema.enum && !schema.enum.includes(value)) throw new Error(`${at}: expected ${schema.enum.join(' | ')}`);
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${at}: expected object`);
    for (const required of schema.required ?? []) if (!(required in value)) throw new Error(`${at}.${required}: required`);
    if (schema.minProperties && Object.keys(value).length < schema.minProperties) throw new Error(`${at}: empty object`);
    for (const [key, child] of Object.entries(value)) {
      if (Object.hasOwn(schema.properties ?? {}, key)) checkArguments(child, schema.properties[key], `${at}.${key}`);
      else if (schema.additionalProperties === false) throw new Error(`${at}.${key}: unknown argument`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') checkArguments(child, schema.additionalProperties, `${at}.${key}`);
    }
  }
  if (schema.type === 'string' && (typeof value !== 'string' || (schema.minLength && value.trim().length < schema.minLength))) throw new Error(`${at}: expected nonempty string`);
  if (schema.type === 'number' || schema.type === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value) || (schema.type === 'integer' && !Number.isInteger(value))) throw new Error(`${at}: expected ${schema.type}`);
    if ((schema.minimum !== undefined && value < schema.minimum) || (schema.maximum !== undefined && value > schema.maximum) || (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum)) throw new Error(`${at}: out of range`);
  }
}
async function invokeTool(name, args) {
  const tool = definitions.find((item) => item.name === name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  checkArguments(args, tool.inputSchema);
  if (name === 'list_personas') return { personas: listPersonas() };
  if (name === 'generate_episode') {
    const { outputPath, ...options } = args;
    const result = await generateEpisode(options);
    const destination = path.resolve(outputPath ?? path.join(__dirname, 'output', `episode-${crypto.randomUUID()}.jsonl`));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, JSON.stringify(result) + '\n', { flag: 'wx', mode: 0o600 });
    return { outputPath: destination, summary: result.summary, sessionId: result.episode.sessionId, eventCount: result.behaviorLogs.length };
  }
  if (name === 'generate_batch') return generateBatch(args);
  if (name === 'export_to_backend') return exportToBackend(args);
  if (Boolean(args.episode) === Boolean(args.batchFilePath)) throw new Error('Provide exactly one of episode or batchFilePath');
  if (args.episode) return validateGeneratedEpisode(args.episode);
  return validateGeneratedJsonlFile(args.batchFilePath);
}
async function dispatch(message) {
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') return { jsonrpc: '2.0', id: message?.id ?? null, error: { code: -32600, message: 'Invalid Request' } };
  if (message.id === undefined) return null;
  try {
    let result;
    if (message.method === 'initialize') result = { protocolVersion: ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'].includes(message.params?.protocolVersion) ? message.params.protocolVersion : '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'oneuldo-market-simulator', version: '1.0.0' } };
    else if (message.method === 'ping') result = {};
    else if (message.method === 'tools/list') result = { tools: definitions };
    else if (message.method === 'tools/call') {
      try {
        const value = await invokeTool(message.params?.name, message.params?.arguments ?? {});
        result = { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value, isError: false };
      } catch (error) { result = { content: [{ type: 'text', text: error.message }], isError: true }; }
    } else return { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Method not found' } };
    return { jsonrpc: '2.0', id: message.id, result };
  } catch { return { jsonrpc: '2.0', id: message.id, error: { code: -32603, message: 'Internal error' } }; }
}
function start() {
  const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  input.on('line', (line) => {
    if (!line.trim()) return;
    if (Buffer.byteLength(line) > 16 * 1024 * 1024) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Request exceeds 16 MiB; use a file path' } }) + '\n'); return; }
    let message;
    try { message = JSON.parse(line); }
    catch { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\n'); return; }
    // Each request owns its episode state; no browser lease or serial request queue.
    dispatch(message).then((response) => { if (response) process.stdout.write(JSON.stringify(response) + '\n'); });
  });
}
module.exports = { definitions, invokeTool, dispatch, start };
if (require.main === module) start();
