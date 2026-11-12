'use strict';
require('../runtime.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { IDS, categoricalAgreement, reviewerAgreement } = require('../src/validation/personaValidationBlind.cjs');
const { DEFAULT_REVIEWER_ID, assertPanelReady, submitReview, readReviews, summarizeReviews } = require('../src/validation/personaValidationReviewers.cjs');
const traitKeys = require('../validation/persona-traits.json').traits.map(row => row.key);
const settings = value => Object.fromEntries(traitKeys.map(key => [key, value]));
function fixture(t, validationMode = 'legacy') {
  const runDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'oneuldo-reviewers-'));
  t.after(() => fs.rmSync(runDirectory, { recursive: true, force: true }));
  const key = ['A', 'B'].flatMap(version => ['low', 'high'].map((level, i) => ({ opaqueId: `${version}-${i}`, version,
    personaId: IDS[i], traits: settings(level) })));
  const args = { runDirectory, state: { dataFingerprint: 'fixture-fingerprint', fixtureOnly: true }, key, validationMode, traitKeys };
  const answers = panel => Object.fromEntries(key.filter(row => row.version === panel).map(row => [row.opaqueId,
    validationMode === 'traits' ? { traits: row.traits, confidence: .5 } : { personaId: row.personaId, confidence: .5 }]));
  return { ...args, args, answers };
}

test('two nominal reviewers use Cohen kappa with separate marginals', () => {
  const ratings = [...Array.from({ length: 20 }, () => ['yes', 'yes']), ...Array.from({ length: 5 }, () => ['yes', 'no']),
    ...Array.from({ length: 10 }, () => ['no', 'yes']), ...Array.from({ length: 15 }, () => ['no', 'no'])];
  const result = categoricalAgreement(ratings);
  assert.equal(result.method, 'cohen-kappa'); assert.equal(result.n, 50);
  assert.equal(result.observedAgreement, .7); assert.equal(result.expectedAgreement, .5);
  assert.ok(Math.abs(result.kappa - .4) < 1e-12);
});
test('three nominal reviewers use Fleiss kappa with pooled category marginals', () => {
  const ratings = [['x', 'x', 'x'], ['x', 'x', 'x'], ['y', 'y', 'y'], ['y', 'y', 'y'], ['x', 'x', 'y'], ['x', 'y', 'y']];
  const result = categoricalAgreement(ratings);
  assert.equal(result.method, 'fleiss-kappa'); assert.equal(result.reviewers, 3);
  assert.ok(Math.abs(result.observedAgreement - 7 / 9) < 1e-12);
  assert.ok(Math.abs(result.kappa - 5 / 9) < 1e-12);
  assert.deepEqual(categoricalAgreement(ratings.map(row => [...row].reverse())), result);
});
test('agreement does not turn too few reviewers/items or constant abstention into zero or perfect kappa', () => {
  for (const matrix of [[], [['x']], [['x'], ['y']], [['x', 'x']]]) {
    assert.equal(categoricalAgreement(matrix).kappa, null);
    assert.equal(categoricalAgreement(matrix).status, 'insufficient');
  }
  const result = categoricalAgreement([['unknown', 'unknown'], ['unknown', 'unknown']]);
  assert.equal(result.status, 'undefined'); assert.equal(result.kappa, null);
  assert.equal(result.unknownTreatment, 'separate-category');
  assert.throws(() => categoricalAgreement([['x', 'x'], ['y']]), /equally sized/);
});

for (const validationMode of ['legacy', 'traits']) {
  test(`${validationMode} named reviewers preserve independent A/B gates, frozen answers and identity labels`, t => {
    const f = fixture(t, validationMode);
    const r1 = { reviewerId: 'rater-1', reviewerKind: 'llm', reviewerModel: 'fixture-model', reviewerSession: 'independent-1' };
    const r2 = { reviewerId: 'rater-2', reviewerKind: 'expert', reviewerSession: 'independent-2' };
    const first = submitReview({ ...f.args, ...r1, panel: 'A', answers: f.answers('A') });
    assert.equal(first.reviewerId, r1.reviewerId); assert.equal(first.reviewPath, path.join(f.runDirectory, 'blind-reviews.json'));
    assert.ok(!fs.existsSync(path.join(f.runDirectory, 'blind-review.json')));
    assert.equal(assertPanelReady({ ...f.args, ...r1, panel: 'B' }).reviewerId, r1.reviewerId);
    assert.throws(() => assertPanelReady({ ...f.args, ...r2, panel: 'B' }), /Score panel A/);
    assert.throws(() => submitReview({ ...f.args, ...r2, panel: 'B', answers: f.answers('B') }), /Panel A/);
    assert.throws(() => submitReview({ ...f.args, ...r1, reviewerKind: 'expert', panel: 'A', answers: f.answers('A') }), /label changed/);
    assert.throws(() => submitReview({ ...f.args, ...r1, reviewerSession: 'changed', panel: 'A', answers: f.answers('A') }), /label changed/);
    const changed = f.answers('A');
    changed['A-0'] = validationMode === 'traits' ? { traits: settings('unknown') } : IDS[3];
    assert.throws(() => submitReview({ ...f.args, ...r1, panel: 'A', answers: changed }), /frozen/);
    assert.deepEqual(submitReview({ ...f.args, ...r1, panel: 'A', answers: Object.fromEntries(Object.entries(f.answers('A')).reverse()) }).score, first.score);
    submitReview({ ...f.args, ...r2, panel: 'A', answers: f.answers('A') });
    submitReview({ ...f.args, ...r1, panel: 'B', answers: f.answers('B') });
    const summary = summarizeReviews({ ...f.args, dataFingerprint: f.state.dataFingerprint });
    assert.equal(summary.blindReviews.length, 2); assert.ok(summary.blindReviews.every(row => !Object.hasOwn(row, 'answers')));
    assert.equal(summary.blindReviews[1].reviewerKind, 'expert'); assert.equal(summary.blindReviews[1].reviewerModel, null);
    const get = panel => validationMode === 'traits' ? summary.interReviewerAgreement[panel].perTrait.checking : summary.interReviewerAgreement[panel].persona;
    assert.equal(get('A').method, 'cohen-kappa'); assert.equal(get('A').kappa, 1);
    assert.equal(get('B').kappa, null); assert.equal(get('B').reviewers, 1);
    submitReview({ ...f.args, reviewerId: 'rater-3', reviewerKind: 'expert', reviewerSession: 'third', panel: 'A', answers: f.answers('A') });
    const three = summarizeReviews({ ...f.args, dataFingerprint: f.state.dataFingerprint });
    const result = validationMode === 'traits' ? three.interReviewerAgreement.A.perTrait.checking : three.interReviewerAgreement.A.persona;
    assert.equal(result.method, 'fleiss-kappa'); assert.equal(result.kappa, 1);
    assert.throws(() => summarizeReviews({ ...f.args, dataFingerprint: 'other' }), /does not match/);
  });
}

test('legacy single-reviewer storage and responses stay compatible and are not rewritten by named submissions', t => {
  const f = fixture(t);
  const legacy = { reviewerModel: 'old-model', reviewerSession: 'old-session' };
  const first = submitReview({ ...f.args, ...legacy, panel: 'A', answers: f.answers('A') });
  assert.equal(first.reviewPath, path.join(f.runDirectory, 'blind-review.json')); assert.equal(first.score.accuracy, 1);
  const before = fs.readFileSync(first.reviewPath, 'utf8'), saved = JSON.parse(before);
  assert.ok(!Object.hasOwn(saved, 'reviewerId')); assert.ok(!Object.hasOwn(saved, 'reviewerKind'));
  assert.equal(assertPanelReady({ ...f.args, panel: 'B' }).reviewerId, DEFAULT_REVIEWER_ID);
  assert.throws(() => assertPanelReady({ ...f.args, reviewerId: 'new', panel: 'B' }), /Score panel A/);
  submitReview({ ...f.args, panel: 'A', answers: f.answers('A'), reviewerId: 'new', reviewerKind: 'expert', reviewerSession: 'new' });
  assert.equal(fs.readFileSync(first.reviewPath, 'utf8'), before);
  const reviews = readReviews({ ...f.args, dataFingerprint: f.state.dataFingerprint });
  assert.equal(reviews.length, 2); assert.equal(reviews[0].reviewerId, DEFAULT_REVIEWER_ID);
  assert.equal(summarizeReviews(f.args).interReviewerAgreement.A.persona.kappa, 1);
  assert.throws(() => submitReview({ ...f.args, ...legacy, reviewerSession: 'different', panel: 'B', answers: f.answers('B') }), /label changed/);
});
test('named reviewer validation rejects unsafe identifiers, absent kinds and model-less llm reviews', t => {
  const f = fixture(t), args = { ...f.args, panel: 'A', answers: f.answers('A'), reviewerSession: 'test' };
  for (const reviewerId of ['../x', '', DEFAULT_REVIEWER_ID, 'x'.repeat(65)]) {
    assert.throws(() => submitReview({ ...args, reviewerId, reviewerKind: 'expert' }), /reviewerId/);
  }
  assert.throws(() => submitReview({ ...args, reviewerId: 'rater' }), /reviewerKind/);
  assert.throws(() => submitReview({ ...args, reviewerKind: 'expert' }), /explicit reviewerId/);
  assert.throws(() => submitReview({ ...args, reviewerId: 'rater', reviewerKind: 'llm' }), /model and session/);
  assert.throws(() => submitReview({ ...args, reviewerId: 'rater', reviewerKind: 'expert', answers: {} }), /Missing/);
  assert.equal(readReviews(f.args).length, 0);
});
test('trait agreement treats unknown as an explicit nominal category and stays separate from accuracy', () => {
  const answers = { a: { traits: settings('unknown') }, b: { traits: settings('high') } };
  const reviews = [1, 2].map(id => ({ reviewerId: `r${id}`, answers: { A: answers }, scores: { A: { macroAccuracy: 0 } } }));
  const result = reviewerAgreement(reviews, { validationMode: 'traits', traitKeys });
  assert.equal(result.A.perTrait.checking.kappa, 1); assert.equal(result.A.perTrait.checking.n, 2);
  assert.ok(!Object.hasOwn(result.A.perTrait.checking, 'accuracy'));
  assert.equal(result.B.perTrait.checking.kappa, null);
});
