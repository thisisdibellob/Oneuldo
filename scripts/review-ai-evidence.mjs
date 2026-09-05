import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const read = p => JSON.parse(readFileSync(resolve(root,p), 'utf8'));
const candidates = read('shared/evidence/candidates.json');
const cases = read('shared/evidence/synthetic-cases.json');
const review = read('shared/evidence/review.json');
const approved = review.cards.filter(c => c.status === 'DEVELOPMENT_APPROVED').map(c => c.cardId);
const responsesPath = process.argv[2];
const responses = responsesPath ? JSON.parse(readFileSync(resolve(responsesPath), 'utf8')) : [];
const checks = {
  candidateCount44: candidates.length === 44,
  uniqueCandidateIds: new Set(candidates.map(c => c.card_id)).size === candidates.length,
  reviewCoversEveryCandidate: candidates.every(c => review.cards.filter(r => r.cardId === c.card_id).length === 1),
  syntheticCount24: cases.length === 24,
  syntheticNotExpertTruth: cases.every(c => c.synthetic && !c.expert_validated && c.alternative_explanations_ko.length && c.must_not_conclude_ko),
  noUnreviewedCitation: responses.every(r => (r.analysis?.usedEvidenceCardIds ?? []).every(id => approved.includes(id))),
  noUnknownOrDuplicateCases: new Set(responses.map(r => r.caseId)).size === responses.length
    && responses.every(r => cases.some(c => c.case_id === r.caseId)),
};
const report = {
  version: 'phase6-review-harness-v1', generatedAt: new Date().toISOString(), checks,
  automatedChecksPassed: Object.values(checks).every(Boolean), liveModelResponses: responses.length,
  fullComparisonAvailable: responses.length === 24,
  expertValidationComplete: false, participantValidationComplete: false, productionApproved: false,
  note: 'Mechanical coverage/reference checks only. No semantic accuracy, diagnosis, expert approval, or support-effect claim.',
  cases: cases.map(c => ({ caseId:c.case_id, observation:c.observation_ko, knownConditions:c.known_conditions_ko,
    possibleAlternatives:c.alternative_explanations_ko, avoidConcluding:c.must_not_conclude_ko,
    reviewTarget:c.review_target_ko, modelResponse:responses.find(r=>r.caseId===c.case_id) ?? null,
    humanReview:{ reviewer:null, evidenceAccuracy:null, nonStigmatizing:null, missingContextHandled:null,
      supportFeasible:null, participantPreference:null, sameSeedComparison:null, notes:null } })),
};
mkdirSync(resolve(root,'tmp/phase6'), {recursive:true});
writeFileSync(resolve(root,'tmp/phase6/review-report.json'), JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({ checks, cases:cases.length, modelResponses:responses.length, productionApproved:false,
  report:'tmp/phase6/review-report.json' },null,2));
if (!report.automatedChecksPassed) process.exitCode=1;

