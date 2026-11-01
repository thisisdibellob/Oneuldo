import { createWholeTraceSourceAuthoringCursor, WholeTraceSourceAuthoringError,
  type WholeTraceSourceDecisionDraft } from './wholeTraceAuthoringSource';
import { validateWholeTracePrefix, WholeTraceCompileError } from './wholeTraceCompiler';
import type { WholeTraceBundle, WholeTraceSettings, WholeTraceTaskChoiceDecision } from './wholeTraceContracts';
import type { ActorObservation } from './types';

export type WholeTraceAuthoringOptions = { maxRewritesPerDecision?: number };
export type WholeTraceAuthoringAttempt = {
  decisionIndex: number; decisionNumber: number; attempts: number; rewriteCount: number;
  firstAttemptPassed: boolean; accepted: boolean; rejectedRules: string[];
};
export type WholeTraceAuthoringRewrite = {
  status: 'awaiting-rewrite' | 'exhausted'; decisionIndex: number; decisionNumber: number;
  acceptedDecisionCount: number; remainingRewrites: number; message: string;
};
export type WholeTraceAuthoringObservation = {
  kind: 'validated-prefix-observation-v1'; acceptedDecisionCount: number; notice: string;
  readObjectives?: ActorObservation['readObjectives'];
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
  const decisions: WholeTraceTaskChoiceDecision[] = [], attempts: WholeTraceAuthoringAttempt[] = [];
  let failed = false, busy = false, failureCode = 'AUTHORING_REWRITE_LIMIT';
  const candidate = () => ({ candidateVersion: '7' as const, requestId: bundle.requestId,
    decisions: structuredClone(decisions) });
  let prefix = await validateWholeTracePrefix(settings, bundle, candidate());
  const metrics = () => {
    const firstAttemptPassCount = attempts.filter(row => row.firstAttemptPassed).length;
    return { maxRewritesPerDecision, failed, decisions: structuredClone(attempts),
      firstAttemptPassCount, attemptedDecisionCount: attempts.length,
      firstAttemptAccuracy: attempts.length ? firstAttemptPassCount / attempts.length : null };
  };
  type NextDecision = { actorState: Pick<WholeTraceTaskChoiceDecision['actorState'], 'activity'>; delayMs: number };
  const menu = async (nextDecision?: NextDecision) => {
    const preview = nextDecision
      ? await validateWholeTracePrefix(settings, bundle, candidate(), { nextDecision }) : prefix;
    const currentObservation: WholeTraceAuthoringObservation = {
      kind: 'validated-prefix-observation-v1', acceptedDecisionCount: preview.acceptedActions,
      notice: '오프라인 접두 실행의 현재 목록 관찰만 표시한다. readObjectives가 없으면 현재 미표시이며 읽은 적이 없다는 뜻은 아니다. readObjectives:[]이면 표시된 빈 목록이다. 목표 선택 전 advisory.goalFields/openGoalIds가 비어 있어도 목록 부재를 뜻하지 않는다. 행동·상태 선언은 계속 AI가 작성한다.',
      ...(preview.before.readObjectives === undefined ? {} : {
        readObjectives: structuredClone(preview.before.readObjectives),
      }),
    };
    return { ...cursor.menu(), currentObservation, advisory: structuredClone(preview.advisory) };
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
        // Stage both symbolic and execution checks. No rejected proposal can
        // advance the source, observations, task declarations or working memory.
        const staged = createWholeTraceSourceAuthoringCursor(bundle);
        for (const prior of decisions) {
          const { source: _source, ...choiceRef } = prior.choiceRef;
          staged.append({ ...structuredClone(prior), choiceRef });
        }
        const decision = staged.append(draft);
        const checked = await validateWholeTracePrefix(settings, bundle,
          { ...candidate(), decisions: [...structuredClone(decisions), decision] });
        decisions.push(decision); cursor = staged; prefix = checked;
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
      return cursor.finish();
    },
  };
}
