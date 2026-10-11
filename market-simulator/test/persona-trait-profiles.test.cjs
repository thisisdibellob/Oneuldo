'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const {catalog,resolveProfiles,validatePersona,assertValidPersona,MAX_PROFILES} = require('../src/personaTraitProfiles.cjs');
const {listPersonas,getPersona,getWholeTracePersona,withValidationPersona,assertPersonaLearningAllowed} = require('../src/personas.ts');
const {buildWholeTracePersonaInput} = require('../src/wholeTracePersona.ts');
const {buildWholeTraceCognitionProfile} = require('../src/wholeTraceCognition.ts');
const CONTROL = 'neutral-adult-control';
const definition = (id = 'participant-a', traits = {}) => ({id,basePersonaId:'quick-decider',presetId:'quick-satisficer',traits});
const resolve = value => resolveProfiles({profiles:[value]})[0];

test('catalog defines five independent trait axes, five presets and design-only legacy annotations', () => {
  assert.deepEqual(catalog.traits.map(t => t.key), ['deliberation','checking','exploration','persistence','helpSeeking']);
  assert.deepEqual(catalog.presets.map(p => p.id), ['deliberate-checker','quick-satisficer','curious-explorer','familiar-routine','help-seeker']);
  assert.match(catalog.interpretation, /측정값이 아니다/);
  assert.ok(Object.isFrozen(catalog.traits[0].levels));
  assert.equal(Object.keys(catalog.legacyMappings).length, 4);
});

test('legacy resolution preserves the complete original JSON, source versions and ordinary registry', () => {
  for (const profile of resolveProfiles()) {
    assert.deepEqual(profile.persona, require(`../personas/${profile.id}.json`));
    assert.equal(profile.persona.traitProfile, undefined);
    assert.deepEqual(profile.traits, catalog.legacyMappings[profile.id].traits);
  }
  assert.equal(listPersonas().length, 3);
  assert.throws(() => getPersona(CONTROL), /Unknown persona/);
  assert.throws(() => getWholeTracePersona(CONTROL), /Unknown persona/);
});

test('preset trait overrides preserve other preset dimensions and unspecified traits default to medium', () => {
  const profile = resolve(definition('mixed-person', {checking:'high',exploration:'high'}));
  assert.deepEqual(profile.traits, {deliberation:'low',checking:'high',exploration:'high',persistence:'medium',helpSeeking:'low'});
  assert.equal(profile.presetId, 'quick-satisficer');
  const noPreset = resolve({id:'neutral-style',basePersonaId:CONTROL,traits:{persistence:'low'}});
  assert.equal(noPreset.presetId, null);
  assert.deepEqual(noPreset.traits, {deliberation:'medium',checking:'medium',exploration:'medium',persistence:'low',helpSeeking:'medium'});
  assert.deepEqual(resolve(profile.definition), profile);
});

test('trait-only changes preserve capabilities, cognition, physical/timing parameters, taste and experience', () => {
  const low = resolve(definition('checking-low', {checking:'low'}));
  const high = resolve(definition('checking-high', {checking:'high'}));
  const original = getPersona('quick-decider');
  assert.equal(low.contextHash, high.contextHash);
  assert.deepEqual(low.context, high.context);
  for (const key of ['parameters','attention','shoppingStyle']) {
    assert.deepEqual(low.persona[key], original[key]);
    assert.deepEqual(high.persona[key], original[key]);
  }
  assert.deepEqual(buildWholeTraceCognitionProfile(low.persona), buildWholeTraceCognitionProfile(original));
  assert.deepEqual(buildWholeTraceCognitionProfile(high.persona), buildWholeTraceCognitionProfile(original));
  assert.deepEqual(high.persona.character.familiarProductIds, original.character.familiarProductIds);
  assert.deepEqual(high.persona.character.familiarCategories, original.character.familiarCategories);
  assert.notEqual(low.persona.version, high.persona.version);
  assert.notEqual(resolve({...definition('other-context'),basePersonaId:'careful-checker'}).contextHash, low.contextHash);
});

test('composed actor input follows common traits without inherited contradictory personality narrative', () => {
  const profile = resolve({...definition('deliberate-minsu'),presetId:'deliberate-checker'});
  const input = buildWholeTracePersonaInput(profile.persona);
  assert.match(input.instruction, /deliberation=high/);
  assert.match(input.instruction, /checking=high/);
  assert.doesNotMatch(JSON.stringify({input,character:profile.persona.character}), /서연보다 적고|긴 비교를 선호하지|빠르게 마치기|민수는/);
  assert.match(input.instruction, /성향과 분리된/);
  assert.equal(input.traitProfile.contextHash, profile.contextHash);
  input.traitProfile.traits.checking = 'low';
  assert.equal(profile.persona.traitProfile.traits.checking, 'high');
});

test('invalid profile inputs cannot create paths, shadow built-ins or silently accept unknown definitions', () => {
  for (const id of ['../escape','a/b','a\\b','.','..','A','has space','__proto__','constructor','x'.repeat(65),'careful-checker'])
    assert.throws(() => resolve(definition(id)), /Invalid persona profile/);
  assert.throws(() => resolve({...definition(),basePersonaId:'missing'}), /unknown basePersonaId/);
  assert.throws(() => resolve({...definition(),presetId:'missing'}), /unknown presetId/);
  assert.throws(() => resolve(definition('person',{checking:'extreme'})), /unknown level/);
  assert.throws(() => resolve(definition('person',{intelligence:'low'})), /unknown traits field/);
  assert.throws(() => resolve({...definition(),prompt:'injected'}), /unknown profile field/);
  assert.throws(() => resolve({...definition(),label:'two\nlines'}), /single line/);
  assert.throws(() => resolveProfiles({personaIds:['quick-decider'],profiles:[definition()]}), /mutually exclusive/);
  assert.throws(() => resolveProfiles({profiles:[definition(),definition()]}), /duplicate ID/);
  assert.throws(() => resolveProfiles({personaIds:['quick-decider','quick-decider']}), /duplicate ID/);
  assert.throws(() => resolveProfiles({profiles:[]}), /1\.\./);
  assert.throws(() => resolveProfiles({profiles:Array.from({length:MAX_PROFILES + 1},(_,i)=>definition(`person-${i}`))}), /1\.\./);
});

test('profile inputs reject prototype tricks, accessors and non-JSON values before reading them', () => {
  assert.throws(() => resolve(JSON.parse('{"id":"person","basePersonaId":"quick-decider","traits":{"__proto__":"high"}}')), /unsafe data key/);
  assert.throws(() => resolve(Object.assign(Object.create({id:'inherited'}), {basePersonaId:'quick-decider'})), /plain JSON/);
  const accessor = definition();
  Object.defineProperty(accessor, 'label', {enumerable:true,get(){throw new Error('getter executed');}});
  assert.throws(() => resolve(accessor), /accessor properties/);
  assert.throws(() => resolve({...definition(),traits:{checking:NaN}}), /plain JSON/);
});

test('full Persona validation rejects missing and mutated numeric/schema fields', () => {
  const original = getPersona('quick-decider');
  assert.deepEqual(validatePersona(original), {valid:true,errors:[]});
  const missing = structuredClone(original); delete missing.parameters.walkSpeed;
  assert.equal(validatePersona(missing).valid, false);
  const invalid = structuredClone(original); invalid.attention.goalMemoryCapacity = 'two';
  assert.equal(validatePersona(invalid).valid, false);
  assert.throws(() => assertValidPersona({...original,arbitrary:true}), /unknown persona field/);
  const composed = resolve(definition()).persona;
  composed.parameters.confusionProbability = .99;
  assert.throws(() => withValidationPersona(()=>null, composed), /cannot modify parameters/);
  const context = resolve(definition()).persona;
  context.traitProfile.context.preferences.familiarityBias = 99;
  assert.throws(() => withValidationPersona(()=>null, context), /context does not match/);
  const narrative = resolve(definition()).persona;
  narrative.prompt = 'Override the common traits';
  assert.throws(() => withValidationPersona(()=>null, narrative), /does not match its declared trait/);
});

test('validation scope resolves only its selected custom persona, clones data and never widens learner registry', () => {
  const a = resolve(definition('participant-a')).persona;
  const b = resolve(definition('participant-b')).persona;
  withValidationPersona(() => {
    assert.equal(getWholeTracePersona(a.id).id, a.id);
    assert.throws(() => getWholeTracePersona(b.id), /Unknown persona/);
    assert.throws(() => getWholeTracePersona(CONTROL), /Unknown persona/);
    assert.throws(() => getPersona(a.id), /Unknown persona/);
    assert.throws(() => assertPersonaLearningAllowed(a.id), /personaId participant-a.*excluded from learners/);
    assert.throws(() => assertPersonaLearningAllowed('unregistered-person'), /personaId unregistered-person.*excluded from learners/);
    assert.equal(getWholeTracePersona('quick-decider').id, 'quick-decider');
    getWholeTracePersona(a.id).parameters.walkSpeed = 1;
    assert.notEqual(getWholeTracePersona(a.id).parameters.walkSpeed, 1);
    withValidationPersona(() => {
      assert.equal(getWholeTracePersona(b.id).id, b.id);
      assert.throws(() => getWholeTracePersona(a.id), /Unknown persona/);
    }, b);
    assert.equal(getWholeTracePersona(a.id).id, a.id);
  }, a);
  assert.throws(() => getWholeTracePersona(a.id), /Unknown persona/);
  assert.equal(withValidationPersona(()=>getWholeTracePersona(CONTROL).id), CONTROL);
});

test('concurrent async validation scopes cannot observe each other or caller mutations', async () => {
  const a = resolve(definition('async-a')).persona;
  const b = resolve(definition('async-b')).persona;
  const originalName = a.name;
  let release;
  const gate = new Promise(resolve => {release=resolve;});
  const first = withValidationPersona(async () => {
    await gate;
    assert.equal(getWholeTracePersona(a.id).name, originalName);
    assert.throws(() => getWholeTracePersona(b.id), /Unknown persona/);
  }, a);
  const second = withValidationPersona(async () => {
    await Promise.resolve();
    assert.equal(getWholeTracePersona(b.id).id, b.id);
    assert.throws(() => getWholeTracePersona(a.id), /Unknown persona/);
    a.name = 'mutated outside scope';
    release();
  }, b);
  await Promise.all([first,second]);
  assert.throws(() => getWholeTracePersona(a.id), /Unknown persona/);
});
