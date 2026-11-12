import { createWholeTraceSourceAuthoringCursor, WholeTraceSourceAuthoringError,
  type WholeTraceSourceDecisionDraft } from './wholeTraceAuthoringSource';
import { validateWholeTracePrefix, WholeTraceCompileError } from './wholeTraceCompiler';
import type { WholeTraceBundle, WholeTraceSettings, WholeTraceTaskChoiceDecision } from './wholeTraceContracts';
import type { ActorObservation } from './types';
import { canonicalMarketReplayJson } from '../../frontend/src/game/marketReplayTrace';
import type { WholeTraceChoiceFrame } from './wholeTraceChoices';
import { wholeTraceHasAnchorMovementFeedback } from './wholeTraceMovementFeedback';

export type WholeTraceAuthoringOptions = { maxRewritesPerDecision?: number };
export type WholeTraceAuthoringAttempt = {
  decisionIndex: number; decisionNumber: number; attempts: number; rewriteCount: number;
  firstAttemptPassed: boolean; accepted: boolean; rejectedRules: string[];
  originalEnding?: 'nonterminal' | 'submit' | 'giveUp';
};
export type WholeTraceAuthoringRewrite = {
  status: 'awaiting-rewrite' | 'exhausted'; decisionIndex: number; decisionNumber: number;
  acceptedDecisionCount: number; remainingRewrites: number; message: string;
};
export type WholeTraceAuthoringObservation = {
  kind: 'validated-prefix-observation-v1' | 'validated-prefix-observation-v2' | 'validated-prefix-observation-v3' | 'validated-prefix-observation-v4'; acceptedDecisionCount: number; notice: string;
  readObjectives?: ActorObservation['readObjectives'];
  observation?: ActorObservation;
};
const error = (code: string, message: string) => Object.assign(new Error(message), { code });

/** Offline checks only. Every action, state and belief remains an actor declaration. */
export async function createWholeTraceExecutionAuthoringCursor(settings: WholeTraceSettings,
  bundle: WholeTraceBundle, options: WholeTraceAuthoringOptions = {}) {
  settings = structuredClone(settings); bundle = structuredClone(bundle);
  const maxRewritesPerDecision = options.maxRewritesPerDecision ?? 3;
  if (!Number.isInteger(maxRewritesPerDecision) || maxRewritesPerDecision < 0)
    throw error('AUTHORING_SCHEMA', 'maxRewritesPerDecision must be a nonnegative integer');
  let cursor = createWholeTraceSourceAuthoringCursor(bundle);
  const continuous = bundle.movementVersion === 'directional-v2';
  const decisions: WholeTraceTaskChoiceDecision[] = [], attempts: WholeTraceAuthoringAttempt[] = [];
  let failed = false, busy = false, failureCode = 'AUTHORING_REWRITE_LIMIT';
  const candidate = () => ({ candidateVersion: '7' as const, requestId: bundle.requestId,
    decisions: structuredClone(decisions) });
  // Bind the concrete control, not basis.intent: a walk toward checkout and
  // giveUp can both declare "finish". Unknown/malformed references do not
  // establish a terminal intent and cannot acquire one through a retry.
  const endingOf = (draft: WholeTraceSourceDecisionDraft): NonNullable<WholeTraceAuthoringAttempt['originalEnding']> => {
    const action = bundle.choiceCatalog.entries.find(entry => entry.choiceId === draft?.choiceRef?.choiceId)?.action.type;
    return action === 'submit' || action === 'giveUp' ? action : 'nonterminal';
  };
  let prefix = await validateWholeTracePrefix(settings, bundle, candidate());
  const frames: { frame: WholeTraceChoiceFrame; observation: ActorObservation }[] = [];
  if (continuous) {
    cursor.acceptExecutionFrame(prefix.choiceFrame!, prefix.before, 0);
    frames.push({ frame: structuredClone(prefix.choiceFrame!), observation: structuredClone(prefix.before) });
  }
  const expectedSource = () => continuous && !prefix.terminal ? {
    expectedSource: { acceptedActions: decisions.length, source: structuredClone(prefix.choiceFrame!.source) },
  } : {};
  const metrics = () => {
    const firstAttemptPassCount = attempts.filter(row => row.firstAttemptPassed).length;
    return { rewriteContract: 'terminal-intent-preserved-v1' as const,
      finalizationContract: 'incomplete-finalization-fails-request-v1' as const,
      maxRewritesPerDecision, failed, ...(failed ? { failureCode } : {}), decisions: structuredClone(attempts),
      firstAttemptPassCount, attemptedDecisionCount: attempts.length,
      firstAttemptAccuracy: attempts.length ? firstAttemptPassCount / attempts.length : null };
  };
  type NextDecision = { actorState: Pick<WholeTraceTaskChoiceDecision['actorState'], 'activity'>; delayMs: number };
  const menu = async (nextDecision?: NextDecision) => {
    // Capture one accepted boundary before awaiting a preview. Another append
    // may finish while it runs; never combine old perception with new choices.
    const sourceMenu = cursor.menu();
    const preview = nextDecision
      ? await validateWholeTracePrefix(settings, bundle, candidate(), { nextDecision, ...expectedSource() }) : prefix;
    // Anchor menu v2 supplies contextual labels from the static catalogue.
    // Append only accepted-history marks, preserving that menu's order and cues.
    if (wholeTraceHasAnchorMovementFeedback(bundle.movementFeedbackVersion)) {
      const mark = <T extends { choiceId: string; label: string }>(choice: T): T => {
        const recentVisit = preview.choiceFrame?.availableChoices.find(entry => entry.choiceId === choice.choiceId)?.recentVisit;
        return recentVisit ? { ...choice, label: `${choice.label} · 최근에 ${recentVisit.timesArrived}번 간 통로`,
          recentVisit: structuredClone(recentVisit) } : choice;
      };
      sourceMenu.availableChoices = sourceMenu.availableChoices.map(mark);
      sourceMenu.visibleWalkChoices = sourceMenu.visibleWalkChoices.map(mark);
    }
    const currentObservation: WholeTraceAuthoringObservation = {
      kind: continuous ? 'validated-prefix-observation-v2' : bundle.observationVersion
        ? 'validated-prefix-observation-v4' : 'validated-prefix-observation-v3', acceptedDecisionCount: preview.acceptedActions,
      notice: '오프라인 접두 실행에서 공용 observeActor가 반환한 현재 화면 관찰이다. 보이는 표지의 방향·거리·near는 현재 표시이며, near:false는 아직 상호작용할 수 없다는 뜻이다. observation은 지도·경로·미관찰 상품이나 목표를 보충하지 않는다. readObjectives가 없으면 현재 미표시이며 읽은 적이 없다는 뜻은 아니다. readObjectives:[]이면 표시된 빈 목록이다. 행동·상태 선언은 계속 AI가 작성한다.',
      // The saved control menu contains only nearby interactions. A visible
      // sign can still be too far to open, and help/products exist only on their
      // current panels. Preserve the exact public observation rather than
      // mistaking the absence of an enabled control for absence from the screen.
      observation: structuredClone(preview.before),
      ...(preview.before.readObjectives === undefined ? {} : {
        readObjectives: structuredClone(preview.before.readObjectives),
      }),
      ...(continuous ? { notice: '같은 prefix를 앱과 공용 입력·충돌 함수로 실행한 현재 화면이다. 좌표·지도·목적지·이동 수치는 제공하지 않는다. 배우가 다음 행동을 선택한다.' } : {}),
    };
    return { ...sourceMenu, currentObservation, advisory: structuredClone(preview.advisory),
      ...(preview.movementResult ? { movementResult: structuredClone(preview.movementResult) } : {}),
      ...(preview.movementNotes ? { movementNotes: [...preview.movementNotes] } : {}) };
  };
  return {
    menu, metrics,
    async append(draft: WholeTraceSourceDecisionDraft) {
      if (busy) throw error('AUTHORING_BUSY', 'Wait for the pending decision before submitting another');
      if (failed) throw error(failureCode, 'This authoring request is closed after its recorded failure');
      busy = true;
      const decisionIndex = decisions.length, decisionNumber = decisionIndex + 1;
      const record = attempts[decisionIndex] ??= { decisionIndex, decisionNumber, attempts: 0,
        rewriteCount: 0, firstAttemptPassed: false, accepted: false, rejectedRules: [] };
      record.attempts++; record.rewriteCount = record.attempts - 1;
      try {
        const ending = endingOf(draft);
        if (record.attempts === 1) record.originalEnding = ending;
        else if (ending !== record.originalEnding) {
          const message = `Technical rewrites must preserve the first draft's terminal intent (${record.originalEnding}); received ${ending}. No action was accepted or substituted.`;
          throw new WholeTraceSourceAuthoringError('AUTHORING_REWRITE_CHANGED_ENDING', message,
            [{ path: 'choiceRef.choiceId', rule: 'AUTHORING_REWRITE_CHANGED_ENDING', message }]);
        }
        if (continuous && prefix.terminal) throw new WholeTraceSourceAuthoringError('AUTHORING_TERMINAL', 'The actor already selected a terminal action');
        // Stage both symbolic and execution checks. No rejected proposal can
        // advance the source, observations, task declarations or working memory.
        const staged = createWholeTraceSourceAuthoringCursor(bundle);
        for (const [index, prior] of decisions.entries()) {
          if (continuous) staged.acceptExecutionFrame(frames[index].frame, frames[index].observation, index);
          const { source: _source, ...choiceRef } = prior.choiceRef;
          const replayed = staged.append({ ...structuredClone(prior), choiceRef });
          if (continuous && canonicalMarketReplayJson(replayed) !== canonicalMarketReplayJson(prior))
            throw new WholeTraceCompileError({ valid: false, errors: ['Accepted prefix source changed during authoring'], code: 'CHOICE_SOURCE_MISMATCH' });
        }
        if (continuous) staged.acceptExecutionFrame(prefix.choiceFrame!, prefix.before, decisions.length);
        const decision = staged.append(draft);
        const checked = await validateWholeTracePrefix(settings, bundle,
          { ...candidate(), decisions: [...structuredClone(decisions), decision] }, expectedSource());
        if (continuous && !checked.terminal) staged.acceptExecutionFrame(checked.choiceFrame!, checked.before, checked.acceptedActions);
        if (continuous && checked.terminal) staged.acceptExecutionTerminal(checked.acceptedActions);
        decisions.push(decision); cursor = staged; prefix = checked;
        if (continuous && !checked.terminal) frames.push({ frame: structuredClone(checked.choiceFrame!), observation: structuredClone(checked.before) });
        record.accepted = true; record.firstAttemptPassed = record.attempts === 1;
        return { accepted: true as const, decision: structuredClone(decision), decisionIndex, decisionNumber,
          menu: await menu(), metrics: metrics() };
      } catch (cause) {
        if (!(cause instanceof WholeTraceSourceAuthoringError) && !(cause instanceof WholeTraceCompileError)) {
          failed = true; failureCode = 'AUTHORING_CHECK_FAILED';
          record.rejectedRules.push(failureCode);
          throw Object.assign(error(failureCode, (cause as Error).message), { cause });
        }
        const code = cause instanceof WholeTraceCompileError ? cause.validation.code ?? 'CANDIDATE_EXECUTION' : cause.code;
        const supplied = cause instanceof WholeTraceCompileError ? cause.validation.issues : cause.issues;
        const issues = (supplied?.length ? supplied : [{ path: code === 'AUTHORING_CHOICE_NOT_AVAILABLE'
          ? 'choiceRef.choiceId' : 'decision', rule: code, message: cause.message }])
          .map(issue => ({ ...issue, decisionIndex, decisionNumber }));
        record.rejectedRules.push(...issues.map(issue => issue.rule));
        failed = record.attempts >= 1 + maxRewritesPerDecision;
        const remainingRewrites = Math.max(0, 1 + maxRewritesPerDecision - record.attempts);
        const rewrite: WholeTraceAuthoringRewrite = { status: failed ? 'exhausted' : 'awaiting-rewrite',
          decisionIndex, decisionNumber, acceptedDecisionCount: decisions.length, remainingRewrites,
          message: failed
            ? `${decisionNumber}번 결정의 재작성 한도에 도달하여 전체 작성 요청이 실패했습니다. 수락된 앞 ${decisions.length}개 결정은 변경되지 않았습니다.`
            : `${decisionNumber}번 결정의 재작성을 기다립니다. 전체 작성 요청은 계속 진행 중이며, 수락된 앞 ${decisions.length}개 결정은 유지됩니다. 같은 결정을 최대 ${remainingRewrites}회 다시 제출할 수 있습니다.` };
        // The rejected draft may be malformed. The unchanged baseline menu is
        // always available; exact timing/activity preview is an explicit query.
        return { accepted: false as const, code, issues, canRetry: !failed, decisionIndex, decisionNumber,
          rewrite, menu: await menu(), metrics: metrics() };
      } finally { busy = false; }
    },
    finish() {
      if (busy) throw error('AUTHORING_BUSY', 'Wait for the pending decision before finishing');
      if (failed) throw error(failureCode, 'This authoring request is closed after its recorded failure');
      // A rejected extra append cannot reopen an already accepted ending or
      // system-completed horizon. Only a live, unresolved decision blocks finish.
      if (!prefix.terminal && attempts[decisions.length] && !attempts[decisions.length].accepted)
        throw error('AUTHORING_REWRITE_PENDING', 'The rejected decision must be resolved within its rewrite budget before finishing');
      // A finalization attempt declares this accepted prefix to be the whole
      // plan. Do not turn its missing ending into another actor choice after a
      // schema error: that would let technical delivery manufacture a giveUp.
      // Pending decision rewrites above remain authoring, not finalization.
      if (!prefix.terminal && decisions.length < 100) {
        failed = true; failureCode = 'AUTHORING_INCOMPLETE_FINALIZATION';
        throw Object.assign(error(failureCode,
          'Finalization received an unfinished plan. This request is now a technical failure; its accepted decisions are preserved and no continuation or replacement ending is accepted.'),
        { candidate: candidate() });
      }
      return cursor.finish();
    },
  };
}
