'use strict';
// Named reviewers use an additive sidecar; old single-reviewer files stay readable.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { IDS, reviewerAgreement } = require('./personaValidationBlind.cjs');
const { scoreReview, scoreTraitReview } = require('./personaValidationStatistics.cjs');
const DEFAULT_REVIEWER_ID = 'legacy-single-reviewer';
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
function write(file, value) {
  const temporary = `${file}.${crypto.randomUUID()}.partial`;
  try { fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); fs.renameSync(temporary, file); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
function identity({ reviewerId, reviewerKind, reviewerModel, reviewerSession }, submission = false) {
  if (reviewerId === undefined) {
    if (reviewerKind !== undefined) throw new Error('reviewerKind requires an explicit reviewerId');
    reviewerId = DEFAULT_REVIEWER_ID; reviewerKind = 'llm';
  } else if (typeof reviewerId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(reviewerId) || reviewerId === DEFAULT_REVIEWER_ID) {
    throw new Error('Invalid or reserved reviewerId');
  }
  if ((submission || reviewerKind !== undefined) && !['llm', 'expert'].includes(reviewerKind)) throw new Error('reviewerKind must be llm or expert');
  if (submission) {
    if (typeof reviewerSession !== 'string' || !reviewerSession.trim()
      || reviewerKind === 'llm' && (typeof reviewerModel !== 'string' || !reviewerModel.trim())
      || reviewerModel !== undefined && (typeof reviewerModel !== 'string' || !reviewerModel.trim())) {
      throw new Error('Self-reported reviewer model and session are required for llm; expert requires a session label');
    }
  }
  return { reviewerId, reviewerKind, reviewerModel: reviewerModel ?? null, reviewerSession: reviewerSession ?? null };
}
function readReviews({ runDirectory, dataFingerprint }) {
  const legacyFile = path.join(runDirectory, 'blind-review.json'), file = path.join(runDirectory, 'blind-reviews.json');
  const legacy = fs.existsSync(legacyFile) ? read(legacyFile) : null;
  const collection = fs.existsSync(file) ? read(file) : null;
  if (collection && (collection.schema !== 'oneuldo.persona-blind-reviewers' || collection.version !== 1 || !Array.isArray(collection.reviewers))) {
    throw new Error('Invalid multi-reviewer storage');
  }
  const reviews = [...(legacy ? [{ ...legacy, reviewerId: DEFAULT_REVIEWER_ID, reviewerKind: 'llm' }] : []), ...(collection?.reviewers ?? [])];
  if (new Set(reviews.map(review => review.reviewerId)).size !== reviews.length) throw new Error('Duplicate reviewer identity');
  for (const review of collection?.reviewers ?? []) identity({ ...review, reviewerModel: review.reviewerModel ?? undefined }, true);
  if (dataFingerprint !== undefined && (collection && collection.dataFingerprint !== dataFingerprint
    || reviews.some(review => review.dataFingerprint !== dataFingerprint))) throw new Error('Blind review does not match measurements');
  return reviews;
}
function assertPanelReady({ runDirectory, panel = 'A', reviewerId, reviewerKind }) {
  if (!['A', 'B'].includes(panel)) throw new Error('Expected blind panel A or B');
  const selected = identity({ reviewerId, reviewerKind });
  const previous = readReviews({ runDirectory }).find(review => review.reviewerId === selected.reviewerId);
  if (previous && reviewerKind !== undefined && previous.reviewerKind !== reviewerKind) throw new Error('Reviewer label changed');
  if (panel === 'B' && !previous?.scores?.A) throw new Error('Score panel A before requesting panel B for this reviewer');
  return { reviewerId: selected.reviewerId, reviewerKind: previous?.reviewerKind ?? selected.reviewerKind ?? null };
}
function submitReview({ runDirectory, panel, answers, reviewerId, reviewerKind, reviewerModel, reviewerSession,
  state, key, validationMode = 'legacy', traitKeys = [] }) {
  if (!['A', 'B'].includes(panel)) throw new Error('Submit panel A or B');
  const selected = identity({ reviewerId, reviewerKind, reviewerModel, reviewerSession }, true);
  const reviews = readReviews({ runDirectory, dataFingerprint: state.dataFingerprint });
  const previous = reviews.find(review => review.reviewerId === selected.reviewerId);
  if (panel === 'B' && !previous?.scores?.A) throw new Error('Panel A must be scored before panel B for this reviewer');
  if (previous && ['reviewerKind', 'reviewerModel', 'reviewerSession'].some(field => (previous[field] ?? null) !== selected[field])) throw new Error('Reviewer label changed');
  const legacy = reviewerId === undefined, reviewPath = path.join(runDirectory, legacy ? 'blind-review.json' : 'blind-reviews.json');
  const response = score => ({ reviewPath, panel, score, reviewerId: selected.reviewerId, reviewerKind: selected.reviewerKind,
    independenceVerified: false, keyIsolationVerified: false });
  if (previous?.answers?.[panel]) {
    if (!same(previous.answers[panel], answers)) throw new Error('Scored answers are frozen; use a new reviewer only for an independent review');
    return response(previous.scores[panel]);
  }
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw new Error('answers must map opaque IDs to answers');
  const rows = key.filter(row => row.version === panel);
  let score;
  if (validationMode === 'traits') score = scoreTraitReview(rows, answers, { traitKeys });
  else {
    for (const value of Object.values(answers)) {
      if (typeof value === 'string') continue;
      if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(field => !['personaId', 'confidence'].includes(field))
        || typeof value.personaId !== 'string' || value.confidence !== undefined && (!Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1)) {
        throw new Error('Invalid answer or confidence; expected 0..1');
      }
    }
    score = scoreReview(rows, Object.fromEntries(Object.entries(answers).map(([id, answer]) => [id, typeof answer === 'string' ? answer : answer.personaId])), IDS);
  }
  const saved = { ...selected, dataFingerprint: state.dataFingerprint, fixtureOnly: state.fixtureOnly,
    independenceVerified: false, keyIsolationVerified: false,
    scores: { ...previous?.scores, [panel]: score }, answers: { ...previous?.answers, [panel]: answers } };
  if (legacy) {
    const { reviewerId: ignoredId, reviewerKind: ignoredKind, ...legacySaved } = saved;
    write(reviewPath, legacySaved);
  } else {
    const named = reviews.filter(review => review.reviewerId !== DEFAULT_REVIEWER_ID);
    const index = named.findIndex(review => review.reviewerId === selected.reviewerId);
    if (index < 0) named.push(saved); else named[index] = saved;
    write(reviewPath, { schema: 'oneuldo.persona-blind-reviewers', version: 1,
      dataFingerprint: state.dataFingerprint, fixtureOnly: state.fixtureOnly, reviewers: named });
  }
  return response(score);
}
function summarizeReviews({ runDirectory, dataFingerprint, validationMode = 'legacy', traitKeys = [] }) {
  const reviews = readReviews({ runDirectory, dataFingerprint });
  return { blindReviews: reviews.map(({ answers, ...review }) => review),
    interReviewerAgreement: reviewerAgreement(reviews, { validationMode, traitKeys }) };
}

module.exports = { DEFAULT_REVIEWER_ID, identity, readReviews, assertPanelReady, submitReview, summarizeReviews };
