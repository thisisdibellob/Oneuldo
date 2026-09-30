import type { ActorObservation, AttentionMemory, Decision } from './types';

export type PracticeEpisode = { action: string; target?: string; product?: string; quantity?: number;
  instructions?: string[]; readList?: { label: string; quantity: number }[];
  seenProducts?: string[]; seenStations?: string[];
  result?: string; source: 'current-planning-observation' | 'executed-app-action' };
export type ConfirmedLearning = { version: '1'; source: 'confirmed-app-replay'; memberId: string;
  sessionId: string; replayId: string; episodes: PracticeEpisode[] };

export function validateLearning(value: unknown): asserts value is ConfirmedLearning {
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

/** Observable episodic context. No probabilistic beliefs, competence score, or automatic improvement. */
export class ActorLearningMemory {
  private episodes: PracticeEpisode[] = [];
  private displayedInstructions: Partial<Record<'entry' | 'checkout', string[]>> = {};
  private lastReadList: ActorObservation['readObjectives'];
  private currentTask: string | null = null;
  private currentAnchor: string | null = null;
  private route: { from: string | null; to: string }[] = [];
  private sightings: { stationId: string; fromAnchor: string | null; direction: string; distanceBand: string }[] = [];
  private discoveries: AttentionMemory = { version:'1', stations:[], anchors:[], knownProducts:[], controlsPracticed:[] };
  constructor(private prior?: ConfirmedLearning) { if (prior) validateLearning(prior); }
  observe(o: ActorObservation) {
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
      ...(after.products.length && ['interact','browse'].includes(a.type) ? {seenProducts:after.products.slice(0,20).map(p=>`${p.name} ${p.detail??''}`.trim().slice(0,200))}:{}),
      ...(a.type==='walkToAnchor' ? {seenStations:after.visibleStations.slice(0,20).map(s=>s.label.slice(0,200))}:{}),
      ...(after.readObjectives ? {readList:after.readObjectives.map(g=>({label:g.label,quantity:g.quantity}))}:{}),
      result:outcome, source:'current-planning-observation'});
    this.episodes=this.episodes.slice(-12);
    if (!this.discoveries.controlsPracticed.includes(a.type)) this.discoveries.controlsPracticed.push(a.type);
  }
  getMemory() { return structuredClone(this.discoveries); }
  getState() {
    return { kind:'episodic-actor-v2', recentExperience:structuredClone(this.episodes.slice(-6)),
      observedThisVisit: {
        instructions:structuredClone(this.displayedInstructions), lastReadList:structuredClone(this.lastReadList ?? null),
        discoveries:this.getMemory(), currentAnchor:this.currentAnchor, traveledEdges:structuredClone(this.route),
        stationSightings:structuredClone(this.sightings),
      },
      actorChosenTask:this.currentTask,
      previousExecutedExperience:structuredClone(this.prior?.episodes ?? []),
      note:'Recorded observations are available context, not measured human recall or comprehension. Historical directions are relative to their observation location; current visible cues take precedence. actorChosenTask is a model-authored provisional intent, not a correct answer. Experience is not a success label. No competence, memory-decay, stress or improvement probability is supplied. Previous actions do not reveal current task targets or layout.' };
  }
}
