// Generates trace artifacts only. This script never uploads or fabricates application logs.
require('../runtime.cjs');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const { generateBatch, listPersonas } = require('../src/simulator.ts');
const { validateTrace } = require('../src/traceValidation.ts');
const output = path.resolve(process.argv[2] ?? path.join(__dirname, '../output', `trace-verification-${Date.now()}`));
const count = Number(process.env.MARKET_VERIFY_COUNT ?? 12);
async function main() {
  if (!Number.isInteger(count) || count < 3 || count > 1000) throw new Error('MARKET_VERIFY_COUNT must be 3..1000.');
  const snapshot = createMarketReplaySnapshot(createMarketSession({ seed: 'trace-verification-v1' }));
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, 'snapshot.json'), JSON.stringify(snapshot, null, 2) + '\n', { flag: 'wx' });
  const reports = [];
  for (const persona of listPersonas()) {
    const batch = await generateBatch({ count, personaMix: { [persona.id]: 1 }, seed: 'trace-policy-verification-v1', snapshot,
      concurrency: 3, outputPath: path.join(output, `${persona.id}.jsonl`) });
    const traces = (await fs.readFile(batch.outputPath, 'utf8')).trim().split('\n').map(JSON.parse);
    const reactions = [], sequences = new Set();
    const report = { personaId: persona.id, traces: count, uniqueSequences: 0, meanCartChecks: 0, meanHelpRequests: 0,
      plannedReactionMedianMs: 0, plannedReactionP90Ms: 0, reviewRequests: 0, gaveUp: 0, productChoices: {}, examples: [] };
    for (const trace of traces) {
      const result = validateTrace(trace, snapshot);
      assert.ok(result.valid, result.errors.join('; '));
      const meaningful = trace.steps.map(s => [s.type, s.target?.stationId, s.productId, s.quantity, s.reactionDelayMs]);
      sequences.add(JSON.stringify(meaningful));
      report.meanCartChecks += trace.steps.filter(s => s.type === 'viewCart').length / count;
      report.meanHelpRequests += trace.steps.filter(s => s.type === 'viewHelp' || s.type === 'talkToStaff' && s.choice !== 'open').length / count;
      report.reviewRequests += Number(trace.steps.some(s => s.type === 'submitForReview'));
      report.gaveUp += Number(trace.steps.some(s => s.type === 'giveUp'));
      for (const step of trace.steps) {
        if (step.reactionDelayMs > 0) reactions.push(step.reactionDelayMs);
        if (step.type === 'dragProduct' && step.gesture.outcome === 'drop') report.productChoices[step.productId] = (report.productChoices[step.productId] ?? 0) + step.quantity;
      }
      if (report.examples.length < 3) report.examples.push({ traceId: trace.traceId, seed: trace.seed,
        visitedStations: trace.steps.filter(s => s.type === 'walkTo').map(s => s.target.stationId),
        cartChecks: trace.steps.filter(s => s.type === 'viewCart').length });
    }
    report.uniqueSequences = sequences.size;
    assert.equal(sequences.size, count);
    reactions.sort((a, b) => a - b);
    report.plannedReactionMedianMs = reactions[Math.floor(reactions.length * .5)];
    report.plannedReactionP90Ms = reactions[Math.floor(reactions.length * .9)];
    reports.push(report);
    process.stdout.write(JSON.stringify(report) + '\n');
  }
  const careful = reports.find(r => r.personaId === 'careful-checker');
  const quick = reports.find(r => r.personaId === 'quick-decider');
  assert.ok(careful.plannedReactionMedianMs > quick.plannedReactionMedianMs * 2);
  assert.ok(careful.meanCartChecks > quick.meanCartChecks);
  const report = { schema: 'oneuldo.market.trace-validation', version: 1, snapshotId: snapshot.snapshotId,
    totalTraces: count * reports.length,
    note: 'Planned waits and uncalibrated persona intentions; not measured human timing, clinical evidence, or completed UI sessions. Actual logs are produced only by app replay.', personas: reports };
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  process.stdout.write(JSON.stringify({ reportPath: path.join(output, 'report.json'), status: 'passed' }) + '\n');
}
main().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
