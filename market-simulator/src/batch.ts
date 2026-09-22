import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { randomUUID } from 'node:crypto';
import { mkdir, open, link, unlink } from 'node:fs/promises';
import path from 'node:path';
import { Random } from './random';
import { getPersona, listPersonas } from './personas';
import type { EpisodeOptions, EpisodeSummary } from './types';

export type BatchOptions = Omit<EpisodeOptions, 'personaId' | 'sessionId' | 'decisionProvider' | 'replayTrace'> & {
  count: number; personaMix?: Record<string, number>; outputPath: string; concurrency?: number;
};
type WorkerResult = { line: string; summary: EpisodeSummary };
type Aggregate = { episodes: number; successes: number; gaveUp: number; actions: number; moves: number; cartChecks: number;
  helpRequests: number; retries: number; wrongSelections: number; selections: number; rejectedActions: number;
  meanDecisionMs: number; meanPathDistance: number; selectedItemCounts: Record<string, number> };

export async function generateBatch(options: BatchOptions) {
  if (!Number.isInteger(options.count) || options.count < 1 || options.count > 100000) throw new Error('count must be 1..100000.');
  if (!options.outputPath || typeof options.outputPath !== 'string') throw new Error('outputPath is required.');
  if (options.seed === undefined || options.seed === null || !String(options.seed).length) throw new Error('Batch seed is required.');
  const concurrency = options.concurrency ?? Math.min(4, availableParallelism());
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) throw new Error('concurrency must be 1..32.');
  const mix = options.personaMix ?? Object.fromEntries(listPersonas().map(p => [p.id, 1]));
  const ids = Object.keys(mix);
  if (!ids.length || !ids.some(id => mix[id] > 0)) throw new Error('personaMix needs positive weights.');
  for (const id of ids) { getPersona(id); if (!Number.isFinite(mix[id]) || mix[id] < 0) throw new Error('Persona weights must be finite and nonnegative.'); }
  const poolSize = Math.min(options.count, concurrency);
  const outputPath = path.resolve(options.outputPath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  const partial = `${outputPath}.${randomUUID()}.partial`;
  const file = await open(partial, 'wx');
  const workers: Worker[] = [];
  const aggregates: Record<string, Aggregate> = {};
  let completed = false;
  try {
    // Reserve the final name without truncating an existing dataset. Hard-link publication below is atomic.
    try { const existing = await open(outputPath, 'r'); await existing.close(); throw new Error('Output already exists; choose a new outputPath.'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    for (let i = 0; i < poolSize; i++) workers.push(new Worker(path.join(__dirname, '../worker.cjs')));
    const random = new Random(`${options.seed}:persona-mix`);
    for (let start = 0; start < options.count; start += poolSize) {
      const results = await Promise.all(workers.slice(0, Math.min(poolSize, options.count - start)).map((worker, offset) => {
        const index = start + offset;
        const { count, personaMix, outputPath: ignored, concurrency: ignoredConcurrency, ...base } = options;
        const personaId = random.weighted(ids.filter(id => mix[id] > 0), id => mix[id]);
        return runWorker(worker, { ...base, seed: `${options.seed}:${index}`, personaId });
      }));
      // Ordered writes make the dataset independent of worker scheduling. Memory is O(concurrency).
      for (const result of results) {
        await file.write(result.line + '\n');
        const s = result.summary;
        const a = aggregates[s.personaId] ??= { episodes: 0, successes: 0, gaveUp: 0, actions: 0, moves: 0,
          cartChecks: 0, helpRequests: 0, retries: 0, wrongSelections: 0, selections: 0, rejectedActions: 0,
          meanDecisionMs: 0, meanPathDistance: 0, selectedItemCounts: {} };
        a.episodes++; a.successes += Number(s.outcome === 'success'); a.gaveUp += Number(s.outcome === 'gave-up');
        a.actions += s.actionCount; a.moves += s.moveCount; a.cartChecks += s.cartChecks; a.helpRequests += s.helpRequests;
        a.retries += s.retries; a.wrongSelections += s.wrongSelections; a.selections += s.selections; a.rejectedActions += s.rejectedActions;
        a.meanDecisionMs += (s.decisionMeanMs - a.meanDecisionMs) / a.episodes;
        a.meanPathDistance += (s.pathDistance - a.meanPathDistance) / a.episodes;
        for (const [id, count] of Object.entries(s.selectedItemCounts)) a.selectedItemCounts[id] = (a.selectedItemCounts[id] ?? 0) + count;
      }
    }
    await file.sync(); await file.close();
    await link(partial, outputPath); // EEXIST rather than overwriting another caller's file.
    completed = true;
    return { outputPath, count: options.count, summary: { seed: options.seed, workers: poolSize, perPersona: aggregates } };
  } finally {
    await Promise.allSettled(workers.map(worker => worker.terminate()));
    if (!completed) await file.close().catch(() => undefined);
    await unlink(partial).catch(() => undefined);
  }
}

function runWorker(worker: Worker, options: EpisodeOptions): Promise<WorkerResult> {
  return new Promise((resolve, reject) => {
    const clean = () => { worker.off('message', message); worker.off('error', failed); worker.off('exit', exited); };
    const message = (data: WorkerResult & { error?: string }) => { clean(); data.error ? reject(new Error(data.error)) : resolve(data); };
    const failed = (error: Error) => { clean(); reject(error); };
    const exited = (code: number) => failed(new Error(`Simulation worker exited early (${code}).`));
    worker.once('message', message); worker.once('error', failed); worker.once('exit', exited);
    worker.postMessage(options);
  });
}
