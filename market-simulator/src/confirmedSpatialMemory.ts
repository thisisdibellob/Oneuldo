import type { ActorObservation, AttentionMemory, ActorDirection, ActorDistanceBand } from './types';
import type { MarketReplayStep } from '../../frontend/src/game/marketReplayTrace';
import type { EpisodeEvidence } from './actorLearning';
import { getMarketEnvironmentObstacles, type MarketEnvironment, type MarketCashierAvailability } from '../../frontend/src/game/marketEnvironment';
import { marketReplayFingerprint } from '../../frontend/src/game/marketReplayTrace';

export type ConfirmedSpatialRoute = {
  action: 'walkToAnchor' | 'walkTo'; from: string | null; to: string; label: string;
  direction: ActorDirection; distanceBand: ActorDistanceBand; seenStationIds: string[]; navigationKey: string; evidence: EpisodeEvidence;
};
export type ConfirmedSpatialMemory = {
  version: 'confirmed-observed-routes-v1'; layoutKey: string; navigationKey: string;
  stations: AttentionMemory['stations']; anchors: AttentionMemory['anchors']; routes: ConfirmedSpatialRoute[];
  previousLayouts: { layoutKey: string; landmarkLabels: string[]; routeCount: number; sessionId: string; replayId: string }[];
};
const directions = ['north','northeast','east','southeast','south','southwest','west','northwest'];
const text = (x: unknown, max = 200): x is string => typeof x === 'string' && x.length > 0 && x.length <= max;
const only = (x: unknown, keys: string[]): x is Record<string, any> => !!x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).every(k=>keys.includes(k));
/** Physical navigation identity, deliberately independent of shelf category labels/order. Never sent as geometry to the actor. */
export function navigationGeometryKey(environment: MarketEnvironment, cashiers?: Partial<MarketCashierAvailability>): string {
  const availability=Object.fromEntries(environment.checkouts.map(c=>[c.id,cashiers?.[c.id]??c.cashierPresent]));
  const rectangles=(rects: {x:number;y:number;width:number;height:number}[])=>rects.map(r=>({x:r.x,y:r.y,width:r.width,height:r.height}))
    .sort((a,b)=>a.x-b.x||a.y-b.y||a.width-b.width||a.height-b.height);
  return marketReplayFingerprint({seed:environment.seed,layoutId:environment.config.layoutId??'classic',world:environment.world,spawn:environment.spawn,
    walkableAreas:rectangles(environment.walkableAreas),walls:rectangles(environment.walls),
    obstacles:rectangles(getMarketEnvironmentObstacles(environment,availability)),
    checkoutOccupancy:availability,employeeAnchorPoints:environment.employees.map(e=>e.point).sort((a,b)=>a.x-b.x||a.y-b.y)});
}
export function reusableSpatialRoutes(prior: ConfirmedSpatialMemory | undefined, layoutKey: string, navigationKey: string): ConfirmedSpatialRoute[] {
  if(!prior||prior.navigationKey!==navigationKey)return [];
  return prior.routes.filter(r=>r.navigationKey===navigationKey&&(prior.layoutKey===layoutKey||r.action==='walkToAnchor'))
    .map(r=>({...structuredClone(r),...(prior.layoutKey!==layoutKey?{seenStationIds:[]}:{} )}));
}
export function validateConfirmedSpatialMemory(x: unknown): asserts x is ConfirmedSpatialMemory {
  if(!only(x,['version','layoutKey','navigationKey','stations','anchors','routes','previousLayouts']) || x.version!=='confirmed-observed-routes-v1' || !text(x.layoutKey)||!text(x.navigationKey)
    || !Array.isArray(x.stations)||x.stations.length>24 || !Array.isArray(x.anchors)||x.anchors.length>64
    || !Array.isArray(x.routes)||x.routes.length>48 || !Array.isArray(x.previousLayouts)||x.previousLayouts.length>3)
    throw new Error('Invalid bounded confirmed spatial memory');
  for(const s of x.stations) if(!only(s,['id','label','kind','anchorId','visits']) || ![s.id,s.label,s.kind].every(v=>text(v))
    || s.anchorId!==undefined&&!text(s.anchorId) || !Number.isSafeInteger(s.visits)||s.visits<0) throw new Error('Invalid observed spatial landmark');
  for(const a of x.anchors) if(!only(a,['id','neighbors','visits'])||!text(a.id)||!Array.isArray(a.neighbors)||a.neighbors.length>64
    || a.neighbors.some((v:unknown)=>!text(v))||!Number.isSafeInteger(a.visits)||a.visits<0) throw new Error('Invalid observed passage');
  for(const r of x.routes) if(!only(r,['action','from','to','label','direction','distanceBand','seenStationIds','navigationKey','evidence'])
    || !['walkToAnchor','walkTo'].includes(r.action)||r.from!==null&&!text(r.from)||![r.to,r.label].every(v=>text(v))
    ||!directions.includes(r.direction)||!['near','medium','far'].includes(r.distanceBand)||!text(r.navigationKey)
    ||!Array.isArray(r.seenStationIds)||r.seenStationIds.length>20||r.seenStationIds.some((v:unknown)=>!text(v))
    ||!only(r.evidence,['sessionId','replayId','traceId','stepId','stepIndex'])
    ||![r.evidence.sessionId,r.evidence.replayId,r.evidence.traceId,r.evidence.stepId].every(v=>text(v))
    ||!Number.isSafeInteger(r.evidence.stepIndex)||r.evidence.stepIndex<0) throw new Error('Spatial route requires executed actor-step provenance');
  for(const h of x.previousLayouts) if(!only(h,['layoutKey','landmarkLabels','routeCount','sessionId','replayId'])
    ||![h.layoutKey,h.sessionId,h.replayId].every(v=>text(v))||!Array.isArray(h.landmarkLabels)||h.landmarkLabels.length>24
    ||h.landmarkLabels.some((v:unknown)=>!text(v))||!Number.isSafeInteger(h.routeCount)||h.routeCount<0||h.routeCount>48)
    throw new Error('Invalid historical layout observation');
}

/** Reconstruct after a verified replay. It never reads the map or the generated actor memory. */
export class ConfirmedSpatialRecorder {
  private state: ConfirmedSpatialMemory;
  private currentAnchor: string | null = null;
  constructor(layoutKey: string, prior?: ConfirmedSpatialMemory, previousEvidence?: {sessionId:string;replayId:string}, navigationKey=layoutKey) {
    if(prior)validateConfirmedSpatialMemory(prior);
    const same=prior?.layoutKey===layoutKey;
    const sameNavigation=prior?.navigationKey===navigationKey;
    const previousLayouts=structuredClone(prior?.previousLayouts??[]);
    if(prior&&!same&&previousEvidence)previousLayouts.push({layoutKey:prior.layoutKey,landmarkLabels:prior.stations.map(s=>s.label),routeCount:prior.routes.length,...previousEvidence});
    this.state={version:'confirmed-observed-routes-v1',layoutKey,navigationKey,stations:same?structuredClone(prior.stations):[],
      anchors:sameNavigation?structuredClone(prior.anchors):[],routes:reusableSpatialRoutes(prior,layoutKey,navigationKey),
      previousLayouts:previousLayouts.filter(h=>h.layoutKey!==layoutKey).slice(-3)};
  }
  observe(o: ActorObservation) {
    for(const s of o.visibleStations)if(!this.state.stations.some(x=>x.id===s.id))
      this.state.stations.push({id:s.id,label:s.label,kind:s.kind,visits:0,...(this.currentAnchor?{anchorId:this.currentAnchor}:{})});
    for(const a of o.anchors)if(!this.state.anchors.some(x=>x.id===a.id))this.state.anchors.push({id:a.id,neighbors:[],visits:0});
    this.state.stations=this.state.stations.slice(-24);this.state.anchors=this.state.anchors.slice(-64);
    const ids=new Set(this.state.anchors.map(a=>a.id));for(const a of this.state.anchors)a.neighbors=a.neighbors.filter(id=>ids.has(id));
  }
  record(step: MarketReplayStep, before: ActorObservation, after: ActorObservation, evidence: EpisodeEvidence, navigationKey=this.state.navigationKey) {
    this.observe(before);
    if(step.type==='walkToAnchor'||step.type==='walkTo'){
      const target=step.type==='walkToAnchor'?before.anchors.find(a=>a.id===step.target.anchorId):before.visibleStations.find(s=>s.id===step.target.stationId);
      if(!target)throw new Error('Executed route target was not observed before movement');
      const to=target.id;
      this.state.routes.push({action:step.type,from:this.currentAnchor,to,label:target.label,direction:target.direction,distanceBand:target.distanceBand,
        seenStationIds:after.visibleStations.slice(0,20).map(s=>s.id),navigationKey,evidence:structuredClone(evidence)});
      this.state.routes=this.state.routes.slice(-48);
      if(step.type==='walkToAnchor'){
        const origin=this.state.anchors.find(a=>a.id===this.currentAnchor);if(origin&&!origin.neighbors.includes(to))origin.neighbors.push(to);
        this.currentAnchor=to;const anchor=this.state.anchors.find(a=>a.id===to);if(anchor)anchor.visits++;
      }else this.currentAnchor=null;
    }
    // A landmark first exposed by this move belongs to the arrival passage,
    // not to the previous anchor. Historical directions remain in the route.
    this.observe(after);
    if(step.type==='openShelf'||step.type==='talkToStaff'&&step.choice==='open'){
      const target=this.state.stations.find(s=>s.id===step.stationId);if(target)target.visits++;
    }
  }
  snapshot(){validateConfirmedSpatialMemory(this.state);return structuredClone(this.state);}
}
