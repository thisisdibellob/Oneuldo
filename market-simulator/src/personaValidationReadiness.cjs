'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { canonicalMarketReplayJson, marketReplayTraceId } = require('../../frontend/src/game/marketReplayTrace.ts');
const CONTROL = 'neutral-adult-control';
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const digest = value => crypto.createHash('sha256').update(canonicalMarketReplayJson(value)).digest('hex');
const key = slot => `${slot.condition}:${String(slot.seed)}:${slot.personaId}`;
function prepareWholeTrace(m, slot) {
  return slot.prepareWholeTrace ?? { personaId: slot.personaId, seed: slot.seed, snapshotFilePath: m.snapshots[slot.condition].filePath,
    outputPath: slot.tracePath, attentionExperience: { visit: 'first-play' } };
}
function inspectSlot(m, slot) {
  if (!fs.existsSync(slot.tracePath)) {
    if (slot.traceId) return { complete: false, reason: 'Recorded trace removed' };
    for (const file of [`${slot.tracePath}.generation/status.json`, `${slot.tracePath}.whole-trace/status.json`]) if (fs.existsSync(file)) {
      try { const status = read(file); if (['failed', 'invalid'].includes(status.state ?? status.status)) return { complete: false, reason: `Generation ${status.state ?? status.status}` }; }
      catch { return { complete: false, reason: 'Unreadable generation status' }; }
    }
    return { complete: false };
  }
  try {
    const trace = read(slot.tracePath), fixture = trace.generationPolicy === 'stochastic';
    const persona = m.version === 3 ? m.profiles[slot.personaId].persona : read(path.join(__dirname, '../personas', `${slot.personaId}.json`));
    if (trace.personaId !== slot.personaId || String(trace.seed) !== String(slot.seed) || trace.target?.snapshotId !== slot.snapshotId
      || trace.personaVersion !== persona.version || slot.traceId && trace.traceId !== slot.traceId) throw new Error('Mixed trace identity or persona version');
    if (!Array.isArray(trace.steps)) throw new Error('Missing trace steps');
    const paths = { trace: slot.tracePath, snapshot: `${slot.tracePath}.snapshot.json`, actorDecisions: `${slot.tracePath}.actor-decisions.json`,
      knowledgeAudit: `${slot.tracePath}.knowledge-audit.json`, personaReview: `${slot.tracePath}.persona-review.json`, bundle: `${slot.tracePath}.whole-trace/bundle.json` };
    if (slot.evidenceHashes && Object.entries(paths).some(([name, file]) => (fs.existsSync(file) ? hash(file) : null) !== slot.evidenceHashes[name])) throw new Error('Recorded trace evidence changed');
    if (!fixture) {
      if (trace.experienceMode !== 'first-play' || trace.generationPolicy !== 'llm' || trace.generation?.actorPolicyVersion !== m.versions.policyVersion
        || trace.generation?.model !== m.versions.model || trace.generation?.learnerIdentity || trace.generation?.trialBinding) throw new Error('Mixed policy/model/experience');
      const audit = read(paths.knowledgeAudit), bundle = read(paths.bundle);
      if (audit.candidateVersion !== m.versions.candidateVersion || bundle.bundleVersion !== m.versions.bundleVersion
        || trace.traceId !== marketReplayTraceId(trace) || audit.traceId !== trace.traceId || audit.requestId !== bundle.requestId
        || audit.inputHash !== bundle.inputHash || audit.policyVersion !== m.versions.policyVersion || bundle.policyVersion !== m.versions.policyVersion
        || bundle.model !== m.versions.model || bundle.snapshotId !== slot.snapshotId || bundle.persona?.id !== slot.personaId
        || bundle.persona?.version !== persona.version || String(bundle.seed) !== String(slot.seed)) throw new Error('Mixed or altered whole-trace evidence');
      if (digest(read(paths.snapshot)) !== digest(read(m.snapshots[slot.condition].filePath))) throw new Error('Mixed saved snapshot');
      if (bundle.persona?.behavior?.source?.promptHash !== crypto.createHash('sha256').update(persona.prompt).digest('hex')) throw new Error('Mixed persona prompt');
      if (fs.existsSync(paths.personaReview)) { const review = read(paths.personaReview); if (review.traceId !== trace.traceId || review.requestId !== bundle.requestId || review.knowledgeAuditHash !== digest(audit)) throw new Error('Mixed persona review'); }
      if (fs.existsSync(paths.actorDecisions)) { const decisions = read(paths.actorDecisions); if (!Array.isArray(decisions) && decisions.traceId && decisions.traceId !== trace.traceId) throw new Error('Mixed actor decisions'); }
    }
    return { complete: true, traceId: trace.traceId, fixture };
  } catch (error) { return { complete: false, reason: error.message }; }
}
function fromManifest(m, { samples } = {}) {
  const traits = m.version === 3, current = require(traits ? '../validation/persona-trait-validation-spec.json' : '../validation/persona-validation-spec.json');
  const spec = require('./personaValidationSpec.cjs').assertSpec(m, current, traits ? 'traits' : 'legacy');
  const sampleByKey = samples && new Map(samples.map(sample => [key(sample), sample]));
  const slots = m.slots.map(slot => ({ ...slot, ...(sampleByKey?.has(key(slot)) ? { complete: true, fixture: sampleByKey.get(key(slot)).fixture } : inspectSlot(m, slot)),
    prepareWholeTrace: prepareWholeTrace(m, slot) }));
  const completed = new Set(slots.filter(slot => slot.complete).map(key)), byKey = new Map(slots.map(slot => [key(slot), slot]));
  const catalogSchemaVersion = m.catalogSchemaVersion ?? Object.values(m.profiles ?? {})[0]?.persona?.traitProfile?.schemaVersion ?? 'persona-traits-v1';
  const contrasts = traits ? require('./personaTraitValidationRun.cjs').matchedContrasts(m.profiles, catalogSchemaVersion).map(contrast => ({
    comparisonId: contrast.id, traitKey: contrast.traitKey, actorPersonaId: contrast.higherProfileId, referencePersonaId: contrast.lowerProfileId,
  })) : m.personaIds.filter(id => id !== CONTROL).map(id => ({ comparisonId: `${id}:${CONTROL}`, actorPersonaId: id, referencePersonaId: CONTROL }));
  const conditions = Object.keys(m.snapshots), unmatchedSlots = [], expectedValidPairs = [];
  const audits = m.opportunityAudit?.byPersonaCondition ?? [];
  for (const contrast of contrasts) for (const condition of conditions) {
    const pairedSeeds = [];
    for (const seed of m.seeds) {
      const missingPersonaIds = [contrast.actorPersonaId, contrast.referencePersonaId].filter(personaId => !completed.has(key({ condition, seed, personaId })));
      if (!missingPersonaIds.length) pairedSeeds.push(seed);
      else unmatchedSlots.push({ ...contrast, condition, seed, missingPersonaIds,
        actorComplete: completed.has(key({ condition, seed, personaId: contrast.actorPersonaId })),
        referenceComplete: completed.has(key({ condition, seed, personaId: contrast.referencePersonaId })) });
    }
    for (const metric of spec.metrics.filter(metric => (traits ? metric.traitKey === contrast.traitKey : metric.personaId === contrast.actorPersonaId)
      && (metric.applies === 'both' || metric.applies === condition))) {
      const possibilities = [contrast.actorPersonaId, contrast.referencePersonaId].map(personaId => audits.find(row => row.personaId === personaId && row.condition === condition)?.metrics?.[metric.kind]?.possible);
      const structurallyPossible = possibilities.includes(false) ? false : possibilities.every(v => v === true) ? true : null;
      const planned = m.seeds.filter(seed => [contrast.actorPersonaId, contrast.referencePersonaId].every(personaId => byKey.has(key({ condition, seed, personaId })))).length;
      expectedValidPairs.push({ ...contrast, metricId: metric.id, kind: metric.kind, condition, pairedSlots: pairedSeeds.length,
        maximumValidPairs: structurallyPossible === false ? 0 : pairedSeeds.length, plannedMaximumValidPairs: structurallyPossible === false ? 0 : planned, structurallyPossible });
    }
  }
  const technicalFailures = slots.filter(slot => slot.reason).map(slot => ({ personaId: slot.personaId, condition: slot.condition, seed: slot.seed, tracePath: slot.tracePath, reason: slot.reason }));
  const missingSlots = slots.filter(slot => !slot.complete).map(({ complete, reason, ...slot }) => ({ ...slot, status: reason ? 'technical-failure' : 'missing',
    ...(reason ? { failureReason: reason, generationAction: fs.existsSync(slot.tracePath) || slot.traceId ? 'new-run-required' : 'inspect-generation-record' } : {}) }));
  const controlCount = slots.filter(slot => slot.personaId === CONTROL && slot.complete).length;
  const referenceControls = contrasts.map(contrast => ({ ...contrast, completed: slots.filter(slot => slot.personaId === contrast.referencePersonaId && slot.complete).length }));
  const reasons = [];
  if (!traits && controlCount === 0) reasons.push({ code: 'no-control-traces', message: '대조군의 완료 trace가 0개다.' });
  if (!expectedValidPairs.some(row => row.maximumValidPairs > 0)) reasons.push({ code: 'no-expected-valid-pairs', message: '모든 비교의 기대 최대 유효 쌍이 0개다.' });
  if (traits && !contrasts.length) reasons.push({ code: 'no-matched-trait-contrast', message: '같은 맥락에서 성향 하나만 다른 비교가 없다.' });
  const blocked = reasons.length > 0;
  if (missingSlots.length) reasons.push({ code: 'incomplete-slot-grid', message: `${missingSlots.length}개 슬롯이 아직 완료되지 않았다.` });
  if (expectedValidPairs.some(row => row.maximumValidPairs < spec.minValidPairs)) reasons.push({ code: 'insufficient-pair-capacity', message: `현재 완료 슬롯으로는 일부 비교에서 유효 쌍 ${spec.minValidPairs}개에 도달할 수 없다.` });
  if (technicalFailures.length) reasons.push({ code: 'technical-failures', message: `${technicalFailures.length}개 슬롯의 기술 실패 또는 근거 불일치를 확인했다.` });
  if (m.analysisVersion === 2) for (const warning of m.opportunityAudit?.warnings ?? []) reasons.push({ ...warning,
    message: `${warning.personaId}/${warning.condition}: ${warning.message}` });
  return { runDirectory: m.runDirectory, manifestPath: path.join(m.runDirectory, 'manifest.json'), validationMode: traits ? 'traits' : 'legacy',
    readiness: blocked ? 'blocked' : missingSlots.length || expectedValidPairs.some(row => row.maximumValidPairs < spec.minValidPairs) ? 'incomplete' : 'ready', reasons,
    complete: completed.size, required: m.slots.length, containsFixture: slots.some(slot => slot.complete && slot.fixture),
    fixtureOnly: completed.size > 0 && slots.filter(slot => slot.complete).every(slot => slot.fixture),
    byPersonaCondition: m.personaIds.flatMap(personaId => conditions.map(condition => {
      const cells = slots.filter(slot => slot.personaId === personaId && slot.condition === condition);
      return { personaId, condition, complete: cells.filter(slot => slot.complete).length, required: cells.length, technicalFailures: cells.filter(slot => slot.reason).length };
    })), control: { personaId: CONTROL, required: !traits, present: controlCount > 0, completed: controlCount },
    referenceControls, unmatchedSlots, expectedValidPairs, missingSlots, technicalFailures,
    powerWarning: m.seeds.length < 20 ? `조건별 seed ${m.seeds.length}개: 20개 이상을 권장한다. 실제 기회 미발생으로 유효 쌍은 더 적을 수 있다.` : null,
    note: 'maximumValidPairs는 현재 완료 쌍의 상한이다. 실제 기회 발생 여부는 measure에서 확인한다. 미시도 슬롯을 기술 실패로 세지 않는다.' };
}
function check({ runDirectory }) {
  if (typeof runDirectory !== 'string' || !runDirectory.trim()) throw new Error('runDirectory is required');
  const m = require('./personaValidationRun.cjs').readManifest(runDirectory);
  return fromManifest(m);
}
module.exports = { check, fromManifest, prepareWholeTrace };
