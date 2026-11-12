const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
require('../runtime.cjs');
const { listPersonas, getPersona } = require('../src/personas.ts');
const { ACTOR_PERSONA_INSTRUCTIONS } = require('../src/actorInstructions.ts');
const { buildWholeTracePersonaInput } = require('../src/wholeTrace/wholeTracePersona.ts');

test('whole persona input retains every selected trait, strength and practiced strategy from all three original profiles', () => {
  const personas = listPersonas();
  assert.equal(personas.length, 3);
  for (const persona of personas) {
    const input = buildWholeTracePersonaInput(persona);
    assert.deepEqual(input.source, { personaId: persona.id, version: persona.version,
      promptHash: createHash('sha256').update(persona.prompt).digest('hex') });
    assert.ok(input.instruction.startsWith(ACTOR_PERSONA_INSTRUCTIONS));
    assert.ok(input.instruction.includes(input.individualInstructions));
    for (const rule of [...persona.character.selectedTraits, ...persona.character.strengths,
      ...persona.character.practicedStrategies])
      assert.ok(input.individualInstructions.includes(rule), `${persona.id}: missing individual rule ${rule}`);
    assert.ok(input.individualInstructions.includes('## 게임에서 표현하는 선택·확인 습관'));
    // Preserve this optional section when the canonical profile defines it;
    // older active profiles must not acquire a new personal history from the adapter.
    const experienceHeading = '## 개인의 시작 상태와 회차 경험';
    assert.equal(input.individualInstructions.includes(experienceHeading),
      persona.prompt.split(/^## 공통 전제/m)[0].includes(experienceHeading));
    assert.equal(input.individualInstructions.includes('## 공통 전제'), false);
    assert.equal(input.individualInstructions.includes('## 원자료'), false);
    assert.equal(input.individualInstructions.includes('## 자료와 구조화된 설정의 연결'), false);
    assert.ok(input.individualInstructions.length < 4000);
    assert.ok(input.instruction.length < persona.prompt.length / 2,
      `${persona.id}: full references should remain outside the whole actor instructions`);
    assert.deepEqual(input, buildWholeTracePersonaInput(persona), 'building is stable and consumes no random state');
  }
});

test('individual habits preserve interest runs, memory burden and recovery instead of reducing the persona to character labels', () => {
  const mild = buildWholeTracePersonaInput(getPersona('mild-intellectual-disability-adult'));
  assert.ok(mild.individualInstructions.includes('그동안 하던 항목의 세부를 놓칠 수 있다'));
  assert.ok(mild.individualInstructions.includes('관심이 생기면 한동안 이어질 수 있고'));
  assert.ok(mild.individualInstructions.includes('매 스텝마다 구매 목록으로 즉시 복귀시키지 않는다'));
  assert.ok(mild.individualInstructions.includes('스스로 목표를 떠올리거나 목록·장바구니를 확인해 돌아올 수 있다'));
  const careful = buildWholeTracePersonaInput(getPersona('careful-checker'));
  assert.ok(careful.individualInstructions.includes('처음 보거나 바뀐 매장에서는 주변 단서를 더 살피고'));
  assert.ok(careful.individualInstructions.includes('이름을 보고 다음에 규격·수량, 다음에 가격'));
  assert.ok(careful.individualInstructions.includes('모든 실행에서 완벽한 장바구니를 보장하지 않는다'));
  const quick = buildWholeTracePersonaInput(getPersona('quick-decider'));
  assert.ok(quick.individualInstructions.includes('미확인 선택이 쌓이면 세부 조건이나 개수를 놓칠 수 있다'));
  assert.ok(quick.individualInstructions.includes('단순한 한 항목과 눈앞의 수량은 안정적으로 수행할 수 있다'));
  assert.ok(quick.individualInstructions.includes('부담·불확실성·실패가 커지면 도움을 구하거나 다시 확인'));
});

test('whole persona input connects original memory parameters to context coefficients without action quotas', () => {
  for (const persona of listPersonas()) {
    const input = buildWholeTracePersonaInput(persona);
    assert.deepEqual(input.behavioralContext, { goalMemoryCapacity: persona.attention.goalMemoryCapacity });
    assert.deepEqual(input.timingBaseline, { reactionMedianMs: persona.parameters.reactionMedianMs,
      reactionSigma: persona.parameters.reactionSigma, walkSpeed: persona.parameters.walkSpeed });
    const serialized = JSON.stringify(input);
    assert.doesNotMatch(serialized,
      /firstPlayOrientationActions|minimumInterestActions|maximumInterestActions|spatialMemoryCapacity/);
    assert.deepEqual(input.cognition.sourceParameters, { switchMemoryDecay: persona.attention.switchMemoryDecay, confusionProbability: persona.parameters.confusionProbability, quantitySlipProbability: persona.parameters.quantitySlipProbability });
    assert.equal(input.cognition.goalMemoryCapacity, persona.attention.goalMemoryCapacity);
    assert.match(input.cognitionSourceHash, /^[a-f0-9]{64}$/);
    assert.equal(Object.hasOwn(input.behavioralContext, 'firstVisit'), false);
    assert.ok(input.instruction.includes('실존 인물의 진단·기억검사·임상 척도나 장애 집단의 실측 행동 확률이 아니다'));
    assert.ok(input.instruction.includes('작은 작업 목표 묶음의 설계 한도'));
    assert.ok(input.instruction.includes('확률 추첨·자동 잡음·고정 지연을 적용하거나'));
    assert.ok(input.instruction.includes('익숙함, 새 설명, 여러 조건의 부하'));
    assert.ok(input.instruction.includes('느린 반응은 곧 이해 실패가 아니고'));
  }
});

test('profile changes flow into instructions and full prompt provenance without a second persona source', () => {
  const original = getPersona('mild-intellectual-disability-adult');
  const before = buildWholeTracePersonaInput(original);
  const changed = structuredClone(original);
  const addedRule = '## 새로 선택한 상황 규칙\n\n실제로 읽은 표기를 다시 대조한다.\n\n';
  changed.prompt = changed.prompt.replace('## 공통 전제', `${addedRule}## 공통 전제`);
  const after = buildWholeTracePersonaInput(changed);
  assert.ok(after.individualInstructions.includes(addedRule.trim()));
  assert.notEqual(after.source.promptHash, before.source.promptHash);
  const parameterChange = structuredClone(original);
  parameterChange.parameters.quantitySlipProbability = .31;
  const parameterInput = buildWholeTracePersonaInput(parameterChange);
  assert.notEqual(parameterInput.cognitionSourceHash, before.cognitionSourceHash);
  assert.equal(parameterInput.source.promptHash, before.source.promptHash);
  const referenceChange = structuredClone(original);
  referenceChange.prompt += '\n원자료의 보존 정보만 변경됨';
  const referenceInput = buildWholeTracePersonaInput(referenceChange);
  assert.equal(referenceInput.individualInstructions, before.individualInstructions);
  assert.notEqual(referenceInput.source.promptHash, before.source.promptHash);
  after.behavioralContext.goalMemoryCapacity = 99;
  after.timingBaseline.reactionMedianMs = 1;
  assert.equal(original.attention.goalMemoryCapacity, 2);
  assert.equal(original.parameters.reactionMedianMs, 2700);
});

test('a missing profile boundary fails explicitly instead of sending the raw references or silently losing individual rules', () => {
  const persona = getPersona('quick-decider');
  persona.prompt = persona.prompt.replace('## 공통 전제', '## changed common heading');
  assert.throws(() => buildWholeTracePersonaInput(persona), /Missing individual\/common persona prompt boundary/);
});
