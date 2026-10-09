const test = require('node:test'), assert = require('node:assert/strict');
require('../runtime.cjs');
const { assistantLearnerContext } = require('../src/assistantLearnerContext.ts');
const experience = () => ({ version: 'assistant-observed-v1', personaId: 'fixture',
  episodes: [{ id: 'observed-1', sessionId: 'session-1', observationRef: 'fixture-ui-receipt.json',
    observed: { action: 'readList', readList: [{ label: '바나나 1송이', quantity: 1 }], source: 'executed-app-action' } }],
  learnerNotes: [] });
test('repeated experience does not create a strategy, mastery or new answer', () => {
  const a = assistantLearnerContext(experience()), b = assistantLearnerContext(experience());
  assert.deepEqual(a, b); assert.deepEqual(a.tentativeLearnerNotes, []);
  assert.equal(a.mastery, undefined); assert.equal(a.currentTaskAnswer, undefined);
});
test('learner-authored strategy must refer to an observed episode and remains tentative', () => {
  const input = experience(); input.learnerNotes.push({ kind: 'tentative-strategy', text: '다음에도 송이라는 글자를 찾아볼까.', episodeIds: ['observed-1'] });
  const context = assistantLearnerContext(input);
  assert.equal(context.tentativeLearnerNotes[0].kind, 'tentative-strategy');
  context.observedExperience[0].observed.readList[0].label = 'changed';
  assert.equal(input.episodes[0].observed.readList[0].label, '바나나 1송이');
  input.learnerNotes[0].episodeIds = ['unseen']; assert.throws(() => assistantLearnerContext(input));
});
test('hidden analysis, planned actions and unsupported ability updates are rejected', () => {
  for (const extra of [{analysis:'secret'}, {mastery:1}, {improvementProbability:0.5}])
    assert.throws(() => assistantLearnerContext({...experience(), ...extra}));
  const input = experience(); input.episodes[0].observed.source = 'current-planning-observation';
  assert.throws(() => assistantLearnerContext(input));
  input.episodes[0].observed.source = 'executed-app-action'; input.episodes[0].observed.analysis = 'answer';
  assert.throws(() => assistantLearnerContext(input));
});
