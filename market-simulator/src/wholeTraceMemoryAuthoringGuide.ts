import { WHOLE_TRACE_GOAL_FIELDS } from './wholeTraceCognition';

/** Static writing guidance only: never runs cognition, fills declarations, or changes a candidate. */
export function buildWholeTraceMemoryAuthoringGuide() {
  return {
    guidanceRevision: 'pre-action-working-memory-v1' as const,
    scope: 'Read alongside persona.behavior.cognition and the existing working-memory/task instructions. Static examples do not calculate or fill actorState, memoryUses, uncertainty, task updates, actions or quantities. The execution authoring menu shows reference-only calculated pressures/statuses, observed product IDs and open goal IDs. Its separate currentObservation.readObjectives copies the current list observation from the validated accepted prefix, not remembered values. It never fills declarations; the AI still authors every value. Full submission validation is still required.',
    calculatedReference: {
      notice: '참고용 계산값: 보조기는 선언을 채우거나 고치지 않으며, 상태·불확실성·행동은 계속 AI가 선언한다.',
      baseline: 'The menu applies elapsed-time decay to retained open-goal fields, rounded to six decimals. By default it uses the previous activity and zero additional delay. Its assumptions are explicit; this is not an exact preview of an unspecified future activity/delay.',
      preview: 'Supply your own nextDecision.actorState.activity and delayMs to preview their pre-action decay. This reference excludes actor memoryUpdate/taskUpdate and supplies no remembered values. Append applies and validates the complete explicit draft through the same final execution guards.',
      observation: 'observedProductIds includes only products actually observed before the next action. A product revealed by opening the shelf being written cannot be its pre-action focusedProductId.',
      emptyValues: 'goalFields:[] means no active memory fields to calculate, openGoalIds:[] means no open tasks, and observedProductIds:[] means no products observed. None means the shopping list is absent. After readList, currentObservation.readObjectives may contain items before any goal is selected while these arrays remain empty. The actor still supplies taskUpdate, heldGoalIds, uncertainGoalIds, focus and memoryUses under the existing contract.',
      currentList: 'currentObservation has kind validated-prefix-observation-v1 and acceptedDecisionCount. Its optional readObjectives is the existing current offline execution observation, copied without worldReference or archived-list fallback. Absent means not currently displayed, not never read; present [] means a displayed empty list. Menu queries and nextDecision activity/delay previews do not create or consume a list observation.',
    },
    fields: [...WHOLE_TRACE_GOAL_FIELDS],
    preActionOrder: [
      '1. Use the current observation produced by the PREVIOUS accepted action. Include its elapsed action time and observed result; do not use the result of the action being written.',
      '2. Apply this decision\'s explicit taskUpdate and keep exactly the resulting open goals in heldGoalIds. Clearing focus or changing activity does not finish or abandon a task.',
      '3. Account for the current delayMs and the existing cognition profile. Refresh only fields in current actual readObjectives; other retained fields receive time/context pressure. Current OR previous interest activity applies interest pressure, including the first decision after interest.',
      '4. Apply explicit memoryUpdate after that decay. Declare uncertainGoalIds from the resulting held field states, then choose memoryUses modes matching those states. Previous decision annotations are not the current state.',
      '5. Only after these pre-action declarations are checked is the chosen action accepted. Its duration, result, newly read list or cart become observations for a later decision.',
    ],
    timing: {
      elapsed: 'deltaMs = max(0, runtimeObservation.elapsedMs - previousWorkingMemory.processedTimeMs) + currentDecision.delayMs; if runtimeObservation.elapsedMs is absent, deltaMs = delayMs. processedTimeMs advances monotonically to max(previous processedTimeMs, runtimeObservation.elapsedMs) + delayMs. runtimeObservation is the compiler internal ActorObservation; the menu currentObservation is a list-only projection. Its omitted elapsedMs does not mean zero elapsed time or authorize ignoring the previous action duration.',
      previousAction: 'The elapsed gap can include the PREVIOUS walk, browse, add or other action duration. Counting only current delayMs underestimates retention pressure. The CURRENT action duration is not counted before that action.',
      pressure: 'Use persona.behavior.cognition.coefficients and rules. Retention uses deltaMs; label ambiguity and quantity tracking use current delayMs. Related currently displayed labels affect name/specification. Previously accepted add/remove quantities enter unreviewedQuantityChanges once; a real list/cart observation resets that counter. These are separate terms.',
      thresholds: 'Apply the supplied uncertainThreshold/unavailableThreshold after pressure is rounded to six decimals. At uncertainThreshold the field is uncertain; at unavailableThreshold its value is removed. Switching away from interest, closing a station, or writing uncertainGoalIds:[] never resets pressure.',
    },
    pendingVersusFocus: {
      held: 'All open tasks remain held, including while focusedGoalId=null, basis.goalId=null, activity=interest/orient, or memoryUses=[]. Their retained fields still decay and may require uncertainty annotations. Pending does not mean currently focused.',
      release: 'Only the actor\'s explicit valid complete/abandon taskUpdate releases a selected task. Completion requires a prior accepted goal-bound add and its observed result, not a correct basket. Do not complete, abandon, reread, shorten a delay, or change activity just to avoid a memory rejection.',
      bound: 'In candidate 7, basis.goalId identifies the open task whose details are used, independently of momentary focus. Its name use is required except for the existing readList/viewCart/viewHelp recovery exception; a goal-bound add/remove also declares requiredQuantity. All memoryUses belong to that same goal.',
    },
    uncertainty: {
      required: 'Include each active goal with an uncertain/unavailable name or requiredQuantity, or an uncertain/unavailable specification that was actually displayed earlier. An undisplayed specification does not by itself require uncertainty. This applies even when no field is used in the current action.',
      declarationOnly: 'uncertainGoalIds reports the resulting field states; adding an ID does not change a clear field to uncertain, and omitting an ID does not restore an uncertain field. Extra known-goal uncertainty annotations are allowed by the existing contract. Use an explicit memoryUpdate only when expressing an actual belief update.',
      selfRecall: 'selfRecall requires actor-supplied belief values for a previously read field of an active goal; it always produces uncertain fields. It never retrieves archived answers. An unavailable field cannot be used as guess without explicit selfRecall or a real displayed list first.',
    },
    memoryUseModes: {
      remembered: 'An active CLEAR field with exactly the retained value, after current pre-action decay and updates. A correct hidden answer is insufficient when the field is uncertain/unavailable.',
      guess: 'An active UNCERTAIN field after decay/updates. The actor supplies the believed value; either a correct or mistaken value is permitted without comparing to the hidden answer. Merely listing the goal in uncertainGoalIds does not authorize guess while its field is still clear.',
      'current-display': 'That exact goal field/value must be in the CURRENT actual readObjectives. A prior list archive, worldReference, product detail, cart, help text, or the readList action being selected does not supply current-display.',
      value: 'Every use includes value: nonempty text for name/specification, integer 1..99 for requiredQuantity. The action quantity remains the actor\'s independently selected quantity; it is never copied from, compared with, or corrected to the memory belief.',
    },
    listTiming: {
      beforeRead: 'Selecting readList is a pre-action decision: preserve the current memory state and its uncertainty. Do not claim the upcoming list values or clear uncertainty in that same decision unless a list is already actually displayed in the current observation.',
      afterRead: 'A later decision with actual readObjectives refreshes the displayed held fields to clear/pressure 0. Only an explicitly displayed specification refreshes specification. Cart observations confirm purchased counts, never the requested quantity.',
      menuLifetime: 'The execution menu exposes readObjectives for the existing observation immediately after accepted readList. A rejected draft preserves it; the next accepted non-readList action removes the display. A previous menu is not current-display after that transition. Displayed items do not automatically select a goal or populate actorState, and empty advisory arrays are not a reason to infer list absence.',
    },
    references: {
      goalId: 'Use the exact objective ID actually read in this request for heldGoalIds, uncertainGoalIds, taskUpdate, focusedGoalId, basis.goalId, memoryUpdate and memoryUses. Never use a product ID, label, guessed numeric suffix, or another request\'s ID. A worldReference listing alone is not a read.',
      objectiveCue: 'objective:<id> is a cue reference; the corresponding goalId is the exact <id>, without that prefix. In candidate 7 a raw basis.cueRefs objective reference requires a bound open basis.goalId and its existing memory-use rules. Known triggerCueRefs and compiler-derived proofs are separate annotations and never restore remembered values. Do not move or strip references automatically to make a candidate pass.',
    },
    pendingAfterInterestExample: {
      scope: 'Illustrative arithmetic for the supplied example coefficients only; not a required action, delay, belief, or copied candidate fragment. Use the actual state/profile of this request.',
      before: { requiredQuantityPressure: 0.607059, previousActivity: 'interest', requiredQuantity: 1,
        unreviewedQuantityChanges: 1, previousProcessedTimeMs: 48697 },
      current: { observationElapsedMs: 50197, delayMs: 850, activity: 'orient', focusedGoalId: null },
      coefficients: { delay: 0.12, interest: 0.48, countTracking: 0.06 },
      calculation: 'deltaMs = (50197 - 48697) + 850 = 2350. Retention = 2350/60000*0.12 + 2350/12000*0.48 = 0.0987 because the previous activity was interest. Quantity tracking = 850/16000*0.06*(0 + 1/3) = 0.0010625. round6(0.607059 + 0.0987 + 0.0010625) = 0.706822.',
      consequence: 'With uncertainThreshold=0.7, the still-held goal must appear in uncertainGoalIds before this orient action, even with null focus and no memoryUses. The annotation does not require a guess, a purchase, a list read, or a different action.',
    },
  };
}
