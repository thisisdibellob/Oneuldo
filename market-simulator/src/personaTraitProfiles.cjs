'use strict';
const { createHash } = require('node:crypto');
const catalogs = {
  'persona-traits-v1': require('../validation/persona-traits.json'),
  'persona-traits-v2': require('../validation/persona-traits-v2.json'),
};
const DEFAULT_SCHEMA_VERSION = 'persona-traits-v2';
const catalog = catalogs[DEFAULT_SCHEMA_VERSION];
const TRAIT_KEYS_BY_VERSION = Object.fromEntries(Object.entries(catalogs).map(([version, value]) => [version, value.traits.map(trait => trait.key)]));
function getCatalog(schemaVersion = DEFAULT_SCHEMA_VERSION) {
  if (!Object.hasOwn(catalogs, schemaVersion) || catalogs[schemaVersion].schemaVersion !== schemaVersion) fail('unknown trait profile version');
  return catalogs[schemaVersion];
}
function getTraitKeys(schemaVersion = DEFAULT_SCHEMA_VERSION) { getCatalog(schemaVersion); return TRAIT_KEYS_BY_VERSION[schemaVersion]; }
const canonical = [
  require('../personas/mild-intellectual-disability-adult.json'),
  require('../personas/careful-checker.json'),
  require('../personas/quick-decider.json'),
  require('../personas/neutral-adult-control.json'),
];
const TRAIT_KEYS = getTraitKeys();
const MAX_PROFILES = 32;
const SAFE_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
const clone = value => structuredClone(value);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function fail(message) { throw new Error(`Invalid persona profile: ${message}`); }
function plain(value) { return !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function safeData(value, depth = 0, seen = new Set()) {
  if (depth > 20) fail('data nesting is too deep');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (!Array.isArray(value) && !plain(value)) fail('expected plain JSON data');
  if (seen.has(value)) fail('cyclic data');
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || forbidden.has(key)) fail('unsafe data key');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail('accessor properties are not allowed');
    safeData(descriptor.value, depth + 1, seen);
  }
  seen.delete(value);
}
function shape(value, required, optional = [], at = 'object') {
  if (!plain(value)) fail(`${at} must be an object`);
  for (const key of required) if (!Object.hasOwn(value, key)) fail(`${at}.${key} is required`);
  for (const key of Object.keys(value)) if (![...required, ...optional].includes(key)) fail(`unknown ${at} field: ${key}`);
}
function string(value, at, max = 4000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) fail(`${at} must be nonempty safe text (max ${max})`);
}
function id(value, at = 'id') { if (typeof value !== 'string' || !SAFE_ID.test(value) || forbidden.has(value)) fail(`${at} must be a path-safe ID (1..64 lowercase ASCII characters)`); }
function number(value, at, min = 0, max = 1000000, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) fail(`invalid numeric ${at}`);
}
function strings(value, at, limit = 128) {
  if (!Array.isArray(value) || value.length > limit) fail(`${at} must be a bounded text array`);
  value.forEach(item => string(item, at));
}
function weights(value, at) {
  if (!plain(value) || Object.keys(value).length > 256) fail(`${at} must be a bounded weight object`);
  for (const [key, item] of Object.entries(value)) { string(key, `${at} key`, 128); number(item, at, 0, 100); }
}
function validateTraits(value, partial = false, schemaVersion = DEFAULT_SCHEMA_VERSION) {
  const catalog = getCatalog(schemaVersion), traitKeys = getTraitKeys(schemaVersion);
  shape(value, partial ? [] : traitKeys, partial ? traitKeys : [], 'traits');
  for (const [key, level] of Object.entries(value)) if (!catalog.levels.includes(level)) fail(`unknown level for ${key}: ${level}`);
}
function assertValidPersona(persona) {
  safeData(persona);
  shape(persona, ['id','version','name','description','prompt','parameters'], ['character','attention','shoppingStyle','traitProfile'], 'persona');
  id(persona.id); string(persona.version, 'version', 128); string(persona.name, 'name', 128);
  string(persona.description, 'description'); string(persona.prompt, 'prompt', 100000);
  const p = persona.parameters;
  const probabilities = ['recheckProbability','hesitationProbability','confusionProbability','quantitySlipProbability','helpProbability','explorationProbability','retryProbability','feedbackLearningRate'];
  shape(p, ['reactionMedianMs','reactionSigma','walkSpeed',...probabilities,'pricePreference','familiarityBias','itemPreferenceWeights'], [], 'parameters');
  number(p.reactionMedianMs, 'reactionMedianMs', 1, 120000); number(p.reactionSigma, 'reactionSigma', 0, 10); number(p.walkSpeed, 'walkSpeed', 1, 1000);
  probabilities.forEach(key => number(p[key], key, 0, 1));
  number(p.pricePreference, 'pricePreference', 0, 100); number(p.familiarityBias, 'familiarityBias', 0, 100); weights(p.itemPreferenceWeights, 'itemPreferenceWeights');
  if (persona.character !== undefined) {
    const c = persona.character;
    const lists = ['selectedTraits','strengths','preferences','familiarCategories','familiarProductIds','practicedStrategies'];
    shape(c, ['name','age','goal',...lists], ['learningProfile'], 'character');
    string(c.name, 'character.name', 128); number(c.age, 'age', 18, 120, true); string(c.goal, 'goal');
    lists.forEach(key => strings(c[key], key));
    if (c.learningProfile !== undefined) {
      shape(c.learningProfile, ['baseline','practiceFocus','transferConditions'], [], 'learningProfile');
      if (c.learningProfile.baseline !== 'initial-personal-history') fail('unknown learning baseline');
      strings(c.learningProfile.practiceFocus, 'practiceFocus'); strings(c.learningProfile.transferConditions, 'transferConditions');
    }
  }
  if (persona.attention !== undefined) {
    const a = persona.attention;
    const probabilities = ['captureProbability','interestPurchaseProbability','resumeProbability','switchMemoryDecay'];
    const counts = ['minimumInterestActions','maximumInterestActions','firstPlayOrientationActions','goalMemoryCapacity','spatialMemoryCapacity'];
    shape(a, ['version','interestProductWeights','interestCategoryWeights',...probabilities,...counts], [], 'attention');
    if (a.version !== '1') fail('unknown attention version');
    weights(a.interestProductWeights, 'interestProductWeights'); weights(a.interestCategoryWeights, 'interestCategoryWeights');
    probabilities.forEach(key => number(a[key], key, 0, 1)); counts.forEach(key => number(a[key], key, key.endsWith('Capacity') ? 1 : 0, key === 'goalMemoryCapacity' ? 24 : 1000, true));
    if (a.minimumInterestActions > a.maximumInterestActions) fail('interest action bounds are inverted');
  }
  if (persona.shoppingStyle !== undefined) {
    const s = persona.shoppingStyle;
    const probabilities = ['comparisonProbability','listCheckAfterSelectionProbability','preCheckoutCheckProbability','familiarShortcutProbability','headingPersistence'];
    shape(s, [...probabilities,'maxComparisonPages'], [], 'shoppingStyle');
    probabilities.forEach(key => number(s[key], key, 0, 1)); number(s.maxComparisonPages, 'maxComparisonPages', 1, 100, true);
  }
  if (persona.traitProfile !== undefined) {
    const t = persona.traitProfile;
    shape(t, ['schemaVersion','basePersonaId','presetId','traits','contextHash','context'], [], 'traitProfile');
    const catalog = getCatalog(t.schemaVersion);
    const base = canonical.find(item => item.id === t.basePersonaId);
    if (!base) fail('custom profile must use a known base and cannot shadow built-ins');
    if (canonical.some(item => item.id === persona.id)) {
      const mapping = catalog.legacyMappings[persona.id];
      if (t.schemaVersion !== 'persona-traits-v2' || t.basePersonaId !== persona.id || t.presetId !== mapping.presetId
        || JSON.stringify(t.traits) !== JSON.stringify(mapping.traits)) fail('custom profile cannot shadow built-ins outside the exact v2 trait mapping');
    }
    if (t.presetId !== null && !catalog.presets.some(item => item.id === t.presetId)) fail('unknown presetId');
    validateTraits(t.traits, false, t.schemaVersion);
    const context = buildSeparatedContext(base);
    if (JSON.stringify(t.context) !== JSON.stringify(context) || t.contextHash !== hash(context)) fail('context does not match the unchanged base capability, preferences and experience');
    for (const key of ['parameters','attention','shoppingStyle']) if (JSON.stringify(persona[key]) !== JSON.stringify(base[key])) fail(`custom traits cannot modify ${key}`);
    const expected = customPersona(base, {id:persona.id,basePersonaId:base.id,presetId:t.presetId,traits:t.traits,label:persona.name}, t.schemaVersion);
    if (JSON.stringify(persona) !== JSON.stringify(expected)) fail('custom persona content does not match its declared trait definition');
  }
  return persona;
}
function validatePersona(persona) { try { assertValidPersona(persona); return {valid:true,errors:[]}; } catch (error) { return {valid:false,errors:[error.message]}; } }

/** All keys are explicit: behavioral probabilities and narrative personality never enter a matched-context hash. */
function buildSeparatedContext(persona) {
  const p = persona.parameters, a = persona.attention, c = persona.character;
  return {
    capability: {
      reactionMedianMs:p.reactionMedianMs, reactionSigma:p.reactionSigma, walkSpeed:p.walkSpeed,
      confusionProbability:p.confusionProbability, quantitySlipProbability:p.quantitySlipProbability,
      feedbackLearningRate:p.feedbackLearningRate,
      goalMemoryCapacity:a?.goalMemoryCapacity ?? null, spatialMemoryCapacity:a?.spatialMemoryCapacity ?? null,
      switchMemoryDecay:a?.switchMemoryDecay ?? null,
    },
    preferences: {
      pricePreference:p.pricePreference, familiarityBias:p.familiarityBias, itemPreferenceWeights:clone(p.itemPreferenceWeights),
      interestProductWeights:clone(a?.interestProductWeights ?? {}), interestCategoryWeights:clone(a?.interestCategoryWeights ?? {}),
    },
    experience: {
      familiarProductIds:clone(c?.familiarProductIds ?? []), familiarCategories:clone(c?.familiarCategories ?? []),
      learningProfile:clone(c?.learningProfile ?? null),
      interpretation:'상품 친숙함은 현재 매장 배치나 조작을 알고 있다는 뜻이 아니다. 실제 방문·연습 경험은 요청의 attentionExperience로 별도로 전달한다.',
    },
  };
}
function traitInstructions(traits, catalog) {
  return catalog.traits.map(trait => `${trait.label} (${trait.key}=${traits[trait.key]}): ${trait.levels[traits[trait.key]]}`);
}
function customPersona(base, definition, schemaVersion = definition.schemaVersion ?? DEFAULT_SCHEMA_VERSION) {
  const catalog = getCatalog(schemaVersion);
  validateTraits(definition.traits, false, schemaVersion);
  const persona = clone(base), context = buildSeparatedContext(base), traits = clone(definition.traits);
  const label = definition.label ?? definition.id;
  const traitProfile = {schemaVersion:catalog.schemaVersion,basePersonaId:base.id,presetId:definition.presetId ?? null,traits,contextHash:hash(context),context};
  persona.id = definition.id;
  persona.name = label;
  persona.description = `${label}: 공통 행동 성향으로 구성한 허구의 성인. 인지·수행 기준, 취향과 경험은 별도 기본 맥락을 유지한다. ${traitInstructions(traits, catalog).join(' ')}`;
  if (persona.character) {
    const character = persona.character;
    character.name = label; character.goal = '화면에 제시된 장보기 목표를 이해한 범위에서 자신의 선택으로 수행하기';
    character.selectedTraits = traitInstructions(traits, catalog);
    character.strengths = ['자신의 취향과 최종 선택을 유지한다.', '실제로 관찰한 단서와 명확한 피드백을 활용할 수 있다.'];
    character.preferences = [`상품 취향의 구조화된 설계값: ${JSON.stringify(context.preferences)}`];
    character.practicedStrategies = ['실제 방문·연습 경험은 전달된 attentionExperience만 따른다. 익숙한 상품을 안다는 사실로 현재 매장 위치·재고·조작 경험을 만들지 않는다.'];
  }
  persona.prompt = `# 공통 성향 기반 성인 프로필\n\n${catalog.interpretation}\n\n## 공통 성향\n\n${traitInstructions(traits, catalog).join('\n')}\n\n## 성향을 행동으로 선택하는 기준\n\n성향은 행동 이름을 붙이는 방식보다 어떤 정보를 더 살펴볼지, 충분히 알았을 때 언제 선택할지에 반영한다. 비교는 실제로 관찰한 후보의 차이와 현재 알고 있는 조건을 대조하는 행동이다. 재확인은 이전에 알던 목표·상품·수량과 현재 확인할 수 있는 정보를 다시 대조하는 행동이다. 아직 관찰하지 않은 목표나 후보를 비교·확인한 것으로 쓰지 않는다.\n\n확인이 필요하다고 판단하면 필요한 정보가 보이는 현재 허용된 행동을 선택한다. 매대를 닫거나 이동하거나 기다렸다는 사실만으로 새 정보를 확인했다고 선언하지 않는다. 반대로 이미 충분히 명확하다면 확인을 더 하지 않고 진행할 수 있다. 행동의 목적과 관찰 가능한 근거를 짧게 일치시켜 기록하며, 성향을 보여주기 위해 활동 표기만 바꾸지 않는다.\n\n## 성향과 분리된 기본 맥락\n\n${JSON.stringify(context)}\n\n성향 수준은 선택의 경향이며 행동 횟수·대기시간·실수·포기·완료를 의무로 정하지 않는다. 성향 변경으로 인지·수행 기준이나 상품 경험을 바꾸지 않는다.\n\n## 공통 전제와 관찰·실행 범위\n\n현재 제공된 관찰과 실제로 확인한 경험만 사용한다. 도움을 받더라도 선호와 최종 선택은 스스로 유지한다.`;
  persona.traitProfile = traitProfile;
  // Hash the delivered actor content, including instruction text, rather than only trait values.
  // The context hash remains independent so matched trait comparisons keep their meaning.
  const {version:baseVersion,...authoredPersona} = persona;
  persona.version = `traits-2-${hash({baseVersion,authoredPersona}).slice(0,12)}`;
  return persona;
}
function resolveProfiles(options = {}, schemaVersion) {
  safeData(options); shape(options, [], ['personaIds','profiles','schemaVersion'], 'options');
  const declaredVersions = [...new Set((Array.isArray(options.profiles) ? options.profiles : []).map(profile => profile?.schemaVersion).filter(version => version !== undefined))];
  if (declaredVersions.length > 1) fail('profiles must use the same trait schema version');
  if (options.schemaVersion !== undefined && schemaVersion !== undefined && options.schemaVersion !== schemaVersion) fail('profile schemaVersion must match the catalog');
  schemaVersion = options.schemaVersion ?? schemaVersion ?? declaredVersions[0] ?? DEFAULT_SCHEMA_VERSION;
  if (declaredVersions.some(version => version !== schemaVersion)) fail('profile schemaVersion must match the catalog');
  const catalog = getCatalog(schemaVersion), traitKeys = getTraitKeys(schemaVersion);
  if (options.personaIds !== undefined && options.profiles !== undefined) fail('personaIds and profiles are mutually exclusive');
  const custom = options.profiles !== undefined;
  const entries = custom ? options.profiles : options.personaIds ?? canonical.map(persona => persona.id);
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > MAX_PROFILES) fail(`expected 1..${MAX_PROFILES} profiles`);
  const seen = new Set();
  return entries.map(entry => {
    let base, persona, definition, presetId, traits;
    if (custom) {
      shape(entry, ['id','basePersonaId'], ['presetId','traits','label','schemaVersion'], 'profile');
      id(entry.id); id(entry.basePersonaId, 'basePersonaId');
      if (canonical.some(persona => persona.id === entry.id)) fail('custom ID cannot shadow a built-in persona');
      base = canonical.find(persona => persona.id === entry.basePersonaId);
      if (!base) fail(`unknown basePersonaId ${entry.basePersonaId}`);
      let preset;
      if (entry.presetId !== undefined) {
        preset = catalog.presets.find(item => item.id === entry.presetId);
        if (!preset) fail(`unknown presetId ${entry.presetId}`);
      }
      if (entry.traits !== undefined) validateTraits(entry.traits, true, schemaVersion);
      if (entry.label !== undefined) { string(entry.label, 'label', 80); if (/[\r\n]/.test(entry.label)) fail('label must be a single line'); }
      presetId = preset?.id ?? null;
      const defaults = preset?.traits ?? Object.fromEntries(traitKeys.map(key => [key,'medium']));
      traits = Object.fromEntries(traitKeys.map(key => [key,entry.traits?.[key] ?? defaults[key]]));
      definition = {id:entry.id,basePersonaId:base.id,...(presetId ? {presetId} : {}),traits:clone(traits),...(entry.label !== undefined ? {label:entry.label} : {})};
      if (schemaVersion !== 'persona-traits-v1') definition.schemaVersion = schemaVersion;
      persona = customPersona(base, definition, schemaVersion);
    } else {
      id(entry); base = canonical.find(persona => persona.id === entry);
      if (!base) fail(`unknown personaId ${entry}`);
      presetId = catalog.legacyMappings[entry].presetId; traits = clone(catalog.legacyMappings[entry].traits);
      definition = {id:entry,basePersonaId:entry};
      if (schemaVersion === 'persona-traits-v1') persona = clone(base);
      else {
        definition = {...definition,schemaVersion,traits:clone(traits),...(presetId ? {presetId} : {}),label:base.name};
        persona = customPersona(base, definition, schemaVersion);
      }
    }
    if (seen.has(persona.id)) fail(`duplicate ID ${persona.id}`);
    seen.add(persona.id); assertValidPersona(persona);
    const context = buildSeparatedContext(base);
    return {id:persona.id,basePersonaId:base.id,presetId,traits,persona,contextHash:hash(context),context,definition};
  });
}
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
freeze(catalogs); freeze(TRAIT_KEYS_BY_VERSION);
module.exports = {catalog,catalogs,DEFAULT_SCHEMA_VERSION,TRAIT_KEYS,TRAIT_KEYS_BY_VERSION,getCatalog,getTraitKeys,MAX_PROFILES,resolveProfiles,validateTraits,validatePersona,assertValidPersona,buildSeparatedContext};
