import traceSchema from './marketReplayTrace.schema.json';
import { createMarketSession, type MarketSession, type MarketSessionConfig } from './marketSession';
import type { MarketEnvironment, MarketCashierAvailability, MarketEnvironmentStationId, MarketCheckoutId } from './marketEnvironment';
import type { MarketMission } from './scenarios';
import { MARKET_CATALOG_VERSION, MARKET_SCENARIO_VERSION } from './marketContent';
import { validateReplayPresentation, type ReplayPresentation } from './marketReplayPerception';

export type MarketReplaySnapshot = {
  snapshotSchemaVersion: '1'; snapshotId: string; config: MarketSessionConfig; environment: MarketEnvironment;
  mission?: MarketMission; initialStock: Record<string, number>; cashierAvailability: MarketCashierAvailability;
  catalogVersion: string; scenarioVersion: string; completionMode: 'ai-review';
  presentation?: ReplayPresentation;
};
type StepBase = { id: string; reactionDelayMs: number; timeoutMs: number; reason: string; attentionTag?: string; cueRefs?: string[] };
export type ReplayMovement = { style: 'careful' | 'steady' | 'brisk'; speedMultiplier: number; running: false; motorSeed: string; accelerationMs: number };
export type MarketReplayStep = StepBase & (
  | { type: 'start' | 'viewCart' | 'viewHelp' | 'closeView' | 'closeStation' | 'submitForReview' | 'awaitReviewAccepted' | 'giveUp' | 'skipRating' | 'leave' }
  | { type: 'walkTo'; target: { stationId: MarketEnvironmentStationId }; movement: ReplayMovement }
  | { type: 'walkToAnchor'; target: { anchorId: string }; movement: ReplayMovement }
  | { type: 'readList'; durationMs: number }
  | { type: 'pause' | 'lookAround'; durationMs: number }
  | { type: 'openShelf'; stationId: MarketEnvironmentStationId }
  | { type: 'browse'; durationMs: number; scrollFraction: number }
  | { type: 'dragProduct'; productId: string; quantity: number; gesture: {
      durationMs: number; hesitationMs: number; outcome: 'drop' | 'cancel' | 'miss'; motorSeed: string;
    } }
  | { type: 'removeProduct'; productId: string; quantity: number }
  | { type: 'talkToStaff'; stationId: MarketEnvironmentStationId; choice: 'open' }
  | { type: 'talkToStaff'; stationId: MarketEnvironmentStationId; choice: 'requestCashier'; checkoutId: MarketCheckoutId }
  | { type: 'talkToStaff'; stationId: MarketEnvironmentStationId; choice: 'returnProduct'; productId: string; quantity: number }
  | { type: 'checkout'; checkoutId: MarketCheckoutId }
);
export type MarketReplayTrace = {
  traceSchemaVersion: '1' | '2'; traceId: string; personaId: string; personaVersion: string; seed: string | number;
  generationPolicy: 'stochastic' | 'llm'; policyVersion: '3' | '4' | '5';
  experienceMode?: 'first-play' | 'revisit';
  attentionExperience?: { layoutKey: string; memory: Record<string, unknown>; source: 'planned-trace' };
  /** Fresh LLM requests are not seed deterministic. A captured trace is replayable. */
  generation?: { model: string; reproducibility: 'seed-and-snapshot' | 'captured-trace'; requestId?: string;
    timingProfile?: 'compact-v1'; sourceTraceId?: string; actorPolicyVersion?: 'episodic-choice-v1' | 'episodic-choice-v2' | 'episodic-choice-v3' | 'episodic-choice-v4' };
  target: { snapshotId: string; scenarioId?: string; missionId?: string; completionMode: 'ai-review' };
  steps: MarketReplayStep[];
};
export type MarketReplayValidation = { valid: boolean; errors: string[] };
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export function canonicalMarketReplayJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalMarketReplayJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().filter(key => (value as Record<string, unknown>)[key] !== undefined)
    .map(key => `${JSON.stringify(key)}:${canonicalMarketReplayJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
/** Portable deterministic identity. Authentication uses a separate random bridge token. */
export function marketReplayFingerprint(value: unknown): string {
  const text = canonicalMarketReplayJson(value);
  let a = 2166136261, b = 3335557771, c = 2246822519, d = 3266489917;
  for (let i = 0; i < text.length; i++) {
    const n = text.charCodeAt(i);
    a = Math.imul(a ^ n, 16777619); b = Math.imul(b ^ n, 2246822519);
    c = Math.imul(c ^ n, 3266489917); d = Math.imul(d ^ n, 668265263);
  }
  return [a, b, c, d].map(n => (n >>> 0).toString(16).padStart(8, '0')).join('');
}
export function marketReplayTraceId(trace: Omit<MarketReplayTrace, 'traceId'> | MarketReplayTrace): string {
  const { traceId: ignored, ...identity } = trace as MarketReplayTrace;
  return `trace-${marketReplayFingerprint(identity)}`;
}

export function createMarketReplaySnapshot(session: MarketSession, mission?: MarketMission, presentation?: ReplayPresentation): MarketReplaySnapshot {
  if (presentation !== undefined && !validateReplayPresentation(presentation)) throw new Error('Invalid replay presentation');
  if (session.phase !== 'shopping' || session.view !== 'world' || session.activeStation || Object.keys(session.cart).length || session.attempts
    || canonicalMarketReplayJson(session.stock) !== canonicalMarketReplayJson(session.initialStock)
    || session.playerPosition.x !== session.environment.spawn.x || session.playerPosition.y !== session.environment.spawn.y) {
    throw new Error('Replay snapshots require an untouched initial shopping session at spawn.');
  }
  const config = clone(session.config);
  delete config.sessionId;
  config.startedAt = '2000-01-01T00:00:00.000Z';
  config.provenance = { source: 'human' };
  config.inventoryProductIds = clone(session.shelfSlots);
  config.stockOverrides = clone(session.initialStock);
  const body = { snapshotSchemaVersion: '1' as const, config, environment: clone(session.environment),
    ...(mission ? { mission: clone(mission) } : {}), initialStock: clone(session.initialStock),
    cashierAvailability: clone(session.cashierAvailability), catalogVersion: String(MARKET_CATALOG_VERSION),
    scenarioVersion: String(MARKET_SCENARIO_VERSION), completionMode: 'ai-review' as const,
    ...(presentation ? { presentation: clone(presentation) } : {}) };
  return { ...body, snapshotId: `snapshot-${marketReplayFingerprint(body)}` };
}

export function validateMarketReplaySnapshot(value: unknown): MarketReplayValidation {
  const errors: string[] = [];
  try {
    const s = value as MarketReplaySnapshot;
    if (!s || typeof s !== 'object' || s.snapshotSchemaVersion !== '1' || s.completionMode !== 'ai-review') throw new Error('Unsupported replay snapshot.');
    if (s.presentation !== undefined && !validateReplayPresentation(s.presentation)) throw new Error('Invalid replay presentation');
    const { snapshotId, ...body } = s;
    if (snapshotId !== `snapshot-${marketReplayFingerprint(body)}`) throw new Error('Snapshot identity does not match its contents.');
    if (s.catalogVersion !== String(MARKET_CATALOG_VERSION) || s.scenarioVersion !== String(MARKET_SCENARIO_VERSION)) throw new Error('Snapshot catalog/scenario version differs from this app.');
    const initial = createMarketSession(s.config, s.environment);
    if (canonicalMarketReplayJson(initial.initialStock) !== canonicalMarketReplayJson(s.initialStock)) throw new Error('Snapshot stock differs from its game configuration.');
    if (canonicalMarketReplayJson(initial.cashierAvailability) !== canonicalMarketReplayJson(s.cashierAvailability)) throw new Error('Snapshot cashier availability differs from its environment.');
    if (s.config.sessionId !== undefined || s.config.startedAt !== '2000-01-01T00:00:00.000Z'
      || canonicalMarketReplayJson(s.config.provenance) !== '{"source":"human"}') throw new Error('Snapshot must omit execution identity and use the canonical clock.');
  } catch (error) { errors.push((error as Error).message); }
  return { valid: !errors.length, errors };
}

/** Same JSON Schema subset runs in the app and the Node bridge; no Node or browser APIs. */
function validateSchema(value: unknown, schema: any, path: string, errors: string[]): void {
  if (schema.$ref) {
    const resolved = schema.$ref.split('/').slice(1).reduce((node: any, key: string) => node?.[key], traceSchema);
    if (!resolved) { errors.push(`${path}: unresolved schema reference`); return; }
    validateSchema(value, resolved, path, errors); return;
  }
  if (schema.oneOf) {
    const matches = schema.oneOf.filter((candidate: any) => { const trial: string[] = []; validateSchema(value, candidate, path, trial); return !trial.length; });
    if (matches.length !== 1) errors.push(`${path}: must match one supported intention shape`);
    return;
  }
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: unsupported value`);
  if (schema.const !== undefined && value !== schema.const) errors.push(`${path}: must be ${JSON.stringify(schema.const)}`);
  const type = schema.type;
  if (type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) { errors.push(`${path}: expected object`); return; }
    const o = value as Record<string, unknown>;
    for (const key of schema.required ?? []) if (!(key in o)) errors.push(`${path}.${key}: required`);
    for (const key of Object.keys(o)) {
      if (schema.properties?.[key]) validateSchema(o[key], schema.properties[key], `${path}.${key}`, errors);
      else if (schema.additionalProperties === false) errors.push(`${path}.${key}: unsupported field`);
    }
  } else if (type === 'array') {
    if (!Array.isArray(value)) { errors.push(`${path}: expected array`); return; }
    if (value.length < (schema.minItems ?? 0) || value.length > (schema.maxItems ?? Infinity)) errors.push(`${path}: invalid item count`);
    value.forEach((item, i) => validateSchema(item, schema.items, `${path}[${i}]`, errors));
  } else if (type === 'string') {
    if (typeof value !== 'string') { errors.push(`${path}: expected string`); return; }
    if (value.length < (schema.minLength ?? 0) || value.length > (schema.maxLength ?? Infinity)) errors.push(`${path}: invalid length`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${path}: invalid format`);
  } else if (type === 'number' || type === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value) || (type === 'integer' && !Number.isInteger(value))) { errors.push(`${path}: expected finite ${type}`); return; }
    if (value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity)) errors.push(`${path}: outside allowed bounds`);
  } else if (type === 'boolean' && typeof value !== 'boolean') errors.push(`${path}: expected boolean`);
}
export function validateMarketReplayTrace(value: unknown, snapshot?: MarketReplaySnapshot): MarketReplayValidation {
  const errors: string[] = [];
  try { validateSchema(value, traceSchema, 'trace', errors); }
  catch { errors.push('Trace must be bounded JSON data.'); }
  if (errors.length) return { valid: false, errors };
  const trace = value as MarketReplayTrace;
  if (trace.traceSchemaVersion === '1') {
    if (trace.policyVersion !== '3' || trace.experienceMode !== undefined || trace.attentionExperience !== undefined
      || trace.steps.some(step => step.type === 'walkToAnchor' || step.type === 'readList' || step.attentionTag !== undefined || step.cueRefs !== undefined)) {
      errors.push('Attention intentions and metadata require trace schema 2 and policy 4.');
    }
  } else if (!['4', '5'].includes(trace.policyVersion)) errors.push('Trace schema 2 requires policy 4 or 5.');
  if (trace.attentionExperience && JSON.stringify(trace.attentionExperience).length > 250000) errors.push('Attention experience is too large.');
  if (trace.traceId !== marketReplayTraceId(trace)) errors.push('Trace identity does not match its contents.');
  if (new Set(trace.steps.map(step => step.id)).size !== trace.steps.length) errors.push('Step IDs must be unique.');
  if (trace.steps[0].type !== 'start' || trace.steps.slice(1).some(s => s.type === 'start')) errors.push('Exactly one start step is required first.');
  if (trace.steps.at(-1)?.type !== 'leave' || trace.steps.slice(0, -1).some(s => s.type === 'leave')) errors.push('Exactly one leave step is required last.');
  const submit = trace.steps.findIndex(s => s.type === 'submitForReview');
  const quit = trace.steps.findIndex(s => s.type === 'giveUp');
  if ((submit >= 0) === (quit >= 0)) errors.push('An AI review trace must either submit for review or give up.');
  if (submit >= 0 && (submit !== trace.steps.length - 3 || trace.steps[submit + 1].type !== 'awaitReviewAccepted')) errors.push('AI review must terminate with submitForReview, awaitReviewAccepted, leave.');
  if (quit >= 0 && (quit !== trace.steps.length - 3 || trace.steps[quit + 1].type !== 'skipRating')) errors.push('giveUp must terminate with skipRating, leave.');
  if (trace.steps.filter(s => s.type === 'skipRating').length !== Number(quit >= 0)) errors.push('skipRating is supported only after giveUp.');
  if (trace.steps.filter(s => s.type === 'awaitReviewAccepted').length !== Number(submit >= 0)) errors.push('Review wait must follow the only submission.');
  if (snapshot) {
    errors.push(...validateMarketReplaySnapshot(snapshot).errors);
    if (trace.target.snapshotId !== snapshot.snapshotId) errors.push('Trace is bound to a different initial app snapshot.');
    if (trace.target.scenarioId !== snapshot.mission?.scenarioId) errors.push('Trace scenario differs from the bound mission.');
    if (trace.target.missionId !== snapshot.mission?.id) errors.push('Trace mission differs from the bound mission.');
  }
  return { valid: !errors.length, errors };
}
