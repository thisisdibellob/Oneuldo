import { createHash, randomUUID } from 'node:crypto';
import { extendedActorChoices as actorChoices, presentActorChoices } from './actorChoices';
import { REMEMBERED_ROUTE_CONTRACT, rememberedRouteCues } from './rememberedRoute';
import { assertDecision, LUNA_ACTOR_POLICY_VERSION } from './llmPolicy';
import type { ActorObservation, ActorPersona, Decision, Persona, ResearchPersona, TraceEntry } from './types';
import { IncrementalCognition, type IncrementalCognitionDeclaration, type IncrementalCognitionFrame } from './incrementalCognition';

export const ACTOR_PLAN_MODEL = 'gpt-6-luna' as const;
export const ACTOR_PLAN_REASONING = 'low' as const;
export type PlanFrame = { sessionId: string; revision: number; observation: ActorObservation;
  persona: ResearchPersona | {id:string;version:string;name:string;character?:Pick<NonNullable<Persona['character']>,'name'|'age'|'goal'|'selectedTraits'|'strengths'|'preferences'|'familiarCategories'|'familiarProductIds'|'practicedStrategies'>};
  experience: unknown; activity: unknown; availableChoices: {id:string;label:string;action:Decision['action']}[];
  cognition?: IncrementalCognitionFrame;
  choiceSemantics: {walkToAnchor:string;readList:string;pauseAndLookAround:string} };

/** A per-trace request/response mailbox. The normal attention loop remains the only executor. */
export class ActorPlanSession {
  readonly id = randomUUID();
  readonly model = ACTOR_PLAN_MODEL;
  readonly reasoning = ACTOR_PLAN_REASONING;
  readonly policyVersion: 'episodic-choice-v10' | 'episodic-choice-v11';
  private cognition?: IncrementalCognition;
  private revision = 0;
  private frame: PlanFrame | null = null;
  private waiter: ((decisions: Decision[]) => void) | null = null;
  private frameWaiters: Array<()=>void> = [];
  private queued: Decision[] = [];
  private previousFingerprint = '';
  private stopped = false;
  private accepted = 0;
  constructor(options: {policyVersion?: 'episodic-choice-v10' | 'episodic-choice-v11'} = {}) {
    this.policyVersion=options.policyVersion??LUNA_ACTOR_POLICY_VERSION;
    if (!['episodic-choice-v10','episodic-choice-v11'].includes(this.policyVersion)) throw new Error('Unsupported direct actor plan policy');
  }
  recordAccepted(){ this.accepted++; }
  recordApplied(after:ActorObservation) { if(this.cognition)this.cognition.applied(after); }
  get cognitionProof() { return this.cognition?.proof(); }

  get status() { return { sessionId:this.id, revision:this.revision, acceptedActions:this.accepted, waiting:Boolean(this.waiter), complete:this.stopped }; }
  observe() { if (!this.frame) throw new Error('No actor observation is waiting'); return structuredClone(this.frame); }
  async awaitObserve(timeoutMs=30000):Promise<PlanFrame|{status:'complete'}>{
    if(this.frame)return this.observe(); if(this.stopped)return {status:'complete'};
    await new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>{this.frameWaiters=this.frameWaiters.filter(w=>w!==wake);reject(new Error('Actor observation did not become available within 30 seconds'));},timeoutMs);
      const wake=()=>{clearTimeout(timer);resolve();};this.frameWaiters.push(wake);
    });
    return this.frame?this.observe():{status:'complete'};
  }

  append(input: { revision:number; choiceIds:string[]; delayMs:number[]; reasons:string[]; currentTasks?:Array<string|null>; cognition?:IncrementalCognitionDeclaration }) {
    if (this.stopped || !this.waiter || !this.frame) throw new Error('Plan session is not awaiting a plan');
    if (input.revision !== this.revision) throw new Error('Stale plan revision');
    const n=input.choiceIds?.length;
    if (!Number.isInteger(n) || n < 1 || n > 3 || input.delayMs?.length!==n || input.reasons?.length!==n
      || (input.currentTasks && input.currentTasks.length!==n)) throw new Error('A plan must contain 1..3 complete decisions');
    if(this.policyVersion==='episodic-choice-v11' && n!==1) throw new Error('v11 requires exactly one current action and its memory declaration');
    if(this.policyVersion==='episodic-choice-v10' && input.cognition!==undefined) throw new Error('v10 does not accept the v11 cognition contract');
    const decisions=input.choiceIds.map((id,i)=>{
      const choice=this.frame!.availableChoices.find(c=>c.id===id);
      if(!choice) throw new Error(`Choice is not available in revision ${this.revision}`);
      const d:Decision={action:choice.action,delayMs:input.delayMs[i],reason:input.reasons[i],...(input.currentTasks?.[i]?{currentTask:input.currentTasks[i]!}:{}),
        ...(this.policyVersion==='episodic-choice-v11'?{cognition:structuredClone(input.cognition)}:{})};
      assertDecision(d); return d;
    });
    if(this.policyVersion==='episodic-choice-v11') {
      if(!this.cognition)throw new Error('v11 cognition has not been connected to the current observation');
      this.cognition.preview(this.frame.observation,input.cognition,decisions[0].action,decisions[0].delayMs);
    }
    this.queued=decisions;
    const resolve=this.waiter; this.waiter=null; this.frame=null; resolve(decisions);
    return {accepted:n,revision:this.revision};
  }

  async decide(observation:ActorObservation, history:TraceEntry[], persona:ActorPersona, activity:unknown, state:unknown):Promise<Decision>{
    if(this.stopped) throw new Error('Plan session is closed');
    let cognitiveFrame:IncrementalCognitionFrame|undefined;
    if(this.policyVersion==='episodic-choice-v11') {
      this.cognition??=new IncrementalCognition(persona);
      cognitiveFrame=this.cognition.frame(observation);
      const engineFrame=(state as any)?.cognition;
      if(!engineFrame || JSON.stringify(engineFrame)!==JSON.stringify(cognitiveFrame))
        throw new Error('v11 runtime cognition is not connected or its applied callback differs from the actor session');
    }
    const observed=(state as any)?.observedThisVisit;
    // remembered-route-v1 learners only (v11 with spatial memory); otherwise no annotation and identical choices.
    const st=state as any, recall=this.policyVersion==='episodic-choice-v11'&&st?.previousRouteRecall?.contract===REMEMBERED_ROUTE_CONTRACT
      &&st?.previousSpatialExperience?.navigationMatches===true
      ? rememberedRouteCues(st.previousSpatialExperience.routes??[],observation,new Map((observed?.discoveries?.stations??[]).map((s:any)=>[s.id,s.label])))
      : undefined;
    const choices=presentActorChoices(actorChoices(observation,observed?{anchors:observed.discoveries.anchors,currentAnchor:observed.currentAnchor}:undefined,recall),this.id,history.length);
    const memory=(state as any)?.observedThisVisit;
    const stableObservation={phase:observation.phase,view:observation.view,activeStation:observation.activeStation,
      visibleStations:observation.visibleStations,anchors:observation.anchors,products:observation.products,shelf:observation.shelf,
      listAvailable:observation.listAvailable,readObjectives:observation.readObjectives,instructions:observation.instructions,
      supportText:observation.supportText,cart:observation.cart,removableProductIds:observation.removableProductIds,
      staffLocationHelp:observation.staffLocationHelp,locationChoices:observation.locationChoices,staffMessage:observation.result?.message,
      cashiers:observation.cashiers,lastActionError:observation.lastActionError,
      rejectedResult:observation.result?.accepted===false?observation.result:null};
    const stableMemory={currentAnchor:memory?.currentAnchor,traveledEdges:memory?.traveledEdges,
      discoveredStations:memory?.discoveries?.stations?.map((s:any)=>[s.id,s.label,s.kind]).sort((a:any,b:any)=>a[0].localeCompare(b[0])),
      discoveredAnchors:memory?.discoveries?.anchors?.map((a:any)=>[a.id,[...a.neighbors].sort(),a.visits]).sort((a:any,b:any)=>a[0].localeCompare(b[0])),
      discoveredProducts:memory?.discoveries?.knownProducts?.map((p:any)=>p.id).sort()};
    const fingerprint=createHash('sha256').update(JSON.stringify({observation:stableObservation,memory:stableMemory,choices:choices.map(c=>c.id).sort()})).digest('hex');
    if(this.queued.length && fingerprint===this.previousFingerprint) {
      const decision=this.queued.shift()!; return decision;
    }
    this.queued=[];
    this.revision++;
    this.previousFingerprint=fingerprint;
    const character='scope' in persona ? undefined : persona.character;
    this.frame={sessionId:this.id,revision:this.revision,observation:structuredClone(observation),
      persona:'scope' in persona ? structuredClone(persona) : {id:persona.id,version:persona.version,name:persona.name,...(character?{character:{name:character.name,age:character.age,goal:character.goal,
        selectedTraits:character.selectedTraits,strengths:character.strengths,preferences:character.preferences,
        familiarCategories:character.familiarCategories,familiarProductIds:character.familiarProductIds,practicedStrategies:character.practicedStrategies}}:{})},
      experience:structuredClone(state),activity:structuredClone(activity),
      ...(cognitiveFrame?{cognition:cognitiveFrame}:{}),
      availableChoices:choices.map(choice=>({id:choice.id,label:choice.label,action:choice.action,
        ...(this.policyVersion==='episodic-choice-v11'&&'effect'in choice?{effect:choice.effect}:{}),
        ...(this.policyVersion==='episodic-choice-v11'&&'observedContext'in choice?{observedContext:choice.observedContext}:{})})),
      choiceSemantics:{walkToAnchor:'Only currently observed visible passages are offered; movement follows ordinary in-app walking controls.',
        readList:'Reading exposes displayed list contents, which remain available in observed memory.',
        pauseAndLookAround:'These actions wait in place and do not reveal another area.'}};
    for(const wake of this.frameWaiters.splice(0))wake();
    const selected=await new Promise<Decision[]>(resolve=>{this.waiter=resolve;});
    const decision=selected.shift()!; this.queued=selected; return decision;
  }

  close(){ this.stopped=true; this.queued=[]; if(this.waiter){this.waiter([]);this.waiter=null;} this.frame=null; for(const wake of this.frameWaiters.splice(0))wake(); }
  complete(){ this.stopped=true; this.queued=[]; this.frame=null; for(const wake of this.frameWaiters.splice(0))wake(); }
}
