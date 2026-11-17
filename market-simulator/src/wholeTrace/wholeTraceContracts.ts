import type { MarketReplaySnapshot } from '../../../frontend/src/game/marketReplayTrace';
import type { Persona, TraceOptions, ActorObservation } from '../types';
import type { wholeReplayWaypointCatalog, WholeReplayNearbyStation, WholeReplayWaypointGraph } from '../../../frontend/src/game/marketReplayPerception';
import { validateWholeTraceBasis, type WholeTraceBasis, type WholeTraceKnowledgeSnapshot } from './wholeTraceKnowledge';
import { validateWholeTraceActorState, type WholeTraceActorState } from './wholeTraceActorState';
import type { WholeTracePersonaInput } from './wholeTracePersona';
import type { WholeTraceChoiceCatalog, WholeTraceChoiceFrame, WholeTraceAcceptedFrame } from './wholeTraceChoices';
import type { WholeTraceMemoryUse, WholeTraceCognitionState } from './wholeTraceCognition';
import type { WholeTraceTaskState } from './wholeTraceTaskMemory';
import type { WholeTraceAuthoringGuide } from './wholeTraceAuthoring';
import { WHOLE_TRACE_DIRECTIONS, wholeTraceDirectionalLocation, wholeTraceHasDirectionalMovement, wholeTraceIsContinuousFrame, type WholeTraceMovementVersion } from './wholeTraceMovement';
import type { ActorDirection } from '../types';
import type { WholeTraceMovementFeedbackVersion } from './wholeTraceMovementFeedback';
import type { WayfindingProfile, WholeTraceWayfindingVersion } from './wholeTraceWayfinding';

export const WHOLE_TRACE_BUNDLE_VERSION = '8' as const;
export const WHOLE_TRACE_CANDIDATE_VERSION = '7' as const;

export const WHOLE_TRACE_POLICY_VERSION = 'whole-trace-v3' as const;
export const WHOLE_TRACE_MODEL = 'gpt-6-luna' as const;
export const WHOLE_TRACE_ACTION_LIMIT = 100;
/** Explicit accepted-decision observation horizons. 100 is the default; 200 is an opt-in experiment setting. */
export const WHOLE_TRACE_ACTION_HORIZONS = [100, 200] as const;
export type WholeTraceActionHorizon = typeof WHOLE_TRACE_ACTION_HORIZONS[number];
export function wholeTraceActionHorizon(value: unknown): WholeTraceActionHorizon {
  if (value === undefined) return WHOLE_TRACE_ACTION_LIMIT;
  if (!WHOLE_TRACE_ACTION_HORIZONS.includes(value as WholeTraceActionHorizon)) throw new Error('actionHorizon must be 100 or 200');
  return value as WholeTraceActionHorizon;
}
export type WholeTraceAction =
  | { type: 'readList' | 'pause' | 'lookAround' | 'viewCart' | 'viewHelp' | 'closeView' | 'closeStation' | 'submit' | 'giveUp' }
  | { type: 'walk'; waypointId: string }
  | { type: 'moveDirection'; direction: ActorDirection; durationMs: number }
  | { type: 'interact'; station: string }
  | { type: 'checkout' | 'requestCashier'; checkoutId: string }
  | { type: 'add' | 'remove'; productId: string; quantity: number }
  | { type: 'browse'; pageIndex: number }
  /** wayfinding-v4: the staff dialogue's existing location-question controls. */
  | { type: 'openLocationHelp' | 'backToStaff' }
  | { type: 'askLocation'; objectiveId: string };
export type WholeTraceDecision = { action: WholeTraceAction; delayMs: number; reason: string; basis: WholeTraceBasis; actorState: WholeTraceActorState };
export type WholeTraceChoiceSource = {
  location: 'start' | string; navigationStateId: string; phase: 'shopping' | 'checkout';
  view: 'world' | 'cart' | 'help'; activeStation: string | null; pageIndex: number | null;
};
export type WholeTraceChoiceDecision = {
  choiceRef: { source: WholeTraceChoiceSource; choiceId: string; quantity?: number; durationMs?: number };
  delayMs: number; reason: string;
  basis: { intent: WholeTraceBasis['intent']; cueRefs?: string[]; memoryUses?: WholeTraceMemoryUse[]; goalId?: string | null };
  actorState: Omit<WholeTraceActorState, 'triggerCueRefs'> & { triggerCueRefs?: string[] };
};
export type WholeTraceWireDecision = WholeTraceDecision | WholeTraceChoiceDecision;
export type WholeTraceLegacyCandidate = { candidateVersion: '3'; requestId: string; decisions: WholeTraceDecision[] };
export type WholeTraceChoiceCandidateV4 = { candidateVersion: '4'; requestId: string; decisions: WholeTraceChoiceDecision[] };
export type WholeTraceFocusedChoiceDecision = WholeTraceChoiceDecision & {
  actorState: WholeTraceChoiceDecision['actorState'] & { focusedGoalId: string | null; focusedProductId: string | null };
};
export type WholeTraceFocusedChoiceCandidate = { candidateVersion: '5'; requestId: string; decisions: WholeTraceFocusedChoiceDecision[] };
export type WholeTraceCognitiveChoiceDecision = WholeTraceFocusedChoiceDecision & { basis: { memoryUses: WholeTraceMemoryUse[] } };
export type WholeTraceCognitiveChoiceCandidate = { candidateVersion: '6'; requestId: string; decisions: WholeTraceCognitiveChoiceDecision[] };
export type WholeTraceTaskChoiceDecision = WholeTraceCognitiveChoiceDecision & { basis: { goalId: string | null } };
export type WholeTraceTaskChoiceCandidate = { candidateVersion: '7'; requestId: string; decisions: WholeTraceTaskChoiceDecision[] };
export type WholeTraceChoiceCandidate = WholeTraceChoiceCandidateV4 | WholeTraceFocusedChoiceCandidate | WholeTraceCognitiveChoiceCandidate | WholeTraceTaskChoiceCandidate;
export type WholeTraceCandidate = WholeTraceLegacyCandidate | WholeTraceChoiceCandidate;
export type WholeTraceNavigation = {
  schemaVersion: '1'; view: 'world'; presentationKey: string; initialStateId: string;
  initialLocation: 'start'; startPoint: MarketReplaySnapshot['environment']['spawn'];
  states: { stateId: string; cashierAvailability: WholeReplayWaypointGraph['cashierAvailability'];
    start: { allowedWaypointIds: string[]; nearbyStations: WholeReplayNearbyStation[] };
    nodes: WholeReplayWaypointGraph['nodes'] }[];
};
export type WholeTraceBundle = {
  /** Absent in archived bundles: preserve their original public observation. */
  observationVersion?: 'anchor-visible-structures-v1';
  movementValidationVersion?: '1';
  movementVersion?: WholeTraceMovementVersion;
  movementFeedbackVersion?: WholeTraceMovementFeedbackVersion;
  /** Optional experiment options; absent in default and archived bundles. */
  choiceOrderVersion?: WholeTraceChoiceOrderVersion;
  authoringExampleVersion?: WholeTraceAuthoringExampleVersion;
  /** wayfinding-v1: boundaries, actor spatial memory, own notes and give-up eligibility. */
  wayfindingVersion?: WholeTraceWayfindingVersion;
  bundleVersion: typeof WHOLE_TRACE_BUNDLE_VERSION; requestId: string; inputHash: string; policyVersion: typeof WHOLE_TRACE_POLICY_VERSION;
  model: typeof WHOLE_TRACE_MODEL; reasoningEffort: 'low'; observationScope: 'whole-world'; actorKnowledgeScope: 'observed-and-remembered';
  snapshotId: string; seed: string | number; persona: Pick<Persona, 'id' | 'version' | 'name' | 'description' | 'character'> & { behavior: WholeTracePersonaInput;
    wayfinding?: { profile: WayfindingProfile; instructions: string } };
  /** Optional in saved bundle 8 files predating the additive authoring guidance. */
  authoringGuide?: WholeTraceAuthoringGuide;
  generationLimits: { acceptedActionHorizon: WholeTraceActionHorizon; technicalActionBudget: number; maxRepairs: number; plannedTimeBudgetMs?: number };
  worldReference: {
    world: MarketReplaySnapshot['environment']; presentation: NonNullable<MarketReplaySnapshot['presentation']>;
    waypoints: ReturnType<typeof wholeReplayWaypointCatalog>; navigation: WholeTraceNavigation;
    shelves: { stationId: string; products: { id: string; name: string; detail?: string; price: number; stock: number }[];
      pages: { pageIndex: number; visibleProductIds: string[] }[] }[];
    objectives: { id: string; label: string; quantity: number; match: string }[]; helpText: string[];
  };
  candidateVersion: typeof WHOLE_TRACE_CANDIDATE_VERSION; supportedCandidateVersions: ['7'] | ['7', '6', '5', '4', '3'];
  choiceCatalog: WholeTraceChoiceCatalog; initialChoiceFrame: WholeTraceChoiceFrame;
  actorState: { initialObservation: ActorObservation; knowledge: WholeTraceKnowledgeSnapshot; experience: unknown; initialState: WholeTraceActorState;
    workingMemory: WholeTraceCognitionState; taskMemory: WholeTraceTaskState };
  instructions: string;
  actionContract: Record<string, string>; sourceFiles: { path: string; sha256: string }[];
};
export type WholeTraceSettings = Pick<TraceOptions, 'personaId' | 'seed' | 'snapshot' | 'timingProfile' | 'maxActions' |
  'timeBudgetMs' | 'attentionExperience' | 'learnerIdentity' | 'trialBinding' | 'llm'> & { outputPath?: string; maxRepairs?: number; movementValidationVersion?: '1'; movementVersion?: WholeTraceMovementVersion; movementFeedbackVersion?: WholeTraceMovementFeedbackVersion;
  choiceOrderVersion?: WholeTraceChoiceOrderVersion; authoringExampleVersion?: WholeTraceAuthoringExampleVersion;
  wayfindingVersion?: WholeTraceWayfindingVersion;
  /** Opt-in accepted-decision observation horizon. Absent means the default 100. */
  actionHorizon?: WholeTraceActionHorizon };
/** give-up-last-v1 lists control/giveUp after every other currently available choice. Availability is unchanged. */
export const WHOLE_TRACE_CHOICE_ORDER_VERSIONS = ['give-up-last-v1'] as const;
export type WholeTraceChoiceOrderVersion = typeof WHOLE_TRACE_CHOICE_ORDER_VERSIONS[number];
/** walk-while-unseen-v1 adds one neutral walk example to the authoring guide. */
export const WHOLE_TRACE_AUTHORING_EXAMPLE_VERSIONS = ['walk-while-unseen-v1'] as const;
export type WholeTraceAuthoringExampleVersion = typeof WHOLE_TRACE_AUTHORING_EXAMPLE_VERSIONS[number];
/** Presentation-only reordering: the same IDs, moved giveUp last. */
export function wholeTraceOrderChoiceIds(choiceIds: string[], version?: WholeTraceChoiceOrderVersion): string[] {
  if (version !== 'give-up-last-v1') return choiceIds;
  return [...choiceIds.filter(id => id !== 'control/giveUp'), ...choiceIds.filter(id => id === 'control/giveUp')];
}
export type WholeTraceValidationIssue = { decisionIndex: number; decisionNumber: number; path: string; rule: string; message: string;
  evidence?: Record<string, unknown> };
export type WholeTraceValidation = { issues?: WholeTraceValidationIssue[]; valid: boolean; errors: string[]; code?: string; failedDecisionIndex?: number;
  acceptedPrefixLength?: number; before?: ActorObservation; knowledge?: WholeTraceKnowledgeSnapshot; workingMemory?: WholeTraceCognitionState;
  proposedWorkingMemory?: WholeTraceCognitionState;
  taskMemory?: WholeTraceTaskState; proposedTaskMemory?: WholeTraceTaskState;
  validPrefix?: WholeTraceWireDecision[]; choiceFrame?: WholeTraceChoiceFrame; acceptedFrame?: WholeTraceAcceptedFrame };

const fields: Record<string, string[]> = {
  readList: [], pause: [], lookAround: [], viewCart: [], viewHelp: [], closeView: [], closeStation: [], submit: [], giveUp: [],
  walk: ['waypointId'], interact: ['station'], checkout: ['checkoutId'], requestCashier: ['checkoutId'],
  add: ['productId', 'quantity'], remove: ['productId', 'quantity'], browse: ['pageIndex'],
  openLocationHelp: [], backToStaff: [], askLocation: ['objectiveId'],
};
function plain(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
/** Terminal intent is explicit; this helper never selects an ending. */
export function wholeTraceTerminalIntent(decision: WholeTraceWireDecision | undefined): 'submit' | 'giveUp' | undefined {
  if (!decision || typeof decision !== 'object' || Array.isArray(decision)) return undefined;
  if ('action' in decision) return decision.action?.type === 'submit' || decision.action?.type === 'giveUp' ? decision.action.type : undefined;
  return decision.choiceRef?.choiceId === 'control/submit' ? 'submit'
    : decision.choiceRef?.choiceId === 'control/giveUp' ? 'giveUp' : undefined;
}
const shortRefArray = (value: unknown, maximum: number) => Array.isArray(value) && value.length <= maximum
  && value.every(ref => typeof ref === 'string' && !!ref.trim() && ref.length <= 300) && new Set(value).size === value.length;
function validateChoiceDecision(d: Record<string, unknown>, at: string, errors: string[], requireFocusFields: boolean, cognitive = false, persistent = false, movementVersion?: WholeTraceMovementVersion, wayfinding?: WholeTraceWayfindingVersion) {
  if (Object.keys(d).some(k => !['choiceRef', 'delayMs', 'reason', 'basis', 'actorState'].includes(k))) errors.push(`${at}: unknown field`);
  const basis = d.basis;
  if (!plain(basis)) errors.push(`${at}: basis must be a JSON object`);
  else {
    for (const error of validateWholeTraceBasis({ ...basis, cueRefs: ['control:pause'] }, { allowMemoryUses: cognitive, allowTaskMemory: persistent }).errors) errors.push(`${at}: ${error}`);
    if (cognitive && !Array.isArray(basis.memoryUses)) errors.push(`${at}: basis.memoryUses is required as an array (use [] when no goal detail is used)`);
    if (basis.cueRefs !== undefined && !shortRefArray(basis.cueRefs, 24)) errors.push(`${at}: invalid optional basis.cueRefs`);
  }
  const state = d.actorState;
  if (!plain(state)) errors.push(`${at}: actorState must be a JSON object`);
  else {
    for (const error of validateWholeTraceActorState({ ...state, triggerCueRefs: ['control:pause'] }, { requireFocusFields, allowMemoryUpdate: cognitive, allowTaskMemory: persistent, allowThought: !!wayfinding, ...(wayfinding ? { thoughtVersion: wayfinding } : {}) }).errors) errors.push(`${at}: ${error}`);
    if (state.triggerCueRefs !== undefined && !shortRefArray(state.triggerCueRefs, 12)) errors.push(`${at}: invalid optional actorState.triggerCueRefs`);
  }
  const ref = d.choiceRef;
  if (!plain(ref)) { errors.push(`${at}: choiceRef must be a JSON object`); return; }
  const directional = wholeTraceHasDirectionalMovement(movementVersion);
  if (Object.keys(ref).some(k => !['source', 'choiceId', 'quantity', ...(directional ? ['durationMs'] : [])].includes(k))) errors.push(`${at}: unknown choiceRef field`);
  if (typeof ref.choiceId !== 'string' || !ref.choiceId.trim() || ref.choiceId.length > 300) errors.push(`${at}: invalid choiceId`);
  if (directional) {
    const moving = typeof ref.choiceId === 'string' && ref.choiceId.startsWith('moveDirection/');
    if (moving && !WHOLE_TRACE_DIRECTIONS.some(direction => ref.choiceId === `moveDirection/${direction}`)) errors.push(`${at}: invalid movement direction`);
    if (moving && (!Number.isInteger(ref.durationMs) || (ref.durationMs as number) < 100 || (ref.durationMs as number) > 2000)) errors.push(`${at}: choiceRef.durationMs must be 100..2000 for moveDirection`);
    if (!moving && ref.durationMs !== undefined) errors.push(`${at}: this choice does not accept durationMs`);
    if (moving && ref.quantity !== undefined) errors.push(`${at}: moveDirection does not accept quantity`);
  }
  // Product choice templates deliberately do not choose a quantity. Report all
  // missing product parameters before execution, so one suffix repair can see
  // every such omission instead of discovering them one action at a time.
  if (typeof ref.choiceId === 'string' && /^(?:add|remove)\//.test(ref.choiceId) && ref.quantity === undefined)
    errors.push(`${at}: choiceRef.quantity is required for ${ref.choiceId}; choose the quantity explicitly`);
  if (ref.quantity !== undefined && (!Number.isInteger(ref.quantity) || (ref.quantity as number) < 1 || (ref.quantity as number) > 99)) errors.push(`${at}: quantity must be 1..99`);
  const source = ref.source;
  if (!plain(source)) { errors.push(`${at}: choiceRef.source must be a JSON object`); return; }
  const sourceFields = ['location', 'navigationStateId', 'phase', 'view', 'activeStation', 'pageIndex'];
  if (Object.keys(source).some(k => !sourceFields.includes(k)) || sourceFields.some(k => !Object.hasOwn(source, k))) errors.push(`${at}: invalid source fields`);
  if (typeof source.location !== 'string' || !(source.location === 'start' || /^W[0-9]+$/.test(source.location)
    || movementVersion === 'directional-v1' && wholeTraceDirectionalLocation(source.location)
    || movementVersion === 'directional-v2' && wholeTraceIsContinuousFrame(source as WholeTraceChoiceSource))) errors.push(`${at}: invalid source location`);
  if (movementVersion === 'directional-v2' && !wholeTraceIsContinuousFrame(source as WholeTraceChoiceSource)) errors.push(`${at}: directional-v2 requires a continuous execution source`);
  if (typeof source.navigationStateId !== 'string' || !source.navigationStateId.trim() || source.navigationStateId.length > 200) errors.push(`${at}: invalid navigationStateId`);
  if (!['shopping', 'checkout'].includes(source.phase as string)) errors.push(`${at}: invalid source phase`);
  if (!['world', 'cart', 'help'].includes(source.view as string)) errors.push(`${at}: invalid source view`);
  if (source.activeStation !== null && (typeof source.activeStation !== 'string' || !source.activeStation.trim() || source.activeStation.length > 200)) errors.push(`${at}: invalid source activeStation`);
  if (source.pageIndex !== null && (!Number.isInteger(source.pageIndex) || (source.pageIndex as number) < 0 || (source.pageIndex as number) > 1000)) errors.push(`${at}: invalid source pageIndex`);
}
/** The existing wire checks for one authored choice, without executing it or inventing an ending.
 * Full-candidate identity, objective spelling, horizon and terminal checks still run at submission.
 */
export function validateWholeTraceChoiceDecisionSyntax(value: unknown,
  candidateVersion: '4' | '5' | '6' | '7' = '7', options: { movementVersion?: WholeTraceMovementVersion; wayfinding?: WholeTraceWayfindingVersion } = {}): WholeTraceValidation {
  const errors: string[] = [], at = 'decision';
  if (!plain(value)) return { valid: false, errors: [`${at}: expected object`], code: 'CANDIDATE_SCHEMA' };
  if (!['4', '5', '6', '7'].includes(candidateVersion))
    return { valid: false, errors: ['Unsupported choice candidateVersion'], code: 'CANDIDATE_SCHEMA' };
  if (!Number.isInteger(value.delayMs) || (value.delayMs as number) < 1 || (value.delayMs as number) > 120000)
    errors.push(`${at}: delayMs must be 1..120000`);
  if (typeof value.reason !== 'string' || !value.reason.trim() || value.reason.length > 1000)
    errors.push(`${at}: reason must be a short nonempty description`);
  validateChoiceDecision(value, at, errors, candidateVersion !== '4', ['6', '7'].includes(candidateVersion), candidateVersion === '7', options.movementVersion, options.wayfinding);
  return { valid: !errors.length, errors, ...(errors.length ? { code: 'CANDIDATE_SCHEMA' } : {}) };
}
export function validateWholeTraceCandidate(value: unknown, requestId: string,
  options: { objectiveIds?: readonly string[]; movementVersion?: WholeTraceMovementVersion; wayfinding?: WholeTraceWayfindingVersion; actionHorizon?: WholeTraceActionHorizon } = {}): WholeTraceValidation {
  return validateCandidate(value, requestId, options, false);
}
/** A prefix has no ending yet; every supplied decision keeps the full wire contract. */
export function validateWholeTraceCandidatePrefix(value: unknown, requestId: string,
  options: { objectiveIds?: readonly string[]; movementVersion?: WholeTraceMovementVersion; wayfinding?: WholeTraceWayfindingVersion; actionHorizon?: WholeTraceActionHorizon } = {}): WholeTraceValidation {
  return validateCandidate(value, requestId, options, true);
}
function validateCandidate(value: unknown, requestId: string,
  options: { objectiveIds?: readonly string[]; movementVersion?: WholeTraceMovementVersion; wayfinding?: WholeTraceWayfindingVersion; actionHorizon?: WholeTraceActionHorizon }, prefix: boolean): WholeTraceValidation {
  const errors: string[] = [];
  const horizon = wholeTraceActionHorizon(options.actionHorizon);
  if (!plain(value)) return { valid: false, errors: ['Candidate must be a JSON object'], code: 'CANDIDATE_SCHEMA' };
  if (Object.keys(value).some(k => !['candidateVersion', 'requestId', 'decisions'].includes(k))) errors.push('Unknown candidate field');
  if (!['3', '4', '5', '6', '7'].includes(value.candidateVersion as string))
    errors.push('candidateVersion must be 7 (persistent task memory), 6 (working-memory choices), 5 (focused choices), 4 (state-bound choices) or explicit legacy 3');
  if (value.requestId !== requestId) errors.push('Candidate requestId differs from the prepared input');
  if (!Array.isArray(value.decisions) || value.decisions.length < (prefix ? 0 : 1) || value.decisions.length > horizon)
    return { valid: false, errors: [...errors, `decisions must contain 1..${horizon} complete actor decisions`], code: 'CANDIDATE_SCHEMA' };
  const decisions = value.decisions;
  decisions.forEach((d, i) => {
    const at = `decisions[${i}]`;
    if (!plain(d)) { errors.push(`${at}: expected object`); return; }
    if (!Number.isInteger(d.delayMs) || (d.delayMs as number) < 1 || (d.delayMs as number) > 120000) errors.push(`${at}: delayMs must be 1..120000`);
    if (typeof d.reason !== 'string' || !d.reason.trim() || d.reason.length > 1000) errors.push(`${at}: reason must be a short nonempty description`);
    if (['4', '5', '6', '7'].includes(value.candidateVersion as string)) validateChoiceDecision(d, at, errors, value.candidateVersion !== '4', ['6', '7'].includes(value.candidateVersion as string), value.candidateVersion === '7', options.movementVersion, options.wayfinding);
    else {
      if (Object.keys(d).some(k => !['action', 'delayMs', 'reason', 'basis', 'actorState'].includes(k))) errors.push(`${at}: unknown field`);
      for (const error of validateWholeTraceBasis(d.basis).errors) errors.push(`${at}: ${error}`);
      for (const error of validateWholeTraceActorState(d.actorState).errors) errors.push(`${at}: ${error}`);
      const a = d.action;
      if (!plain(a) || typeof a.type !== 'string' || !Object.hasOwn(fields, a.type)) { errors.push(`${at}: unsupported action`); return; }
      const required = fields[a.type];
      if (Object.keys(a).some(k => !['type', ...required].includes(k)) || required.some(k => !Object.hasOwn(a, k))) errors.push(`${at}: invalid action fields`);
      for (const k of required.filter(k => !['quantity', 'pageIndex'].includes(k)))
        if (typeof a[k] !== 'string' || !(a[k] as string).trim() || (a[k] as string).length > 200) errors.push(`${at}: invalid ${k}`);
      if (required.includes('quantity') && (!Number.isInteger(a.quantity) || (a.quantity as number) < 1 || (a.quantity as number) > 99)) errors.push(`${at}: quantity must be 1..99`);
      if (required.includes('pageIndex') && (!Number.isInteger(a.pageIndex) || (a.pageIndex as number) < 0 || (a.pageIndex as number) > 1000)) errors.push(`${at}: invalid pageIndex`);
    }
    // A v5 reference spelling is a wire contract, not proof of an actual read.
    // Report all misspelled objective references in the same schema diagnostic
    // as other shape errors, before consuming a bounded execution repair.
    // Known-but-unread objectives still fail the later knowledge guard.
    if (['5', '6', '7'].includes(value.candidateVersion as string) && options.objectiveIds && plain(d.actorState)) {
      const known = new Set(options.objectiveIds);
      const goalRefs: [string, unknown][] = [['focusedGoalId', d.actorState.focusedGoalId]];
      for (const field of ['heldGoalIds', 'uncertainGoalIds'] as const)
        if (Array.isArray(d.actorState[field])) for (const id of d.actorState[field] as unknown[]) goalRefs.push([field, id]);
      if (value.candidateVersion === '6' || value.candidateVersion === '7') {
        if (plain(d.basis) && Array.isArray(d.basis.memoryUses))
          for (const use of d.basis.memoryUses) if (plain(use)) goalRefs.push(['memoryUses.goalId', use.goalId]);
        if (Array.isArray(d.actorState.memoryUpdate))
          for (const update of d.actorState.memoryUpdate) if (plain(update)) goalRefs.push(['memoryUpdate.goalId', update.goalId]);
        if (value.candidateVersion === '7') {
          if (plain(d.basis)) goalRefs.push(['basis.goalId', d.basis.goalId]);
          if (Array.isArray(d.actorState.taskUpdate))
            for (const update of d.actorState.taskUpdate) if (plain(update)) goalRefs.push(['taskUpdate.goalId', update.goalId]);
        }
      }
      for (const [field, id] of goalRefs) if (typeof id === 'string' && !known.has(id))
        errors.push(`${at}: actorState.${field} has unknown objective ID ${id}; use the prepared objective ID after an actual readList, not a product ID`);
      for (const [field, refs] of [['actorState.triggerCueRefs', d.actorState.triggerCueRefs], ['basis.cueRefs', plain(d.basis) ? d.basis.cueRefs : undefined]] as const)
        if (Array.isArray(refs)) for (const ref of refs) if (typeof ref === 'string' && ref.startsWith('objective:') && !known.has(ref.slice(10)))
          errors.push(`${at}: ${field} has unknown objective reference ${ref}`);
    }
    if (wholeTraceTerminalIntent(d as WholeTraceWireDecision) && i !== decisions.length - 1) errors.push(`${at}: terminal action must be last`);
  });
  if (!prefix && decisions.length < horizon && !wholeTraceTerminalIntent(decisions.at(-1) as WholeTraceWireDecision))
    errors.push(`A plan shorter than ${horizon} decisions must end with submit or giveUp`);
  return { valid: errors.length === 0, errors, ...(errors.length ? { code: 'CANDIDATE_SCHEMA' } : {}) };
}
