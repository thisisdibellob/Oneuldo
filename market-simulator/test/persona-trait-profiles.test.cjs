'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {createRequire} = require('node:module');
const vm = require('node:vm');
require('../runtime.cjs');
const {getCatalog,resolveProfiles:resolveVersionedProfiles,validatePersona,assertValidPersona,MAX_PROFILES} = require('../src/validation/personaTraitProfiles.cjs');
const catalog = getCatalog('persona-traits-v1');
const resolveProfiles = options => resolveVersionedProfiles(options, 'persona-traits-v1');
const {listPersonas,getPersona,getWholeTracePersona,withValidationPersona,assertPersonaLearningAllowed} = require('../src/personas.ts');
const {buildWholeTracePersonaInput} = require('../src/wholeTrace/wholeTracePersona.ts');
const {buildWholeTraceCognitionProfile} = require('../src/wholeTrace/wholeTraceCognition.ts');
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

test('custom instructions turn deliberation and checking into contextual choices with a stopping condition', () => {
  for (const level of catalog.levels) {
    const profile = resolve(definition(`situational-${level}`, {deliberation:level,checking:level}));
    const input = buildWholeTracePersonaInput(profile.persona);
    const deliberation = catalog.traits.find(trait => trait.key === 'deliberation').levels[level];
    const checking = catalog.traits.find(trait => trait.key === 'checking').levels[level];
    assert.ok(input.individualInstructions.includes(deliberation));
    assert.ok(input.individualInstructions.includes(checking));
    assert.match(deliberation, /관찰/);
    assert.match(deliberation, /선택이 충분히 분명해지면 비교를 마친다/);
    assert.match(checking, /수량/);
    assert.match(checking, /충분히 명확해지면 추가 확인을 마친다|충분히 명확하면 추가 확인을 마친다/);
    assert.match(input.individualInstructions, /아직 관찰하지 않은 목표나 후보를 비교·확인한 것으로 쓰지 않는다/);
    assert.match(input.individualInstructions, /매대를 닫거나 이동하거나 기다렸다는 사실만으로 새 정보를 확인했다고 선언하지 않는다/);
    assert.match(input.individualInstructions, /행동 횟수·대기시간·실수·포기·완료를 의무로 정하지 않는다/);
    assert.doesNotMatch(input.individualInstructions, /comparisonRate|postSelectionListRate|preCheckoutCartRate|minValidPairs|bootstrapReplicates/);
  }
  const high = resolve(definition('purposeful-high', {deliberation:'high',checking:'high'})).persona.prompt;
  assert.match(high, /관련 후보를 둘 이상 실제로 관찰했거나 여러 조건을 함께 고려해야 할 때/);
  assert.match(high, /하나의 지정 상품만 보이거나/);
  assert.match(high, /상품을 담고 다음 목표로 넘어가거나 결제를 결정할 때/);
  assert.match(high, /필요한 정보가 실제로 보이는 화면을 열어 확인/);
});

test('custom persona provenance changes when authored wording changes, without changing the matched context', () => {
  const file = require.resolve('../src/validation/personaTraitProfiles.cjs');
  const localRequire = createRequire(file);
  const source = fs.readFileSync(file, 'utf8');
  function resolveWithCatalog(changedCatalog) {
    // A separate module instance represents a future catalogue revision; do not mutate the frozen live catalogue.
    const target = {exports:{}};
    const load = vm.runInThisContext(`(function(require,module,exports){${source}\n})`, {filename:file});
    load(name => name === '../../validation/persona-traits.json' ? changedCatalog : localRequire(name), target, target.exports);
    return target.exports.resolveProfiles({profiles:[definition('versioned-person', {checking:'high'})]}, 'persona-traits-v1')[0];
  }
  const current = resolve(definition('versioned-person', {checking:'high'}));
  const repeated = resolveWithCatalog(structuredClone(catalog));
  assert.match(current.persona.version, /^traits-2-[a-f0-9]{12}$/);
  assert.equal(repeated.persona.version, current.persona.version);
  for (const revise of [
    value => { value.traits.find(trait => trait.key === 'checking').levels.high += ' 새로운 확인 지침.'; },
    value => { value.interpretation += ' 새로운 공통 해석 지침.'; },
  ]) {
    const changedCatalog = structuredClone(catalog); revise(changedCatalog);
    const revised = resolveWithCatalog(changedCatalog);
    assert.notEqual(revised.persona.prompt, current.persona.prompt);
    assert.notEqual(revised.persona.version, current.persona.version);
    assert.equal(revised.contextHash, current.contextHash);
    assert.deepEqual(revised.traits, current.traits);
    for (const key of ['parameters','attention','shoppingStyle']) assert.deepEqual(revised.persona[key], current.persona[key]);
  }
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

// traitMode:"omitted" baselines: same base context and shared instructions, no trait levels.
const traitSection = prompt => prompt.replace(/## 공통 성향\n\n[\s\S]*?\n\n(?=## )/, '');
const resolveV2 = profiles => resolveVersionedProfiles({profiles}, 'persona-traits-v2');
test('trait-omitted baseline keeps the context and every shared section and drops only trait lines', () => {
  const [high, low, baseline] = resolveV2([
    {id:'checking-high',basePersonaId:'mild-intellectual-disability-adult',traits:{checking:'high'}},
    {id:'checking-low',basePersonaId:'mild-intellectual-disability-adult',traits:{checking:'low'}},
    {id:'baseline',basePersonaId:'mild-intellectual-disability-adult',traitMode:'omitted'}]);
  assert.equal(baseline.traits, null); assert.equal(baseline.presetId, null);
  assert.equal(baseline.contextHash, high.contextHash); assert.deepEqual(baseline.context, high.context);
  assert.deepEqual(baseline.persona.traitProfile, {schemaVersion:'persona-traits-v2',basePersonaId:'mild-intellectual-disability-adult',
    presetId:null,traitMode:'omitted',traits:null,contextHash:high.contextHash,context:high.context});
  assert.doesNotMatch(baseline.persona.prompt, /## 공통 성향\n/);
  for (const trait of getCatalog('persona-traits-v2').traits) assert.ok(!baseline.persona.prompt.includes(`(${trait.key}=`), trait.key);
  for (const profile of [high, low]) {
    assert.match(profile.persona.prompt, /## 공통 성향\n/);
    assert.equal(traitSection(profile.persona.prompt.replaceAll(profile.id, 'baseline')), baseline.persona.prompt);
  }
  for (const heading of ['## 성향을 행동으로 선택하는 기준', '## 성향과 분리된 기본 맥락', '## 공통 전제와 관찰·실행 범위'])
    assert.ok(baseline.persona.prompt.includes(heading), heading);
  assert.equal(baseline.persona.description, 'baseline: 공통 행동 성향으로 구성한 허구의 성인. 인지·수행 기준, 취향과 경험은 별도 기본 맥락을 유지한다.');
  assert.ok(high.persona.description.startsWith(baseline.persona.description.replace('baseline', 'checking-high') + ' '));
  assert.deepEqual(baseline.persona.character.selectedTraits, []);
  assert.deepEqual({...baseline.persona.character, name:null, selectedTraits:null}, {...high.persona.character, name:null, selectedTraits:null});
  for (const key of ['parameters','attention','shoppingStyle']) assert.deepEqual(baseline.persona[key], high.persona[key]);
  assert.notEqual(baseline.persona.version, high.persona.version); assert.match(baseline.persona.version, /^traits-2-[0-9a-f]{12}$/);
  assert.deepEqual(baseline.definition, {id:'baseline',basePersonaId:'mild-intellectual-disability-adult',traitMode:'omitted',schemaVersion:'persona-traits-v2'});
  assert.equal(validatePersona(baseline.persona).valid, true);
  const tampered = structuredClone(baseline.persona); tampered.traitProfile.traits = high.traits;
  assert.equal(validatePersona(tampered).valid, false);
  const input = buildWholeTracePersonaInput(baseline.persona);
  assert.equal(input.traitProfile.traits, null);
  assert.deepEqual(resolveV2([{id:'baseline',basePersonaId:'mild-intellectual-disability-adult',traitMode:'omitted'}])[0].persona, baseline.persona);
});
test('traitMode accepts only "omitted", rejects presetId or traits beside it, and is not available in v1', () => {
  const base = {id:'baseline',basePersonaId:'quick-decider'};
  assert.throws(() => resolveV2([{...base,traitMode:'neutral'}]), /traitMode must be "omitted"/);
  assert.throws(() => resolveV2([{...base,traitMode:'omitted',traits:{checking:'high'}}]), /cannot be combined with presetId or traits/);
  assert.throws(() => resolveV2([{...base,traitMode:'omitted',traits:{}}]), /cannot be combined with presetId or traits/);
  assert.throws(() => resolveV2([{...base,traitMode:'omitted',presetId:'quick-satisficer'}]), /cannot be combined with presetId or traits/);
  assert.throws(() => resolveProfiles({profiles:[{...base,traitMode:'omitted'}]}), /requires persona-traits-v2/);
});
