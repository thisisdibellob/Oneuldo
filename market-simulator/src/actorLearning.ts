import { REMEMBERED_ROUTE_CONTRACT } from './rememberedRoute';
import type { ActorObservation, AttentionMemory, Decision } from './types';
import type { MarketReplayTrace } from '../../frontend/src/game/marketReplayTrace';
import { assertPersonaLearningAllowed } from './personas';
import { validateConfirmedSpatialMemory, reusableSpatialRoutes, type ConfirmedSpatialMemory } from './confirmedSpatialMemory';

/** A watchdog intervention must never be remembered as a persona's voluntary action. */
export function assertPersonaLearningEligible(trace: Pick<MarketReplayTrace, 'generation'> & Partial<Pick<MarketReplayTrace, 'personaId'>>): void {
  if (trace.personaId !== undefined) assertPersonaLearningAllowed(trace.personaId);
  if (trace.generation?.controlledStop !== undefined) {
    throw Object.assign(new Error('System-controlled stop is excluded from persona learning and performance evidence'),
      { code:'SYSTEM_CONTROLLED_STOP_EXCLUDED' });
  }
}

export type LearnerIdentity = {
  learnerId: string; memberId: string; personaId: string; personaVersion: string;
  experimentId: string; arm: 'A' | 'B' | 'C'; model: string; policyVersion: string; reasoningEffort?: 'low';
};
export type EpisodeEvidence = { sessionId: string; replayId: string; traceId: string; stepId: string; stepIndex: number };
export type PracticeEpisode = { action: string; target?: string; product?: string; quantity?: number;
  instructions?: string[]; supportText?: string[]; readList?: { label: string; quantity: number }[];
  seenProducts?: string[]; seenStations?: string[];
  result?: string; source: 'current-planning-observation' | 'executed-app-action'; evidence?: EpisodeEvidence };
type LearningSource = { source: 'confirmed-app-replay'; memberId: string; sessionId: string; replayId: string; episodes: PracticeEpisode[]; spatial?: ConfirmedSpatialMemory };
export type ConfirmedLearning = (LearningSource & { version: '1' }) | (LearningSource & LearnerIdentity & { version: '2' });
export const LEARNER_IDENTITY_KEYS = ['learnerId','memberId','personaId','personaVersion','experimentId','arm','model','policyVersion'] as const;
export function learnerIdentityFrom(value: Record<string, unknown>): LearnerIdentity {
  return {...Object.fromEntries(LEARNER_IDENTITY_KEYS.map(k=>[k,value[k]])),...(value.reasoningEffort?{reasoningEffort:value.reasoningEffort}:{})} as LearnerIdentity;
}
const nonempty = (value: unknown, max = 200): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
export function validateLearnerIdentity(value: unknown): asserts value is LearnerIdentity {
  const x = value as LearnerIdentity;
  if (!x || typeof x !== 'object' || Object.keys(x).some(k => !LEARNER_IDENTITY_KEYS.includes(k as any) && k !== 'reasoningEffort')
    || LEARNER_IDENTITY_KEYS.some(k => !nonempty(x[k])) || !['A','B','C'].includes(x.arm))
    throw new Error('Learner identity requires learner, member, persona/version, experiment/arm, model and actor policy version');
  assertPersonaLearningAllowed(x.personaId);
  if (['episodic-choice-v10','episodic-choice-v11'].includes(x.policyVersion) && (x.model !== 'gpt-6-luna' || x.reasoningEffort !== 'low'))
    throw new Error('Luna v10/v11 learner identity requires gpt-6-luna with low reasoning');
  if (['whole-trace-v1', 'whole-trace-v2', 'whole-trace-v3'].includes(x.policyVersion) && (x.model !== 'gpt-6-luna' || x.reasoningEffort !== 'low'))
    throw new Error('Whole-trace learner identity requires gpt-6-luna with low reasoning');
  if (x.reasoningEffort !== undefined && x.reasoningEffort !== 'low') throw new Error('Unsupported learner reasoning effort');
}
export function assertLearnerIdentity(actual: LearnerIdentity, expected: LearnerIdentity) {
  validateLearnerIdentity(actual); validateLearnerIdentity(expected);
  for (const key of LEARNER_IDENTITY_KEYS) if (actual[key] !== expected[key]) throw new Error(`Learner identity mismatch: ${key}`);
  if (actual.reasoningEffort !== expected.reasoningEffort) throw new Error('Learner identity mismatch: reasoningEffort');
}
export function validateLearning(value: unknown): asserts value is ConfirmedLearning {
  if ((value as ConfirmedLearning)?.version === '1') { validateLegacyLearning(value); return; }
  const x = value as ConfirmedLearning;
  const identityKeys = x?.version === '2' ? [...LEARNER_IDENTITY_KEYS] : [];
  const allowed = ['version','source','memberId','sessionId','replayId','episodes',...identityKeys,...((x as any)?.reasoningEffort!==undefined?['reasoningEffort']:[]),...(x?.version==='2'&&x.policyVersion==='episodic-choice-v11'?['spatial']:[])];
  if (!x || !['1','2'].includes(x.version) || x.source !== 'confirmed-app-replay'
    || Object.keys(x).some(k => !allowed.includes(k))
    || ![x.memberId,x.sessionId,x.replayId].every(v => nonempty(v))
    || !Array.isArray(x.episodes) || (x.version === '1' && (x.episodes.length > 24 || JSON.stringify(x).length > 24000)))
    throw new Error('Learning requires confirmed-app-replay evidence; legacy artifacts must be bounded');
  if (x.version === '2') validateLearnerIdentity(learnerIdentityFrom(x as any));
  if (x.spatial !== undefined) validateConfirmedSpatialMemory(x.spatial);
  for (const e of x.episodes) {
    if (!e || e.source !== 'executed-app-action' || !nonempty(e.action,64)
      || Object.keys(e).some(k => !['action','target','product','quantity','instructions','supportText','readList','result','source','seenProducts','seenStations','evidence'].includes(k))
      || [e.seenProducts,e.seenStations].some(v => v !== undefined && (!Array.isArray(v) || v.length > 20 || v.some(s => typeof s !== 'string' || s.length > 200)))
      || (e.instructions !== undefined && (!Array.isArray(e.instructions) || e.instructions.length > 10 || e.instructions.some(s => typeof s !== 'string' || s.length > 500)))
      // Five actual adaptive briefing lines plus seven shared help lines are displayed together.
      || (e.supportText !== undefined && (!Array.isArray(e.supportText) || e.supportText.length > 12 || e.supportText.some(s => typeof s !== 'string' || s.length > 500)))
      || (e.readList !== undefined && (!Array.isArray(e.readList) || e.readList.length > 4 || e.readList.some(g => !g || Object.keys(g).some(k => !['label','quantity'].includes(k)) || typeof g.label !== 'string' || g.label.length > 500 || !Number.isInteger(g.quantity) || g.quantity < 1 || g.quantity > 99)))
      || (e.target !== undefined && (typeof e.target !== 'string' || e.target.length > 200))
      || (e.product !== undefined && (typeof e.product !== 'string' || e.product.length > 500))
      || (e.result !== undefined && (typeof e.result !== 'string' || e.result.length > 500))
      || (e.quantity !== undefined && (!Number.isInteger(e.quantity) || e.quantity < 0 || e.quantity > 99)))
      throw new Error('Invalid learning episode; no analysis or hidden evaluation is accepted');
    if (x.version === '2' || e.evidence !== undefined) {
      const p=e.evidence;
      if (!p || Object.keys(p).some(k => !['sessionId','replayId','traceId','stepId','stepIndex'].includes(k))
        || ![p.sessionId,p.replayId,p.traceId,p.stepId].every(v => nonempty(v)) || !Number.isSafeInteger(p.stepIndex) || p.stepIndex < 0)
        throw new Error('Every v2 episode requires its executed session, replay, trace and step provenance');
    }
  }
}

function validateLegacyLearning(value: unknown): asserts value is ConfirmedLearning {
  const x = value as ConfirmedLearning;
  if (!x || x.version !== '1' || x.source !== 'confirmed-app-replay'
    || ['memberId','sessionId','replayId'].some(k => typeof (x as any)[k] !== 'string' || !(x as any)[k].length)
    || !Array.isArray(x.episodes) || x.episodes.length > 24 || JSON.stringify(x).length > 24000)
    throw new Error('Learning requires a bounded confirmed-app-replay artifact');
  for (const e of x.episodes) {
    if (!e || e.source !== 'executed-app-action' || typeof e.action !== 'string'
      || Object.keys(e).some(k => !['action','target','product','quantity','instructions','readList','result','source','seenProducts','seenStations'].includes(k))
      || [e.seenProducts,e.seenStations].some(v => v !== undefined && (!Array.isArray(v) || v.length > 20 || v.some(s => typeof s !== 'string' || s.length > 200)))
      || (e.instructions !== undefined && (!Array.isArray(e.instructions) || e.instructions.length > 5 || e.instructions.some(s => typeof s !== 'string' || s.length > 500)))
      || (e.readList !== undefined && (!Array.isArray(e.readList) || e.readList.length > 4 || e.readList.some(g => typeof g.label !== 'string' || g.label.length > 500 || !Number.isInteger(g.quantity))))
      || (e.target !== undefined && (typeof e.target !== 'string' || e.target.length > 200))
      || (e.product !== undefined && (typeof e.product !== 'string' || e.product.length > 500))
      || (e.result !== undefined && (typeof e.result !== 'string' || e.result.length > 500))
      || (e.quantity !== undefined && (!Number.isInteger(e.quantity) || e.quantity < 0 || e.quantity > 99)))
      throw new Error('Invalid learning episode; no analysis or hidden evaluation is accepted');
  }
}

/** Retrieval selects observed cue overlap and recency only, never success, analysis, hidden goals or inferred mastery. */
export function retrieveLearningEpisodes(episodes: PracticeEpisode[], cues: string[], limit = 12): PracticeEpisode[] {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 24) throw new Error('Retrieval limit must be 1..24');
  if (episodes.length <= limit) return structuredClone(episodes);
  const tokens = (s: string) => s.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [];
  const known = new Set(cues.flatMap(tokens));
  const ranked = episodes.map((e,index) => {
    const observed = [e.target,e.product,...(e.seenProducts??[]),...(e.seenStations??[]),...(e.instructions??[]),...(e.supportText??[]),...(e.readList??[]).map(g=>g.label)].filter((v): v is string => typeof v === 'string');
    const score = new Set(observed.flatMap(tokens).filter(t => known.has(t))).size;
    return {index,score};
  });
  // Reserve recent episodes even when older episodes have more matching words. Keep temporal order in model input.
  const recent = Math.min(4,limit);
  const picked = new Set(episodes.slice(-recent).map((_,i)=>episodes.length-recent+i));
  // episode-outcome-v1 learners only: keep the latest round endings (at most 3) in view. No-op for other learners.
  const outcomes = episodes.map((e,i)=>e.action==='episode-outcome'?i:-1).filter(i=>i>=0).slice(-3);
  for (const i of outcomes) if (picked.size < limit) picked.add(i);
  // procedural-routine-v1 learners only: keep the latest executed round routines (at most 4). No-op for other learners.
  const routines = episodes.map((e,i)=>e.action==='episode-routine'?i:-1).filter(i=>i>=0).slice(-4);
  for (const i of routines) if (picked.size < limit) picked.add(i);
  for (const candidate of ranked.sort((a,b)=>b.score-a.score || b.index-a.index)) {
    if (picked.size >= limit) break;
    picked.add(candidate.index);
  }
  return structuredClone([...picked].sort((a,b)=>a-b).map(i=>episodes[i]));
}

/** procedural-routine-v1: how many of the actor's own executed rounds contained each adjacent step pair.
 * Repetition count only; failed and successful orders are counted alike and nothing is ranked as correct. */
export function routineFamiliarity(episodes: PracticeEpisode[]): Array<{from: string; to: string; rounds: number}> {
  const counts = new Map<string, number>();
  for (const e of episodes.filter(e => e.action === 'episode-routine' && typeof e.result === 'string')) {
    const body = e.result!.replace(/^지난 장보기에서 실제로 한 순서: /, '').replace(/ \(끝날 때 장바구니: .*\)$/, '');
    const steps = body.split(' → ').map(s => s.replace(/×\d+$/, '').replace(/^둘러보기\(.*\)$/, '둘러보기')).filter(s => s !== '…');
    const pairs = new Set<string>();
    for (let i = 1; i < steps.length; i++) if (steps[i-1] !== steps[i]) pairs.add(steps[i-1] + '\u0000' + steps[i]);
    for (const p of pairs) counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  return [...counts].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([p, rounds]) => { const [from, to] = p.split('\u0000'); return { from, to, rounds }; });
}

/** Observable episodic context. No probabilistic beliefs, competence score, or automatic improvement. */
export class ActorLearningMemory {
  private episodes: PracticeEpisode[] = [];
  private retrievalCues = new Set<string>();
  private displayedInstructions: Partial<Record<'entry' | 'checkout', string[]>> = {};
  private lastReadList: ActorObservation['readObjectives'];
  private currentTask: string | null = null;
  private currentAnchor: string | null = null;
  private route: { from: string | null; to: string }[] = [];
  private sightings: { stationId: string; fromAnchor: string | null; direction: string; distanceBand: string }[] = [];
  private discoveries: AttentionMemory = { version:'1', stations:[], anchors:[], knownProducts:[], controlsPracticed:[] };
  constructor(private prior?: ConfirmedLearning, private readonly extendedPolicy = prior?.version === '2',
    private readonly spatialOptions?: {layoutKey:string;navigationKey?:string;spatialEnabled:true}) {
    if (prior) validateLearning(prior);
    if(spatialOptions&&prior?.spatial?.navigationKey===(spatialOptions.navigationKey??spatialOptions.layoutKey)){
      if(prior.spatial.layoutKey===spatialOptions.layoutKey)this.discoveries.stations=structuredClone(prior.spatial.stations);
      this.discoveries.anchors=structuredClone(prior.spatial.anchors);
      this.route=reusableSpatialRoutes(prior.spatial,spatialOptions.layoutKey,spatialOptions.navigationKey??spatialOptions.layoutKey)
        .filter(r=>r.action==='walkToAnchor').map(r=>({from:r.from,to:r.to})).slice(-48);
    }
  }
  observe(o: ActorObservation) {
    // Every retrieval cue came from a displayed observation; the guard's mission and evaluation are unavailable.
    if (this.extendedPolicy) for (const cue of [...o.products.map(p=>`${p.name} ${p.detail??''}`), ...o.visibleStations.map(s=>s.label),
      ...(o.readObjectives??[]).map(g=>g.label), ...(o.instructions?.lines??[]), ...(o.supportText??[])]) this.retrievalCues.add(cue);
    if (o.instructions) this.displayedInstructions[o.instructions.phase] = [...o.instructions.lines];
    if (o.readObjectives) this.lastReadList = structuredClone(o.readObjectives);
    for (const s of o.visibleStations) {
      this.sightings = this.sightings.filter(x => x.stationId !== s.id);
      this.sightings.push({stationId:s.id, fromAnchor:this.currentAnchor, direction:s.direction, distanceBand:s.distanceBand});
    }
    for (const s of o.visibleStations) if (!this.discoveries.stations.some(x => x.id === s.id))
      this.discoveries.stations.push({id:s.id, label:s.label, kind:s.kind, visits:0});
    for (const p of o.products) {
      this.discoveries.knownProducts = this.discoveries.knownProducts.filter(x=>x.id!==p.id);
      this.discoveries.knownProducts.push({...p});
    }
    for (const a of o.anchors) if (!this.discoveries.anchors.some(x=>x.id===a.id))
      this.discoveries.anchors.push({id:a.id,neighbors:[],visits:0});
    // Bounded observation history, not a clinical forgetting model. Never import unseen map nodes.
    this.discoveries.anchors=this.discoveries.anchors.slice(-256);
    this.discoveries.stations=this.discoveries.stations.slice(-64);
    this.discoveries.knownProducts=this.discoveries.knownProducts.slice(-96);
    this.sightings=this.sightings.slice(-64);
  }
  record(d: Decision, before: ActorObservation, after: ActorObservation) {
    const a=d.action;
    if (d.currentTask !== undefined) this.currentTask=d.currentTask;
    if (a.type === 'moveDirection' && (after.result?.movement?.movedDistancePx ?? 0) > 1e-7) this.currentAnchor = null;
    if (after.result?.accepted && a.type==='walkToAnchor') {
      const from=this.currentAnchor, to=a.anchorId;
      this.currentAnchor=to;
      this.route.push({from,to});this.route=this.route.slice(-48);
      const destination=this.discoveries.anchors.find(x=>x.id===to);
      if (destination) destination.visits++;
      const origin=this.discoveries.anchors.find(x=>x.id===from);
      if (origin && !origin.neighbors.includes(to)) origin.neighbors.push(to);
    }
    if (after.result?.accepted && a.type==='interact') {
      const station=this.discoveries.stations.find(x=>x.id===a.station);
      if (station) station.visits++;
    }
    if(after.result?.accepted&&a.type==='walkTo')this.currentAnchor=null;
    if (before.instructions) this.displayedInstructions[before.instructions.phase]=[...before.instructions.lines];
    // Refresh after applying movement so sightings retain the correct observation location.
    this.observe(after);
    const item='productId' in a ? before.products.find(p=>p.id===a.productId) : undefined;
    const product='productId' in a ? (item ? `${item.name} ${item.detail ?? ''}`.trim() : a.productId) : undefined;
    const scene=(o: ActorObservation)=>JSON.stringify([o.visibleStations,o.anchors,o.products,o.view,o.activeStation,o.shelf]);
    const outcome=after.lastActionError ??
      (['lookAround','pause'].includes(a.type) && scene(before)===scene(after)
        ? 'Stayed in place. Visible scene unchanged; no new location or product became visible.'
        : a.type==='viewCart' ? ('Displayed basket: '+JSON.stringify(after.cart)).slice(0,500)
        : after.result?.message ?? 'Action accepted; task correctness unknown');
    this.episodes.push({action:a.type, ...('anchorId' in a ? {target:a.anchorId} : 'station' in a ? {target:a.station} : {}), ...(product ? {product}:{}), ...('quantity' in a && a.quantity !== undefined ? {quantity:a.quantity}:{}),
      ...(before.instructions ? {instructions:before.instructions.lines}:{}),
      ...(this.extendedPolicy && after.supportText ? {supportText:[...after.supportText]}:{}),
      ...(after.products.length && ['interact','browse'].includes(a.type) ? {seenProducts:after.products.slice(0,20).map(p=>`${p.name} ${p.detail??''}`.trim().slice(0,200))}:{}),
      ...(a.type==='walkToAnchor' ? {seenStations:after.visibleStations.slice(0,20).map(s=>s.label.slice(0,200))}:{}),
      ...(after.readObjectives ? {readList:after.readObjectives.map(g=>({label:g.label,quantity:g.quantity}))}:{}),
      result:outcome, source:'current-planning-observation'});
    this.episodes=this.episodes.slice(-12);
    if (!this.discoveries.controlsPracticed.includes(a.type)) this.discoveries.controlsPracticed.push(a.type);
  }
  /** remembered-route-v1 is enabled by a contract marker bound into the learner's confirmed rounds; the marker is not an experience. */
  private recallEnabled() {
    return !!this.spatialOptions && !!this.prior?.episodes.some(e=>e.action==='episode-route-recall')
      && this.prior?.spatial?.navigationKey===(this.spatialOptions.navigationKey??this.spatialOptions.layoutKey);
  }
  private experienceEpisodes() { return (this.prior?.episodes ?? []).filter(e=>e.action!=='episode-route-recall'); }
  getMemory() { return structuredClone(this.discoveries); }
  getState() {
    return { kind:'episodic-actor-v2', recentExperience:structuredClone(this.episodes.slice(-6)),
      observedThisVisit: {
        instructions:structuredClone(this.displayedInstructions), lastReadList:structuredClone(this.lastReadList ?? null),
        discoveries:this.getMemory(), currentAnchor:this.currentAnchor, traveledEdges:structuredClone(this.route),
        stationSightings:structuredClone(this.sightings),
      },
      actorChosenTask:this.currentTask,
      previousExecutedExperience:this.extendedPolicy ? retrieveLearningEpisodes(this.experienceEpisodes(), [...this.retrievalCues]) : structuredClone(this.prior?.episodes ?? []),
      ...(this.extendedPolicy ? {previousExperienceRetrieval:{method:'observed-cues-and-recency-v1', archivedEpisodeCount:this.experienceEpisodes().length, maximumSelected:12, inferredMastery:false}} : {}),
      ...(this.extendedPolicy && this.prior?.episodes.some(e=>e.action==='episode-routine') ? {previousRoutineFamiliarity:{
        contract:'procedural-routine-v1', transitions:routineFamiliarity(this.prior?.episodes ?? []),
        note:'Counts how many of your own earlier rounds included each step-to-step order you actually performed. Repetition only: not correctness, success or advice. Current visible choices still decide every action.'}} : {}),
      ...(this.spatialOptions ? {previousSpatialExperience:{
        contract:'confirmed-observed-routes-v1',layoutMatches:this.prior?.spatial?.layoutKey===this.spatialOptions.layoutKey,
        navigationMatches:this.prior?.spatial?.navigationKey===(this.spatialOptions.navigationKey??this.spatialOptions.layoutKey),
        routes:reusableSpatialRoutes(this.prior?.spatial,this.spatialOptions.layoutKey,this.spatialOptions.navigationKey??this.spatialOptions.layoutKey).slice(-16),
        historicalLandmarks:structuredClone(this.prior?.spatial?.stations.map(s=>({label:s.label,kind:s.kind}))??[]),
        previousLayouts:structuredClone(this.prior?.spatial?.previousLayouts??[]),
        note:'Only verified actor routes with matching actual physical navigation geometry are reusable. When category layout changes, only passage-to-passage edges transfer; old category/staff landmarks and station approaches are historical. Current visible choices still govern every move. No coordinates, hidden destination, system checkout route, or complete map is imported.',
      }} : {}),
      ...(this.recallEnabled() ? {previousRouteRecall:{contract:REMEMBERED_ROUTE_CONTRACT,
        note:'Passage choices may name places you yourself saw after walking on from that passage in earlier rounds, computed only from previousSpatialExperience.routes. Memory of your own past walks, not advice, a shortcut or a guarantee; every move is still one ordinary visible passage choice.'}} : {}),
      note:'Recorded observations are available context, not measured human recall or comprehension. Historical directions are relative to their observation location; current visible cues take precedence. actorChosenTask is a model-authored provisional intent, not a correct answer. Experience is not a success label. No competence, memory-decay, stress or improvement probability is supplied. Previous actions do not reveal current task targets or layout.' };
  }
}
