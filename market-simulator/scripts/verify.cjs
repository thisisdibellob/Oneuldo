// Reproducible data checks; generated raw JSONL remains under ignored output/.
require('../runtime.cjs');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const readline = require('node:readline');
const path = require('node:path');
const assert = require('node:assert/strict');
const { generateBatch, listPersonas } = require('../src/simulator.ts');
const { validateGeneratedEpisode } = require('../src/schemaValidation.ts');
const { stableBatchId } = require('../src/backendExport.ts');
const root = path.resolve(__dirname, '../..');
const output = path.resolve(process.argv[2] ?? path.join(__dirname, '../output', `verification-${Date.now()}`));
const perPersonaCount = Number(process.env.MARKET_VERIFY_COUNT ?? 30);

async function main() {
  await fsp.mkdir(output, { recursive: true });
  const reports = [];
  let fixtureWritten = false;
  for (const persona of listPersonas()) {
    const batch = await generateBatch({ count: perPersonaCount, personaMix: { [persona.id]: 1 }, seed: 'verification-v1',
      environmentSeed: 'validation-store-v1', concurrency: 3, outputPath: path.join(output, `${persona.id}.jsonl`) });
    const stats = { personaId: persona.id, episodes: 0, successes: 0, uniqueActionSequences: 0, maxMovePixels: 0,
      rejectedActions: 0, meanCartChecks: 0, meanHelpRequests: 0, decisionMedianMs: 0, decisionP90Ms: 0,
      selectionErrorRate: 0, checkoutFailureRate: 0, selectedItemCounts: {}, examples: [] };
    const reactions = [], fingerprints = new Set();
    let selections = 0, mistakes = 0, submissions = 0, failedSubmissions = 0;
    const input = readline.createInterface({ input: fs.createReadStream(batch.outputPath), crlfDelay: Infinity });
    for await (const line of input) {
      const item = JSON.parse(line);
      const validation = validateGeneratedEpisode(item);
      assert.equal(validation.valid, true, validation.errors.join('\n'));
      assert.ok(item.summary.maxMoveDistance <= 32);
      assert.equal(item.summary.rejectedActions, 0);
      stats.episodes++; stats.successes += Number(item.episode.outcome === 'success');
      stats.maxMovePixels = Math.max(stats.maxMovePixels, item.summary.maxMoveDistance);
      stats.rejectedActions += item.summary.rejectedActions;
      stats.meanCartChecks += item.summary.cartChecks / perPersonaCount;
      stats.meanHelpRequests += item.summary.helpRequests / perPersonaCount;
      fingerprints.add(item.summary.actionFingerprint);
      selections += item.summary.selections; mistakes += item.summary.wrongSelections;
      for (const [id, count] of Object.entries(item.summary.selectedItemCounts)) stats.selectedItemCounts[id] = (stats.selectedItemCounts[id] ?? 0) + count;
      for (const step of item.trace) if (step.action.type !== 'move' && step.source !== 'limit') reactions.push(step.delayMs);
      for (const event of item.episode.events) if (event.type === 'purchase_submitted') {
        submissions++; failedSubmissions += Number(!event.payload.evaluation.success);
      }
      if (stats.examples.length < 3) stats.examples.push({ seed: item.summary.seed,
        actionFingerprint: item.summary.actionFingerprint,
        visitedStations: item.trace.filter(t => t.action.type === 'interact').map(t => t.action.station),
        cartChecks: item.summary.cartChecks, selectedItems: item.summary.selectedItemCounts,
        movementSample: item.episode.events.filter(e => e.type === 'player_moved').slice(0, 6).map(e => ({ at: e.timestamp, ...e.payload.point })),
      });
      if (!fixtureWritten) {
        const events = item.behaviorLogs.slice(0, 50);
        await fsp.writeFile(path.join(output, 'http-smoke.json'), JSON.stringify({ batchId: stableBatchId(events), events }, null, 2) + '\n', { flag: 'wx' });
        fixtureWritten = true;
      }
    }
    stats.uniqueActionSequences = fingerprints.size;
    assert.equal(fingerprints.size, perPersonaCount, 'Different policy seeds must produce different action sequences in the same store.');
    reactions.sort((a, b) => a - b);
    stats.decisionMedianMs = reactions[Math.floor(reactions.length * .5)] ?? 0;
    stats.decisionP90Ms = reactions[Math.floor(reactions.length * .9)] ?? 0;
    stats.selectionErrorRate = mistakes / Math.max(1, selections);
    stats.checkoutFailureRate = failedSubmissions / Math.max(1, submissions);
    reports.push(stats);
    process.stdout.write(JSON.stringify({ persona: persona.id, completed: stats.episodes, successes: stats.successes,
      medianMs: stats.decisionMedianMs, checks: stats.meanCartChecks, selectionErrorRate: stats.selectionErrorRate }) + '\n');
  }
  const careful = reports.find(r => r.personaId === 'careful-checker');
  const quick = reports.find(r => r.personaId === 'quick-decider');
  assert.ok(careful.decisionMedianMs > quick.decisionMedianMs * 2, 'Reaction time distributions should differ.');
  assert.ok(careful.meanCartChecks > quick.meanCartChecks + .5, 'Cart rechecking patterns should differ.');
  assert.ok(quick.selectionErrorRate > careful.selectionErrorRate, 'Selection errors should reflect the configured profiles.');
  const report = { schema: 'oneuldo.market.validation', version: 1, seed: 'verification-v1', environmentSeed: 'validation-store-v1',
    mode: 'stochastic', perPersonaCount, episodes: perPersonaCount * reports.length,
    note: 'Simulated timings and uncalibrated synthetic behavior profiles, not measured human or clinical evidence. Selection errors mean wrong SKU or excess quantity on add; checkout failures are state-machine evaluations.',
    outputDirectory: path.relative(root, output), personas: reports };
  await fsp.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  process.stdout.write(JSON.stringify({ reportPath: path.join(output, 'report.json'), status: 'passed' }) + '\n');
}
main().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
