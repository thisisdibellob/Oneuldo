import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import type { BehaviorLogRequest, BehaviorLogBatchResponse } from '../../frontend/src/api/behaviorLog';

// Inspect the actual frontend contract, rather than maintaining a second schema.
const ts: typeof import('../../frontend/node_modules/typescript') = require('../../frontend/node_modules/typescript');
const frontend = path.resolve(__dirname, '../../frontend/src');
let contracts: { checker: import('../../frontend/node_modules/typescript').TypeChecker; request: import('../../frontend/node_modules/typescript').Type; response: import('../../frontend/node_modules/typescript').Type; episode: import('../../frontend/node_modules/typescript').Type } | undefined;
function getContracts() {
  if (contracts) return contracts;
  const behaviorFile = path.join(frontend, 'api/behaviorLog.ts');
  const sessionFile = path.join(frontend, 'game/marketSession.ts');
  const program = ts.createProgram([behaviorFile, sessionFile], {
    strict: true, noEmit: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS, moduleResolution: ts.ModuleResolutionKind.Node10,
  });
  const checker = program.getTypeChecker();
  const behavior = program.getSourceFile(behaviorFile)!;
  const session = program.getSourceFile(sessionFile)!;
  const typeAlias = (name: string) => {
    const node = behavior.statements.find((item) => ts.isTypeAliasDeclaration(item) && item.name.text === name);
    if (!node || !ts.isTypeAliasDeclaration(node)) throw new Error(`Frontend contract missing: ${name}`);
    return checker.getTypeFromTypeNode(node.type);
  };
  const declaration = session.statements.find((item) => ts.isFunctionDeclaration(item) && item.name?.text === 'exportMarketEpisode');
  if (!declaration || !ts.isFunctionDeclaration(declaration)) throw new Error('exportMarketEpisode declaration missing');
  contracts = { checker, request: typeAlias('BehaviorLogRequest'), response: typeAlias('BehaviorLogBatchResponse'),
    episode: checker.getReturnTypeOfSignature(checker.getSignatureFromDeclaration(declaration)!) };
  return contracts;
}

export type ValidationResult = { valid: boolean; errors: string[]; eventCount: number };
function checkType(value: unknown, type: import('../../frontend/node_modules/typescript').Type, at: string, errors: string[], depth = 0): void {
  if (errors.length >= 50) return;
  const { checker } = getContracts();
  const flags = type.flags;
  const fail = (expected: string) => { errors.push(`${at}: expected ${expected}`); };
  if (depth > 80) return fail('JSON with depth <= 80');
  if (flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) {
    if (value === undefined || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint' || (typeof value === 'number' && !Number.isFinite(value))) fail('JSON value');
    else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) checkType(item, type, `${at}.${key}`, errors, depth + 1);
    return;
  }
  if (type.isUnion()) {
    for (const option of type.types) { const attempt: string[] = []; checkType(value, option, at, attempt, depth + 1); if (!attempt.length) return; }
    return fail(checker.typeToString(type));
  }
  if (flags & ts.TypeFlags.TemplateLiteral) {
    const template = type as import('../../frontend/node_modules/typescript').TemplateLiteralType;
    const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = template.texts.map((text, index) => escape(text) + (index < template.types.length ? (template.types[index]!.flags & ts.TypeFlags.Number ? '[+-]?(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+)' : '[\\s\\S]*') : '')).join('');
    if (typeof value !== 'string' || !new RegExp(`^${pattern}$`).test(value)) fail(checker.typeToString(type));
    return;
  }
  if (flags & ts.TypeFlags.StringLiteral) { if (value !== (type as import('../../frontend/node_modules/typescript').StringLiteralType).value) fail(checker.typeToString(type)); return; }
  if (flags & ts.TypeFlags.NumberLiteral) { if (value !== (type as import('../../frontend/node_modules/typescript').NumberLiteralType).value) fail(checker.typeToString(type)); return; }
  if (flags & ts.TypeFlags.BooleanLiteral) { if (value !== ((type as unknown as { intrinsicName: string }).intrinsicName === 'true')) fail(checker.typeToString(type)); return; }
  if (flags & ts.TypeFlags.String) { if (typeof value !== 'string') fail('string'); return; }
  if (flags & ts.TypeFlags.Number) { if (typeof value !== 'number' || !Number.isFinite(value)) fail('finite number'); return; }
  if (flags & ts.TypeFlags.Boolean) { if (typeof value !== 'boolean') fail('boolean'); return; }
  if (flags & ts.TypeFlags.Null) { if (value !== null) fail('null'); return; }
  if (flags & ts.TypeFlags.Undefined) { if (value !== undefined) fail('undefined'); return; }
  if (checker.isArrayType(type) || checker.isTupleType(type)) {
    if (!Array.isArray(value)) return fail('array');
    const elements = checker.getTypeArguments(type as import('../../frontend/node_modules/typescript').TypeReference);
    value.forEach((item, index) => checkType(item, elements[checker.isTupleType(type) ? index : 0]!, `${at}[${index}]`, errors, depth + 1));
    return;
  }
  if ((flags & ts.TypeFlags.Object) || type.isIntersection()) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('object');
    const record = value as Record<string, unknown>;
    const properties = checker.getPropertiesOfType(type);
    const known = new Set(properties.map((property) => property.name));
    for (const property of properties) {
      if (!(property.name in record) && property.flags & ts.SymbolFlags.Optional) continue;
      checkType(record[property.name], checker.getTypeOfSymbol(property), `${at}.${property.name}`, errors, depth + 1);
    }
    const indexes = checker.getIndexInfosOfType(type);
    for (const key of Object.keys(record)) if (!known.has(key)) {
      const index = indexes.find((candidate) => { const issues: string[] = []; checkType(key, candidate.keyType, at, issues, depth + 1); return !issues.length; });
      if (index) checkType(record[key], index.type, `${at}.${key}`, errors, depth + 1);
      else errors.push(`${at}.${key}: field not present in frontend contract`);
    }
    return;
  }
  fail(`supported frontend type (${checker.typeToString(type)})`);
}
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === 'string' && uuidPattern.test(value);
function synthetic(value: unknown, at: string, errors: string[]) {
  const provenance = value as Record<string, unknown> | undefined;
  if (!provenance || provenance.source !== 'synthetic') errors.push(`${at}.source must be synthetic`);
  for (const name of ['agentModel', 'personaId', 'personaVersion']) if (typeof provenance?.[name] !== 'string' || !String(provenance[name]).trim()) errors.push(`${at}.${name} is required`);
}
export function validateBehaviorLogs(value: unknown): ValidationResult {
  const errors: string[] = [];
  if (!Array.isArray(value) || !value.length) return { valid: false, errors: ['behaviorLogs must be a non-empty array'], eventCount: 0 };
  const ids = new Set<string>();
  const previous = new Map<string, { sequence: number; timestamp: number }>();
  value.forEach((event, index) => {
    if (errors.length >= 50) return;
    const at = `behaviorLogs[${index}]`;
    const before = errors.length;
    checkType(event, getContracts().request, at, errors);
    if (errors.length !== before) return;
    const item = event as BehaviorLogRequest;
    for (const [name, id] of Object.entries({ 'metadata.clientEventId': item.metadata.clientEventId, 'identity.sessionId': item.identity.sessionId, 'task.taskId': item.task.taskId, 'simulation.questInstanceId': item.simulation.questInstanceId })) if (!isUuid(id)) errors.push(`${at}.${name} must be a UUID`);
    if (ids.has(item.metadata.clientEventId)) errors.push(`${at}: duplicate clientEventId`);
    ids.add(item.metadata.clientEventId);
    const timestamp = Date.parse(item.metadata.occurredAt);
    if (!Number.isFinite(timestamp)) errors.push(`${at}.metadata.occurredAt must be an ISO timestamp`);
    if (!Number.isInteger(item.metadata.eventSequence) || item.metadata.eventSequence < 1) errors.push(`${at}.metadata.eventSequence must be a positive integer`);
    const prior = previous.get(item.identity.sessionId);
    if (prior && (item.metadata.eventSequence <= prior.sequence || timestamp < prior.timestamp)) errors.push(`${at}: event sequence/time goes backwards`);
    previous.set(item.identity.sessionId, { sequence: item.metadata.eventSequence, timestamp });
    synthetic((item.payload.marketContent as Record<string, unknown> | undefined)?.provenance, `${at}.payload.marketContent.provenance`, errors);
  });
  return { valid: !errors.length, errors: errors.slice(0, 50), eventCount: value.length };
}
export function validateBatchResponse(value: unknown): ValidationResult {
  const errors: string[] = [];
  checkType(value, getContracts().response, 'response', errors);
  return { valid: !errors.length, errors, eventCount: errors.length ? 0 : (value as BehaviorLogBatchResponse).events.length };
}
export function validateGeneratedEpisode(value: unknown): ValidationResult {
  const errors: string[] = [];
  if (!value || typeof value !== 'object') return { valid: false, errors: ['Expected generated episode object'], eventCount: 0 };
  const generated = value as { episode?: Record<string, any>; behaviorLogs?: unknown };
  const episode = generated.episode;
  checkType(episode, getContracts().episode, 'episode', errors);
  const logs = validateBehaviorLogs(generated.behaviorLogs);
  errors.push(...logs.errors);
  if (episode && !errors.length) {
    if (episode.schema !== 'oneuldo.market.episode' || episode.version !== 1) errors.push('Unsupported episode schema/version');
    if (!isUuid(episode.sessionId)) errors.push('episode.sessionId must be a UUID');
    synthetic(episode.provenance, 'episode.provenance', errors);
    synthetic(episode.config.provenance, 'episode.config.provenance', errors);
    if (JSON.stringify(episode.provenance) !== JSON.stringify(episode.config.provenance)) errors.push('episode/config provenance mismatch');
    if (!episode.syntheticDataIsNotClinicalEvidence) errors.push('episode must mark syntheticDataIsNotClinicalEvidence');
    if (episode.events[0]?.type !== 'session_started' || !episode.events.some((event: any) => event.type === 'session_finished')) errors.push('episode must have session_started and session_finished events');
    let time = -Infinity;
    episode.events.forEach((event: any, index: number) => {
      const next = Date.parse(event.timestamp);
      if (event.sequence !== index || !Number.isFinite(next) || next < time) errors.push(`episode.events[${index}]: invalid sequence/time`);
      time = next;
    });
    (generated.behaviorLogs as BehaviorLogRequest[]).forEach((event, index) => {
      if (event.identity.sessionId !== episode.sessionId) errors.push(`behaviorLogs[${index}]: session differs from episode`);
      const provenance = (event.payload.marketContent as Record<string, any>).provenance;
      for (const key of ['source', 'agentModel', 'personaId', 'personaVersion']) if (provenance[key] !== episode.provenance[key]) errors.push(`behaviorLogs[${index}]: provenance ${key} differs from episode`);
    });
  }
  if (!errors.length) {
    const replay = require('./simulator').validateEpisodeReplay(value);
    errors.push(...replay.errors);
  }
  return { valid: !errors.length, errors: errors.slice(0, 50), eventCount: logs.eventCount };
}
export function readGeneratedJsonl(filePath: string): unknown[] {
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter((line) => line.trim()).map((line, index) => {
    try { return JSON.parse(line); } catch { throw new Error(`Invalid JSON at line ${index + 1}`); }
  });
}

/** Streaming validation keeps large batch files out of memory. */
export async function validateGeneratedJsonlFile(filePath: string) {
  const input = fs.createReadStream(filePath, { encoding: 'utf8' });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  const failures: { line: number; errors: string[] }[] = [];
  const sessionIds = new Set<string>();
  let lineNumber = 0, episodeCount = 0, eventCount = 0, invalidCount = 0;
  try {
    for await (const line of lines) {
      lineNumber++;
      if (!line.trim()) continue;
      episodeCount++;
      let record: any;
      try { record = JSON.parse(line); }
      catch { invalidCount++; if (failures.length < 20) failures.push({ line: lineNumber, errors: ['Invalid JSON'] }); continue; }
      const result = validateGeneratedEpisode(record);
      eventCount += result.eventCount;
      if (result.valid && sessionIds.has(record.episode.sessionId)) result.errors.push('Duplicate episode session ID');
      if (result.errors.length) { invalidCount++; if (failures.length < 20) failures.push({ line: lineNumber, errors: result.errors }); }
      if (record?.episode?.sessionId) sessionIds.add(record.episode.sessionId);
    }
  } finally { lines.close(); input.destroy(); }
  if (!episodeCount) failures.push({ line: 0, errors: ['JSONL input is empty'] });
  return { valid: episodeCount > 0 && invalidCount === 0, episodeCount, eventCount, invalidCount, failures };
}
