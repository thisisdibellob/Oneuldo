#!/usr/bin/env node
'use strict';
// Offline plan verification only. No app input, backend traffic, or generated behavior logs.
require('../runtime.cjs');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot, marketReplayFingerprint } = require('../../frontend/src/game/marketReplayTrace.ts');
const { getMarketProduct } = require('../../frontend/src/game/scenarios.ts');
const { generateTrace, listPersonas } = require('../src/simulator.ts');
const { TraceGuard, validateTrace } = require('../src/traceValidation.ts');

const PERSONA_ID = 'mild-intellectual-disability-adult';
const ENVIRONMENT_SEED = 'attention-verification-store-v1';
const POLICY_SEED = 'attention-verification-policy-v1';
const OBJECTIVES = [{ productId: 'apple', quantity: 2 }, { productId: 'water', quantity: 1 }];

function readOptions(argv) {
  const options = { count: 10, output: path.resolve(__dirname, `../output/attention-verification-${Date.now()}`) };
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i], value = argv[i + 1];
    if (!value || !['--count', '--output'].includes(flag)) throw new Error('Usage: verify-attention.cjs [--count 10] [--output new-directory]');
    if (flag === '--count') options.count = Number(value);
    else options.output = path.resolve(value);
  }
  if (!Number.isInteger(options.count) || options.count < 1 || options.count > 1000) throw new Error('--count must be 1..1000.');
  return options;
}

function distribution(values) {
  if (!values.length) return { count: 0, minimum: null, median: null, p90: null, maximum: null, mean: null };
  const sorted = [...values].sort((a, b) => a - b);
  const at = p => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  return { count: values.length, minimum: sorted[0], median: at(.5), p90: at(.9), maximum: sorted.at(-1),
    mean: Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(3)) };
}

/** Gesture/motor seeds, waits, reasons and attention labels cannot create apparent diversity. */
function semanticSequence(trace) {
  return trace.steps.map(step => ({ type: step.type,
    ...(step.target ? { target: step.target } : {}),
    ...Object.fromEntries(['stationId', 'checkoutId', 'productId', 'quantity', 'choice', 'scrollFraction']
      .filter(key => step[key] !== undefined).map(key => [key, step[key]])),
    ...(step.gesture ? { outcome: step.gesture.outcome } : {}),
  }));
}

function describeTrace(trace, goals = OBJECTIVES) {
  const goalProducts = new Set(goals.map(g => g.productId));
  const goalShelves = new Set(goals.map(g => getMarketProduct(g.productId).categoryId));
  const steps = trace.steps, interestSteps = steps.filter(s => s.attentionTag === 'interest');
  const nonGoalShelves = steps.filter(s => s.type === 'openShelf' && !goalShelves.has(s.stationId));
  const nonGoalPurchases = steps.filter(s => s.type === 'dragProduct' && s.gesture.outcome === 'drop' && !goalProducts.has(s.productId));
  let interestRuns = 0, goalReturnsAfterInterest = 0, awaitingReturn = false, previousTag;
  const returnStepIds = [];
  for (const step of steps) {
    if (step.attentionTag === 'interest') {
      if (previousTag !== 'interest') interestRuns++;
      awaitingReturn = true;
    } else if (awaitingReturn && (step.type === 'readList' || ['recover-goal', 'read-goal', 'goal-item'].includes(step.attentionTag))) {
      goalReturnsAfterInterest++; returnStepIds.push(step.id); awaitingReturn = false;
    }
    if (step.attentionTag) previousTag = step.attentionTag;
  }
  const listReads = steps.filter(s => s.type === 'readList').length;
  const cartChecks = steps.filter(s => s.type === 'viewCart').length;
  const reactions = steps.map(s => s.reactionDelayMs).filter(ms => ms > 0);
  const representativeIds = new Set([
    ...interestSteps.slice(0, 3).map(s => s.id), ...returnStepIds.slice(0, 3),
    ...nonGoalShelves.slice(0, 2).map(s => s.id), ...nonGoalPurchases.slice(0, 2).map(s => s.id),
    ...steps.filter(s => s.type === 'readList').slice(0, 2).map(s => s.id),
  ]);
  return { metrics: {
    steps: steps.length, walkingIntentions: steps.filter(s => ['walkTo', 'walkToAnchor'].includes(s.type)).length,
    anchorWalks: steps.filter(s => s.type === 'walkToAnchor').length,
    interestTagSteps: interestSteps.length, interestRuns, goalReturnsAfterInterest,
    nonGoalShelfOpens: nonGoalShelves.length, nonGoalShelfIds: [...new Set(nonGoalShelves.map(s => s.stationId))],
    nonGoalProductsDragged: nonGoalPurchases.reduce((n, s) => n + s.quantity, 0),
    nonGoalProductIds: [...new Set(nonGoalPurchases.map(s => s.productId))],
    listReads, listRechecks: Math.max(0, listReads - 1), cartChecks,
    plannedReactionTotalMs: reactions.reduce((a, b) => a + b, 0), plannedReactionMs: distribution(reactions),
    ending: steps.some(s => s.type === 'submitForReview') ? 'review-requested' : 'gave-up',
  }, reactions, reasonCueSamples: steps.filter(s => representativeIds.has(s.id)).map(s => ({ id: s.id, type: s.type,
    attentionTag: s.attentionTag ?? null, reason: s.reason, cueRefs: s.cueRefs ?? [] })) };
}

/** Replays every guarded primitive; large high-level journeys must be sums of <=32px moves. */
function auditMovement(trace, snapshot) {
  const guard = new TraceGuard(snapshot, trace.personaId, trace.personaVersion, trace.generation?.model, trace.traceSchemaVersion === '2');
  let primitiveMoves = 0, maxDisplacementPx = 0, movementMs = 0;
  for (const step of trace.steps) {
    assert.ok(!['move', 'setPosition'].includes(step.type), 'trace cannot contain low-level movement or teleport');
    const applied = guard.execute(step);
    let dx = 0, dy = 0;
    for (const action of applied.actions) {
      assert.notEqual(action.type, 'setPosition', 'guard must never use teleport');
      assert.ok(!Object.hasOwn(action, 'source') && !Object.hasOwn(action, 'trustedRenderer'), 'guard must use agent actions');
      if (action.type !== 'move') continue;
      assert.ok(Number.isFinite(action.dx) && Number.isFinite(action.dy));
      const displacement = Math.hypot(action.dx, action.dy);
      assert.ok(displacement <= 32 + 1e-7, `guard displacement ${displacement} exceeds 32px`);
      maxDisplacementPx = Math.max(maxDisplacementPx, displacement); primitiveMoves++;
      dx += action.dx; dy += action.dy;
    }
    const actualX = applied.after.playerPosition.x - applied.before.playerPosition.x;
    const actualY = applied.after.playerPosition.y - applied.before.playerPosition.y;
    assert.ok(Math.hypot(actualX - dx, actualY - dy) < 1e-6, `${step.id}: position changed outside guarded moves`);
    movementMs += applied.movementMs;
  }
  return { primitiveMoves, maxDisplacementPx, movementMs, noTeleport: true, guardedMovesWithin32Px: true };
}

function errorDetails(error) { return { name: error?.name ?? 'Error', message: String(error?.message ?? error) }; }
const writeJson = (file, value) => fs.writeFile(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });

async function main(argv = process.argv.slice(2)) {
  const options = readOptions(argv);
  const profile = listPersonas().find(p => p.id === PERSONA_ID);
  const snapshot = createMarketReplaySnapshot(createMarketSession({ seed: ENVIRONMENT_SEED, difficulty: 'exact', objectives: OBJECTIVES }));
  await fs.mkdir(path.dirname(options.output), { recursive: true });
  await fs.mkdir(options.output); // Existing artifact directories are never overwritten.
  await writeJson(path.join(options.output, 'snapshot.json'), snapshot);
  const tracesFile = await fs.open(path.join(options.output, 'traces.jsonl'), 'wx', 0o600);
  const samplesFile = await fs.open(path.join(options.output, 'samples.jsonl'), 'wx', 0o600);
  const samples = [], completed = [], reactions = [], signatures = new Set();
  const invariantFailures = [];
  let representative, reproducibility = { seed: `${POLICY_SEED}:0`, status: 'unavailable', byteIdentical: null };
  try {
    for (let index = 0; index < options.count; index++) {
      const seed = `${POLICY_SEED}:${index}`;
      const input = { personaId: PERSONA_ID, seed, snapshot, mode: 'stochastic', attentionExperience: { visit: 'first-play' } };
      let trace, stage = 'generation';
      let sample = { index, seed };
      try {
        trace = await generateTrace(input);
        if (index === 0) {
          stage = 'reproducibility';
          const replayed = await generateTrace(input);
          const byteIdentical = JSON.stringify(trace) === JSON.stringify(replayed);
          reproducibility = { seed, status: byteIdentical ? 'passed' : 'failed', byteIdentical };
          assert.ok(byteIdentical, 'First seed must reproduce byte-identical trace JSON');
        }
        stage = 'schema-and-guard';
        const validation = validateTrace(trace, snapshot);
        assert.ok(validation.valid, validation.errors.join('; '));
        const movement = auditMovement(trace, snapshot);
        const described = describeTrace(trace);
        const signature = marketReplayFingerprint(semanticSequence(trace));
        signatures.add(signature); reactions.push(...described.reactions);
        sample = { ...sample, status: 'complete-plan', traceId: trace.traceId, personaVersion: trace.personaVersion,
          policyVersion: trace.policyVersion, semanticSequenceHash: signature,
          ...described.metrics, movement, reasonCueSamples: described.reasonCueSamples };
        stage = 'artifact-write';
        await tracesFile.write(JSON.stringify(trace) + '\n');
        completed.push(sample); representative ??= trace;
      } catch (error) {
        if (stage === 'artifact-write') throw error;
        const failureKind = stage === 'generation'
          ? String(error?.message).startsWith('ATTENTION_GENERATION_LIMIT') ? 'technical-generation-limit' : 'generation-error'
          : 'validation-failure';
        sample = { ...sample, status: 'failed-sample', failureKind, stage, error: errorDetails(error),
          ...(trace ? { traceId: trace.traceId } : {}) };
        if (index === 0 && reproducibility.status === 'unavailable') reproducibility = { ...reproducibility, reason: sample.error.message };
        if (stage !== 'generation') invariantFailures.push({ seed, stage, ...sample.error });
      }
      samples.push(sample);
      await samplesFile.write(JSON.stringify(sample) + '\n');
    }
  } finally { await tracesFile.close(); await samplesFile.close(); }

  let diversity = { status: completed.length >= 2 ? 'passed' : 'insufficient-completed-plans', distinctSequences: signatures.size };
  if (completed.length >= 2) {
    try { assert.ok(signatures.size > 1, 'Different seeds must vary semantic sequences after removing timing and metadata'); }
    catch (error) { diversity.status = 'failed'; invariantFailures.push({ stage: 'diversity', ...errorDetails(error) }); }
  }
  const totals = Object.fromEntries(['steps', 'walkingIntentions', 'anchorWalks', 'interestTagSteps', 'interestRuns',
    'goalReturnsAfterInterest', 'nonGoalShelfOpens', 'nonGoalProductsDragged', 'listReads', 'listRechecks', 'cartChecks']
    .map(key => [key, completed.reduce((n, row) => n + row[key], 0)]));
  const failed = samples.filter(s => s.status === 'failed-sample');
  const report = { schema: 'oneuldo.market.attention-plan-validation', version: 1,
    personaId: PERSONA_ID, personaVersion: profile.version, policyVersions: [...new Set(completed.map(row => row.policyVersion))],
    environmentSeed: ENVIRONMENT_SEED, policySeedPrefix: POLICY_SEED, snapshotId: snapshot.snapshotId, objectives: OBJECTIVES,
    requestedSamples: options.count, completedPlans: completed.length, failedSamples: failed.length,
    reviewRequests: completed.filter(s => s.ending === 'review-requested').length,
    plannedGiveUps: completed.filter(s => s.ending === 'gave-up').length,
    technicalGenerationFailures: failed.filter(s => s.failureKind === 'technical-generation-limit').length,
    checks: { reproducibility, diversity, invariantFailures,
      movement: { status: completed.length ? invariantFailures.some(f => f.stage === 'schema-and-guard') ? 'failed' : 'passed' : 'unavailable',
        primitiveMoves: completed.reduce((n, row) => n + row.movement.primitiveMoves, 0),
        maximumDisplacementPx: completed.length ? Math.max(...completed.map(row => row.movement.maxDisplacementPx)) : null } },
    totals, perCompletedPlan: Object.fromEntries(Object.keys(totals).map(key => [key, distribution(completed.map(row => row[key]))])),
    plannedReactionMs: distribution(reactions), samples,
    status: invariantFailures.length ? 'failed' : reproducibility.status !== 'passed' || diversity.status !== 'passed' ? 'inconclusive'
      : failed.length ? 'passed-invariants-with-generation-failures' : 'passed',
    interpretation: [
      '완성된 계획과 생성 실패 표본을 분리한다. technical-generation-limit은 인물의 포기나 완료가 아니다.',
      '목표 밖 매대는 사과·생수의 구역이 아닌 매대를 연 횟수다. 비목표 상품은 담기 의도이며 최종 보유 수량과 다를 수 있다.',
      '목표 복귀는 interest 구간 뒤 첫 readList/goal-item/read-goal/recover-goal 의도다. 실제 사람의 인지 회복을 측정한 값이 아니다.',
      '관심태그·cueRefs·reason은 생성 계획의 감사 정보다. 관심·실수·복귀의 최소 횟수를 강제하지 않는다.',
      '반응시간은 양수인 계획 대기시간만 집계한다. 이동·드래그·서버·실제 화면 시간 또는 임상 반응시간이 아니다.',
      'guard 이동 검사는 내부 에이전트 이동의 32px 제한과 위치 변화 합계만 검증한다. 실제 앱의 FPS·드래그·로그·분석 성공을 입증하지 않는다.',
      'trace.attentionExperience는 planned-trace 출처다. 실제 앱의 학습이나 장애 집단 대표성을 검증하지 않는다.',
    ] };
  if (representative) await writeJson(path.join(options.output, 'representative-trace.json'), representative);
  await writeJson(path.join(options.output, 'report.json'), report);
  await fs.writeFile(path.join(options.output, 'README.ko.md'), '# 주의 정책 계획 검증 결과\n\n'
    + report.interpretation.map(text => '- ' + text).join('\n')
    + '\n\n`traces.jsonl`은 검증된 완성 계획만 포함하고, `samples.jsonl`과 `report.json`은 실패 표본도 포함한다. 첫 seed 재현 또는 두 개 이상 완성 계획의 다양성을 확인하지 못하면 inconclusive다.\n', { flag: 'wx', mode: 0o600 });
  process.stdout.write(JSON.stringify({ reportPath: path.join(options.output, 'report.json'), status: report.status,
    completedPlans: completed.length, failedSamples: failed.length, distinctSequences: signatures.size }) + '\n');
  if (report.status === 'failed' || report.status === 'inconclusive') process.exitCode = 1;
  return report;
}

module.exports = { readOptions, semanticSequence, describeTrace, auditMovement, main };
if (require.main === module) main().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
