const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const crypto = require('node:crypto'), { spawnSync } = require('node:child_process');
require('../runtime.cjs');
const { researchLearnerContext, researchEncodingContext, researchRetrievalContext,
  researchPracticeAudit, researchLearnerProfile, getResearchLearnerProfile } = require('../src/researchLearnerContext.ts');
function input() {
  const who = { personaId: researchLearnerProfile.id, runId: 'unit-fixture' };
  const receipt = { observationRef: 'fixture-ui.txt', observationSha256: 'a'.repeat(64) };
  return {
    archive: { version: 'research-observed-v2', ...who, episodes: [
      { id: 'milk-observation', sessionId: 'practice-1', ...receipt, observedAt: '2026-10-01T10:00:00Z',
        observed: { action: 'readInstruction', instructions: ['우유의 900 표시를 목록과 비교해 보세요.'], source: 'executed-app-action' } },
      { id: 'feedback-observation', sessionId: 'practice-1', ...receipt, observedAt: '2026-10-01T10:01:00Z',
        observed: { action: 'viewFeedback', result: '목록과 맞는 우유를 골랐어요.', source: 'executed-app-action' } },
      { id: 'unused-past', sessionId: 'older-visit', ...receipt, observedAt: '2026-10-01T09:00:00Z',
        observed: { action: 'readInstruction', instructions: ['SECRET_UNUSED_ARCHIVE'], source: 'executed-app-action' } }
    ] },
    memory: { version: 'research-memory-v2', ...who, revisionId: 'learner-written-1', writtenAt: '2026-10-01T10:02:00Z', associations: [
      { id: 'milk-number', skill: 'volume', cue: '우유 팩', association: '900 글자를 옆에서 보고 골랐던 것 같아.',
        status: 'tentative', episodeIds: ['milk-observation', 'feedback-observation'] },
      { id: 'route', skill: 'navigation', cue: '지난 매장', association: 'EXACT_UNRECALLED_MEMORY',
        status: 'tentative', episodeIds: ['milk-observation'] }
    ] },
    recall: { version: 'research-recall-v2', ...who, memoryRevisionId: 'learner-written-1', ...receipt, observedAt: '2026-10-01T11:00:00Z',
      recalled: [{ associationId: 'milk-number', text: '우유 옆에 90이었나? 잘 모르겠어.', certainty: 'uncertain' }] },
    current: { sessionId: 'practice-2', ...receipt, observedAt: '2026-10-01T11:00:00Z', visible: { seenProducts: ['우유 900mL', '우유 200mL'] } }
  };
}
test('decision uses AI-selected imperfect recall; verbatim archive and unrecalled memory stay out', () => {
  const x = input(), c = researchLearnerContext(x), text = JSON.stringify(c);
  assert.equal(c.currentlyRecalled[0].text, '우유 옆에 90이었나? 잘 모르겠어.');
  assert.equal(c.currentlyRecalled[0].skill, 'volume');
  for (const secret of ['SECRET_UNUSED_ARCHIVE', 'EXACT_UNRECALLED_MEMORY', '900 글자를 옆에서 보고 골랐던 것 같아.', '목록과 맞는 우유를 골랐어요.'])
    assert.ok(!text.includes(secret));
  assert.equal(c.archive, undefined); assert.equal(c.mastery, undefined);
  c.currentVisible.seenProducts.push('changed'); assert.equal(x.current.visible.seenProducts.length, 2);
});
test('empty recall remains empty; repeated plays create no automatic recall or success state', () => {
  const x = input(); x.recall.recalled = [];
  assert.deepEqual(researchLearnerContext(x).currentlyRecalled, []);
  const before = structuredClone(x);
  for (let n = 0; n < 10; n++) assert.deepEqual(researchLearnerContext(x).currentlyRecalled, []);
  assert.deepEqual(x, before);
});
test('three different personas share the learning instructions and use the same context path', () => {
  for (const id of ['adult-minjae-unit-support-research-v2', 'adult-seoyeon-research-v2', 'adult-minsu-research-v2']) {
    const profile = getResearchLearnerProfile(id), x = input();
    for (const value of [x.archive, x.memory, x.recall]) value.personaId = id;
    assert.deepEqual(profile.learningInstructions, researchLearnerProfile.learningInstructions);
    assert.deepEqual(profile.researchSourceIds, researchLearnerProfile.researchSourceIds);
    assert.equal(researchLearnerContext(x).persona.id, id);
    assert.equal(researchRetrievalContext(x.archive, x.memory, x.current).persona.id, id);
    assert.equal(researchEncodingContext(x.archive, x.memory, ['milk-observation']).persona.id, id);
    const different = structuredClone(x); different.memory.personaId = id === researchLearnerProfile.id ? 'adult-seoyeon-research-v2' : researchLearnerProfile.id;
    assert.throws(() => researchLearnerContext(different), /LEARNER_IDENTITY_MISMATCH/);
  }
});
test('milk volume experience does not create a banana package-unit strategy', () => {
  const x = input(); x.current.visible = { seenProducts: ['바나나 낱개', '바나나 1송이'] };
  const c = researchLearnerContext(x);
  assert.deepEqual(c.currentlyRecalled.map(r => r.skill), ['volume']);
  assert.ok(!JSON.stringify(c.currentlyRecalled).includes('송이'));
});
test('retrieval sees only learner-authored associations; encoding sees only selected current-session receipts', () => {
  const x = input();
  const retrieval = researchRetrievalContext(x.archive, x.memory, x.current);
  assert.ok(!JSON.stringify(retrieval).includes('SECRET_UNUSED_ARCHIVE'));
  assert.ok(!JSON.stringify(retrieval).includes('목록과 맞는 우유를 골랐어요.'));
  const encoding = researchEncodingContext(x.archive, x.memory, ['feedback-observation']);
  assert.deepEqual(encoding.newlyObserved.map(e => e.id), ['feedback-observation']);
  assert.ok(!JSON.stringify(encoding).includes('SECRET_UNUSED_ARCHIVE'));
  assert.throws(() => researchEncodingContext(x.archive, x.memory, ['missing']));
  assert.throws(() => researchEncodingContext(x.archive, x.memory, ['milk-observation', 'unused-past']));
});
test('analysis, scores, guessed memory decay and assessment purpose cannot enter actor fields', () => {
  for (const mutate of [
    x => x.current.visible.analysis = 'teacher answer',
    x => x.memory.mastery = 1,
    x => x.recall.recalled[0].correctAnswer = '900',
    x => x.archive.episodes[0].observed.analysis = 'hidden',
    x => x.current.purpose = 'independent-probe',
    x => x.memory.associations[0].improvementProbability = 0.4,
    x => x.evaluation = { success: true }
  ]) { const x = input(); mutate(x); assert.throws(() => researchLearnerContext(x)); }
});
test('cross-run, stale recall, invented associations and future memories are rejected', () => {
  for (const mutate of [
    x => x.memory.runId = 'other-learner',
    x => x.recall.personaId = 'different-person',
    x => x.recall.memoryRevisionId = 'previous',
    x => x.recall.observationRef = 'other-screen.txt',
    x => x.recall.observationSha256 = 'b'.repeat(64),
    x => x.recall.observedAt = '2026-10-01T10:59:00Z',
    x => x.recall.recalled[0].associationId = 'invented',
    x => x.memory.associations[0].episodeIds = ['nonexistent'],
    x => x.memory.writtenAt = '2026-10-02T10:02:00Z',
    x => x.archive.episodes[0].observedAt = '2026-10-02T10:00:00Z',
    x => x.archive.episodes[0].observed.source = 'current-planning-observation',
    x => x.current.observationSha256 = 'missing',
    x => x.current.observedAt = 'pretend-one-week-later'
  ]) { const x = input(); mutate(x); assert.throws(() => researchLearnerContext(x)); }
});
test('auditor reports actual observed delay and support exposure without awarding independence', () => {
  const x = input();
  x.archive.episodes.push({ id: 'probe-obs', ...x.current, observed: { action: 'readList', source: 'executed-app-action' } });
  delete x.archive.episodes.at(-1).visible;
  const audit = researchPracticeAudit(x.archive, { sessionId: 'practice-2', purpose: 'maintenance-probe',
    previousPracticeSessionId: 'practice-1', targetSkills: ['volume'], changedFeatures: [],
    support: [{ episodeId: 'probe-obs', level: 'specific-cue', access: 'displayed' }] });
  assert.equal(audit.observedIntervalMs, 59 * 60000);
  assert.equal(audit.support[0].access, 'displayed'); assert.equal(audit.independent, undefined);
  assert.equal(audit.abilityImproved, undefined);
  assert.throws(() => researchPracticeAudit(x.archive, { sessionId: 'practice-2', purpose: 'transfer-probe',
    targetSkills: ['volume'], changedFeatures: [], support: [] }));
  assert.throws(() => researchPracticeAudit(x.archive, { sessionId: 'practice-2', purpose: 'maintenance-probe',
    targetSkills: ['volume'], changedFeatures: [], support: [] }));
  assert.throws(() => researchPracticeAudit(x.archive, { sessionId: 'practice-2', purpose: 'acquisition',
    targetSkills: ['volume'], changedFeatures: [], support: [{ episodeId: 'milk-observation', level: 'specific-cue', access: 'opened' }] }));
});
test('CLI verifies real receipt bytes and refuses changed or legacy artifacts', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oneuldo-research-learner-'));
  const cli = path.resolve(__dirname, '../scripts/prepare-research-learner.cjs');
  try {
    const x = input(), receipt = path.join(dir, 'ui.txt'); fs.writeFileSync(receipt, 'fixture visible screen');
    const digest = crypto.createHash('sha256').update(fs.readFileSync(receipt)).digest('hex');
    for (const e of [...x.archive.episodes, x.current]) { e.observationRef = receipt; e.observationSha256 = digest; }
    x.recall.observationRef = receipt; x.recall.observationSha256 = digest;
    for (const key of ['archive', 'memory', 'recall', 'current']) fs.writeFileSync(path.join(dir, key + '.json'), JSON.stringify(x[key]));
    const args = ['decision', ...['archive', 'memory', 'recall', 'current'].flatMap(k => ['--' + k, path.join(dir, k + '.json')]), '--out', path.join(dir, 'decision.json')];
    let r = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'decision.json'))).version, 'research-decision-context-v2');
    fs.writeFileSync(receipt, 'modified'); r = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
    assert.notEqual(r.status, 0); assert.match(r.stderr, /UI_RECEIPT_CHANGED/);
    fs.writeFileSync(path.join(dir, 'archive.json'), JSON.stringify({ version: 'assistant-observed-v1', episodes: [] }));
    r = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' }); assert.notEqual(r.status, 0); assert.match(r.stderr, /NEW_V2_ARCHIVE_REQUIRED/);
  } finally { fs.rmSync(dir, { recursive: true }); }
});
