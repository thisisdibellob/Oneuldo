import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import type { BehaviorLogRequest, BehaviorLogBatchResponse } from '../../frontend/src/api/behaviorLog';
import { validateGeneratedEpisode, validateBatchResponse } from './schemaValidation';

export type ExportOptions = { batchFilePath: string; targetEnv: 'local' | 'staging'; maxRetries?: number };
export type ExportTarget = { baseUrl: string; isolated: true; tokenEnv?: string };
export const EXPORT_BATCH_SIZE = 50;
export function loadExportTarget(targetEnv: string): ExportTarget {
  if (!['local', 'staging'].includes(targetEnv)) throw new Error('Only isolated local/staging export is supported; production export is disabled.');
  const configPath = process.env.MARKET_SIM_TARGETS;
  if (!configPath) throw new Error('Set MARKET_SIM_TARGETS to an explicit JSON target configuration file. No backend target is enabled by default.');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const target = config[targetEnv] as ExportTarget | undefined;
  if (!target || target.isolated !== true || typeof target.baseUrl !== 'string') throw new Error(`Configure ${targetEnv} with isolated:true and a dedicated test database endpoint.`);
  const url = new URL(target.baseUrl);
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) throw new Error('baseUrl must contain only scheme, host and port.');
  if (targetEnv === 'local' && (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !['http:', 'https:'].includes(url.protocol))) throw new Error('local targets must use a loopback host.');
  if (targetEnv === 'staging' && url.protocol !== 'https:') throw new Error('staging targets must use HTTPS.');
  if (target.tokenEnv !== undefined && !/^[A-Z][A-Z0-9_]*$/.test(target.tokenEnv)) throw new Error('tokenEnv must name an environment variable.');
  return { ...target, baseUrl: url.origin };
}
export function stableBatchId(events: BehaviorLogRequest[]): string {
  const hex = crypto.createHash('sha256').update('oneuldo-market-batch-v1:').update(JSON.stringify(events)).digest('hex').slice(0, 32).split('');
  hex[12] = '5'; hex[16] = ((parseInt(hex[16]!, 16) & 3) | 8).toString(16);
  const id = hex.join('');
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}
async function* readRows(filePath: string): AsyncGenerator<{ lineNumber: number; value: any }> {
  const input = fs.createReadStream(filePath, { encoding: 'utf8' });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  let lineNumber = 0;
  try {
    for await (const line of lines) {
      lineNumber++;
      if (!line.trim()) continue;
      let value: unknown;
      try { value = JSON.parse(line); } catch { throw new Error(`Invalid JSONL at line ${lineNumber}`); }
      yield { lineNumber, value };
    }
  } finally { lines.close(); input.destroy(); }
}
async function postBatch(target: ExportTarget, events: BehaviorLogRequest[], maxRetries: number): Promise<BehaviorLogBatchResponse> {
  const batchId = stableBatchId(events);
  const body = JSON.stringify({ batchId, events });
  const token = target.tokenEnv ? process.env[target.tokenEnv] : undefined;
  if (target.tokenEnv && !token) throw new Error(`Missing access token environment variable ${target.tokenEnv}`);
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let response: Response;
    try {
      response = await fetch(`${target.baseUrl}/api/behavior-logs/batches`, {
        method: 'POST', body, redirect: 'error', signal: AbortSignal.timeout(30_000),
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
    } catch {
      if (attempt === maxRetries) throw new Error(`Backend request failed after ${attempt + 1} attempt(s); batch ${batchId} can be safely retried.`);
      await new Promise((resolve) => setTimeout(resolve, Math.min(2000, 250 * 2 ** attempt)));
      continue;
    }
    if (response.status !== 200) {
      await response.body?.cancel();
      if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(2000, 250 * 2 ** attempt))); continue;
      }
      throw new Error(`Backend returned HTTP ${response.status} for batch ${batchId}; export stopped.`);
    }
    let result: unknown;
    try { result = await response.json(); } catch { throw new Error(`Invalid backend JSON for batch ${batchId}`); }
    const validation = validateBatchResponse(result);
    if (!validation.valid) throw new Error(`Backend response violates frontend contract: ${validation.errors.join('; ')}`);
    const accepted = result as BehaviorLogBatchResponse;
    if (accepted.batchId !== batchId || accepted.events.length !== events.length) throw new Error(`Backend acknowledgment mismatch for batch ${batchId}`);
    const expected = new Map(events.map((event) => [event.metadata.clientEventId, event.metadata.eventSequence]));
    for (const event of accepted.events) {
      if (expected.get(event.clientEventId) !== event.eventSequence) throw new Error(`Unexpected/duplicate acknowledgment for batch ${batchId}`);
      expected.delete(event.clientEventId);
    }
    if (expected.size) throw new Error(`Incomplete acknowledgment for batch ${batchId}`);
    return accepted;
  }
  throw new Error('Unreachable export retry state');
}
export async function exportToBackend(options: ExportOptions) {
  const target = loadExportTarget(options.targetEnv);
  const maxRetries = options.maxRetries ?? 2;
  if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 5) throw new Error('maxRetries must be an integer between 0 and 5');
  const filePath = path.resolve(options.batchFilePath);
  const initialStat = fs.statSync(filePath);
  if (!initialStat.isFile()) throw new Error('batchFilePath must be a JSONL file');
  const assertUnchanged = () => { const current = fs.statSync(filePath); if (current.size !== initialStat.size || current.mtimeMs !== initialStat.mtimeMs || current.ino !== initialStat.ino) throw new Error('Input file changed during export; export stopped.'); };
  // Validate the complete input before the first request, including cross-row IDs.
  // Replay above enforces the shared mapper's session-namespaced event IDs;
  // per-episode validation checks their uniqueness. Retain O(sessions), not O(events).
  const sessionIds = new Set<string>();
  let episodeCount = 0; let eventCount = 0;
  for await (const { value, lineNumber } of readRows(filePath)) {
    const validation = validateGeneratedEpisode(value);
    if (!validation.valid) throw new Error(`JSONL line ${lineNumber}: ${validation.errors.join('; ')}`);
    if (sessionIds.has(value.episode.sessionId)) throw new Error(`Duplicate episode session ID on line ${lineNumber}`);
    sessionIds.add(value.episode.sessionId);
    episodeCount++; eventCount += validation.eventCount;
  }
  if (!episodeCount) throw new Error('JSONL input is empty');
  assertUnchanged();
  let batchCount = 0; let acceptedCount = 0; let duplicateCount = 0;
  let pending: BehaviorLogRequest[] = [];
  const send = async () => {
    assertUnchanged();
    const response = await postBatch(target, pending, maxRetries);
    batchCount++;
    acceptedCount += response.events.filter((event) => event.status === 'ACCEPTED').length;
    duplicateCount += response.events.filter((event) => event.status === 'DUPLICATE').length;
    pending = [];
  };
  for await (const { value } of readRows(filePath)) {
    assertUnchanged();
    for (const event of value.behaviorLogs as BehaviorLogRequest[]) {
      pending.push(event);
      if (pending.length === EXPORT_BATCH_SIZE) await send();
    }
  }
  if (pending.length) await send();
  return { targetEnv: options.targetEnv, batchFilePath: filePath, episodeCount, eventCount, batchCount, acceptedCount, duplicateCount };
}
