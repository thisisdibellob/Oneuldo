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
const expectedChecksums = {
  source1: '2546f2f03482241343cc34dcf3b7928122de36180852eea08ac747967531e79b',
  source2: '30e2616aa133975399eb703644784fe7a53f283690a1ae8603ecae1f3a76ab96',
};
const source = (id) => fs.readFileSync(path.resolve(referencesDirectory, metadata.sources.find((item) => item.id === id).file), 'utf8');

test('both original persona sources retain their bytes, checksums and reference links', () => {
  assert.equal(metadata.personaId, profile.id);
  assert.equal(metadata.personaVersion, '2');
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
test('runtime v2 prompt contains both full source bodies verbatim and matches its Markdown mirror', () => {
  assert.equal(profile.id, 'mild-intellectual-disability-adult');
  assert.equal(profile.version, '2');
  const first = source('source1'), second = source('source2');
  assert.ok(profile.prompt.includes(first), 'role request must be complete, not summarized');
  assert.ok(profile.prompt.includes(second), 'behavior guidance must be complete, not summarized');
  assert.ok(profile.prompt.indexOf(first) < profile.prompt.indexOf(second));
  assert.equal(fs.readFileSync(path.resolve(referencesDirectory, metadata.promptMirror), 'utf8'), profile.prompt);
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
  const section = profile.prompt.split('## 11. AI가 피해야 할 잘못된 재현')[1]?.split('## 참고 자료')[0];
  assert.ok(section);
  assert.ok(section.includes('다음은 근거 있는 행동 재현이 아니라 고정관념이다.'));
  assert.equal([...section.matchAll(/^- /gm)].length, 9);
  for (const text of prohibitions) assert.ok(section.includes(`- ${text}`), text);
  assert.ok(profile.prompt.includes('자료의 모든 특성을 한꺼번에 연기하지 말고'));
  assert.ok(profile.prompt.includes('공격성, 자해, 충동성, 성적 부적절성이나 무조건적인 복종을 기본 특성으로 넣지 않는다.'));
  assert.ok(profile.prompt.includes('자폐, ADHD, 운동장애, 감각장애, 정신질환을 지적장애에 자동으로 결합하지 않는다.'));
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
  assert.ok(profile.prompt.includes('한 사람의 일관된 행동을 정하기 위해 추가한 허구 설정'));
  assert.ok(profile.prompt.includes('아직 보지 않은 재고·위치·정답을 알고 있다는 뜻이 아니다'));
  assert.ok(profile.prompt.includes('게임의 액션으로 직접 관찰·검증하지 않는다'));
});
