#!/usr/bin/env node
'use strict';
require('../runtime.cjs');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { marketCategories, marketProducts, getMarketProduct } = require('../../frontend/src/game/scenarios.ts');
const { createMarketReplaySnapshot, validateMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const { DEFAULT_REPLAY_PRESENTATION } = require('../../frontend/src/game/marketReplayPerception.ts');
const { auditManifestSnapshots } = require('../src/validation/personaValidationOpportunity.cjs');
const PERSONAS = ['mild-intellectual-disability-adult', 'careful-checker', 'quick-decider', 'neutral-adult-control'];
const HIGH_GOALS = [{ productId: 'milk', quantity: 2 }, { productId: 'apple', quantity: 2 },
  { productId: 'water', quantity: 2 }, { productId: 'eggs', quantity: 1 }, { productId: 'banana', quantity: 1 }];

function buildSnapshots({ setId = 'validation-opportunities-v1', environmentSeed = setId, lowGoalCount = 2 } = {}) {
  if (typeof setId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(setId)) throw new Error('Invalid snapshot setId');
  if (!Number.isInteger(lowGoalCount) || lowGoalCount < 2 || lowGoalCount >= HIGH_GOALS.length)
    throw new Error('lowGoalCount must be an integer from 2 to 4');
  const inventoryProductIds = Object.fromEntries(marketCategories.map(category => {
    const products = marketProducts.filter(product => product.categoryId === category.id), selected = [];
    const add = id => { if (!selected.includes(id)) selected.push(id); };
    if (category.id === 'meal') { add('curry'); add('brand-curry'); }
    for (const goal of HIGH_GOALS.filter(goal => getMarketProduct(goal.productId).categoryId === category.id)) {
      add(goal.productId);
      const alternate = products.find(product => product.id !== goal.productId && product.familyId === getMarketProduct(goal.productId).familyId);
      if (!alternate) throw new Error(`Missing related candidate: ${goal.productId}`);
      add(alternate.id);
    }
    for (const product of products) { if (selected.length === 12) break; add(product.id); }
    return [category.id, selected];
  }));
  const environment = { layoutId: 'classic', shelfOrder: ['fresh', 'produce', 'meal', 'household', 'drink'],
    employeeCount: 1, customerCount: 1, pillarCount: 0, chairCount: 0, cashierCount: 2, kioskPresent: false, kioskLane: 'none' };
  // Both loads share geometry and inventory. Actor seed never re-randomizes a saved snapshot.
  return Object.fromEntries(['low', 'high'].map(condition => {
    const objectives = condition === 'low' ? HIGH_GOALS.slice(0, lowGoalCount).map(goal => ({ ...goal, quantity: 1 })) : HIGH_GOALS;
    const session = createMarketSession({ seed: `${environmentSeed}:validation-opportunities-v1`, difficulty: 'exact',
      objectives, inventoryProductIds, stockPerProduct: 6, environment });
    const snapshot = createMarketReplaySnapshot(session, undefined, { ...DEFAULT_REPLAY_PRESENTATION, viewport: { width: 390, height: 600 } });
    const validation = validateMarketReplaySnapshot(snapshot);
    if (!validation.valid) throw new Error(`Invalid ${condition} snapshot: ${validation.errors.join('; ')}`);
    return [condition, snapshot];
  }));
}
function writeSnapshotSet({ outputDirectory, setId = 'validation-opportunities-v1', environmentSeed = setId, lowGoalCount = 2 }) {
  if (typeof outputDirectory !== 'string' || !outputDirectory.trim()) throw new Error('outputDirectory is required');
  const snapshots = buildSnapshots({ setId, environmentSeed, lowGoalCount }), directory = path.resolve(outputDirectory);
  // Claim a new directory before writing: existing snapshot sets and run evidence are immutable.
  fs.mkdirSync(directory, { recursive: false, mode: 0o700 });
  const records = {};
  for (const [condition, snapshot] of Object.entries(snapshots)) {
    const filePath = path.join(directory, `${setId}.${condition}.snapshot.json`), text = JSON.stringify(snapshot, null, 2) + '\n';
    fs.writeFileSync(filePath, text, { flag: 'wx', mode: 0o600 });
    records[condition] = { filePath, snapshotId: snapshot.snapshotId, sha256: crypto.createHash('sha256').update(text).digest('hex') };
  }
  const opportunityAudit = auditManifestSnapshots({ snapshots: records, personaIds: PERSONAS, validationMode: 'legacy' });
  const result = { schema: 'oneuldo.persona-validation-snapshot-set', version: 1, setId,
    design: { lowGoalCount, highGoalCount: HIGH_GOALS.length,
      singleSelectionGoalTransitions: { low: lowGoalCount - 1, high: HIGH_GOALS.length - 1 },
      note: 'Transition counts describe one selection per distinct goal in sequence, not guaranteed actor opportunities.' },
    source: 'createMarketSession/createMarketReplaySnapshot; fixed validation inventory and layout', snapshots: records,
    snapshotFilePaths: Object.fromEntries(Object.entries(records).map(([condition, record]) => [condition, record.filePath])), opportunityAudit,
    limitations: ['검증 전용 합성 환경이며 사람의 수행 자료가 아니다.',
      '카레는 비목표 간편식 매대 첫 페이지에 있다. 목표 동선의 간편식 표지는 카레 상품을 이미 봤다는 증거가 아니다.',
      'legacy 카레 지표에는 실제 상품 단서 노출 뒤의 관심 재진입이 필요하다. 최초 탐색이나 오류를 배우에게 강제하지 않는다.',
      '피드백·불일치·관심·도움 기회는 발생 가능성만 확보한다. 실제 미발생은 null/unexercised로 유지한다.'] };
  const metadataPath = path.join(directory, 'snapshot-set.json');
  fs.writeFileSync(metadataPath, JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return { ...result, metadataPath };
}
if (require.main === module) {
  try {
    const args = process.argv.slice(2), options = {};
    for (let i = 0; i < args.length; i += 2) {
      const key = { '--output-directory': 'outputDirectory', '--set-id': 'setId', '--environment-seed': 'environmentSeed', '--low-goal-count': 'lowGoalCount' }[args[i]];
      if (!key || !args[i + 1]) throw new Error('Usage: node market-simulator/scripts/build-validation-snapshots.cjs --output-directory /new/directory [--set-id validation-opportunities-v1] [--environment-seed fixed-seed] [--low-goal-count 2|3|4]');
      options[key] = key === 'lowGoalCount' ? Number(args[i + 1]) : args[i + 1];
    }
    const result = writeSnapshotSet(options);
    process.stdout.write(JSON.stringify({ snapshotFilePaths: result.snapshotFilePaths, snapshots: result.snapshots,
      metadataPath: result.metadataPath, design: result.design, opportunityWarnings: result.opportunityAudit.warnings, limitations: result.limitations }, null, 2) + '\n');
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
module.exports = { buildSnapshots, writeSnapshotSet };
