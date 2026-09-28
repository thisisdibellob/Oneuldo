'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const personaDirectory = path.resolve(__dirname, '../personas');
const referencesDirectory = path.join(personaDirectory, 'references');
const metadata = JSON.parse(fs.readFileSync(path.join(referencesDirectory, 'sources.json'), 'utf8'));
const profile = JSON.parse(fs.readFileSync(path.join(personaDirectory, 'mild-intellectual-disability-adult.json'), 'utf8'));
const activeVersions = { 'mild-intellectual-disability-adult': '5', 'careful-checker': '3', 'quick-decider': '3' };
const activeProfiles = Object.keys(activeVersions).map(id => JSON.parse(fs.readFileSync(path.join(personaDirectory, `${id}.json`), 'utf8')));
const expectedChecksums = {
  source1: '2546f2f03482241343cc34dcf3b7928122de36180852eea08ac747967531e79b',
  source2: '30e2616aa133975399eb703644784fe7a53f283690a1ae8603ecae1f3a76ab96',
};
const source = (id) => fs.readFileSync(path.resolve(referencesDirectory, metadata.sources.find((item) => item.id === id).file), 'utf8');

test('both original persona sources retain their bytes, checksums and reference links', () => {
  assert.equal(metadata.personaId, profile.id);
  assert.equal(metadata.personaVersion, '5');
  assert.deepEqual(metadata.profiles.map(p => [p.personaId, p.personaVersion]), Object.entries(activeVersions));
  for (const item of metadata.profiles) {
    assert.deepEqual(item.sourceIds, ['source1', 'source2']);
    assert.equal(path.resolve(referencesDirectory, item.runtimeProfile), path.join(personaDirectory, `${item.personaId}.json`));
    assert.equal(path.resolve(referencesDirectory, item.promptMirror), path.join(personaDirectory, `persona-${item.personaId}-v${item.personaVersion}.md`));
  }
  assert.equal(path.resolve(referencesDirectory, metadata.runtimeProfile), path.join(personaDirectory, 'mild-intellectual-disability-adult.json'));
  assert.deepEqual(metadata.sources.map((item) => item.id), ['source1', 'source2']);
  for (const item of metadata.sources) {
    const buffer = fs.readFileSync(path.resolve(referencesDirectory, item.file));
    const body = buffer.toString('utf8');
    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
    assert.equal(checksum, expectedChecksums[item.id], `${item.id}: supplied source text changed`);
    assert.equal(item.sha256, checksum);
    assert.equal(item.bytes, buffer.length);
    assert.equal(item.characters, Array.from(body).length);
    const links = [...body.matchAll(/\]\((https?:\/\/[^)]+)\)/g)].map((match) => match[1]);
    assert.equal(item.linkOccurrences, links.length);
    assert.deepEqual(item.uniqueLinks, [...new Set(links)]);
  }
});
test('every active adult prompt contains both full source bodies verbatim and matches its Markdown mirror', () => {
  const first = source('source1'), second = source('source2');
  for (const value of activeProfiles) {
    assert.equal(value.version, activeVersions[value.id]);
    assert.ok(value.prompt.includes(first), `${value.id}: role request must be complete, not summarized`);
    assert.ok(value.prompt.includes(second), `${value.id}: behavior guidance must be complete, not summarized`);
    assert.ok(value.prompt.indexOf(first) < value.prompt.indexOf(second));
    assert.equal(fs.readFileSync(path.join(personaDirectory, `persona-${value.id}-v${value.version}.md`), 'utf8'), value.prompt);
  }
});
test('all nine source prohibitions and their limiting context remain in the active prompt', () => {
  const prohibitions = [
    '모든 질문을 이해하지 못한다.',
    '항상 틀린 답이나 비합리적인 선택을 한다.',
    '아무 이유 없이 같은 행동을 반복한다.',
    '성인인데도 어린아이처럼 말하고 생각한다.',
    '다른 사람의 말을 무조건 믿거나 따른다.',
    '스스로 선택하거나 계획할 수 없다.',
    '항상 밝고 순수하거나, 반대로 항상 화를 내고 통제되지 않는다.',
    '복잡한 감정, 연애, 성적 자기결정, 사생활이나 책임감이 없다.',
    '장애가 없는 사람과 공통된 욕구와 행동은 제거하고 장애 특성만 보여준다.',
  ];
  for (const value of activeProfiles) {
    const section = value.prompt.split('## 11. AI가 피해야 할 잘못된 재현')[1]?.split('## 참고 자료')[0];
    assert.ok(section);
    assert.ok(section.includes('다음은 근거 있는 행동 재현이 아니라 고정관념이다.'));
    assert.equal([...section.matchAll(/^- /gm)].length, 9);
    for (const text of prohibitions) assert.ok(section.includes(`- ${text}`), text);
    assert.ok(value.prompt.includes('자료의 모든 특성을 한꺼번에 연기하지 말고'));
    assert.ok(value.prompt.includes('공격성, 자해, 충동성, 성적 부적절성이나 무조건적인 복종을 기본 특성으로 넣지 않는다.'));
    assert.ok(value.prompt.includes('자폐, ADHD, 운동장애, 감각장애, 정신질환을 지적장애에 자동으로 결합하지 않는다.'));
  }
});
test('one stable adult character selects a bounded trait subset, strengths and personal preferences', () => {
  const character = profile.character;
  assert.deepEqual(Object.keys(character).sort(), ['name', 'age', 'goal', 'selectedTraits', 'strengths', 'preferences', 'familiarCategories', 'familiarProductIds', 'practicedStrategies'].sort());
  assert.equal(character.name, '지민');
  assert.equal(character.age, 32);
  assert.equal(character.selectedTraits.length, 4);
  for (const trait of character.selectedTraits) assert.ok(profile.prompt.includes(trait), trait);
  assert.ok(character.strengths.length > 0);
  assert.ok(character.preferences.length > 0);
  assert.ok(character.practicedStrategies.length > 0);
  assert.deepEqual(character.familiarCategories, ['fresh', 'produce', 'meal']);
  assert.deepEqual(character.familiarProductIds, ['milk', 'apple', 'curry']);
  for (const value of activeProfiles) {
    assert.ok(value.prompt.includes('이름·나이·취향·경험·선택한 어려움은 합성 인물 설정'));
    assert.ok(value.prompt.includes('상품을 안다는 사실이 미방문 매대의 위치·재고·정답을 안다는 뜻은 아니다'));
    assert.ok(value.prompt.includes('이 게임의 액션으로 발화·표정·동의 편향·관계·사생활을 직접 구현하거나 검증할 수 있다고 주장하지 않는다'));
    assert.ok(value.prompt.includes('세 인물은 장애의 경중이나 지능 순위로 구분하지 않고'));
  }
});

const profileSchema = JSON.parse(fs.readFileSync(path.join(personaDirectory, 'persona.schema.json'), 'utf8'));
// This local schema subset keeps profile checks dependency-free and applies every keyword used here.
function schemaErrors(value, schema, location = '$') {
  const errors = [];
  const fail = (message) => errors.push(`${location}: ${message}`);
  if (Object.hasOwn(schema, 'const') && value !== schema.const) fail('unexpected constant');
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [location + ': expected object'];
    for (const key of schema.required ?? []) if (!Object.hasOwn(value, key)) fail(`missing ${key}`);
    for (const [key, item] of Object.entries(value)) {
      const child = schema.properties?.[key] ?? schema.additionalProperties;
      if (child === false) fail(`unknown ${key}`);
      else if (child && typeof child === 'object') errors.push(...schemaErrors(item, child, `${location}.${key}`));
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) return [location + ': expected array'];
    if (value.length < (schema.minItems ?? 0)) fail('too few items');
    if (schema.uniqueItems && new Set(value.map(item => JSON.stringify(item))).size !== value.length) fail('duplicate items');
    value.forEach((item, i) => errors.push(...schemaErrors(item, schema.items, `${location}[${i}]`)));
  } else if (schema.type === 'number' || schema.type === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value) || schema.type === 'integer' && !Number.isInteger(value)) fail('expected finite numeric value');
    else if (value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity)
      || schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) fail('outside bounds');
  } else if (schema.type === 'string' && (typeof value !== 'string' || value.length < (schema.minLength ?? 0))) fail('expected nonempty string');
  return errors;
}
test('all active profiles obey the schema and use attention with bounded behavioral parameters', () => {
  for (const id of ['mild-intellectual-disability-adult', 'careful-checker', 'quick-decider']) {
    const value = JSON.parse(fs.readFileSync(path.join(personaDirectory, `${id}.json`), 'utf8'));
    assert.deepEqual(schemaErrors(value, profileSchema), [], id);
    assert.equal(value.version, activeVersions[id]);
    assert.equal(value.attention.version, '1');
    assert.ok(value.shoppingStyle && value.character, 'all active personas need a stable character and shopping style');
    assert.ok(value.parameters.reactionMedianMs > 0 && value.parameters.walkSpeed > 0);
    for (const [name, number] of Object.entries(value.parameters)) {
      if (name.endsWith('Probability') || name === 'feedbackLearningRate') assert.ok(number >= 0 && number <= 1, name);
    }
  }

});
test('stable attention profile separates episode experience from the individual', () => {
  const attention = profile.attention;
  assert.equal(attention.version, '1');
  assert.ok(attention.interestProductWeights.curry > 0);
  assert.ok(attention.interestCategoryWeights.meal > 0);
  assert.ok(attention.maximumInterestActions >= attention.minimumInterestActions);
  assert.equal(Object.hasOwn(profile, 'attentionExperience'), false);
  assert.equal(Object.hasOwn(profile.character, 'attentionExperience'), false);
  assert.equal(Object.hasOwn(attention, 'firstPlay'), false);
  for (const mutate of [
    item => { item.attention.captureProbability = 1.01; },
    item => { item.attention.spatialMemoryCapacity = 3; },
    item => { item.attention.interestProductWeights.curry = -1; },
    item => { delete item.attention.resumeProbability; },
    item => { item.attention.firstPlay = true; },
  ]) {
    const invalid = structuredClone(profile); mutate(invalid);
    assert.ok(schemaErrors(invalid, profileSchema).length, 'invalid configuration must be rejected');
  }
});

test('every active persona prompt matches its versioned mirror and describes its configured adult character', () => {
  for (const [id, version] of Object.entries(activeVersions)) {
    const value = JSON.parse(fs.readFileSync(path.join(personaDirectory, `${id}.json`), 'utf8'));
    assert.equal(fs.readFileSync(path.join(personaDirectory, `persona-${id}-v${version}.md`), 'utf8'), value.prompt);
    assert.ok(value.character.age >= 18);
    assert.ok(value.character.selectedTraits.length > 0 && value.character.selectedTraits.length <= 6);
    for (const trait of value.character.selectedTraits) assert.ok(value.prompt.includes(trait), `${id}: missing selected trait`);
    assert.equal(Object.hasOwn(value, 'attentionExperience'), false);
    assert.equal(Object.hasOwn(value.character, 'attentionExperience'), false);
    assert.equal(Object.hasOwn(value.attention, 'firstPlay'), false);
  }
});
