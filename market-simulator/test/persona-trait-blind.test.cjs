'use strict';
require('../runtime.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const { buildTraits, assertAnonymous } = require('../src/personaValidationBlind.cjs');
const { scoreTraitReview } = require('../src/personaValidationStatistics.cjs');
const catalog = require('../validation/persona-traits.json');
const traitKeys = catalog.traits.map(trait => trait.key);
const levels = catalog.levels;
const settings = value => Object.fromEntries(traitKeys.map(key => [key, value]));
const profile = (index, level = 'medium') => ({ id: `fictional-person-${index}`, basePersonaId: 'careful-checker',
  presetId: catalog.presets[0].id, traits: settings(level), contextHash: `private-context-${index}`,
  persona: { id: `fictional-person-${index}`, character: { name: `개별인물${index}` } } });
const sample = value => ({ personaId: value.id, tracePath: `/private/${value.id}.json`, trace: {
  personaId: value.id, seed: 'private-seed', traitProfile: value, steps: [
    { id: 'private-step-1', type: 'readList', reactionDelayMs: 1000, reason: '필요한 상품을 확인한다.',
      identity: value.persona.character.name, currentTask: value.id },
    { id: 'private-step-2', type: 'dragProduct', productId: 'milk', quantity: 1, reactionDelayMs: 1500,
      reason: '목록에 있는 우유를 담는다.', gesture: { motorSeed: value.id, outcome: 'drop' } },
  ] } });
const answersFor = rows => Object.fromEntries(rows.map(row => [row.opaqueId, { traits: { ...row.traits }, confidence: .8 }]));

test('universal blind panels support one profile and arbitrary five-profile mixtures sharing styles', () => {
  for (const count of [1, 5]) {
    const profiles = Array.from({ length: count }, (_, index) => profile(index));
    const result = buildTraits(profiles.map(sample), profiles, catalog);
    assert.equal(result.bundle.panels.A.length, count);
    assert.equal(result.bundle.panels.B.length, count);
    assert.equal(result.key.length, count * 2);
    assert.equal(new Set(result.key.map(row => row.opaqueId)).size, count * 2);
    assert.equal(new Set(result.key.map(row => row.styleId)).size, 1);
    assertAnonymous(result.bundle, profiles);
    const a = result.key.filter(row => row.version === 'A');
    const score = scoreTraitReview(a, answersFor(a), { traitKeys, levels });
    assert.equal(score.n, count);
    assert.equal(score.macroAccuracy, 1);
    assert.equal(score.macroCoverage, 1);
    assert.ok(!Object.hasOwn(score, 'binaryAccuracy'));
    assert.ok(!Object.hasOwn(score, 'pValue'));
    assert.ok(!Object.hasOwn(score, 'chanceAccuracy'));
  }
});

test('only the common rubric and style descriptions are public, never individual settings', () => {
  const p = profile(7, 'high');
  const source = { ...catalog, privateMapping: { [p.id]: p },
    traits: catalog.traits.map(trait => ({ ...trait, privateProfile: p })),
    presets: catalog.presets.map(preset => ({ ...preset, privateProfile: p })) };
  const result = buildTraits([sample(p)], [p], source);
  assert.equal(result.traitRubric.length, traitKeys.length);
  assert.deepEqual(Object.keys(result.traitRubric[0]), ['key', 'label', 'description', 'levels']);
  assert.deepEqual(Object.keys(result.publicStyles[0]), ['id', 'label', 'description']);
  const publicContent = JSON.stringify({ bundle: result.bundle, traitRubric: result.traitRubric, publicStyles: result.publicStyles });
  for (const hidden of [p.id, p.persona.character.name, p.contextHash, 'privateMapping', 'privateProfile', 'private-seed', '/private/']) {
    assert.ok(!publicContent.includes(hidden), hidden);
  }
  assert.ok(!Object.hasOwn(result.bundle, 'publicProfiles'));
  assert.deepEqual(result.key[0].traits, p.traits);
  assert.equal(result.key[0].personaId, p.id);
});

test('A exposes actor behavior and timing; B additionally exposes reasons with disjoint IDs', () => {
  const p = profile(1), result = buildTraits([sample(p)], [p], catalog);
  const a = result.bundle.panels.A[0], b = result.bundle.panels.B[0];
  assert.notEqual(a.opaqueId, b.opaqueId);
  assert.deepEqual(a.trace.steps, [
    { type: 'readList', reactionDelayMs: 1000 },
    { type: 'dragProduct', productId: 'milk', quantity: 1, reactionDelayMs: 1500 },
  ]);
  assert.deepEqual(b.trace.steps.map(({ reason, ...action }) => action), a.trace.steps);
  assert.ok(b.trace.steps.every(row => typeof row.reason === 'string'));
});

test('custom profile names, aliases, base names and paths cannot leak through allowed free text', () => {
  const p = profile(11);
  for (const token of [p.id, p.persona.character.name, p.basePersonaId, '서연']) {
    const s = sample(p); s.trace.steps[0].reason = `이 행동은 ${token}의 선택이다.`;
    assert.throws(() => buildTraits([s], [p], catalog), /leaked identity/);
  }
  const alias = { ...p, persona: { id: 'private-alias-id', character: { name: '새이름' } } };
  for (const token of ['private-alias-id', '새이름']) {
    assert.throws(() => assertAnonymous({ reason: token }, [alias]), /leaked identity/);
  }
  const s = sample(p); s.trace.steps[0].reason = '기록 위치 /custom/key.json';
  assert.throws(() => buildTraits([s], [p], catalog), /file path/);
});

test('short custom IDs do not match JSON schema names, panel versions or numeric quantities', () => {
  for (const id of ['a', 'b', '1', 'ab', 'abc']) {
    const p = { ...profile(13), id, persona: { id, character: { name: `별도인물${id}` } } };
    const result = buildTraits([sample(p)], [p], catalog);
    assert.equal(result.bundle.panels.A.length, 1);
    assert.equal(result.bundle.panels.B.length, 1);
    assert.throws(() => assertAnonymous({ metadata: { owner: id } }, [p]), /leaked identity/);
    const s = sample(p); s.trace.steps[0].reason = `Profile (${id}) chose this.`;
    assert.throws(() => buildTraits([s], [p], catalog), /leaked identity/);
  }
});

test('answer keys and public rubric are snapshots, not live references into mutable profiles', () => {
  const p = profile(8), source = structuredClone(catalog);
  const result = buildTraits([sample(p)], [p], source);
  p.traits.checking = 'high';
  source.traits[0].levels.low = 'changed later';
  assert.equal(result.key[0].traits.checking, 'medium');
  assert.notEqual(result.traitRubric[0].levels.low, 'changed later');
});

test('trait scoring reports abstention coverage and keeps unknown predictions in accuracy denominators', () => {
  const rows = [
    { opaqueId: 'opaque-a', traits: settings('low') },
    { opaqueId: 'opaque-b', traits: settings('high') },
    { opaqueId: 'opaque-c', traits: settings('medium') },
  ];
  const answers = answersFor(rows);
  answers['opaque-b'].traits = settings('unknown');
  answers['opaque-c'].traits = settings('low');
  answers['opaque-c'].traits.checking = 'medium';
  const score = scoreTraitReview(rows, answers, { traitKeys });
  assert.equal(score.perTrait.deliberation.n, 3);
  assert.equal(score.perTrait.deliberation.correct, 1);
  assert.equal(score.perTrait.deliberation.knownPredictions, 2);
  assert.equal(score.perTrait.deliberation.abstained, 1);
  assert.equal(score.perTrait.deliberation.accuracy, 1 / 3);
  assert.equal(score.perTrait.deliberation.coverage, 2 / 3);
  assert.equal(score.perTrait.deliberation.accuracyWhenPredicted, 1 / 2);
  assert.equal(score.perTrait.deliberation.confusionMatrix.high.unknown, 1);
  assert.equal(score.perTrait.deliberation.confusionMatrix.medium.low, 1);
  assert.equal(score.perTrait.checking.correct, 2);
  assert.ok(Math.abs(score.macroAccuracy - 6 / 15) < 1e-12);
  assert.ok(Math.abs(score.macroCoverage - 2 / 3) < 1e-12);
});

test('all abstentions and empty panels have explicit, distinct results', () => {
  const row = { opaqueId: 'opaque-a', traits: settings('high') };
  const score = scoreTraitReview([row], { 'opaque-a': { traits: settings('unknown') } }, { traitKeys });
  assert.equal(score.macroAccuracy, 0);
  assert.equal(score.macroCoverage, 0);
  assert.equal(score.perTrait.checking.accuracyWhenPredicted, null);
  assert.equal(score.perTrait.checking.confusionMatrix.high.unknown, 1);
  const empty = scoreTraitReview([], {}, { traitKeys });
  assert.equal(empty.macroAccuracy, null);
  assert.equal(empty.macroCoverage, null);
  assert.equal(empty.perTrait.checking.n, 0);
  assert.equal(empty.perTrait.checking.accuracy, null);
});

test('every review row requires exactly the common trait keys and a valid optional confidence', () => {
  const rows = [{ opaqueId: 'opaque-a', traits: settings('medium') }];
  const valid = answersFor(rows);
  const check = answer => assert.throws(() => scoreTraitReview(rows, { 'opaque-a': answer }, { traitKeys }), /invalid trait answer/);
  assert.throws(() => scoreTraitReview(rows, {}, { traitKeys }), /Missing or invalid trait answer/);
  assert.throws(() => scoreTraitReview(rows, { ...valid, extra: valid['opaque-a'] }, { traitKeys }), /Unexpected answer ID/);
  const missing = { ...valid['opaque-a'].traits }; delete missing.checking;
  check({ traits: missing });
  check({ traits: { ...settings('medium'), extra: 'high' } });
  check({ traits: { ...settings('medium'), checking: 'sometimes' } });
  check({ traits: settings('medium'), personaId: 'fictional-person-1' });
  check('medium');
  for (const confidence of [-1, 1.01, NaN, Infinity, '0.8', null]) check({ traits: settings('medium'), confidence });
  for (const confidence of [0, 1]) {
    assert.equal(scoreTraitReview(rows, { 'opaque-a': { traits: settings('medium'), confidence } }, { traitKeys }).macroAccuracy, 1);
  }
});

test('invalid keys, profiles, catalogs and foreign samples fail before producing review material', () => {
  const p = profile(10), s = sample(p);
  assert.throws(() => buildTraits([s], [p, p], catalog), /duplicate trait review profile/);
  assert.throws(() => buildTraits([{ ...s, personaId: 'absent-person' }], [p], catalog), /Unknown profile/);
  assert.throws(() => buildTraits([s], [{ ...p, traits: { ...p.traits, checking: 'unknown' } }], catalog), /Invalid/);
  assert.throws(() => buildTraits([s], [p], { ...catalog, traits: [...catalog.traits, catalog.traits[0]] }), /Duplicate common trait/);
  assert.throws(() => buildTraits([s], [p], { ...catalog, levels: ['unknown'] }), /common trait catalog/);
  const row = { opaqueId: 'opaque-a', traits: settings('medium') };
  assert.throws(() => scoreTraitReview([row, row], {}, { traitKeys }), /duplicate trait answer key/);
  assert.throws(() => scoreTraitReview([{ ...row, traits: settings('unknown') }], {}, { traitKeys }), /Invalid/);
  assert.throws(() => scoreTraitReview([], {}, { traitKeys: [...traitKeys, traitKeys[0]] }), /unique traitKeys/);
  assert.throws(() => scoreTraitReview([], {}, { traitKeys, levels: ['low', 'unknown'] }), /excluding unknown/);
});
