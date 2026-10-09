import { validateLearning, type PracticeEpisode } from './actorLearning';
import profile from '../personas/research-learning-minjae-v2.json';
import seoyeon from '../personas/research-learning-seoyeon-v2.json';
import minsu from '../personas/research-learning-minsu-v2.json';

const profiles = [profile, seoyeon, minsu];
/** Different individual profiles use the same encoding, retrieval and decision boundaries. */
export function getResearchLearnerProfile(personaId: string) {
  const selected = profiles.find(candidate => candidate.id === personaId);
  if (!selected) throw new Error('LEARNER_IDENTITY_MISMATCH');
  return structuredClone(selected);
}

export type LearningSkill = 'product-identity' | 'volume' | 'package-unit' | 'quantity' | 'navigation' | 'checkout';
export type ResearchEpisode = {
  id: string; sessionId: string; observationRef: string; observationSha256: string;
  observedAt: string; observed: PracticeEpisode;
};
/** Auditor archive. Never forward the entire archive to the decision maker. */
export type ResearchArchive = {
  version: 'research-observed-v2'; personaId: string; runId: string; episodes: ResearchEpisode[];
};
export type LearnerAssociation = {
  id: string; skill: LearningSkill; cue: string; association: string;
  status: 'tentative'; episodeIds: string[];
};
export type ResearchMemory = {
  version: 'research-memory-v2'; personaId: string; runId: string; revisionId: string;
  writtenAt: string; associations: LearnerAssociation[];
};
/** AI-authored recall for this observation. Empty and inaccurate recollections are allowed. */
export type ResearchRecall = {
  version: 'research-recall-v2'; personaId: string; runId: string; memoryRevisionId: string;
  observationRef: string; observationSha256: string; observedAt: string;
  recalled: { associationId: string; text: string; certainty: 'uncertain' | 'familiar' }[];
};
export type CurrentLearnerObservation = {
  sessionId: string; observationRef: string; observationSha256: string; observedAt: string;
  visible: { instructions?: string[]; readList?: { label: string; quantity: number }[];
    seenProducts?: string[]; seenStations?: string[]; result?: string };
};
export type ResearchDecisionInput = {
  archive: ResearchArchive; memory: ResearchMemory; recall: ResearchRecall; current: CurrentLearnerObservation;
};

const skills: LearningSkill[] = ['product-identity', 'volume', 'package-unit', 'quantity', 'navigation', 'checkout'];
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
function exact(x: unknown, allowed: string[]) {
  if (!record(x) || Object.keys(x).some(k => !allowed.includes(k))) throw new Error('UNEXPECTED_LEARNER_FIELD');
}
function short(x: unknown, limit = 500): asserts x is string {
  if (typeof x !== 'string' || !x.trim() || x.length > limit) throw new Error('INVALID_LEARNER_TEXT');
}
function time(x: unknown) {
  short(x, 40);
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(x) || !Number.isFinite(Date.parse(x)))
    throw new Error('REAL_OBSERVATION_TIME_REQUIRED');
  return Date.parse(x);
}
function digest(x: unknown) {
  if (typeof x !== 'string' || !/^[a-f0-9]{64}$/.test(x)) throw new Error('UI_RECEIPT_DIGEST_REQUIRED');
}
function identity(x: { personaId: string; runId: string }, archive?: ResearchArchive) {
  short(x.personaId); short(x.runId);
  getResearchLearnerProfile(x.personaId);
  if (archive && (x.personaId !== archive.personaId || x.runId !== archive.runId))
    throw new Error('LEARNER_IDENTITY_MISMATCH');
}
function validateEpisode(e: ResearchEpisode) {
  exact(e, ['id', 'sessionId', 'observationRef', 'observationSha256', 'observedAt', 'observed']);
  short(e.id); short(e.sessionId); short(e.observationRef); digest(e.observationSha256); time(e.observedAt);
  validateLearning({ version: '1', source: 'confirmed-app-replay', memberId: 'validation-only',
    sessionId: e.sessionId, replayId: 'validation-only', episodes: [e.observed] });
}
export function validateResearchArchive(a: ResearchArchive) {
  exact(a, ['version', 'personaId', 'runId', 'episodes']); identity(a);
  if (a.version !== 'research-observed-v2' || !Array.isArray(a.episodes) || a.episodes.length > 2000
    || JSON.stringify(a).length > 2_000_000) throw new Error('INVALID_RESEARCH_ARCHIVE');
  const ids = new Set<string>();
  for (const e of a.episodes) {
    validateEpisode(e);
    if (ids.has(e.id)) throw new Error('DUPLICATE_EPISODE');
    ids.add(e.id);
  }
}
function validateMemory(m: ResearchMemory, a: ResearchArchive) {
  exact(m, ['version', 'personaId', 'runId', 'revisionId', 'writtenAt', 'associations']); identity(m, a);
  short(m.revisionId); const written = time(m.writtenAt);
  // These are payload safety limits, not measured human memory capacity.
  if (m.version !== 'research-memory-v2' || !Array.isArray(m.associations) || m.associations.length > 64
    || JSON.stringify(m).length > 24000) throw new Error('INVALID_RESEARCH_MEMORY');
  const episodes = new Map(a.episodes.map(e => [e.id, e])); const ids = new Set<string>();
  for (const v of m.associations) {
    exact(v, ['id', 'skill', 'cue', 'association', 'status', 'episodeIds']);
    short(v.id); short(v.cue, 160); short(v.association, 240);
    if (!skills.includes(v.skill) || v.status !== 'tentative' || ids.has(v.id)
      || !Array.isArray(v.episodeIds) || !v.episodeIds.length || v.episodeIds.length > 8
      || new Set(v.episodeIds).size !== v.episodeIds.length
      || v.episodeIds.some(id => !episodes.has(id) || time(episodes.get(id)!.observedAt) > written))
      throw new Error('UNSUPPORTED_LEARNER_ASSOCIATION');
    ids.add(v.id);
  }
}
function validateCurrent(c: CurrentLearnerObservation) {
  exact(c, ['sessionId', 'observationRef', 'observationSha256', 'observedAt', 'visible']);
  short(c.sessionId); short(c.observationRef); digest(c.observationSha256); time(c.observedAt);
  exact(c.visible, ['instructions', 'readList', 'seenProducts', 'seenStations', 'result']);
  // Reuse the observation field bounds; this validates shape, not execution or comprehension.
  validateLearning({ version: '1', source: 'confirmed-app-replay', memberId: 'validation-only',
    sessionId: c.sessionId, replayId: 'validation-only',
    episodes: [{ ...c.visible, action: 'observe-visible-screen', source: 'executed-app-action' }] });
}
function checked(a: ResearchArchive, m: ResearchMemory, c: CurrentLearnerObservation) {
  validateResearchArchive(a); validateMemory(m, a); validateCurrent(c);
  if (time(m.writtenAt) > time(c.observedAt)) throw new Error('FUTURE_MEMORY_NOT_ALLOWED');
}

/** Encoding sees only just-observed receipts and the learner's own previous associations. */
export function researchEncodingContext(a: ResearchArchive, m: ResearchMemory, episodeIds: string[]) {
  validateResearchArchive(a); validateMemory(m, a);
  if (!Array.isArray(episodeIds) || !episodeIds.length || episodeIds.length > 24
    || new Set(episodeIds).size !== episodeIds.length) throw new Error('INVALID_ENCODING_WINDOW');
  const episodes = episodeIds.map(id => a.episodes.find(e => e.id === id));
  if (episodes.some(e => !e) || new Set(episodes.map(e => e!.sessionId)).size !== 1)
    throw new Error('ENCODING_REQUIRES_ONE_OBSERVED_SESSION');
  return structuredClone({ version: 'research-encoding-context-v2', persona: getResearchLearnerProfile(a.personaId),
    memoryBinding: { personaId: a.personaId, runId: a.runId, previousRevisionId: m.revisionId },
    previousAssociations: m.associations,
    newlyObserved: episodes.map(e => ({ id: e!.id, observedAt: e!.observedAt, observed: e!.observed })),
    instruction: 'Learner role: retain, revise or omit short, situated associations from these observations. '
      + 'Empty associations are valid. Do not turn displayed instructions into universal strategies or mastery. '
      + 'Do not invent feedback, learning rates, probabilities or prescribed outcomes. Write a new memory revision; code does not choose what is learned.' });
}

/** Retrieval has remembered associations, not the verbatim past episodes or teacher evaluation. */
export function researchRetrievalContext(a: ResearchArchive, m: ResearchMemory, c: CurrentLearnerObservation) {
  checked(a, m, c);
  return structuredClone({ version: 'research-retrieval-context-v2', persona: getResearchLearnerProfile(a.personaId),
    rememberedAssociations: m.associations.map(({ id, skill, cue, association }) => ({ id, skill, cue, association })),
    currentVisible: c.visible,
    instruction: 'Learner role: choose what comes to mind for this screen. Recall may be partial, uncertain, mistaken or empty. '
      + 'Do not require a remembered method to transfer to a different product or unit. Do not deliberately forget or fail to meet a quota. '
      + 'Return research-recall-v2 tied to the provided observationRef and memoryRevisionId. This is an engineering role constraint, not measured human recall.',
    recallBinding: { personaId: a.personaId, runId: a.runId, memoryRevisionId: m.revisionId,
      observationRef: c.observationRef, observationSha256: c.observationSha256, observedAt: c.observedAt } });
}

/** Decisions receive only current visible content and AI-selected recollections. */
export function researchLearnerContext(input: ResearchDecisionInput) {
  exact(input, ['archive', 'memory', 'recall', 'current']);
  const { archive: a, memory: m, recall: r, current: c } = input; checked(a, m, c);
  exact(r, ['version', 'personaId', 'runId', 'memoryRevisionId', 'observationRef', 'observationSha256', 'observedAt', 'recalled']); identity(r, a);
  if (r.version !== 'research-recall-v2' || r.memoryRevisionId !== m.revisionId || r.observationRef !== c.observationRef
    || r.observationSha256 !== c.observationSha256 || r.observedAt !== c.observedAt
    || !Array.isArray(r.recalled) || r.recalled.length > 64) throw new Error('RECALL_BINDING_MISMATCH');
  const remembered = new Map(m.associations.map(v => [v.id, v])); const ids = new Set<string>();
  for (const v of r.recalled) {
    exact(v, ['associationId', 'text', 'certainty']); short(v.text, 240);
    if (!remembered.has(v.associationId) || ids.has(v.associationId) || !['uncertain', 'familiar'].includes(v.certainty))
      throw new Error('UNSUPPORTED_RECOLLECTION');
    ids.add(v.associationId);
  }
  return structuredClone({ version: 'research-decision-context-v2', persona: getResearchLearnerProfile(a.personaId),
    currentVisible: c.visible,
    currentlyRecalled: r.recalled.map(v => ({ skill: remembered.get(v.associationId)!.skill, text: v.text, certainty: v.certainty })),
    instruction: 'Choose the next actual UI action as the learner. You may request help or reread the list. '
      + 'Remembered text is not an answer key. Do not repair recall by looking at the archive, analysis, source papers or assessment phase. '
      + 'No forced failure/success sequence, automatic mastery, exact memory capacity or guaranteed transfer is defined.' });
}

export const researchLearnerProfile = structuredClone(profile);

export type ResearchPracticeAuditInput = {
  sessionId: string; purpose: 'acquisition' | 'independent-probe' | 'maintenance-probe' | 'transfer-probe';
  targetSkills: LearningSkill[]; previousPracticeSessionId?: string;
  changedFeatures: ('item' | 'label' | 'unit' | 'order' | 'layout')[];
  support: { episodeId: string; level: 'task-list' | 'general-instruction' | 'specific-cue' | 'worked-example' | 'corrective-feedback';
    access: 'displayed' | 'opened' | 'followed-in-action' }[];
};

/** Measurement ledger only. It neither grades ability nor changes learner memory. */
export function researchPracticeAudit(a: ResearchArchive, input: ResearchPracticeAuditInput) {
  validateResearchArchive(a);
  exact(input, ['sessionId', 'purpose', 'targetSkills', 'previousPracticeSessionId', 'changedFeatures', 'support']);
  short(input.sessionId);
  if (!['acquisition', 'independent-probe', 'maintenance-probe', 'transfer-probe'].includes(input.purpose)
    || !Array.isArray(input.targetSkills) || !input.targetSkills.length
    || input.targetSkills.some(s => !skills.includes(s))
    || new Set(input.targetSkills).size !== input.targetSkills.length
    || !Array.isArray(input.changedFeatures) || input.changedFeatures.some(s => !['item', 'label', 'unit', 'order', 'layout'].includes(s))
    || new Set(input.changedFeatures).size !== input.changedFeatures.length
    || !Array.isArray(input.support) || input.support.length > 100) throw new Error('INVALID_PRACTICE_AUDIT');
  const current = a.episodes.filter(e => e.sessionId === input.sessionId);
  if (!current.length) throw new Error('OBSERVED_PRACTICE_SESSION_REQUIRED');
  for (const s of input.support) {
    exact(s, ['episodeId', 'level', 'access']);
    if (!current.some(e => e.id === s.episodeId)
      || !['task-list', 'general-instruction', 'specific-cue', 'worked-example', 'corrective-feedback'].includes(s.level)
      || !['displayed', 'opened', 'followed-in-action'].includes(s.access)) throw new Error('UNSUPPORTED_SUPPORT_OBSERVATION');
  }
  if (input.purpose === 'transfer-probe' && !input.changedFeatures.length) throw new Error('TRANSFER_CHANGE_REQUIRED');
  let observedIntervalMs: number | null = null;
  if (input.previousPracticeSessionId !== undefined) {
    short(input.previousPracticeSessionId);
    const previous = a.episodes.filter(e => e.sessionId === input.previousPracticeSessionId);
    if (!previous.length || input.previousPracticeSessionId === input.sessionId) throw new Error('PRIOR_PRACTICE_SESSION_REQUIRED');
    observedIntervalMs = Math.min(...current.map(e => time(e.observedAt))) - Math.max(...previous.map(e => time(e.observedAt)));
    if (observedIntervalMs < 0) throw new Error('PRACTICE_TIME_ORDER_INVALID');
  }
  if (input.purpose === 'maintenance-probe' && (observedIntervalMs === null || observedIntervalMs === 0))
    throw new Error('ACTUAL_MAINTENANCE_INTERVAL_REQUIRED');
  return structuredClone({ version: 'research-practice-audit-v2', personaId: a.personaId, runId: a.runId,
    ...input, observedIntervalMs,
    interpretation: 'Auditor only. Purpose is a planned condition, not proof of independence or improvement. '
      + 'Compare actual task requirements, choices, support used, corrections and app results separately. '
      + 'An immediate repeat or easier supported task does not establish retention, transfer or clinical efficacy.' });
}
