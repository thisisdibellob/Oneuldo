'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { createHash } = require('node:crypto');
require('../runtime.cjs');
const saved = require('./fixtures/whole-trace-anchor-feedback-r5.json');
const { resolveProfiles } = require('../src/validation/personaTraitProfiles.cjs');
const { withValidationPersona } = require('../src/personas.ts');
const { buildWholeTraceBundle, wholeTraceInputHash } = require('../src/wholeTrace/wholeTraceBundle.ts');
const { compileWholeTraceCandidate, validateWholeTracePrefix } = require('../src/wholeTrace/wholeTraceCompiler.ts');
const { createWholeTraceExecutionAuthoringCursor } = require('../src/wholeTrace/wholeTraceExecutionAuthoring.ts');
const { createWholeTraceMovementFeedback } = require('../src/wholeTrace/wholeTraceMovementFeedback.ts');
const { FEEDBACK_EXPERIENCE_LIMITS } = require('../src/feedbackExperience.ts');
const { WholeTraceSession } = require('../src/wholeTrace/wholeTraceSession.ts');
const { TraceGuard, validateTrace } = require('../src/traceValidation.ts');
const VERSION = 'recent-movement-anchor-v1';
const CAPACITY_VERSION = 'recent-movement-anchor-capacity-v1';
const sha256 = value => createHash('sha256').update(value).digest('hex');
const persona = resolveProfiles({ profiles: [saved.profileDefinition] }, 'persona-traits-v2')[0].persona;
const scoped = work => withValidationPersona(work, persona);
const fixture = () => {
  const plain = structuredClone(saved.settings), settings = { ...plain, movementFeedbackVersion: VERSION };
  return { plain, settings, candidate: structuredClone(saved.candidate),
    bundle: buildWholeTraceBundle(settings, saved.candidate.requestId),
    plainBundle: buildWholeTraceBundle(plain, saved.candidate.requestId) };
};
const draft = decision => {
  const { source, ...choiceRef } = decision.choiceRef;
  return { ...structuredClone(decision), choiceRef };
};
const acceptedArrival = row => row.kind === 'decision' && row.decision.action.type === 'walkToAnchor' && row.after.result?.accepted
  && row.after.result.anchorId === row.decision.action.anchorId;
const actorText = menu => JSON.stringify({ labels: menu.availableChoices.map(choice => choice.label),
  movementNotes: menu.movementNotes });
const forbidden = /anchor-|\bW\d+\b|waypoint|coordinate|actualDelta|travelledPx|netPx|movedDistancePx|"[xy]"\s*:|가세요|가야|탐색하라|포기하지/;

test('bundle feedback accepts exactly the directional and visible-anchor pairs', () => scoped(() => {
  const plain = structuredClone(saved.settings);
  for (const movementVersion of [undefined, 'directional-v1', 'directional-v2', 'unknown', null])
    for (const movementFeedbackVersion of ['recent-movement-v1', VERSION, CAPACITY_VERSION, 'unknown', null]) {
      const settings = { ...plain, ...(movementVersion === undefined ? {} : { movementVersion }), movementFeedbackVersion };
      const build = () => buildWholeTraceBundle(settings, saved.candidate.requestId);
      const valid = movementFeedbackVersion === 'recent-movement-v1' && movementVersion === 'directional-v2'
        || [VERSION, CAPACITY_VERSION].includes(movementFeedbackVersion) && movementVersion === undefined;
      if (valid) assert.doesNotThrow(build);
      else assert.throws(build, /movementVersion|movementFeedbackVersion/);
    }
  assert.throws(() => buildWholeTraceBundle({ ...plain, movementFeedbackVersion: VERSION, trialBinding: {} },
    saved.candidate.requestId), /anchor-visible-structures-v1/);
}));

test('capacity feedback binds the canonical persona value and limits real r5 prefix markers', async () => {
  const limited = structuredClone(persona);
  // Mechanical fixture only: custom trait profiles intentionally freeze base
  // capability. This in-memory fixture is not a trait comparison or actor run.
  delete limited.traitProfile;
  limited.attention.spatialMemoryCapacity = 4;
  const settings = { ...structuredClone(saved.settings), movementFeedbackVersion: CAPACITY_VERSION };
  const bundle = withValidationPersona(() => buildWholeTraceBundle(settings, saved.candidate.requestId), limited);
  assert.equal(bundle.persona.behavior.behavioralContext.spatialMemoryCapacity, 4);
  assert.notEqual(bundle.inputHash, scoped(() => wholeTraceInputHash(settings, bundle.observationVersion)));
  const candidate = structuredClone(saved.candidate);
  await assert.rejects(scoped(() => validateWholeTracePrefix(settings, bundle, { ...candidate, decisions: [] })),
    error => error.validation?.code === 'PREPARED_INPUT_MISMATCH');
  await withValidationPersona(async () => {
    const forged = structuredClone(bundle);
    forged.persona.behavior.behavioralContext.spatialMemoryCapacity = 5;
    await assert.rejects(validateWholeTracePrefix(settings, forged, { ...candidate, decisions: [] }),
      error => error.validation?.code === 'PREPARED_INPUT_MISMATCH');
    const plainSettings = { ...settings, movementFeedbackVersion: VERSION };
    const plainBundle = buildWholeTraceBundle(plainSettings, bundle.requestId);
    assert.equal(plainBundle.persona.behavior.behavioralContext.spatialMemoryCapacity, undefined);
    const capped = await createWholeTraceExecutionAuthoringCursor(settings, bundle);
    const original = await createWholeTraceExecutionAuthoringCursor(plainSettings, plainBundle);
    let evictedVisible = 0;
    for (const decision of candidate.decisions) {
      const menu = await capped.menu(), unbounded = await original.menu();
      assert.deepEqual(menu.choiceIds, unbounded.choiceIds);
      assert.deepEqual(menu.movementNotes, unbounded.movementNotes);
      assert.ok(menu.availableChoices.filter(choice => choice.recentVisit).length <= 4);
      for (const choice of menu.availableChoices) {
        const prior = unbounded.availableChoices.find(row => row.choiceId === choice.choiceId);
        if (!choice.recentVisit && prior.recentVisit) evictedVisible++;
      }
      assert.equal((await capped.append(draft(decision))).accepted, true);
      assert.equal((await original.append(draft(decision))).accepted, true);
    }
    assert.ok(evictedVisible > 0, 'the compiler actually applies the persona capacity');
    const compiled = await compileWholeTraceCandidate(settings, bundle, capped.finish());
    assert.equal(compiled.trace.generation.wholeTraceMovementFeedbackVersion, CAPACITY_VERSION);
    assert.equal(validateTrace(compiled.trace, settings.snapshot).valid, true);
  }, limited);
});

test('r5 saved decisions recompile and replay unchanged with opt-in feedback and an unmarked initial frame', () => scoped(async () => {
  const { plain, settings, candidate, bundle, plainBundle } = fixture(), checkpoints = [];
  assert.equal(persona.version, saved.personaVersion);
  assert.equal(bundle.observationVersion, 'anchor-visible-structures-v1');
  assert.equal(bundle.movementFeedbackVersion, VERSION);
  assert.equal(bundle.movementValidationVersion, undefined, 'feedback does not require a validation experiment');
  assert.notEqual(bundle.inputHash, plainBundle.inputHash);
  assert.deepEqual(bundle.initialChoiceFrame, plainBundle.initialChoiceFrame);
  assert.ok(bundle.initialChoiceFrame.availableChoices.every(choice => !choice.recentVisit && !/최근에/.test(choice.label)));
  assert.match(bundle.actionContract.movementFeedback, /24/);
  for (const source of ['src/wholeTrace/wholeTraceMovementFeedback.ts', 'src/feedbackExperience.ts', 'src/feedbackActor.ts'])
    assert.ok(bundle.sourceFiles.some(file => file.path === source));
  const result = await compileWholeTraceCandidate(settings, bundle, candidate, 1, row => checkpoints.push(row));
  const off = await compileWholeTraceCandidate(plain, plainBundle, candidate);
  assert.equal(result.acceptedActions, 21);
  assert.equal(checkpoints.filter(acceptedArrival).length, 15);
  assert.equal(sha256(JSON.stringify(result.trace.steps)), saved.stepsSha256, 'exact original saved trace steps');
  assert.deepEqual(result.trace.steps, off.trace.steps);
  assert.deepEqual(result.knowledgeAudit, off.knowledgeAudit, 'feedback cannot change knowledge or declared decisions');
  assert.deepEqual(result.personaReview, off.personaReview, 'feedback cannot change trait findings');
  assert.equal(result.trace.generation.wholeTraceMovementFeedbackVersion, VERSION);
  assert.equal(Object.hasOwn(off.trace.generation, 'wholeTraceMovementFeedbackVersion'), false);
  assert.equal(validateTrace(result.trace, settings.snapshot).valid, true);
  const guard = new TraceGuard(settings.snapshot, persona.id, persona.version, 'anchor-feedback-replay',
    true, true, false, false, false, false, true, false, bundle.observationVersion);
  let walks = 0;
  for (const step of result.trace.steps) {
    guard.execute(step);
    if (step.type !== 'walkToAnchor') continue;
    const observation = guard.observeActor();
    assert.equal(observation.result.accepted, true);
    assert.equal(observation.result.anchorId, step.target.anchorId);
    walks++;
  }
  assert.equal(walks, 15);
  for (const [relative, digest] of Object.entries(saved.sourceFiles)) {
    const original = path.resolve(__dirname, '../..', relative);
    if (fs.existsSync(original)) assert.equal(sha256(fs.readFileSync(original)), digest, 'historical output remains untouched');
  }
}));

test('r5 execution menu v2 keeps contextual labels, all choices and exact accepted-arrival counts', () => scoped(async () => {
  const { plain, settings, candidate, bundle, plainBundle } = fixture(), checkpoints = [];
  await compileWholeTraceCandidate(settings, bundle, candidate, 1, row => checkpoints.push(row));
  const cursor = await createWholeTraceExecutionAuthoringCursor(settings, bundle);
  const off = await createWholeTraceExecutionAuthoringCursor(plain, plainBundle);
  const examples = [];
  for (const [index, decision] of candidate.decisions.entries()) {
    const menu = await cursor.menu(), original = await off.menu();
    assert.equal(menu.presentationRevision, 'current-choice-menu-v2');
    assert.deepEqual(menu.choiceIds, original.choiceIds);
    assert.deepEqual(menu.allowedWaypointIds, original.allowedWaypointIds);
    assert.deepEqual(menu.currentObservation, original.currentObservation);
    assert.equal(Object.hasOwn(original, 'movementNotes'), false);
    const arrivals = checkpoints.filter(row => row.index <= index && index - row.index <= FEEDBACK_EXPERIENCE_LIMITS.retentionActions
      && acceptedArrival(row));
    const visible = new Set(menu.currentObservation.observation.anchors.map(anchor => anchor.id));
    for (const [i, choice] of menu.availableChoices.entries()) {
      const entry = bundle.choiceCatalog.entries.find(entry => entry.choiceId === choice.choiceId);
      const anchor = entry.action.type === 'walk'
        ? bundle.worldReference.waypoints.find(point => point.waypointId === entry.action.waypointId).anchorId : null;
      const count = visible.has(anchor) ? arrivals.filter(row => row.decision.action.anchorId === anchor).length : 0;
      assert.deepEqual(choice, count ? { ...original.availableChoices[i],
        label: `${original.availableChoices[i].label} · 최근에 ${count}번 간 통로`, recentVisit: { timesArrived: count } }
        : original.availableChoices[i], `decision ${index}, choice ${choice.choiceId}`);
      if (count && choice.choiceId === decision.choiceRef.choiceId) examples.push({ index, label: choice.label, count });
    }
    for (const choice of menu.visibleWalkChoices) {
      const row = menu.availableChoices.find(entry => entry.choiceId === choice.choiceId);
      assert.equal(choice.label, row.label);
      assert.deepEqual(choice.recentVisit, row.recentVisit);
    }
    assert.doesNotMatch(actorText(menu), forbidden);
    if (arrivals.length < 4) assert.deepEqual(menu.movementNotes, []);
    else assert.match(menu.movementNotes[0], new RegExp(`최근 24번의 행동 안에 ${arrivals.length}번 걸었습니다`));
    if (index === 8) {
      assert.deepEqual(await cursor.menu(), menu, 'menu reads cannot age or duplicate evidence');
      const preview = await cursor.menu({ actorState: decision.actorState, delayMs: decision.delayMs });
      for (const key of ['availableChoices', 'visibleWalkChoices', 'movementNotes', 'currentObservation'])
        assert.deepEqual(preview[key], menu[key], 'timing preview keeps the same marked choices');
      const rejected = await cursor.append({ ...draft(decision), choiceRef: { choiceId: 'walk/not-offered' } });
      assert.equal(rejected.accepted, false);
      assert.deepEqual(rejected.menu, menu, 'rejected drafts are not applied movement');
    }
    const accepted = await cursor.append(draft(decision)), unmarked = await off.append(draft(decision));
    assert.equal(accepted.accepted, true, JSON.stringify(accepted));
    assert.equal(unmarked.accepted, true, JSON.stringify(unmarked));
    assert.deepEqual(accepted.decision, decision, 'the original actor decision remains exact');
  }
  assert.deepEqual(cursor.finish(), candidate);
  assert.deepEqual(off.finish(), candidate);
  assert.deepEqual(examples.map(example => example.index), [8, 9, 11, 16]);
  assert.ok(examples.every(example => example.count === 1));
}));

test('real r5 arrival marks expire after the existing 24-action boundary and never mark unseen or rejected arrivals', () => scoped(async () => {
  const { settings, bundle, candidate } = fixture(), checkpoints = [];
  await compileWholeTraceCandidate(settings, bundle, candidate, 1, row => checkpoints.push(row));
  const prefix = await validateWholeTracePrefix(settings, bundle, { ...candidate, decisions: candidate.decisions.slice(0, 8) });
  const feedback = createWholeTraceMovementFeedback();
  const arrival = checkpoints.find(row => row.index === 7), current = prefix.before;
  feedback.record(arrival.decision, arrival.before, arrival.after);
  const choiceId = candidate.decisions[6].choiceRef.choiceId;
  const row = () => feedback.decorate(prefix.choiceFrame, current).choiceFrame.availableChoices.find(choice => choice.choiceId === choiceId);
  // The compiler frame is already decorated; use a clean frame for independent aging checks.
  for (const choice of prefix.choiceFrame.availableChoices) {
    choice.label = choice.label.replace(/ · 최근에 \d+번 간 통로$/, '');
    delete choice.recentVisit;
  }
  assert.deepEqual(row().recentVisit, { timesArrived: 1 });
  const pause = { action: { type: 'pause', durationMs: 1500 }, delayMs: 500, reason: '잠시 기다린다' };
  const after = { ...current, result: { accepted: true, actionType: 'pause' } };
  for (let i = 0; i < FEEDBACK_EXPERIENCE_LIMITS.retentionActions; i++) feedback.record(pause, current, after);
  assert.deepEqual(row().recentVisit, { timesArrived: 1 }, 'age 24 is retained by the existing inclusive window');
  feedback.record(pause, current, after);
  assert.equal(row().recentVisit, undefined, 'age 25 is expired');
  assert.deepEqual(feedback.decorate(prefix.choiceFrame, current).movementNotes, []);
  feedback.record(arrival.decision, arrival.before, { ...arrival.after,
    result: { ...arrival.after.result, accepted: false } });
  feedback.record(arrival.decision, arrival.before, { ...arrival.after,
    result: { ...arrival.after.result, anchorId: 'different-anchor' } });
  assert.equal(row().recentVisit, undefined);
  feedback.record(arrival.decision, arrival.before, arrival.after);
  assert.deepEqual(row().recentVisit, { timesArrived: 1 });
  assert.ok(feedback.decorate(prefix.choiceFrame, { ...current, anchors: [] }).choiceFrame.availableChoices
    .every(choice => !choice.recentVisit), 'an offered but currently unseen passage has no arrival annotation');
}));

test('an archived bundle without the anchor observation contract cannot enable new movement feedback', () => scoped(async () => {
  const { settings, bundle, candidate } = fixture();
  delete bundle.observationVersion;
  bundle.inputHash = wholeTraceInputHash(settings);
  await assert.rejects(validateWholeTracePrefix(settings, bundle, { ...candidate, decisions: [] }), error =>
    error.validation?.code === 'PREPARED_INPUT_MISMATCH');
}));

test('session saves the new feedback version in trace and knowledge audit without a validation flag', t => scoped(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-feedback-r5-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const { settings, candidate } = fixture(), outputPath = path.join(directory, 'replayed.json');
  const session = new WholeTraceSession({ ...settings, outputPath }), prepared = session.prepare();
  const submitted = { ...candidate, requestId: prepared.requestId };
  const result = await session.submit(submitted);
  assert.equal(result.status, 'complete', JSON.stringify(result));
  const trace = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  const audit = JSON.parse(fs.readFileSync(`${outputPath}.knowledge-audit.json`, 'utf8'));
  assert.equal(trace.generation.wholeTraceMovementFeedbackVersion, VERSION);
  assert.equal(audit.movementFeedbackVersion, VERSION);
  assert.equal(audit.observationVersion, 'anchor-visible-structures-v1');
  assert.equal(audit.inputHash, prepared.bundle.inputHash);
  assert.equal(sha256(JSON.stringify(trace.steps)), saved.stepsSha256);
  assert.equal(validateTrace(trace, settings.snapshot).valid, true);
}));
