#!/usr/bin/env node
'use strict';
// Offline intention comparison. Never starts an app, provider request or backend export.
require('../runtime.cjs');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { generateTrace, listPersonas } = require('../src/simulator.ts');
const { AttentionPolicy } = require('../src/attentionPolicy.ts');
const { validateTrace } = require('../src/traceValidation.ts');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot, marketReplayFingerprint } = require('../../frontend/src/game/marketReplayTrace.ts');
const { DEFAULT_REPLAY_PRESENTATION } = require('../../frontend/src/game/marketReplayPerception.ts');
const { marketProducts, getMarketProduct } = require('../../frontend/src/game/scenarios.ts');
const { auditMovement, semanticSequence } = require('./verify-attention.cjs');
const PERSONAS = ['mild-intellectual-disability-adult', 'careful-checker', 'quick-decider'];
const OBJECTIVES = [{ productId: 'apple', quantity: 2 }, { productId: 'milk', quantity: 1 }];
const COMPARISON_REASONS = ['compare-visible-options-before-selecting', 'compare-another-observed-shelf-page', 'return-to-a-compared-option'];
const counts = ['steps', 'interestShelfOpens', 'nonGoalShelfOpens', 'comparisonBrowses', 'listRechecks', 'cartChecks',
  'familiarSelections', 'familiarShortcuts', 'selections', 'postSelectionListRechecks', 'preCheckoutCartChecks',
  'returnActions', 'returnedQuantity', 'staffReturnRequests'];
const starts = (step, prefix) => (step.reason ?? '').startsWith(prefix);
const mean = xs => xs.length ? Number((xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(3)) : null;
function distribution(xs) {
  const sorted = [...xs].sort((a, b) => a - b);
  return { count: xs.length, mean: mean(xs), median: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null,
    p90: sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .9))] : null };
}
function shoppingSequence(trace) {
  // Independent of coordinates/anchor IDs, waiting, annotation and motor noise.
  return semanticSequence(trace).filter(step => !['walkTo', 'walkToAnchor', 'pause', 'lookAround'].includes(step.type));
}
function describe(trace, persona) {
  const steps = trace.steps, familiar = new Set(persona.character?.familiarProductIds ?? []);
  const selections = steps.filter(s => s.type === 'dragProduct' && s.gesture.outcome === 'drop');
  const returns = steps.filter(s => s.type === 'removeProduct' || s.type === 'talkToStaff' && s.choice === 'returnProduct');
  const goalShelves = new Set(OBJECTIVES.map(o => getMarketProduct(o.productId).categoryId));
  const reactions = steps.filter(s => s.reactionDelayMs > 0).map(s => s.reactionDelayMs);
  const listReads = steps.filter(s => s.type === 'readList').length;
  const result = { steps: steps.length,
    interestShelfOpens: steps.filter(s => s.type === 'openShelf' && s.attentionTag === 'interest').length,
    nonGoalShelfOpens: steps.filter(s => s.type === 'openShelf' && !goalShelves.has(s.stationId)).length,
    comparisonBrowses: steps.filter(s => s.type === 'browse' && COMPARISON_REASONS.some(r => starts(s, r))).length,
    listRechecks: Math.max(0, listReads - 1), cartChecks: steps.filter(s => s.type === 'viewCart').length,
    familiarSelections: selections.filter(s => familiar.has(s.productId)).length,
    familiarShortcuts: selections.filter(s => starts(s, 'choose-a-familiar-visible-variant-before-checking-all-details')).length,
    selections: selections.length,
    returnActions: returns.length, returnedQuantity: returns.reduce((n, s) => n + s.quantity, 0),
    staffReturnRequests: returns.filter(s => s.type === 'talkToStaff').length,
    postSelectionListRechecks: steps.filter(s => s.type === 'readList' && starts(s, 'recheck-the-list-after-a-selection')).length,
    preCheckoutCartChecks: steps.filter(s => s.type === 'viewCart' && starts(s, 'check-the-basket-before-looking-for-checkout')).length,
    reactionMs: distribution(reactions), reactionValues: reactions,
    ending: steps.some(s => s.type === 'submitForReview') ? 'review-requested' : 'gave-up',
    semanticHash: marketReplayFingerprint(semanticSequence(trace)), shoppingHash: marketReplayFingerprint(shoppingSequence(trace)),
  };
  result.evidence = steps.filter(s => s.attentionTag === 'interest' && !['walkTo', 'walkToAnchor'].includes(s.type) || COMPARISON_REASONS.some(r => starts(s, r))
    || starts(s, 'choose-a-familiar-visible') || starts(s, 'recheck-the-list-after') || starts(s, 'check-the-basket-before')
    || s.type === 'removeProduct' || s.type === 'talkToStaff' && s.choice === 'returnProduct')
    .slice(0, 8).map(({ id, type, reason, attentionTag, stationId, productId, scrollFraction }) => ({ id, type, reason, attentionTag, stationId, productId, scrollFraction }));
  return result;
}
function summarizeSamples(personaId, samples, requested) {
  assert.equal(samples.length, requested, 'Every requested seed must have a result, including failed seeds');
  assert.ok(samples.every(s => ['complete-plan', 'failed-sample'].includes(s.status)), 'Unknown sample status');
  const complete = samples.filter(s => s.status === 'complete-plan'), failed = samples.filter(s => s.status === 'failed-sample');
  const summarizeCount = key => ({ total: complete.reduce((n, s) => n + s.metrics[key], 0),
    meanPerCompletedPlan: mean(complete.map(s => s.metrics[key])), denominatorCompletedPlans: complete.length });
  return { personaId, requested, completedPlans: complete.length, failedSamples: failed.length,
    completionFractionOfRequested: complete.length / requested, failureFractionOfRequested: failed.length / requested,
    endings: { reviewRequested: complete.filter(s => s.metrics.ending === 'review-requested').length,
      gaveUp: complete.filter(s => s.metrics.ending === 'gave-up').length, denominatorRequested: requested },
    failureKinds: Object.fromEntries([...new Set(failed.map(s => s.failureKind))].map(k => [k, failed.filter(s => s.failureKind === k).length])),
    metrics: Object.fromEntries(counts.map(key => [key, summarizeCount(key)])),
    reactionMs: distribution(complete.flatMap(s => s.metrics.reactionValues)),
    uniqueSemanticSequences: new Set(complete.map(s => s.metrics.semanticHash)).size,
    uniqueShoppingSequencesWithoutMovementOrWaiting: new Set(complete.map(s => s.metrics.shoppingHash)).size,
    reproducibility: samples[0].reproducibility ?? { status: 'unavailable', reason: 'The first requested seed did not produce a complete trace.' },
    maximumGuardedMovePx: complete.length ? Math.max(...complete.map(s => s.movement.maxDisplacementPx)) : null,
    evidence: complete.flatMap(s => s.metrics.evidence.map(e => ({ seed: s.seed, ...e }))).slice(0, 10) };
}
function actor(overrides = {}) {
  return { schemaVersion: 'attention-observation-v1', sequence: 0, phase: 'shopping', view: 'world', activeStation: null,
    visibleStations: [], anchors: [], products: [], shelf: null, listAvailable: true, cart: null, cashiers: {}, ...overrides };
}
function accept(policy, before, decision, overrides = {}) {
  const after = { ...before, sequence: before.sequence + 1, readObjectives: undefined, lastActionError: null,
    result: { accepted: true, actionType: decision.action.type, ...('productId' in decision.action ? { productId: decision.action.productId, quantity: decision.action.quantity ?? 1 } : {}) }, ...overrides };
  policy.record(decision, before, after); return after;
}
const product = id => { const p = getMarketProduct(id); return { id: p.id, name: p.name, categoryId: p.categoryId, detail: p.detail, price: p.price, stock: 8 }; };
const probeGoals = [{ id: 'apple-family', label: '사과', quantity: 1, match: 'family' }];
function prepare(persona, seed, goals = probeGoals) {
  // Isolate shopping style from discovery, interest capture and optional help/cart support.
  const p = structuredClone(persona);
  p.attention = { ...p.attention, firstPlayOrientationActions: 0, captureProbability: 0 };
  p.parameters.helpProbability = 0; p.parameters.recheckProbability = 0;
  const policy = new AttentionPolicy(p, seed), before = actor();
  const read = policy.next(before); assert.equal(read.action.type, 'readList');
  return { policy, observation: accept(policy, before, read, { readObjectives: goals }) };
}
function runShelfProbe(persona, seed, { singleGoal = false, noFamiliar = false, oneChoice = false } = {}) {
  const p = structuredClone(persona);
  if (noFamiliar) { p.character.familiarProductIds = []; p.character.familiarCategories = []; }
  const goals = singleGoal ? probeGoals : [...probeGoals, { id: 'milk-family', label: '우유', quantity: 1, match: 'family' }];
  const prepared = prepare(p, seed, goals), policy = prepared.policy;
  const nonApples = marketProducts.filter(p => p.categoryId === 'produce' && !p.name.includes('사과')).map(p => p.id);
  const pages = oneChoice ? [[product('apple')]] : [[product('apple'), product('green-apple'), ...nonApples.slice(0, 2).map(product)],
    [product('apple-green'), ...nonApples.slice(2, 5).map(product)]];
  const pageFractions = pages.length === 1 ? [0] : [0, 1];
  const shelf = page => ({ page, pageCount: pages.length, scrollFraction: pageFractions[page], pageFractions });
  let page = 0, cart = {}, selected = null;
  let o = { ...prepared.observation, sequence: prepared.observation.sequence + 1, readObjectives: undefined,
    activeStation: 'produce', listAvailable: false, products: pages[0], shelf: shelf(0) };
  const actions = [];
  for (let i = 0; i < 30; i++) {
    const d = policy.next(o), a = d.action;
    actions.push({ type: a.type, reason: d.reason, productId: a.productId, scrollFraction: a.scrollFraction, delayMs: d.delayMs });
    if (a.type === 'browse') {
      page = a.scrollFraction >= .5 && pages.length > 1 ? 1 : 0;
      o = accept(policy, o, d, { products: pages[page], shelf: shelf(page) });
    } else if (a.type === 'add') {
      assert.ok(o.products.some(p => p.id === a.productId), 'Probe must not select a hidden page product');
      selected ??= a.productId; cart[a.productId] = (cart[a.productId] ?? 0) + (a.quantity ?? 1);
      o = accept(policy, o, d);
    } else if (a.type === 'viewCart') {
      o = accept(policy, o, d, { view: 'cart', cart: { ...cart }, products: [], shelf: null, listAvailable: false });
    } else if (a.type === 'closeView') {
      o = accept(policy, o, d, { view: 'world', cart: null, listAvailable: !o.activeStation,
        products: o.activeStation ? pages[page] : [], shelf: o.activeStation ? shelf(page) : null });
    } else if (a.type === 'closeStation') {
      o = accept(policy, o, d, { activeStation: null, products: [], shelf: null, listAvailable: true,
        visibleStations: [{ id: 'checkout', kind: 'checkout', label: '1번 계산대 · 계산 가능', direction: 'south', distanceBand: 'near', near: true }], cashiers: { checkout: true } });
    } else if (a.type === 'readList') {
      o = accept(policy, o, d, { readObjectives: goals });
    } else if (['pause', 'lookAround'].includes(a.type)) {
      if (selected) break; // The controlled fixture ends before unrelated discovery.
      o = accept(policy, o, d);
    }
    else break;
  }
  return { selected, selectedFamiliar: !!selected && (p.character?.familiarProductIds ?? []).includes(selected),
    comparisonBrowses: actions.filter(a => a.type === 'browse' && COMPARISON_REASONS.some(r => starts(a, r))).length,
    familiarShortcuts: actions.filter(a => a.type === 'add' && starts(a, 'choose-a-familiar-visible-variant-before-checking-all-details')).length,
    postSelectionListRechecks: actions.filter(a => a.type === 'readList' && starts(a, 'recheck-the-list-after-a-selection')).length,
    preCheckoutCartChecks: actions.filter(a => a.type === 'viewCart' && starts(a, 'check-the-basket-before-looking-for-checkout')).length,
    actions };
}
function interestProbe(persona, seed) {
  const p = structuredClone(persona); p.attention.firstPlayOrientationActions = 0;
  const policy = new AttentionPolicy(p, seed), before = actor(), read = policy.next(before);
  const readAfter = accept(policy, before, read, { readObjectives: probeGoals });
  const o = { ...readAfter, sequence: readAfter.sequence + 1, readObjectives: undefined, visibleStations:
    [['produce', '과일 채소'], ['meal', '간편식']].map(([id, label]) => ({ id, label, kind: 'shelf', direction: 'north', distanceBand: 'near', near: true })) };
  const d = policy.next(o);
  return { captured: d.attentionTag === 'interest', interestShelfOpened: d.action.type === 'interact' && d.attentionTag === 'interest',
    nonGoalInterestShelfOpened: d.action.type === 'interact' && d.action.station === 'meal' && d.attentionTag === 'interest', type: d.action.type, reason: d.reason };
}
function probes(persona, count = 100) {
  const rows = [];
  for (let i = 0; i < count; i++) rows.push({ seed: `personality-probe:${i}`, shelf: runShelfProbe(persona, `personality-probe:${i}`),
    checkout: runShelfProbe(persona, `personality-probe-checkout:${i}`, { singleGoal: true }), interest: interestProbe(persona, `personality-interest:${i}`) });
  return { count, selected: rows.filter(r => r.shelf.selected).length,
    comparisonBrowseMean: mean(rows.map(r => r.shelf.comparisonBrowses)),
    comparisonFraction: rows.filter(r => r.shelf.comparisonBrowses > 0).length / count,
    familiarSelectionFraction: rows.filter(r => r.shelf.selectedFamiliar).length / count,
    familiarShortcutFraction: rows.filter(r => r.shelf.familiarShortcuts > 0).length / count,
    postSelectionListRecheckFraction: rows.filter(r => r.shelf.postSelectionListRechecks > 0).length / count,
    preCheckoutCartCheckFraction: rows.filter(r => r.checkout.preCheckoutCartChecks > 0).length / count,
    interestCaptureFraction: rows.filter(r => r.interest.captured).length / count,
    interestShelfOpenFraction: rows.filter(r => r.interest.interestShelfOpened).length / count,
    nonGoalInterestShelfOpenFraction: rows.filter(r => r.interest.nonGoalInterestShelfOpened).length / count,
    reactionMs: distribution(rows.flatMap(r => r.shelf.actions.map(a => a.delayMs))), rows };
}
function readOptions(argv) {
  const result = { count: 12, probeCount: 100, seed: 'personality-comparison-v1', environmentSeed: 'personality-shared-store-v1',
    maxActions: 600, output: path.resolve(__dirname, `../output/personality-validation-${Date.now()}`) };
  const flags = { '--count': 'count', '--probe-count': 'probeCount', '--seed': 'seed', '--environment-seed': 'environmentSeed', '--max-actions': 'maxActions', '--output': 'output' };
  for (let i = 0; i < argv.length; i += 2) {
    const key = flags[argv[i]], value = argv[i + 1]; if (!key || !value) throw new Error('Use --count >=10 --probe-count >=30 --seed value --environment-seed value --max-actions 600 --output new-directory');
    result[key] = ['count', 'probeCount', 'maxActions'].includes(key) ? Number(value) : key === 'output' ? path.resolve(value) : value;
  }
  for (const [key, minimum, maximum] of [['count', 10, 500], ['probeCount', 30, 500], ['maxActions', 30, 2000]]) {
    if (!Number.isInteger(result[key]) || result[key] < minimum || result[key] > maximum) throw new Error(`${key} must be ${minimum}..${maximum}`);
  }
  return result;
}
const jsonFile = (file, value) => fs.writeFile(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
async function main(argv = process.argv.slice(2)) {
  const options = readOptions(argv), profiles = PERSONAS.map(id => listPersonas().find(p => p.id === id));
  assert.ok(profiles.every(p => p?.attention && p?.shoppingStyle), 'All three profiles must support the attention shopping policy');
  const snapshot = createMarketReplaySnapshot(createMarketSession({ seed: options.environmentSeed, difficulty: 'family', objectives: OBJECTIVES }), undefined, DEFAULT_REPLAY_PRESENTATION);
  await fs.mkdir(path.dirname(options.output), { recursive: true }); await fs.mkdir(options.output);
  await jsonFile(path.join(options.output, 'snapshot.json'), snapshot);
  const traces = await fs.open(path.join(options.output, 'traces.jsonl'), 'wx', 0o600);
  const samplesFile = await fs.open(path.join(options.output, 'samples.jsonl'), 'wx', 0o600);
  const samples = [], groups = [], probeResults = [];
  try {
    for (const persona of profiles) {
      const current = [];
      for (let i = 0; i < options.count; i++) {
        const seed = `${options.seed}:${i}`, input = { personaId: persona.id, seed, snapshot, mode: 'stochastic', maxActions: options.maxActions };
        const sample = { personaId: persona.id, personaVersion: persona.version, index: i, seed };
        let stage = 'generation', trace;
        try {
          trace = await generateTrace(input);
          stage = 'schema-and-guard';
          assert.equal(trace.traceSchemaVersion, '2'); assert.equal(trace.policyVersion, '5');
          const valid = validateTrace(trace, snapshot); assert.ok(valid.valid, valid.errors.join('; '));
          sample.movement = auditMovement(trace, snapshot);
          if (i === 0) {
            stage = 'reproducibility';
            const repeated = await generateTrace(input), identical = JSON.stringify(repeated) === JSON.stringify(trace);
            sample.reproducibility = { status: identical ? 'passed' : 'failed', byteIdentical: identical };
            assert.ok(identical, 'Same seed/snapshot must reproduce the same stochastic trace');
          }
          sample.status = 'complete-plan'; sample.traceId = trace.traceId; sample.metrics = describe(trace, persona);
          stage = 'write'; await traces.write(JSON.stringify(trace) + '\n');
        } catch (error) {
          if (stage === 'write') throw error;
          sample.status = 'failed-sample'; sample.stage = stage;
          sample.failureKind = stage !== 'generation' ? 'invariant-failure' : String(error.message).startsWith('ATTENTION_GENERATION_LIMIT') ? 'technical-generation-limit' : 'generation-error';
          sample.error = String(error.message); if (trace) sample.traceId = trace.traceId;
        }
        current.push(sample); samples.push(sample); await samplesFile.write(JSON.stringify(sample) + '\n');
      }
      groups.push(summarizeSamples(persona.id, current, options.count));
      probeResults.push({ personaId: persona.id, ...probes(persona, options.probeCount) });
    }
  } finally { await traces.close(); await samplesFile.close(); }
  const invariantFailures = samples.filter(s => s.failureKind === 'invariant-failure');
  const status = invariantFailures.length ? 'failed' : groups.some(g => g.completedPlans < 2 || g.reproducibility.status !== 'passed') ? 'inconclusive'
    : groups.some(g => g.uniqueShoppingSequencesWithoutMovementOrWaiting < 2) ? 'inconclusive-shopping-diversity'
    : samples.some(s => s.status === 'failed-sample') ? 'complete-with-generation-failures' : 'passed';
  const report = { schema: 'oneuldo.personality-plan-comparison', version: 1, status, options, snapshotId: snapshot.snapshotId,
    profiles: profiles.map(({ id, version, attention, shoppingStyle }) => ({ id, version, attention, shoppingStyle })),
    fixtureFamiliarInventory: profiles.map(p => ({ personaId: p.id,
      personallyFamiliarProductIds: p.character?.familiarProductIds ?? [],
      personallyFamiliarProductIdsInInitialStock: (p.character?.familiarProductIds ?? []).filter(id => snapshot.initialStock[id] > 0) })),
    requested: options.count * profiles.length, groups, probes: probeResults.map(({ rows, ...p }) => p),
    interpretation: [
      '완성 trace와 고정 관측 probe는 계획된 행동이며 실제 앱 행동 로그·서버 수집 결과가 아니다.',
      '실패를 다른 seed로 대체하지 않았다. 분모는 각 persona 요청 수이고, 행동 평균은 완성 계획에 한정된다. 실패 행동을 0으로 채우지 않았다.',
      '재현 검사는 각 persona의 첫 요청 seed만 동일 입력으로 한 번 더 생성해 비교한다. 첫 요청이 실패하면 다른 seed로 대신 검사하지 않는다.',
      '검토 요청은 구매 성공이나 AI 분석 성공이 아니다. 기술적 생성 한도와 인물의 포기 의도를 구분한다.',
      '동일 seed 이름·snapshot·동일 행동 한도를 사용했다. RNG의 개인별 경로가 같다는 뜻은 아니다.',
      '친숙 개별상품 선택은 character.familiarProductIds와 일치하는 선택만 센다. 친숙 단서로 바로 선택은 익숙한 분류까지 포함하는 별도 행동이다. 초기 재고는 비교 조건이며 행위자가 미리 본 정보가 아니다.',
      '고정 shelf probe는 처음 조작 탐색·관심 포착·선택적 도움/장바구니 지원을 끄고 비교·친숙 선택 성향만 관찰했다. 실제 개인의 전체 게임 행동률이 아니다.',
      'interest probe는 실제 profile의 관심 확률을 사용하되 동일하게 공개된 매대 단서를 제시했다.',
      '행동 차이는 이 합성 설정의 차이이며 임상적 실제성·집단 대표성·학습용 정답을 입증하지 않는다. 실제 LLM 모드는 호출하지 않았다.',
    ] };
  await jsonFile(path.join(options.output, 'report.json'), report);
  await jsonFile(path.join(options.output, 'controlled-probes.json'), probeResults);
  const header = '| 페르소나 | 요청/완성/실패 | 평균 반응 ms | 관심 매대 | 비교 browse | 목록 재확인 | 장바구니 | 친숙 개별상품 | 친숙 단서로 바로 선택 | 반품 | 전체 steps |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|';
  const row = g => `| ${g.personaId} | ${g.requested}/${g.completedPlans}/${g.failedSamples} | ${g.reactionMs.mean ?? '-'} | ${['interestShelfOpens', 'comparisonBrowses', 'listRechecks', 'cartChecks', 'familiarSelections', 'familiarShortcuts', 'returnActions', 'steps'].map(k => g.metrics[k].meanPerCompletedPlan ?? '-').join(' | ')} |`;
  const probeTable = '| 페르소나 | 비교 발생 | 친숙 바로 선택 | 선택 후 목록 재확인 | 계산 전 장바구니 | 관심 포착 |\n|---|---:|---:|---:|---:|---:|\n'
    + probeResults.map(p => `| ${p.personaId} | ${p.comparisonFraction} | ${p.familiarShortcutFraction} | ${p.postSelectionListRecheckFraction} | ${p.preCheckoutCartCheckFraction} | ${p.interestCaptureFraction} |`).join('\n');
  const evidence = groups.map(g => `### ${g.personaId}\n\n` + g.evidence.slice(0, 4).map(e => `- ${e.seed} / ${e.id}: ${e.type}${e.productId ? ' ' + e.productId : ''}${e.stationId ? ' ' + e.stationId : ''} — ${e.reason}`).join('\n')).join('\n\n');
  const checks = groups.map(g => `- ${g.personaId}: 완성 ${g.completedPlans}/${g.requested}, 검토 요청 ${g.endings.reviewRequested}, 포기 ${g.endings.gaveUp}, 기술 실패 ${g.failedSamples}; 첫 seed 재현 ${g.reproducibility.status}, 이동·대기를 뺀 서로 다른 행동열 ${g.uniqueShoppingSequencesWithoutMovementOrWaiting}, 최대 guarded 이동 ${g.maximumGuardedMovePx ?? '-'}px.`).join('\n');
  const failures = samples.filter(s => s.status === 'failed-sample').map(s => `- ${s.personaId} / ${s.seed}: ${s.failureKind} — ${s.error}`).join('\n') || '- 실패 표본 없음.';
  const availability = report.fixtureFamiliarInventory.map(p => `- ${p.personaId}: 이번 매장 초기 재고에 포함된 친숙 개별상품은 ${p.personallyFamiliarProductIdsInInitialStock.join(', ') || '없음'}.`).join('\n');
  await fs.writeFile(path.join(options.output, 'report.ko.md'), '# 세 페르소나 계획 행동 비교\n\n'
    + `상태: ${status}. 동일 매장 snapshot: ${snapshot.snapshotId}. 각 ${options.count}개 seed, 재시도 없음.\n\n`
    + header + '\n' + groups.map(row).join('\n') + '\n\n행동 횟수와 steps는 완성 계획당 평균이다. 반응시간은 완성 계획의 양수 반응 지연을 모은 평균이다.\n\n' + availability + '\n\n'
    + '## 검증과 전체 분모\n\n완성 계획은 모두 공용 trace schema, snapshot 의미 guard, 32px 이동 제한을 통과했다.\n\n' + checks + '\n\n' + failures + '\n\n'
    + '## 동일 공개 관측에서의 조건부 probe\n\n각 ' + options.probeCount + '개 seed. 수치는 실측 확률이 아닌 합성 정책의 조건부 비율이다.\n\n' + probeTable
    + '\n\n## 실제 계획 의도 예\n\n' + evidence + '\n\n## 해석 범위\n\n' + report.interpretation.map(s => '- ' + s).join('\n') + '\n', { flag: 'wx', mode: 0o600 });
  process.stdout.write(JSON.stringify({ outputPath: options.output, status, requested: report.requested,
    groups: groups.map(g => ({ personaId: g.personaId, completed: g.completedPlans, failed: g.failedSamples,
      shoppingDiversity: g.uniqueShoppingSequencesWithoutMovementOrWaiting })), probes: report.probes }) + '\n');
  if (status.startsWith('inconclusive') || status === 'failed') process.exitCode = 1;
  return report;
}
module.exports = { readOptions, describe, summarizeSamples, shoppingSequence, runShelfProbe, probes, main };
if (require.main === module) main().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
