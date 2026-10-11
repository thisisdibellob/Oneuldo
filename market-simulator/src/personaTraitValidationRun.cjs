'use strict';
// Pure file-based evaluation. Actors, app replay and model judges are supplied externally.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { catalog, resolveProfiles } = require('./personaTraitProfiles.cjs');
const spec = require('../validation/persona-trait-validation-spec.json');
const { WHOLE_TRACE_POLICY_VERSION, WHOLE_TRACE_BUNDLE_VERSION, WHOLE_TRACE_CANDIDATE_VERSION, WHOLE_TRACE_MODEL } = require('./wholeTraceContracts.ts');
const { canonicalMarketReplayJson, marketReplayTraceId, validateMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const CONDITIONS = ['low', 'high'];
const TRAITS = ['deliberation', 'checking', 'exploration', 'persistence', 'helpSeeking'];
const LEVEL = { low: 0, medium: 1, high: 2 };
const DEFAULT_PERSONAS = ['mild-intellectual-disability-adult', 'careful-checker', 'quick-decider'];
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const digest = value => crypto.createHash('sha256').update(canonicalMarketReplayJson(value)).digest('hex');
const fileHash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const manifestAt = directory => path.join(path.resolve(directory), 'manifest.json');
const seedDirectory = (seed, index) => `${String(index + 1).padStart(4, '0')}-${digest(String(seed)).slice(0, 12)}`;
const versions = () => ({ policyVersion: WHOLE_TRACE_POLICY_VERSION, bundleVersion: WHOLE_TRACE_BUNDLE_VERSION,
  candidateVersion: WHOLE_TRACE_CANDIDATE_VERSION, model: WHOLE_TRACE_MODEL });
function write(file, value) {
  const temporary = `${file}.${crypto.randomUUID()}.partial`;
  try { fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); fs.renameSync(temporary, file); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
function validateConfiguration(args) {
  if (typeof args.runId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(args.runId)) throw new Error('Invalid runId');
  if (typeof args.outputDirectory !== 'string' || !args.outputDirectory.trim()) throw new Error('outputDirectory is required');
  if (!args.snapshotFilePaths || CONDITIONS.some(c => typeof args.snapshotFilePaths[c] !== 'string' || !args.snapshotFilePaths[c])) throw new Error('Both low and high snapshotFilePaths are required');
  if (!Array.isArray(args.seeds) || !args.seeds.length || args.seeds.some(s => !['string', 'number'].includes(typeof s)
    || !String(s).trim() || String(s).length > 200 || typeof s === 'number' && !Number.isFinite(s))
    || new Set(args.seeds.map(String)).size !== args.seeds.length) throw new Error('Provide unique finite or nonempty seeds');
  if (args.profiles !== undefined && args.personaIds !== undefined) throw new Error('Use profiles or personaIds, not both');
}
function selectionOf(args) {
  return args.profiles !== undefined ? { profiles: args.profiles } : { personaIds: args.personaIds ?? DEFAULT_PERSONAS };
}
function profileMap(selection) { return Object.fromEntries(resolveProfiles(selection).map(p => [p.id, p])); }
function assertManifest(m, directory = m?.runDirectory) {
  if (!m || m.schema !== 'oneuldo.persona-fidelity-run' || m.version !== 3 || path.resolve(directory) !== m.runDirectory) throw new Error('Invalid trait validation manifest');
  validateConfiguration({ runId: m.runId, seeds: m.seeds, outputDirectory: path.dirname(m.runDirectory),
    snapshotFilePaths: Object.fromEntries(CONDITIONS.map(c => [c, m.snapshots?.[c]?.filePath])) });
  if (m.specHash !== digest(spec) || m.specHash !== digest(read(path.join(__dirname, '../validation/persona-trait-validation-spec.json')))) throw new Error('Trait validation spec changed; create a separate run');
  if (m.catalogHash !== digest(catalog) || m.catalogHash !== digest(read(path.join(__dirname, '../validation/persona-traits.json')))) throw new Error('Trait catalog changed; create a separate run');
  if (digest(m.versions) !== digest(versions())) throw new Error('Validation generation versions changed');
  const current = profileMap(m.profileSelection);
  if (digest(Object.keys(current)) !== digest(m.personaIds) || digest(current) !== digest(m.profiles)) throw new Error('Trait profile definition changed');
  for (const [id, hash] of Object.entries(m.baseHashes))
    if (fileHash(path.join(__dirname, '../personas', `${id}.json`)) !== hash) throw new Error(`Base persona definition changed: ${id}`);
  for (const condition of CONDITIONS) {
    const snapshot = m.snapshots[condition];
    if (!snapshot || fileHash(snapshot.filePath) !== snapshot.sha256 || read(snapshot.filePath).snapshotId !== snapshot.snapshotId) throw new Error(`Snapshot file changed: ${condition}`);
  }
  if (!Array.isArray(m.slots) || m.slots.length !== m.personaIds.length * CONDITIONS.length * m.seeds.length) throw new Error('Invalid validation slot grid');
  const seen = new Set();
  for (const slot of m.slots) {
    const index = m.seeds.findIndex(seed => String(seed) === String(slot.seed));
    const key = `${slot.condition}:${index}:${slot.personaId}`;
    const expected = path.join(m.runDirectory, 'traces', slot.condition, seedDirectory(slot.seed, index), `${slot.personaId}.json`);
    if (index < 0 || !CONDITIONS.includes(slot.condition) || !m.personaIds.includes(slot.personaId) || seen.has(key)
      || slot.tracePath !== expected || slot.snapshotId !== m.snapshots[slot.condition].snapshotId
      || slot.personaVersion !== current[slot.personaId].persona.version
      || Object.entries(m.versions).some(([key, value]) => slot[key] !== value)) throw new Error('Invalid validation slot binding');
    seen.add(key);
  }
  return m;
}
function readManifest(directory) { return assertManifest(read(manifestAt(directory)), path.resolve(directory)); }
function evidencePaths(slot) {
  return { trace: slot.tracePath, snapshot: `${slot.tracePath}.snapshot.json`, actorDecisions: `${slot.tracePath}.actor-decisions.json`,
    knowledgeAudit: `${slot.tracePath}.knowledge-audit.json`, personaReview: `${slot.tracePath}.persona-review.json`,
    bundle: path.join(`${slot.tracePath}.whole-trace`, 'bundle.json') };
}
function evidenceHashes(slot) { return Object.fromEntries(Object.entries(evidencePaths(slot)).map(([key, file]) => [key, fs.existsSync(file) ? fileHash(file) : null])); }
function inventory(m) {
  assertManifest(m);
  return digest({ specHash: m.specHash, catalogHash: m.catalogHash, profiles: m.profiles, snapshots: m.snapshots,
    sources: m.slots.map(evidenceHashes) });
}
function observeSlot(slot) {
  if (!fs.existsSync(slot.tracePath)) {
    if (slot.traceId) throw new Error(`Recorded trace removed: ${slot.tracePath}`);
    slot.exists = false; return;
  }
  const trace = read(slot.tracePath), hashes = evidenceHashes(slot);
  if (slot.evidenceHashes && digest(slot.evidenceHashes) !== digest(hashes)) throw new Error(`Recorded trace evidence changed: ${slot.tracePath}`);
  if (slot.traceId && slot.traceId !== trace.traceId) throw new Error('Mixed trace identity');
  slot.exists = true; slot.traceId = trace.traceId; slot.evidenceHashes = hashes;
}
function refresh(m) {
  assertManifest(m); m.slots.forEach(observeSlot); write(manifestAt(m.runDirectory), m);
  return { validationMode: 'traits', runDirectory: m.runDirectory, manifestPath: manifestAt(m.runDirectory),
    catalog, profiles: Object.values(m.profiles).map(p => ({ id: p.id, presetId: p.presetId, traits: p.traits, contextHash: p.contextHash })),
    slots: m.slots.map(slot => ({ ...slot, prepareWholeTrace: { personaId: slot.personaId, seed: slot.seed,
      snapshotFilePath: m.snapshots[slot.condition].filePath, outputPath: slot.tracePath, attentionExperience: { visit: 'first-play' } } })),
    complete: m.slots.filter(s => s.exists).length, required: m.slots.length };
}
function prepare(args) {
  validateConfiguration(args);
  const profileSelection = selectionOf(args), profiles = profileMap(profileSelection), personaIds = Object.keys(profiles);
  const dir = path.resolve(args.outputDirectory, args.runId), file = manifestAt(dir);
  if (fs.existsSync(file)) {
    const m = readManifest(dir);
    if (digest(m.profileSelection) !== digest(profileSelection) || digest(m.seeds) !== digest(args.seeds)
      || CONDITIONS.some(c => path.resolve(args.snapshotFilePaths[c]) !== m.snapshots[c].filePath)) throw new Error('Existing run configuration differs');
    return refresh(m);
  }
  const snapshots = Object.fromEntries(CONDITIONS.map(condition => {
    const filePath = path.resolve(args.snapshotFilePaths[condition]), snapshot = read(filePath), validation = validateMarketReplaySnapshot(snapshot);
    if (!validation.valid) throw new Error(`Invalid ${condition} snapshot: ${validation.errors.join('; ')}`);
    if (snapshot.config.objectives.length !== (condition === 'low' ? 2 : 5)) throw new Error(`${condition} snapshot requires ${condition === 'low' ? 2 : 5} goals`);
    if (condition === 'high' && !snapshot.config.objectives.some(g => g.quantity > 1)) throw new Error('High snapshot requires a quantity greater than one');
    return [condition, { filePath, snapshotId: snapshot.snapshotId, sha256: fileHash(filePath) }];
  }));
  const v = versions();
  const slots = CONDITIONS.flatMap(condition => args.seeds.flatMap((seed, index) => personaIds.map(personaId => ({
    condition, seed, personaId, tracePath: path.join(dir, 'traces', condition, seedDirectory(seed, index), `${personaId}.json`),
    snapshotId: snapshots[condition].snapshotId, ...v, personaVersion: profiles[personaId].persona.version, traceId: null, exists: false,
  }))));
  const baseIds = [...new Set(Object.values(profiles).map(p => p.basePersonaId))];
  const m = { schema: 'oneuldo.persona-fidelity-run', version: 3, validationMode: 'traits', runId: args.runId, runDirectory: dir,
    snapshots, seeds: args.seeds, personaIds, profileSelection, profiles, slots, versions: v, specHash: digest(spec), catalogHash: digest(catalog),
    baseHashes: Object.fromEntries(baseIds.map(id => [id, fileHash(path.join(__dirname, '../personas', `${id}.json`))])), fixtureOnly: false };
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); write(file, m); return refresh(m);
}
function lookupValidationSlot(args, snapshot) {
  if (!args.outputPath || ['trialFile', 'learnerFile', 'tabId', 'arm', 'jobFilePath', 'generationFilePath'].some(k => args[k] !== undefined)
    || !args.attentionExperience || digest(args.attentionExperience) !== digest({ visit: 'first-play' })) throw new Error('Trait profiles require a first-play validation slot without learner or app');
  const directory = path.dirname(path.dirname(path.dirname(path.dirname(path.resolve(args.outputPath)))));
  const m = readManifest(directory), slot = m.slots.find(s => s.tracePath === path.resolve(args.outputPath));
  if (!slot || slot.personaId !== args.personaId || String(slot.seed) !== String(args.seed) || slot.snapshotId !== snapshot.snapshotId
    || fs.existsSync(slot.tracePath) || digest(snapshot) !== digest(read(m.snapshots[slot.condition].filePath))) throw new Error('Trait profile slot binding mismatch');
  return { ...slot, persona: structuredClone(m.profiles[slot.personaId].persona), validationRunDirectory: directory };
}
function load(m, { allowFixture = false } = {}) {
  assertManifest(m);
  const { extractUniversal } = require('./personaValidationMetrics.cjs'), { flagsForTrace } = require('./personaValidationFlags.cjs');
  const samples = [], missing = [];
  for (const slot of m.slots) {
    if (!fs.existsSync(slot.tracePath)) { if (slot.traceId) throw new Error('Recorded trace removed'); missing.push(slot); continue; }
    const paths = evidencePaths(slot), trace = read(slot.tracePath), snapshot = read(m.snapshots[slot.condition].filePath);
    const profile = m.profiles[slot.personaId], persona = profile.persona, fixture = trace.generationPolicy === 'stochastic';
    if (fixture && !allowFixture) throw new Error('Stochastic trace cannot be validation evidence');
    if (trace.personaId !== slot.personaId || String(trace.seed) !== String(slot.seed) || trace.personaVersion !== persona.version
      || trace.target?.snapshotId !== slot.snapshotId || slot.traceId && trace.traceId !== slot.traceId) throw new Error('Mixed trace identity or persona version');
    const audit = fs.existsSync(paths.knowledgeAudit) ? read(paths.knowledgeAudit) : null;
    const actorDecisions = fs.existsSync(paths.actorDecisions) ? read(paths.actorDecisions) : null;
    const personaReview = fs.existsSync(paths.personaReview) ? read(paths.personaReview) : null;
    if (!fixture) {
      const bundle = fs.existsSync(paths.bundle) ? read(paths.bundle) : null;
      if (trace.experienceMode !== 'first-play' || trace.generationPolicy !== 'llm'
        || trace.generation?.actorPolicyVersion !== m.versions.policyVersion || trace.generation?.model !== m.versions.model
        || trace.generation?.learnerIdentity || trace.generation?.trialBinding) throw new Error('Mixed policy/model/experience');
      if (!audit || !bundle || audit.candidateVersion !== m.versions.candidateVersion || bundle.bundleVersion !== m.versions.bundleVersion
        || trace.traceId !== marketReplayTraceId(trace) || audit.traceId !== trace.traceId || audit.requestId !== bundle.requestId || audit.inputHash !== bundle.inputHash
        || audit.policyVersion !== m.versions.policyVersion || bundle.policyVersion !== m.versions.policyVersion || bundle.model !== m.versions.model
        || bundle.snapshotId !== slot.snapshotId || bundle.persona?.id !== slot.personaId || bundle.persona?.version !== persona.version
        || String(bundle.seed) !== String(slot.seed)) throw new Error('Mixed or altered whole-trace evidence');
      if (!fs.existsSync(paths.snapshot) || digest(read(paths.snapshot)) !== digest(snapshot)) throw new Error('Mixed saved snapshot');
      if (bundle.persona?.behavior?.source?.promptHash !== crypto.createHash('sha256').update(persona.prompt).digest('hex')) throw new Error('Mixed persona prompt');
      if (personaReview && (personaReview.traceId !== trace.traceId || personaReview.requestId !== bundle.requestId || personaReview.knowledgeAuditHash !== digest(audit))) throw new Error('Mixed persona review');
      if (actorDecisions && !Array.isArray(actorDecisions) && actorDecisions.traceId && actorDecisions.traceId !== trace.traceId) throw new Error('Mixed actor decisions');
    }
    observeSlot(slot);
    const evidenceAudit = audit ?? (actorDecisions ? { decisions: Array.isArray(actorDecisions) ? actorDecisions : actorDecisions.decisions ?? [] } : null);
    const evidence = { actorDecisions, personaReview };
    const extracted = extractUniversal(trace, snapshot, persona, evidenceAudit, evidence);
    samples.push({ ...slot, trace, snapshot, persona, profile, audit: evidenceAudit, actorDecisions, personaReview, ...extracted,
      flags: flagsForTrace(trace, snapshot, evidenceAudit, persona, evidence, spec.patterns), fixture,
      evidenceSources: Object.fromEntries(Object.entries(paths).filter(([, file]) => fs.existsSync(file))) });
  }
  if (new Set(samples.map(s => s.fixture)).size > 1) throw new Error('Fixture and whole-trace samples cannot be mixed');
  return { samples, missing };
}
/** A contrast isolates one configured trait. Preset groups remain descriptive. */
function matchedContrasts(profiles) {
  const contrasts = [], rows = Object.values(profiles);
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i], b = rows[j];
    const changed = TRAITS.filter(key => a.traits[key] !== b.traits[key]);
    if (a.contextHash !== b.contextHash || changed.length !== 1) continue;
    const traitKey = changed[0], [higher, lower] = LEVEL[a.traits[traitKey]] > LEVEL[b.traits[traitKey]] ? [a, b] : [b, a];
    contrasts.push({ id: `${traitKey}:${higher.id}:${lower.id}`, traitKey, higherProfileId: higher.id, lowerProfileId: lower.id,
      higherLevel: higher.traits[traitKey], lowerLevel: lower.traits[traitKey], contextHash: a.contextHash });
  }
  return contrasts;
}
function summarizeFlags(samples, ids) {
  const { collectionDiagnostics, collectionFindings } = require('./personaValidationFlags.cjs');
  const prohibited = new Set(['same-wrong-choice-after-feedback', 'role-or-disability-mentioned']);
  return Object.fromEntries(ids.map(id => {
    const rows = samples.filter(s => s.personaId === id), flagged = rows.filter(s => s.flags.length);
    const diagnostics = collectionDiagnostics(rows), findings = collectionFindings(rows, spec.patterns);
    // Help use, accuracy and equal counts require interpretation, not a personality penalty.
    const violationRows = rows.filter(s => s.flags.some(f => prohibited.has(f.code)));
    const reviewSignals = rows.flatMap(s => s.flags.filter(f => !prohibited.has(f.code)).map(f => ({ ...f, tracePath: s.tracePath })));
    const unavailable = diagnostics.some(d => d.errorCount === null || d.interestCount === null);
    return [id, { traces: rows.length, flaggedTraces: flagged.length, flagRate: rows.length ? flagged.length / rows.length : null,
      scope: 'prohibited-patterns', violationTraces: violationRows.length,
      violationRate: rows.length ? violationRows.length / rows.length : null,
      status: !rows.length ? 'insufficient' : violationRows.length / rows.length > (spec.maxFlaggedTraceRate ?? .1) ? 'fail' : unavailable ? 'inconclusive' : 'pass',
      diagnosticWarnings: findings, reviewSignals, collectionViolations: [], collectionDiagnostics: diagnostics,
      evidence: rows.flatMap(s => s.flags.map(f => ({ ...f, tracePath: s.tracePath }))) }];
  }));
}
function measure({ runDirectory, allowFixture = false }) {
  const m = readManifest(runDirectory), { samples, missing } = load(m, { allowFixture });
  const { cliffsDelta, bootstrap, judge } = require('./personaValidationStatistics.cjs');
  const contrasts = matchedContrasts(m.profiles), findings = [];
  const byKey = new Map(samples.map(s => [`${s.condition}:${String(s.seed)}:${s.personaId}`, s]));
  for (const contrast of contrasts) for (const metric of spec.metrics.filter(rule => rule.traitKey === contrast.traitKey)) for (const condition of CONDITIONS) {
    if (metric.applies !== 'both' && metric.applies !== condition) continue;
    const pairs = [], evidence = []; let missingPairs = 0, unexercised = 0;
    for (const seed of m.seeds) {
      const high = byKey.get(`${condition}:${String(seed)}:${contrast.higherProfileId}`), low = byKey.get(`${condition}:${String(seed)}:${contrast.lowerProfileId}`);
      if (!high || !low) { missingPairs++; continue; }
      const a = high.metrics[metric.kind], b = low.metrics[metric.kind];
      if (a?.status !== 'measured' || b?.status !== 'measured') { unexercised++; continue; }
      pairs.push([a.value, b.value]);
      evidence.push({ seed, higher: { tracePath: high.tracePath, ...a }, lower: { tracePath: low.tracePath, ...b } });
    }
    const delta = cliffsDelta(pairs.map(p => p[0]), pairs.map(p => p[1]));
    const interval = bootstrap(pairs, `${m.runId}:${contrast.id}:${metric.id}:${condition}`, spec.bootstrapReplicates);
    const status = !pairs.length && !missingPairs && unexercised ? 'unexercised'
      : judge(delta, interval, metric.expectedDirection, spec.minAbsDelta, pairs.length, spec.minValidPairs);
    findings.push({ ...contrast, metricId: metric.id, kind: metric.kind, condition, pairs: pairs.length, missingPairs, unexercised,
      delta, interval, status, estimator: 'two-sample-cliffs-delta', intervalMethod: 'matched-pair-bootstrap',
      evidenceType: metric.evidenceType, evidence });
  }
  const groups = TRAITS.flatMap(traitKey => Object.keys(LEVEL).flatMap(level => CONDITIONS.map(condition => {
    const rows = samples.filter(s => s.condition === condition && s.profile.traits[traitKey] === level);
    const kinds = [...new Set(spec.metrics.filter(metric => metric.traitKey === traitKey).map(metric => metric.kind))];
    return { traitKey, level, condition, traces: rows.length, personaIds: [...new Set(rows.map(s => s.personaId))], descriptiveOnly: true,
      metrics: Object.fromEntries(kinds.map(kind => {
        const observed = rows.map(s => s.metrics[kind]).filter(metric => metric?.status === 'measured');
        return [kind, { n: observed.length, unexercised: rows.length - observed.length,
          mean: observed.length ? observed.reduce((n, metric) => n + metric.value, 0) / observed.length : null,
          opportunities: observed.reduce((n, metric) => n + metric.denominator, 0) }];
      })) };
  })));
  const result = { schema: 'oneuldo.persona-trait-measurements', version: 1, runId: m.runId, specHash: m.specHash, catalogHash: m.catalogHash,
    dataFingerprint: inventory(m), fixtureOnly: samples.some(s => s.fixture), completed: samples.length, missing: missing.length,
    contrasts, findings, groups, flags: summarizeFlags(samples, m.personaIds),
    unmatchedTraits: TRAITS.filter(key => !contrasts.some(c => c.traitKey === key)),
    perTrace: samples.map(s => ({ personaId: s.personaId, presetId: s.profile.presetId, traits: s.profile.traits, condition: s.condition,
      seed: s.seed, tracePath: s.tracePath, metrics: s.metrics, outcome: s.outcome, coverage: s.coverage,
      terminationReview: s.terminationReview, evidenceSources: s.evidenceSources })),
    missingSlots: missing.map(s => ({ personaId: s.personaId, condition: s.condition, seed: s.seed, tracePath: s.tracePath })) };
  m.fixtureOnly = result.fixtureOnly; write(manifestAt(m.runDirectory), m);
  const measurementsPath = path.join(m.runDirectory, 'measurements.json'); write(measurementsPath, result);
  return { validationMode: 'traits', measurementsPath, completed: result.completed, missing: result.missing,
    comparisons: contrasts.length, unmatchedTraits: result.unmatchedTraits, fixtureOnly: result.fixtureOnly };
}
function readBlind(m) {
  const saved = read(path.join(m.runDirectory, 'blind-state.json'));
  if (saved.dataFingerprint !== inventory(m)) throw new Error('Blind sample set changed; use a separate run');
  for (const [file, hash] of Object.entries(saved.hashes)) if (fileHash(path.join(m.runDirectory, file)) !== hash) throw new Error('Blind evidence changed');
  return saved;
}
function prepareBlind({ runDirectory, allowFixture = false, panel = 'A' }) {
  const m = readManifest(runDirectory), reviewFile = path.join(m.runDirectory, 'blind-review.json');
  if (!['A', 'B'].includes(panel)) throw new Error('Expected blind panel A or B');
  if (panel === 'B' && (!fs.existsSync(reviewFile) || !read(reviewFile).scores?.A)) throw new Error('Score panel A before requesting panel B');
  const statePath = path.join(m.runDirectory, 'blind-state.json'); let state;
  if (fs.existsSync(statePath)) state = readBlind(m);
  else {
    const { samples } = load(m, { allowFixture }); if (!samples.length) throw new Error('No saved traces for blind review');
    const built = require('./personaValidationBlind.cjs').buildTraits(samples, Object.values(m.profiles), catalog);
    const files = { 'blind-bundle.json': built.bundle, 'blind-key.json': built.key,
      'blind-rubric.json': { traitRubric: built.traitRubric, publicStyles: built.publicStyles } };
    for (const [file, value] of Object.entries(files)) write(path.join(m.runDirectory, file), value);
    state = { dataFingerprint: inventory(m), fixtureOnly: samples.some(s => s.fixture),
      hashes: Object.fromEntries(Object.keys(files).map(file => [file, fileHash(path.join(m.runDirectory, file))])) };
    write(statePath, state); write(manifestAt(m.runDirectory), m);
  }
  if (state.fixtureOnly && !allowFixture) throw new Error('Stochastic trace cannot be validation evidence');
  const bundle = { panels: { [panel]: read(path.join(m.runDirectory, 'blind-bundle.json')).panels[panel] } };
  require('./personaValidationBlind.cjs').assertAnonymous(bundle, Object.values(m.profiles));
  const bundlePath = path.join(m.runDirectory, `blind-${panel}.json`); write(bundlePath, bundle);
  return { validationMode: 'traits', panel, bundlePath, bundle, ...read(path.join(m.runDirectory, 'blind-rubric.json')),
    answerFormat: { traits: Object.fromEntries(TRAITS.map(key => [key, 'low|medium|high|unknown'])), confidence: 'optional 0..1' }, fixtureOnly: state.fixtureOnly };
}
function submitBlind({ runDirectory, panel, answers, reviewerModel, reviewerSession }) {
  const m = readManifest(runDirectory), state = readBlind(m), file = path.join(m.runDirectory, 'blind-review.json');
  const previous = fs.existsSync(file) ? read(file) : null;
  if (!['A', 'B'].includes(panel)) throw new Error('Submit panel A or B');
  if (panel === 'B' && !previous?.scores?.A) throw new Error('Panel A must be scored before panel B');
  if (![reviewerModel, reviewerSession].every(value => typeof value === 'string' && value.trim())) throw new Error('Self-reported reviewer model and session are required');
  if (previous && (previous.reviewerModel !== reviewerModel || previous.reviewerSession !== reviewerSession)) throw new Error('Reviewer label changed');
  if (previous?.answers?.[panel]) {
    if (digest(previous.answers[panel]) !== digest(answers)) throw new Error('Scored answers are frozen');
    return { reviewPath: file, panel, score: previous.scores[panel], independenceVerified: false, keyIsolationVerified: false };
  }
  const rows = read(path.join(m.runDirectory, 'blind-key.json')).filter(row => row.version === panel);
  const score = require('./personaValidationStatistics.cjs').scoreTraitReview(rows, answers, { traitKeys: TRAITS });
  write(file, { reviewerModel, reviewerSession, dataFingerprint: state.dataFingerprint, fixtureOnly: state.fixtureOnly,
    independenceVerified: false, keyIsolationVerified: false, scores: { ...previous?.scores, [panel]: score }, answers: { ...previous?.answers, [panel]: answers } });
  return { reviewPath: file, panel, score, independenceVerified: false, keyIsolationVerified: false };
}
function summarizeTraitFindings(findings) {
  const summarize = rows => {
    const exercised = rows.filter(f => f.status !== 'unexercised');
    const status = !rows.length ? 'unmatched' : !exercised.length ? 'unexercised'
      : rows.some(f => f.status === 'insufficient') ? 'insufficient'
      : rows.some(f => f.status === 'unexercised') ? 'partial'
      : rows.every(f => f.status === 'pass') ? 'supported'
      : rows.every(f => f.status === 'fail') ? 'contradicted' : 'inconclusive';
    return { status, expectedComparisons: rows.length, exercisedComparisons: exercised.length, findings: rows };
  };
  const behavioralEvidence = summarize(findings.filter(f => f.evidenceType !== 'authored-timing'));
  const authoredTiming = summarize(findings.filter(f => f.evidenceType === 'authored-timing'));
  return { status: behavioralEvidence.status, primaryEvidence: 'behavioralEvidence', behavioralEvidence,
    authoredTiming: { ...authoredTiming, note: '작성된 지연시간은 행동 근거의 부족을 보충하거나 성향 판정을 통과시키지 않는다.' }, findings };
}
function report({ runDirectory }) {
  const m = readManifest(runDirectory), measurements = read(path.join(m.runDirectory, 'measurements.json'));
  if (measurements.dataFingerprint !== inventory(m)) throw new Error('Measurements are stale; call measure_persona_validation again');
  const file = path.join(m.runDirectory, 'blind-review.json'), review = fs.existsSync(file) ? read(file) : null;
  if (review && review.dataFingerprint !== readBlind(m).dataFingerprint) throw new Error('Blind review does not match measurements');
  const traitResults = Object.fromEntries(TRAITS.map(key =>
    [key, summarizeTraitFindings(measurements.findings.filter(f => f.traitKey === key))]));
  const output = { schema: 'oneuldo.persona-trait-report', version: 1, runId: m.runId, validationMode: 'traits', fixtureOnly: measurements.fixtureOnly,
    completed: measurements.completed, required: m.slots.length, specHash: m.specHash, catalogHash: m.catalogHash, dataFingerprint: measurements.dataFingerprint,
    profiles: Object.values(m.profiles).map(p => ({ id: p.id, basePersonaId: p.basePersonaId, presetId: p.presetId, traits: p.traits, contextHash: p.contextHash })),
    axes: {
      technical: { savedValidTraces: measurements.completed, missingSlots: measurements.missing,
        note: 'Missing slots include unattempted or failed requests; saved trace validity does not imply task success or actual app execution.' },
      taskOutcomes: measurements.perTrace.map(s => ({ personaId: s.personaId, condition: s.condition, seed: s.seed, tracePath: s.tracePath, ...s.outcome, terminationReview: s.terminationReview })),
      traitExpression: traitResults,
      coverage: measurements.perTrace.map(s => ({ personaId: s.personaId, condition: s.condition, seed: s.seed, ...s.coverage })),
    },
    groups: measurements.groups, flags: measurements.flags, blindReview: review?.scores ?? null,
    blindReviewer: { model: review?.reviewerModel ?? null, session: review?.reviewerSession ?? null, independenceVerified: false, keyIsolationVerified: false },
    limitations: [
      '성향 수준과 유형은 합성 설계값이며 심리검사 점수나 임상적 타당성을 의미하지 않는다.',
      '성향 비교는 인지·취향·경험 문맥과 나머지 네 성향이 같은 프로필 쌍만 사용한다. 유형별 집계는 설명적 결과다.',
      '같은 조건·seed는 실험 묶음이며 native 모델 출력의 결정적 재현을 보장하지 않는다. 유효 쌍 수는 생성 슬롯 수와 다르다.',
      '기회에 도달하지 못한 표본은 조건부 비교에서 제외되므로 도달 기회·중단·전체 목표 달성도 함께 읽어야 한다.',
      '관심·불확실성 의도는 일부 배우 선언을 사용한다. 대기시간은 계획한 값이며 사람의 반응시간이 아니다.',
      '성향 판정은 행동 근거만 사용한다. 작성된 시간은 별도로 보고하며 일부 비교에서 기회가 없으면 partial로 남긴다.',
      '효과 크기는 두 집단의 Cliff’s delta이며 신뢰구간만 조건·seed 쌍을 함께 재표집한다. 수준 간 간격과 0.33 기준은 실측으로 보정하지 않은 설계값이다.',
      'A/B는 같은 표본이며 독립 반복이 아니다. 판별자 독립성과 정답 키 미열람은 자기 신고이고, unknown은 정답으로 세지 않는다.',
      '계획 검증은 실제 앱 재생이나 실제 사람의 행동 검증을 수행하지 않는다. 미발생·자료 부족은 통과가 아니다.',
    ] };
  const reportPath = path.join(m.runDirectory, 'report.json'), markdownPath = path.join(m.runDirectory, 'report.ko.md');
  write(reportPath, output);
  const lines = ['# 공통 성향 검증 보고서', '', `Run: ${m.runId}. 저장 trace ${output.completed}/${output.required}.`,
    output.fixtureOnly ? '테스트 fixture 파이프라인 확인용이며 페르소나 검증 결과가 아님.' : 'whole-trace-v3 계획 표본.', '',
    '## 과업 결과와 종료', '', '| 인물 | 조건 | 목표 충족 | 시도 | 종료 | 종료 검토 |', '| --- | --- | ---: | ---: | --- | --- |',
    ...output.axes.taskOutcomes.map(s => `| ${s.personaId} | ${s.condition} | ${s.completedGoalCount}/${s.goalCount} | ${s.attemptedGoalCount}/${s.goalCount} | ${s.ending} | ${s.terminationReview?.status ?? 'unknown'} |`),
    '', '## 공통 성향', '', ...Object.entries(traitResults).map(([key, result]) => `- ${key}: ${result.status}; 행동 비교 관찰 ${result.behavioralEvidence.exercisedComparisons}/${result.behavioralEvidence.expectedComparisons}건; 작성 시간 ${result.authoredTiming.status} (성향 판정 제외)`),
    '', '| 성향 | 높은 프로필 / 낮은 프로필 | 지표 | 근거 | 조건 | 유효 쌍 | 미발생 | 누락 | 효과 크기 | 95% 구간 | 판정 |',
    '| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |',
    ...measurements.findings.map(f => `| ${f.traitKey} | ${f.higherProfileId} (${f.higherLevel}) / ${f.lowerProfileId} (${f.lowerLevel}) | ${f.kind} | ${f.evidenceType} | ${f.condition} | ${f.pairs} | ${f.unexercised} | ${f.missingPairs} | ${f.delta ?? '—'} | ${f.interval?.join(' ~ ') ?? '—'} | ${f.status} |`),
    '', '## 과장 패턴과 진단 경고', '', ...Object.entries(output.flags).map(([id, f]) => `- ${id}: 금지 패턴 ${f.status}, 위반 ${f.violationTraces}/${f.traces}, 검토 신호 ${f.reviewSignals.length}건, 분포 진단 ${f.diagnosticWarnings.length}건. 도움·낮은 정확도·분산 0은 자동 실패가 아니다.`),
    '', '## 블라인드 성향 추정', '', '개인 이름 대신 다섯 성향의 수준을 추정한다. unknown을 포함한 정확도와 판별 비율을 함께 보고한다.',
    '', '```json', JSON.stringify(output.blindReview, null, 2), '```', '', '## 해석 범위', '', ...output.limitations.map(x => `- ${x}`),
    '', '분자·분모·관찰 기회·step ID·프로필별 설명적 집계는 measurements.json 및 report.json에 저장되어 있다.', ''];
  fs.writeFileSync(markdownPath, lines.join('\n'), { mode: 0o600 });
  return { validationMode: 'traits', reportPath, markdownPath, completed: output.completed, required: output.required, fixtureOnly: output.fixtureOnly };
}
module.exports = { prepare, refresh, readManifest, lookupValidationSlot, load, measure, prepareBlind, submitBlind, report, matchedContrasts, summarizeTraitFindings, summarizeFlags };
