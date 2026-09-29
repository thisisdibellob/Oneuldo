import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { randomUUID } from 'node:crypto';
import { mkdir, open, link, unlink } from 'node:fs/promises';
import path from 'node:path';
import { Random } from './random';
import { getPersona, listPersonas } from './personas';
import type { TraceOptions, TraceSummary } from './types';

export type BatchOptions = Omit<TraceOptions, 'personaId' | 'decisionProvider' | 'actorDecisionProvider'> & {
  count: number; personaMix?: Record<string, number>; outputPath: string; concurrency?: number;
};
type WorkerResult = { line: string; summary: TraceSummary };
type Aggregate = { traces: number; reviewRequests: number; gaveUp: number; steps: number; walkingIntentions: number;
  cartChecks: number; helpRequests: number; productsDragged: number; meanReactionMs: number };

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
        const a = aggregates[s.personaId] ??= { traces: 0, reviewRequests: 0, gaveUp: 0, steps: 0,
          walkingIntentions: 0, cartChecks: 0, helpRequests: 0, productsDragged: 0, meanReactionMs: 0 };
        a.traces++; a.reviewRequests += Number(s.ending === 'review-requested'); a.gaveUp += Number(s.ending === 'gave-up');
        a.steps += s.steps; a.walkingIntentions += s.walkingIntentions; a.cartChecks += s.cartChecks;
        a.helpRequests += s.helpRequests; a.productsDragged += s.productsDragged;
        a.meanReactionMs += (s.plannedReactionMs / s.steps - a.meanReactionMs) / a.traces;
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

function runWorker(worker: Worker, options: TraceOptions): Promise<WorkerResult> {
  return new Promise((resolve, reject) => {
    const clean = () => { worker.off('message', message); worker.off('error', failed); worker.off('exit', exited); };
    const message = (data: WorkerResult & { error?: string }) => { clean(); data.error ? reject(new Error(data.error)) : resolve(data); };
    const failed = (error: Error) => { clean(); reject(error); };
    const exited = (code: number) => failed(new Error(`Simulation worker exited early (${code}).`));
    worker.once('message', message); worker.once('error', failed); worker.once('exit', exited);
    worker.postMessage(options);
  });
}
