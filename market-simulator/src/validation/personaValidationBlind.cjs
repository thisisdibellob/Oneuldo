'use strict';
const crypto = require('node:crypto');
const { scoreReview } = require('./personaValidationStatistics.cjs');
const { actorEvents } = require('./personaValidationMetrics.cjs');
const IDS = ['mild-intellectual-disability-adult', 'careful-checker', 'quick-decider', 'neutral-adult-control'];
const TYPES = new Set(['start', 'viewCart', 'viewHelp', 'closeView', 'closeStation', 'submitForReview',
  'awaitReviewAccepted', 'giveUp', 'skipRating', 'leave', 'walkTo', 'walkToAnchor', 'readList', 'pause',
  'lookAround', 'openShelf', 'browse', 'dragProduct', 'removeProduct', 'talkToStaff', 'checkout']);

function copyText(source, target, key) {
  if (source[key] === undefined) return;
  if (typeof source[key] !== 'string') throw new Error(`Invalid blind action ${key}`);
  target[key] = source[key];
}
function copyNumber(source, target, key) {
  if (source[key] === undefined) return;
  if (!Number.isFinite(source[key])) throw new Error(`Invalid blind action ${key}`);
  target[key] = source[key];
}

/** Allowlist at every level: no replay IDs, movement/gesture settings, audit
 * annotations, durations, task state, versions, paths or arbitrary nested data.
 * The array carries order; reactionDelayMs is the actor's pre-action wait. */
function sanitize(trace, version, audit = null) {
  if (!['A', 'B'].includes(version)) throw new Error('Expected blind panel A or B');
  return { steps: actorEvents(trace, audit).map(step => {
    if (!TYPES.has(step.type)) throw new Error('Unsupported blind action type');
    const row = { type: step.type };
    if (step.target !== undefined) {
      if (!step.target || typeof step.target !== 'object' || Array.isArray(step.target)) throw new Error('Invalid blind action target');
      const target = {};
      for (const key of ['stationId', 'anchorId']) copyText(step.target, target, key);
      if (Object.keys(target).length) row.target = target;
    }
    for (const key of ['stationId', 'checkoutId', 'productId', 'choice']) copyText(step, row, key);
    for (const key of ['quantity', 'scrollFraction', 'reactionDelayMs']) copyNumber(step, row, key);
    if (version === 'B') copyText(step, row, 'reason');
    return row;
  }) };
}

function assertAnonymous(bundle, profiles = []) {
  const serialized = JSON.stringify(bundle).normalize('NFC').toLowerCase();
  const tokens = new Set([...IDS, '지민', '서연', '민수', ...profiles.flatMap(profile => [profile.id,
    profile.basePersonaId, profile.character?.name, profile.persona?.id, profile.persona?.character?.name])].filter(Boolean));
  for (const token of tokens) {
    const normalized = String(token).normalize('NFC').toLowerCase();
    // Short custom IDs are legal. Searching serialized JSON for "a" or "1"
    // would match schema keys, panel A and numeric quantities. Inspect actual
    // string tokens instead, excluding only the fixed A/B panel discriminant.
    const shortCustomId = !IDS.includes(token) && !['지민', '서연', '민수'].includes(token) && normalized.length < 4;
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const boundary = new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}($|[^\\p{L}\\p{N}_])`, 'u');
    const hasShortIdentity = (value, key = '') => typeof value === 'string'
      ? !(key === 'version' && ['A', 'B'].includes(value)) && boundary.test(value.normalize('NFC').toLowerCase())
      : Boolean(value && typeof value === 'object' && Object.entries(value).some(([key, child]) => hasShortIdentity(child, key)));
    if (shortCustomId ? hasShortIdentity(bundle) : serialized.includes(normalized)) {
      throw new Error(`Blind trace bundle leaked identity: ${token}`);
    }
  }
  // Paths can also occur in free text reasons, not only metadata fields. Inspect
  // actual strings as well as the serialized identity scan so JSON escaping does
  // not hide Windows/UNC paths, and do not assume one operating-system home path.
  const hasPath = value => typeof value === 'string'
    ? /(?:file:\/\/|(?:^|[\s"'(])(?:\/[^\s"'<>]+|[a-z]:[\\/]|\\\\))/i.test(value)
    : Boolean(value && typeof value === 'object' && Object.values(value).some(hasPath));
  if (hasPath(bundle)) {
    throw new Error('Blind trace bundle leaked a file path');
  }
}

function shuffle(rows) {
  for (let i = rows.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }
  return rows;
}

function build(samples, profiles) {
  const panels = { A: [], B: [] }, key = [], opaqueIds = new Set();
  for (const version of ['A', 'B']) {
    for (const sample of samples) {
      if (!IDS.includes(sample.personaId)) throw new Error('Unknown persona in blind sample');
      let opaqueId;
      do { opaqueId = crypto.randomUUID(); } while (opaqueIds.has(opaqueId));
      opaqueIds.add(opaqueId);
      panels[version].push({ opaqueId, version, trace: sanitize(sample.trace, version, sample.audit) });
      key.push({ opaqueId, version, personaId: sample.personaId, tracePath: sample.tracePath });
    }
    shuffle(panels[version]);
  }
  // Public class descriptions intentionally identify classes. They are separate
  // from the anonymous bundle so its WHOLE serialization is scanned, with no exemptions.
  const publicProfiles = profiles.map(profile => ({ id: profile.id, description: profile.description,
    preferences: profile.character?.preferences, strengths: profile.character?.strengths,
    selectedTraits: profile.character?.selectedTraits }));
  const bundle = { panels };
  assertAnonymous(bundle, profiles);
  return { bundle, publicProfiles, key };
}

/** Universal review: disclose the common rubric, never a person's configured
 * levels or profile-to-style mapping. A and B have unrelated shuffled IDs. */
function buildTraits(samples, profiles, catalog) {
  const levels = catalog?.levels;
  if (!Array.isArray(catalog?.traits) || !catalog.traits.length || !Array.isArray(catalog.presets)
    || !Array.isArray(levels) || !levels.length || new Set(levels).size !== levels.length
    || levels.some(level => typeof level !== 'string' || !level || level === 'unknown')) {
    throw new Error('Trait blind review requires a common trait catalog');
  }
  const traitRubric = catalog.traits.map(trait => {
    if (!trait || typeof trait.key !== 'string' || !trait.key || typeof trait.label !== 'string'
      || typeof trait.description !== 'string' || !trait.levels
      || levels.some(level => typeof trait.levels[level] !== 'string')) throw new Error('Invalid common trait rubric');
    return { key: trait.key, label: trait.label, description: trait.description,
      levels: Object.fromEntries(levels.map(level => [level, trait.levels[level]])),
      ...(catalog.schemaVersion === 'persona-traits-v2' && typeof trait.observationCriteria === 'string'
        ? { observationCriteria: trait.observationCriteria } : {}) };
  });
  const traitKeys = traitRubric.map(trait => trait.key);
  if (new Set(traitKeys).size !== traitKeys.length) throw new Error('Duplicate common trait key');
  const publicStyles = catalog.presets.map(preset => {
    if (!preset || typeof preset.id !== 'string' || !preset.id || typeof preset.label !== 'string'
      || typeof preset.description !== 'string') throw new Error('Invalid common style description');
    return { id: preset.id, label: preset.label, description: preset.description };
  });
  if (new Set(publicStyles.map(style => style.id)).size !== publicStyles.length) throw new Error('Duplicate common style ID');
  if (!Array.isArray(samples) || !Array.isArray(profiles)) throw new Error('Trait blind review requires samples and profiles');
  const byId = new Map(), baselines = new Set();
  for (const profile of profiles) {
    // A trait-omitted baseline has no levels to infer; its traces stay out of panels and the answer key.
    if (profile?.traits === null && profile.persona?.traitProfile?.traitMode === 'omitted' && !baselines.has(profile.id)) { baselines.add(profile.id); continue; }
    const profileSchemaVersion = profile?.persona?.traitProfile?.schemaVersion ?? profile?.definition?.schemaVersion ?? profile?.schemaVersion;
    if (profileSchemaVersion !== undefined && profileSchemaVersion !== catalog.schemaVersion) throw new Error('Trait review profile schemaVersion must match the catalog');
    if (!profile || typeof profile.id !== 'string' || !profile.id || byId.has(profile.id)
      || !profile.traits || typeof profile.traits !== 'object' || Array.isArray(profile.traits)
      || Object.keys(profile.traits).length !== traitKeys.length
      || traitKeys.some(key => !Object.hasOwn(profile.traits, key) || !levels.includes(profile.traits[key]))) {
      throw new Error('Invalid or duplicate trait review profile');
    }
    byId.set(profile.id, profile);
  }
  const panels = { A: [], B: [] }, key = [], opaqueIds = new Set();
  const reviewed = samples.filter(sample => !baselines.has(sample?.personaId));
  for (const version of ['A', 'B']) {
    for (const sample of reviewed) {
      const profile = byId.get(sample?.personaId);
      if (!profile) throw new Error('Unknown profile in trait blind sample');
      let opaqueId;
      do { opaqueId = crypto.randomUUID(); } while (opaqueIds.has(opaqueId));
      opaqueIds.add(opaqueId);
      panels[version].push({ opaqueId, version, trace: sanitize(sample.trace, version, sample.audit) });
      key.push({ opaqueId, version, traits: Object.fromEntries(traitKeys.map(traitKey => [traitKey, profile.traits[traitKey]])),
        ...(profile.presetId ? { styleId: profile.presetId } : {}), personaId: profile.id, tracePath: sample.tracePath });
    }
    shuffle(panels[version]);
  }
  const bundle = { panels };
  assertAnonymous(bundle, profiles);
  return { bundle, traitRubric, publicStyles, key, excludedBaselineTraces: samples.length - reviewed.length };
}

function grade(key, answers) {
  const allIds = new Set(key.map(row => row.opaqueId));
  if (Object.keys(answers).some(id => !allIds.has(id))) throw new Error('Unexpected answer ID for this blind review');
  return Object.fromEntries(['A', 'B'].map(version => {
    const rows = key.filter(row => row.version === version);
    const panelAnswers = Object.fromEntries(rows.filter(row => Object.hasOwn(answers, row.opaqueId))
      .map(row => [row.opaqueId, answers[row.opaqueId]]));
    return [version, scoreReview(rows, panelAnswers, IDS)];
  }));
}

/** Nominal agreement concerns raters' labels, not their accuracy against a key.
 * Unknown is an explicit category; shared abstention is not trait evidence. */
function categoricalAgreement(ratings) {
  if (!Array.isArray(ratings) || ratings.some(row => !Array.isArray(row))) throw new Error('Agreement requires a rating matrix');
  const n = ratings.length, reviewers = ratings[0]?.length ?? 0;
  if (ratings.some(row => row.length !== reviewers || row.some(label => typeof label !== 'string' || !label))) {
    throw new Error('Agreement requires equally sized categorical rating rows');
  }
  const method = reviewers === 2 ? 'cohen-kappa' : reviewers > 2 ? 'fleiss-kappa' : null;
  const base = { method, n, reviewers, kappa: null, observedAgreement: null, expectedAgreement: null,
    descriptiveOnly: true, unknownTreatment: 'separate-category' };
  if (reviewers < 2 || n < 2) return { ...base, status: 'insufficient', reason: 'At least two reviewers and two common items are required' };
  const categories = [...new Set(ratings.flat())], counts = categories.map(label => ratings.map(row => row.filter(value => value === label).length));
  const observedAgreement = reviewers === 2
    ? ratings.filter(row => row[0] === row[1]).length / n
    : counts.reduce((sum, rows) => sum + rows.reduce((total, count) => total + count * (count - 1), 0), 0) / (n * reviewers * (reviewers - 1));
  const expectedAgreement = reviewers === 2
    ? categories.reduce((sum, label) => sum + ratings.filter(row => row[0] === label).length * ratings.filter(row => row[1] === label).length / (n * n), 0)
    : counts.reduce((sum, rows) => sum + (rows.reduce((total, count) => total + count, 0) / (n * reviewers)) ** 2, 0);
  if (Math.abs(1 - expectedAgreement) < 1e-12) return { ...base, observedAgreement, expectedAgreement, status: 'undefined', reason: 'No category variation; chance agreement is one' };
  return { ...base, observedAgreement, expectedAgreement, kappa: (observedAgreement - expectedAgreement) / (1 - expectedAgreement), status: 'available', reason: null };
}

function reviewerAgreement(reviews, { validationMode = 'legacy', traitKeys = [] } = {}) {
  return Object.fromEntries(['A', 'B'].map(panel => {
    const selected = reviews.filter(review => review.scores?.[panel] && review.answers?.[panel]);
    const allIds = [...new Set(selected.flatMap(review => Object.keys(review.answers[panel])))];
    const ids = allIds.filter(id => selected.every(review => Object.hasOwn(review.answers[panel], id)));
    const common = { reviewerIds: selected.map(review => review.reviewerId), reviewers: selected.length,
      commonItems: ids.length, excludedItems: allIds.length - ids.length, descriptiveOnly: true };
    const agreement = pick => ({ ...categoricalAgreement(ids.map(id => selected.map(review => pick(review.answers[panel][id])))),
      ...common, reviewers: selected.length });
    if (validationMode === 'traits') return [panel, { ...common, perTrait: Object.fromEntries(traitKeys.map(traitKey =>
      [traitKey, agreement(answer => answer.traits[traitKey])])) }];
    return [panel, { ...common, persona: agreement(answer => typeof answer === 'string' ? answer : answer.personaId) }];
  }));
}

module.exports = { IDS, sanitize, assertAnonymous, build, buildTraits, grade, categoricalAgreement, reviewerAgreement };
