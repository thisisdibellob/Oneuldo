'use strict';
require('../runtime.cjs');
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const { catalog, getCatalog, getTraitKeys, TRAIT_KEYS_BY_VERSION, resolveProfiles, validateTraits, assertValidPersona } = require('../src/validation/personaTraitProfiles.cjs');
const { buildWholeTracePersonaInput } = require('../src/wholeTrace/wholeTracePersona.ts');
const { buildWholeTraceCognitionProfile } = require('../src/wholeTrace/wholeTraceCognition.ts');
const { buildTraits } = require('../src/validation/personaValidationBlind.cjs');
const { scoreTraitReview } = require('../src/validation/personaValidationStatistics.cjs');
const { getPersona, getWholeTracePersona, withValidationPersona } = require('../src/personas.ts');
const newKeys = ['initialCaution', 'operationLearning', 'routeReliance', 'textCueLoad'];
const definition = (traits = {}, rest = {}) => ({ id:'catalog-participant',basePersonaId:'mild-intellectual-disability-adult',traits,...rest });
const resolve = (value, version) => resolveProfiles({profiles:[value]}, version)[0];

test('v2 has nine versioned axes, unchanged original five and medium additions to all five presets', () => {
  const v1 = getCatalog('persona-traits-v1');
  assert.equal(catalog.schemaVersion, 'persona-traits-v2');
  assert.deepEqual(getTraitKeys(), [...getTraitKeys(v1.schemaVersion), ...newKeys]);
  assert.deepEqual(catalog.traits.slice(0,5), v1.traits);
  assert.equal(catalog.presets.length, 5);
  for (const [index, preset] of catalog.presets.entries()) {
    const original = v1.presets[index];
    assert.deepEqual(preset, {...original, traits:{...original.traits,...Object.fromEntries(newKeys.map(key => [key,'medium']))}});
  }
  assert.ok(Object.isFrozen(TRAIT_KEYS_BY_VERSION['persona-traits-v1']));
  assert.ok(Object.isFrozen(catalog.references));
  assert.throws(() => getCatalog('persona-traits-v3'), /unknown trait profile version/);
});

test('v2 legacy mapping keeps original five values and explicit individual first-play levels', () => {
  const expected = {
    'mild-intellectual-disability-adult':['high','high','high','high'],
    'careful-checker':['medium','medium','medium','low'],
    'quick-decider':['low','low','high','low'],
    'neutral-adult-control':['medium','medium','medium','medium'],
  };
  for (const [id, levels] of Object.entries(expected)) {
    const mapping = catalog.legacyMappings[id];
    assert.deepEqual(newKeys.map(key => mapping.traits[key]), levels);
    for (const key of getTraitKeys('persona-traits-v1')) assert.equal(mapping.traits[key],getCatalog('persona-traits-v1').legacyMappings[id].traits[key]);
  }
});

test('v1 authored hashes remain exact and schema version selects the matching validation catalog', () => {
  const versions = {
    'mild-intellectual-disability-adult':'traits-2-80fbd739bd14',
    'careful-checker':'traits-2-8899934fa60e',
    'quick-decider':'traits-2-e8893d3d7947',
    'neutral-adult-control':'traits-2-d39e506b180d',
  };
  for (const [basePersonaId, expected] of Object.entries(versions)) {
    const value = resolve(definition({checking:'low'}, {id:'v1-regression',basePersonaId,presetId:'deliberate-checker'}), 'persona-traits-v1');
    assert.equal(value.persona.version, expected);
    assert.equal(assertValidPersona(value.persona), value.persona);
    assert.equal(value.persona.traitProfile.schemaVersion, 'persona-traits-v1');
    assert.equal(Object.keys(value.traits).length,5);
  }
  const v2 = resolve(definition());
  assert.equal(v2.definition.schemaVersion,'persona-traits-v2');
  assert.deepEqual(resolve(v2.definition),v2);
  const explicitV1 = resolve(definition({}, {schemaVersion:'persona-traits-v1'}));
  assert.equal(explicitV1.persona.traitProfile.schemaVersion,'persona-traits-v1');
  assert.throws(() => resolve(definition({}, {schemaVersion:'persona-traits-v1'}),'persona-traits-v2'), /must match/);
  assert.throws(() => resolveProfiles({profiles:[definition({}, {id:'a',schemaVersion:'persona-traits-v1'}),definition({}, {id:'b',schemaVersion:'persona-traits-v2'})]}), /same trait schema/);
  for (const version of ['persona-traits-v1','persona-traits-v2']) {
    const value = resolve(definition(),version).persona;
    for (const key of getTraitKeys(version)) {
      const missing = structuredClone(value); delete missing.traitProfile.traits[key];
      assert.throws(() => assertValidPersona(missing), /is required/);
    }
    const wrong = structuredClone(value); wrong.traitProfile.schemaVersion = version.endsWith('v1') ? 'persona-traits-v2' : 'persona-traits-v1';
    assert.throws(() => assertValidPersona(wrong), /is required|unknown traits field/);
  }
  assert.throws(() => validateTraits({initialCaution:'high'}), /is required/);
});

test('one first-play axis can vary while capability, attention, cognition and matched context remain fixed', () => {
  const baseline = resolve(definition());
  const original = require('../personas/mild-intellectual-disability-adult.json');
  for (const key of newKeys) for (const level of ['low','high']) {
    const changed = resolve(definition({[key]:level}));
    assert.deepEqual(Object.keys(changed.traits).filter(axis => changed.traits[axis] !== baseline.traits[axis]), [key]);
    assert.equal(changed.contextHash, baseline.contextHash);
    assert.deepEqual(changed.context, baseline.context);
    for (const field of ['parameters','attention','shoppingStyle']) assert.deepEqual(changed.persona[field],original[field]);
    assert.deepEqual(buildWholeTraceCognitionProfile(changed.persona),buildWholeTraceCognitionProfile(original));
    const input = buildWholeTracePersonaInput(changed.persona);
    assert.match(input.individualInstructions,new RegExp(`${key}=${level}`));
    assert.equal(input.traitProfile.schemaVersion,'persona-traits-v2');
  }
});

test('all twelve new instructions stop when clear, forbid forced errors, cite sources and avoid the live next-goal regex', () => {
  const source = fs.readFileSync(require.resolve('../src/wholeTrace/wholeTraceActorState.ts'),'utf8');
  const body = source.match(/function nextGoalRecheckTrait[^\{]*\{([\s\S]*?)\n\}/)?.[1];
  assert.ok(body,'read the actual nextGoalRecheckTrait implementation');
  const nextGoalRecheckTrait = new Function('persona',body);
  assert.ok(nextGoalRecheckTrait({character:{selectedTraits:['다음 항목의 목록을 다시 확인한다.']}}));
  let count=0;
  for (const trait of catalog.traits.slice(5)) for (const level of catalog.levels) {
    const text = trait.levels[level];
    assert.match(text,/충분히 분명해지면 멈춘다/);
    assert.match(text,/실수를 강제하지 않는다/);
    assert.doesNotMatch(text,/\d+\s*(?:회|번|초|ms)|반드시|의무|할당량/);
    assert.match(text,/\[근거:/);
    for (const id of trait.sources) assert.ok(catalog.references[id]?.every(reference => /^https:\/\//.test(reference.url)));
    assert.equal(nextGoalRecheckTrait({character:{selectedTraits:[`${trait.label} (${trait.key}=${level}): ${text}`]}}),undefined);
    count++;
  }
  assert.equal(count,12);
});

test('blind v1 accepts exactly five answers and v2 exactly nine, with new observation rubrics', () => {
  for (const version of ['persona-traits-v1','persona-traits-v2']) {
    const selected = getCatalog(version), keys = getTraitKeys(version), profile = resolve(definition(),version);
    const samples = [{personaId:profile.id,tracePath:'/private/sample.json',trace:{steps:[{id:'s1',type:'readList'}]}}];
    const built = buildTraits(samples,[profile],selected), rows = built.key.filter(row => row.version==='A');
    assert.equal(built.traitRubric.length,keys.length);
    assert.equal(keys.length,version.endsWith('v1')?5:9);
    const answers = Object.fromEntries(rows.map(row => [row.opaqueId,{traits:{...row.traits}}]));
    assert.equal(scoreTraitReview(rows,answers,{traitKeys:keys}).macroAccuracy,1);
    const otherKeys = getTraitKeys(version.endsWith('v1')?'persona-traits-v2':'persona-traits-v1');
    const wrongAnswers = Object.fromEntries(rows.map(row => [row.opaqueId,{traits:Object.fromEntries(otherKeys.map(key => [key,'medium']))}]));
    assert.throws(() => scoreTraitReview(rows,wrongAnswers,{traitKeys:keys}),/invalid trait answer/);
    if (version.endsWith('v2')) {
      for (const trait of built.traitRubric.slice(5)) assert.ok(trait.observationCriteria.length > 20);
      assert.throws(() => buildTraits(samples,[profile],getCatalog('persona-traits-v1')),/schemaVersion must match/);
    }
  }
});


test('v2 traits built-ins receive their mapped instructions only inside the validation scope', () => {
  for (const profile of resolveProfiles()) {
    const original = require(`../personas/${profile.id}.json`);
    assert.equal(profile.persona.traitProfile.schemaVersion,'persona-traits-v2');
    assert.deepEqual(profile.persona.traitProfile.traits,catalog.legacyMappings[profile.id].traits);
    for (const key of newKeys) assert.match(buildWholeTracePersonaInput(profile.persona).instruction,new RegExp(`${key}=${profile.traits[key]}`));
    assert.deepEqual(profile.persona.parameters,original.parameters);
    assert.deepEqual(profile.persona.attention,original.attention);
    withValidationPersona(() => assert.deepEqual(getWholeTracePersona(profile.id),profile.persona),profile.persona);
    if (profile.id !== 'neutral-adult-control') assert.deepEqual(getPersona(profile.id),original);
    const altered = structuredClone(profile.persona); altered.traitProfile.traits.initialCaution = profile.traits.initialCaution === 'high' ? 'low' : 'high';
    assert.throws(() => assertValidPersona(altered),/cannot shadow built-ins/);
    assert.throws(() => resolveProfiles({profiles:[profile.definition]}),/custom ID cannot shadow/);
    const old = resolveProfiles({personaIds:[profile.id]},'persona-traits-v1')[0];
    assert.deepEqual(old.persona,original);
    assert.equal(old.persona.traitProfile,undefined);
  }
});
