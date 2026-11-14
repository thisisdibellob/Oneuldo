import { createHash } from 'node:crypto';
import { getPersona } from './personas';
import { WholeTraceCognitionEngine, buildWholeTraceCognitionProfile,
  type WholeTraceCognitionActorState, type WholeTraceCognitionProfile, type WholeTraceCognitionPreview,
  type WholeTraceCognitionState, type WholeTraceMemoryUse } from './wholeTraceCognition';
import { WholeTraceTaskMemoryEngine, type WholeTraceTaskActorState, type WholeTraceTaskBasis,
  type WholeTraceTaskPreview, type WholeTraceTaskState } from './wholeTraceTaskMemory';
import type { ActorObservation, ActorPersona, PolicyAction } from './types';

export const INCREMENTAL_COGNITION_CONTRACT = 'observed-working-and-task-memory-v1' as const;
export const INCREMENTAL_COGNITION_INSTRUCTIONS = `The v11 current frame includes the existing working-memory and persistent-task engines, projected through the current observation BEFORE your chosen delay. The controller validates your declaration, executes your unchanged action, then commits only an accepted action. Neither engine chooses an action or checks its purchase correctness. These are explicit synthetic engineering settings, not clinical measurements or a requirement to forget or succeed.
Return one current choice with cognition:{actorState,basis}. actorState has activity, heldGoalIds, uncertainGoalIds, focusedGoalId, focusedProductId, memoryUpdate:[], taskUpdate:[]. basis has intent, goalId, memoryUses:[]. activity/intent are explore,interest,task,check,recover,help,finish,rest. Use current actual goal IDs, never examples or product IDs as goal IDs.
After readList has actually returned observation.readObjectives and no task is open, choose at least one displayed goal through taskUpdate:[{type:"select",goalId:ID}] unless ending. heldGoalIds must equal all open tasks AFTER your updates and fit profile.goalMemoryCapacity. Keep open tasks through exploration, interest, rest or focus changes; release only with explicit complete or abandon. complete requires a previously accepted add bound to that goal AND its observed result; it records your belief, not shopping success. The readList action itself does not yet know its future displayed goals.
task/recover intent needs basis.goalId for an open task. explore/interest/rest/finish use null. check/help may use null or an open task. focusedGoalId is null or the same open goal as basis.goalId. Every declared memoryUse belongs to basis.goalId. A goal-bound action needs the name memoryUse; a goal-bound add/remove also needs requiredQuantity. readList/viewCart/viewHelp may seek cues without name access. A purchase without a goal needs explicit interest activity and intent. You still select the product and added/removed quantity; the controller never repairs them against your belief.
Each memoryUse is {goalId,field:"name"|"specification"|"requiredQuantity",mode:"remembered"|"guess"|"current-display",value}. current-display requires that exact field/value in CURRENT observation.readObjectives. remembered requires a clear matching value in current workingMemory. guess needs an uncertain active field and may be wrong. If unavailable, first explicitly selfRecall with believed values through memoryUpdate:[{type:"selfRecall",goalId:ID,values:{name:YOUR_BELIEF,requiredQuantity:YOUR_BELIEF}}], or read the real list. Recall remains uncertain; archives never restore a clear value. Never-displayed fields cannot be recalled. A real list observation refreshes held goal fields. Product detail alone never supplies the requested specification. Include every uncertain/unavailable active goal in uncertainGoalIds after your delay and updates; the frame/validation error reports the computed state. Omit nonexistent updates with [] rather than inventing a state transition. Historical route memories are past observations and may be stale after layout changes. No mistake, help, detour, purchase or recovery quota is imposed.`;
export type IncrementalCognitionDeclaration = {
  actorState: WholeTraceCognitionActorState & WholeTraceTaskActorState & { focusedProductId?: string | null };
  basis: WholeTraceTaskBasis & { memoryUses: WholeTraceMemoryUse[] };
};
export type IncrementalCognitionProfile = {
  profile: WholeTraceCognitionProfile;
  source: { personaId: string; personaVersion: string; profileHash: string;
    actorPersonaId: string; actorPersonaVersion: string; adapter: 'original-persona' | 'research-minjae-explicit-engineering-v1';
    familiaritySource: string; interpretation: string };
};
export type IncrementalCognitionFrame = {
  contract: typeof INCREMENTAL_COGNITION_CONTRACT; profile: WholeTraceCognitionProfile;
  source: IncrementalCognitionProfile['source']; workingMemory: WholeTraceCognitionState;
  taskMemory: WholeTraceTaskState; stateTiming: 'current-observation-before-selected-delay';
  validatedDecisions: number; committedDecisions: number;
};
export type IncrementalCognitionAuditEntry = {
  contract: typeof INCREMENTAL_COGNITION_CONTRACT; observationSequence?: number;
  declaration: IncrementalCognitionDeclaration; action: PolicyAction; delayMs: number; accepted: boolean;
  workingMemory: WholeTraceCognitionState; taskMemory: WholeTraceTaskState;
  cognitionEvents: WholeTraceCognitionPreview['events']; taskEvents: WholeTraceTaskPreview['events'];
};

/** Research-v2 intentionally has no clinical/numeric capacity. This explicit
 * adapter reuses only the existing engine coefficients, never its source
 * personality, preference, task answer, map or prompt. */
export function incrementalCognitionProfile(persona: ActorPersona): IncrementalCognitionProfile {
  const research = 'scope' in persona;
  if (research && persona.id !== 'adult-minjae-unit-support-research-v2')
    throw new Error(`No explicit incremental cognition adapter for ${persona.id}`);
  const original = 'scope' in persona ? getPersona('mild-intellectual-disability-adult') : persona;
  if('scope' in original)throw new Error('The existing cognition coefficient source must be a numeric engineering profile');
  const profile = buildWholeTraceCognitionProfile(original);
  // Familiarity is individual knowledge, not a numeric engine coefficient.
  // Research Minjae's authored natural-language preferences do not assert exact
  // catalogue IDs, so importing another person's apple/curry familiarity would
  // silently add knowledge. Leave this engine modifier empty; keep the actor's
  // actual research preferences unchanged in its own persona input.
  if(research)profile.familiarProductIds=[];
  return { profile, source: {
    personaId: original.id, personaVersion: original.version,
    profileHash: createHash('sha256').update(JSON.stringify(profile)).digest('hex'),
    actorPersonaId: persona.id, actorPersonaVersion: persona.version,
    adapter: research ? 'research-minjae-explicit-engineering-v1' : 'original-persona',
    familiaritySource:research
      ? 'No exact catalogue-ID familiarity mapping is asserted by research-v2; [] prevents importing another persona\'s knowledge. Authored natural-language preferences remain in the actor persona.'
      : 'Selected original persona character.familiarProductIds',
    interpretation: research
      ? 'Explicit engineering reuse of the existing cognition coefficients only. Research Minjae identity, strengths, preferences and instructions remain unchanged. These values are not measured memory capacity, clinical equivalence or an obligation to forget, fail or succeed.'
      : 'Existing selected persona cognition coefficients; synthetic engineering settings, not clinical measurements.',
  } };
}

const activities = new Set(['explore','interest','task','check','recover','help','finish','rest']);
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function declaration(value: unknown): asserts value is IncrementalCognitionDeclaration {
  if (!object(value) || Object.keys(value).some(k => !['actorState','basis'].includes(k))
    || !object(value.actorState) || !object(value.basis)) throw new Error('v11 requires cognition:{actorState,basis}');
  const s=value.actorState, b=value.basis;
  if (Object.keys(s).some(k=>!['activity','heldGoalIds','uncertainGoalIds','focusedGoalId','focusedProductId','memoryUpdate','taskUpdate'].includes(k))
    || !activities.has(s.activity as string) || !Array.isArray(s.heldGoalIds) || !Array.isArray(s.uncertainGoalIds)
    || !(s.focusedGoalId === null || typeof s.focusedGoalId === 'string')) throw new Error('Invalid v11 cognition actorState');
  if (Object.keys(b).some(k=>!['intent','goalId','memoryUses'].includes(k)) || !activities.has(b.intent as string)
    || !(b.goalId === null || typeof b.goalId === 'string') || !Array.isArray(b.memoryUses)) throw new Error('Invalid v11 cognition basis');
}

/** Adapter around the ORIGINAL two engines. It receives only actual actor
 * observations and declarations. No mission snapshot, hidden goals or catalogue
 * is accepted, and it never selects or repairs a gameplay action. */
export class IncrementalCognition {
  readonly configuration: IncrementalCognitionProfile;
  private readonly cognition: WholeTraceCognitionEngine;
  private readonly tasks: WholeTraceTaskMemoryEngine;
  private pending?: { observation: ActorObservation; declaration: IncrementalCognitionDeclaration;
    action: PolicyAction; delayMs: number; cognition: WholeTraceCognitionPreview; tasks: WholeTraceTaskPreview };
  private validated = 0;
  private committed = 0;
  private audit: IncrementalCognitionAuditEntry[] = [];
  constructor(persona: ActorPersona) {
    this.configuration=incrementalCognitionProfile(persona);
    this.cognition=new WholeTraceCognitionEngine(this.configuration.profile);
    this.tasks=new WholeTraceTaskMemoryEngine(this.configuration.profile.goalMemoryCapacity);
  }
  frame(observation: ActorObservation): IncrementalCognitionFrame {
    const state=this.cognition.snapshot();
    // A pure projection of elapsed time/current display, not an accepted actor
    // action. The actor still chooses tasks and declares its actual memory use.
    const projected=this.cognition.preview(observation, {
      activity:state.context.activity ?? 'explore', heldGoalIds:state.activeGoals.map(g=>g.goalId),
      uncertainGoalIds:[...new Set([...state.knownGoalIds,...(observation.readObjectives??[]).map(g=>g.id)])], focusedGoalId:null,
    }, [], 1);
    if (!projected.valid) throw new Error('Cannot project v11 working memory: '+projected.errors.join('; '));
    return { contract:INCREMENTAL_COGNITION_CONTRACT, profile:structuredClone(this.configuration.profile),
      source:structuredClone(this.configuration.source), workingMemory:projected.state, taskMemory:this.tasks.snapshot(),
      stateTiming:'current-observation-before-selected-delay', validatedDecisions:this.validated, committedDecisions:this.committed };
  }
  preview(observation: ActorObservation, value: unknown, action: PolicyAction, delayMs: number) {
    this.pending=undefined;
    declaration(value);
    const taskCheck=this.tasks.preview(observation,value.actorState,value.basis,action);
    const memoryCheck=this.cognition.preview(observation,value.actorState,value.basis.memoryUses,delayMs);
    const errors=[...taskCheck.errors,...memoryCheck.errors];
    if ((action.type==='add'||action.type==='remove') && value.basis.goalId===null
      && (value.basis.intent!=='interest'||value.actorState.activity!=='interest'))
      errors.push('A purchase/return needs an actor-declared goal or explicit personal-interest activity');
    if (errors.length) throw new Error('Invalid v11 working/task memory: '+errors.join('; ')
      +'; projected uncertainGoalIds='+JSON.stringify(memoryCheck.state.uncertainGoalIds));
    this.pending={observation:structuredClone(observation),declaration:structuredClone(value),action:structuredClone(action),delayMs,
      cognition:memoryCheck,tasks:taskCheck};
    this.validated++;
  }
  applied(after: ActorObservation): IncrementalCognitionAuditEntry {
    if (!this.pending) throw new Error('v11 applied action has no validated cognition declaration');
    const p=this.pending;this.pending=undefined;
    const accepted=after.result?.accepted!==false;
    const workingMemory=accepted?this.cognition.commit():this.cognition.snapshot();
    const taskMemory=accepted?this.tasks.commit():this.tasks.snapshot();
    if (accepted) this.committed++;
    const entry:IncrementalCognitionAuditEntry={contract:INCREMENTAL_COGNITION_CONTRACT,
      ...(p.observation.sequence!==undefined?{observationSequence:p.observation.sequence}:{}),
      declaration:p.declaration,action:p.action,delayMs:p.delayMs,accepted,workingMemory,taskMemory,
      cognitionEvents:p.cognition.events,taskEvents:p.tasks.events};
    this.audit.push(structuredClone(entry));return entry;
  }
  proof() { return { contract:INCREMENTAL_COGNITION_CONTRACT, configuration:structuredClone(this.configuration),
    validatedDecisions:this.validated,committedDecisions:this.committed,workingMemory:this.cognition.snapshot(),
    taskMemory:this.tasks.snapshot(),decisions:structuredClone(this.audit) }; }
}
