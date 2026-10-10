import { randomUUID, createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync, renameSync, unlinkSync, openSync, closeSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { canonicalMarketReplayJson } from '../../frontend/src/game/marketReplayTrace';
import { buildWholeTraceBundle, wholeTraceInputHash } from './wholeTraceBundle';
import { compileWholeTraceCandidate, WholeTraceCompileError } from './wholeTraceCompiler';
import { WHOLE_TRACE_MODEL, WHOLE_TRACE_POLICY_VERSION, validateWholeTraceCandidate,
  wholeTraceTerminalIntent, type WholeTraceBundle, type WholeTraceCandidate, type WholeTraceSettings,
  type WholeTraceValidation, type WholeTraceWireDecision } from './wholeTraceContracts';
import { validateTrace } from './traceValidation';
import { summarizeTrace } from './simulator';

const { beginGeneration } = require('../generation-journal.cjs');
function saveNew(file: string, value: unknown) {
  const data = JSON.stringify(value, null, 2) + '\n';
  // Claim ownership before writing: a failed write can leave a partial file.
  const fd = openSync(file, 'wx', 0o600);
  try {
    writeFileSync(fd, data);
    closeSync(fd);
  } catch (error) {
    try { closeSync(fd); } catch { /* Keep the original write failure. */ }
    try { unlinkSync(file); } catch { /* Only this call's exclusive file is owned. */ }
    throw error;
  }
}
function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([k]) => !/^(?:authorization|headers|apiKey|password|secret|token|cookie|exchange|thinking|reasoning_content)$/i.test(k))
    .map(([k, v]) => [k, scrub(v)]));
}

/** One prepared input, then one complete candidate; no model or app calls occur here. */
export class WholeTraceSession {
  readonly requestId = randomUUID();
  private readonly settings: WholeTraceSettings;
  private readonly bundle: WholeTraceBundle;
  private readonly outputPath: string;
  private readonly diagnosticDirectory: string;
  private readonly createdAt = new Date().toISOString();
  private readonly createdTick = performance.now();
  private readonly inputHash: string;
  private state: 'prepared' | 'compiling' | 'invalid' | 'complete' | 'failed' = 'prepared';
  private attempts = 0;
  private lastHash?: string;
  private lastResult?: Record<string, unknown>;
  private preservedPrefix: any[] = [];
  private originalEnding?: 'submit' | 'giveUp' | 'horizon';
  private originalCandidateVersion?: '3' | '4' | '5' | '6' | '7';
  private lastRepairHash?: string;
  private lastRepairResult?: Record<string, unknown>;

  constructor(input: WholeTraceSettings) {
    if (!input || typeof input !== 'object') throw new Error('Whole trace settings are required');
    if (!['string', 'number'].includes(typeof input.seed) || !String(input.seed).trim() || String(input.seed).length > 200
      || typeof input.seed === 'number' && !Number.isFinite(input.seed)) throw new Error('A finite seed is required');
    if (input.maxRepairs !== undefined && ![0, 1].includes(input.maxRepairs)) throw new Error('maxRepairs must be 0 or 1');
    if (input.maxActions !== undefined && (!Number.isInteger(input.maxActions) || input.maxActions < 1 || input.maxActions > 100)) throw new Error('Whole mode maxActions must be 1..100');
    if (input.timingProfile !== undefined && input.timingProfile !== 'original') throw new Error('Whole-trace-v3 preserves actor judgment timing; timingProfile must be original');
    if (input.timeBudgetMs !== undefined && (!Number.isInteger(input.timeBudgetMs) || input.timeBudgetMs < 1000 || input.timeBudgetMs > 3600000)) throw new Error('timeBudgetMs must be 1000..3600000');
    if (input.llm?.model !== undefined && input.llm.model !== WHOLE_TRACE_MODEL) throw new Error('Whole trace actor must be the native Luna session');
    this.settings = structuredClone({ ...input, maxActions: input.maxActions ?? 100, maxRepairs: input.maxRepairs ?? 0,
      timingProfile: input.timingProfile ?? 'original', llm: { ...input.llm, model: WHOLE_TRACE_MODEL, maxCalls: input.llm?.maxCalls ?? 100 } });
    this.bundle = buildWholeTraceBundle(this.settings, this.requestId);
    this.inputHash = wholeTraceInputHash(this.settings);
    this.outputPath = resolve(input.outputPath ?? join(__dirname, '..', 'output', `trace-${this.requestId}.json`));
    for (const file of [this.outputPath, `${this.outputPath}.snapshot.json`, `${this.outputPath}.knowledge-audit.json`, `${this.outputPath}.persona-review.json`]) if (existsSync(file)) throw new Error(`Output already exists: ${file}`);
    this.diagnosticDirectory = `${this.outputPath}.whole-trace`;
    mkdirSync(dirname(this.diagnosticDirectory), { recursive: true });
    // Exclusive directory reservation permits independent sessions, not duplicate destinations.
    mkdirSync(this.diagnosticDirectory, { mode: 0o700 });
    saveNew(join(this.diagnosticDirectory, 'bundle.json'), this.bundle);
    this.persistStatus();
  }
  prepare() { return { requestId: this.requestId, bundle: structuredClone(this.bundle), diagnosticDirectory: this.diagnosticDirectory }; }
  status() {
    return { requestId: this.requestId, status: this.state, attempts: this.attempts,
      canRepair: this.state === 'invalid' && this.attempts < 1 + (this.settings.maxRepairs ?? 0),
      model: WHOLE_TRACE_MODEL, reasoningEffort: 'low', policyVersion: WHOLE_TRACE_POLICY_VERSION,
      inputHash: this.inputHash, diagnosticDirectory: this.diagnosticDirectory,
      ...(this.lastResult ? { result: structuredClone(this.lastResult) } : {}) };
  }
  /** Submit only the not-yet-accepted tail of one bounded technical repair. */
  async submitRepair(value: unknown): Promise<Record<string, unknown>> {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype)
      throw new Error('Repair must be a JSON object');
    const repair = structuredClone(value) as Record<string, unknown>;
    if (Object.keys(repair).some(key => !['repairVersion', 'requestId', 'baseAttempt', 'fromDecisionIndex', 'candidateVersion', 'decisions'].includes(key)))
      throw new Error('Repair contains an unknown field');
    if (repair.repairVersion !== '1') throw new Error('repairVersion must be 1');
    if (repair.requestId !== this.requestId) throw new Error('Repair requestId differs from the prepared input');
    const repairJson = canonicalMarketReplayJson(repair);
    if (repairJson.length > 1000000) throw new Error('Repair suffix exceeds the bounded JSON size');
    const repairHash = createHash('sha256').update(repairJson).digest('hex');
    if (repairHash === this.lastRepairHash && this.lastRepairResult) return structuredClone(this.lastRepairResult);
    if (this.state !== 'invalid') throw new Error('A suffix repair requires the latest whole trace attempt to be invalid');
    if (this.attempts >= 1 + (this.settings.maxRepairs ?? 0)) throw new Error('Whole trace repair budget exhausted');
    if (repair.baseAttempt !== this.attempts || !Number.isInteger(repair.baseAttempt)) throw new Error('Repair baseAttempt must match the latest attempt');
    if (repair.fromDecisionIndex !== this.preservedPrefix.length || !Number.isInteger(repair.fromDecisionIndex))
      throw new Error('Repair fromDecisionIndex must match the exact accepted prefix length');
    if ((repair.candidateVersion !== '3' && repair.candidateVersion !== '4' && repair.candidateVersion !== '5' && repair.candidateVersion !== '6' && repair.candidateVersion !== '7')
      || repair.candidateVersion !== this.originalCandidateVersion) throw new Error('Repair candidateVersion must match the original candidate wire version');
    if (!Array.isArray(repair.decisions) || repair.decisions.length < 1) throw new Error('Repair decisions must contain a nonempty suffix');
    const remainingActionBudget = Math.min(100, this.settings.maxActions ?? 100) - this.preservedPrefix.length;
    if (remainingActionBudget < 1 || repair.decisions.length > remainingActionBudget)
      throw new Error('Repair suffix exceeds the remaining action budget');
    if (wholeTraceInputHash(this.settings) !== this.inputHash) throw new Error('Prepared whole trace input changed');
    const nextAttempt = this.attempts + 1;
    const suffixPath = join(this.diagnosticDirectory, `attempt-${nextAttempt}.repair-suffix.json`);
    if (existsSync(suffixPath)) throw new Error('Repair diagnostic destination already exists');
    const assembled = { candidateVersion: repair.candidateVersion, requestId: this.requestId,
      decisions: [...structuredClone(this.preservedPrefix), ...structuredClone(repair.decisions)] };
    if (assembled.decisions.length > 100 || assembled.decisions.length > (this.settings.maxActions ?? 100))
      throw new Error('Repair candidate exceeds the accepted action horizon');
    if (canonicalMarketReplayJson(assembled).length > 1000000) throw new Error('Repair candidate exceeds the bounded JSON size');
    const assembledHash = createHash('sha256').update(canonicalMarketReplayJson(assembled)).digest('hex');
    // A repair wrapper can reproduce the most recently submitted full candidate
    // without changing any decision. Treat that as a retry of the prior submit:
    // preserve its attempt state and leave the next suffix diagnostic path free.
    if (assembledHash === this.lastHash && this.lastResult) return structuredClone(this.lastResult);
    saveNew(suffixPath, repair);
    const result = await this.submit(assembled);
    this.lastRepairHash = repairHash;
    this.lastRepairResult = structuredClone(result);
    return result;
  }
  private persistStatus() {
    const temporary = join(this.diagnosticDirectory, 'status.partial.json');
    writeFileSync(temporary, JSON.stringify({ ...this.status(), createdAt: this.createdAt, updatedAt: new Date().toISOString() }, null, 2) + '\n', { mode: 0o600 });
    renameSync(temporary, join(this.diagnosticDirectory, 'status.json'));
  }
  private candidateTerminalIntent(candidate: any): 'submit' | 'giveUp' | 'horizon' {
    const last = candidate?.decisions?.at(-1);
    let ending: string | undefined;
    if (candidate?.candidateVersion === '3') ending = wholeTraceTerminalIntent(last as WholeTraceWireDecision | undefined);
    else if (candidate?.candidateVersion === '4' || candidate?.candidateVersion === '5' || candidate?.candidateVersion === '6' || candidate?.candidateVersion === '7') {
      const catalog = (this.bundle as any).choiceCatalog;
      const entry = catalog?.entries?.find((choice: any) => choice.choiceId === last?.choiceRef?.choiceId);
      ending = entry?.action?.type;
    }
    return ending === 'submit' || ending === 'giveUp' ? ending : 'horizon';
  }
  private wireMetadata() {
    if (!this.originalCandidateVersion) return {};
    return { candidateVersion: this.originalCandidateVersion,
      actionBinding: this.originalCandidateVersion === '3' ? 'explicit-legacy-v3' : 'state-bound-choice-v1',
      ...(['5', '6', '7'].includes(this.originalCandidateVersion) ? { focusContract: 'explicit-focus-v1' } : {}),
      ...(['6', '7'].includes(this.originalCandidateVersion) ? { memoryContract: 'working-memory-v1', cognitionVersion: this.bundle.persona.behavior.cognition.cognitionVersion,
        cognitionSourceHash: this.bundle.persona.behavior.cognitionSourceHash } : {}),
      ...(this.originalCandidateVersion === '7' ? { taskContract: 'persistent-task-memory-v1', taskStateVersion: 'persistent-task-v1' } : {}) };
  }
  async submit(value: unknown): Promise<Record<string, unknown>> {
    if (this.state === 'compiling') throw new Error('This whole trace request is already compiling');
    value = structuredClone(value);
    const json = canonicalMarketReplayJson(value);
    if (json.length > 1000000) throw new Error('Candidate exceeds the bounded JSON size');
    const hash = createHash('sha256').update(json).digest('hex');
    if (hash === this.lastHash && this.lastResult) return structuredClone(this.lastResult);
    if (this.state === 'complete' || this.state === 'failed') throw new Error('Whole trace request is closed');
    if (this.attempts >= 1 + (this.settings.maxRepairs ?? 0)) throw new Error('Whole trace repair budget exhausted');
    if (wholeTraceInputHash(this.settings) !== this.inputHash) throw new Error('Prepared whole trace input changed');
    this.state = 'compiling'; this.attempts++; this.lastHash = hash;
    const compileStart = performance.now();
    const planningGapMs = compileStart - this.createdTick;
    const attemptPath = join(this.diagnosticDirectory, `attempt-${this.attempts}`);
    let journal: ReturnType<typeof beginGeneration> | undefined;
    let completedTrace: Awaited<ReturnType<typeof compileWholeTraceCandidate>>['trace'] | undefined;
    let stage: 'generation' | 'persistence' = 'persistence';
    let snapshotSaved = false, traceSaved = false, auditSaved = false, reviewSaved = false;
    try {
      this.persistStatus();
      stage = 'generation';
      // Preserve even a schema-invalid submitted original for later suffix repair diagnostics.
      saveNew(`${attemptPath}.candidate.json`, value);
      if (this.attempts === 1) {
        const declared = value as any;
        if ((declared?.candidateVersion === '3' || declared?.candidateVersion === '4' || declared?.candidateVersion === '5' || declared?.candidateVersion === '6' || declared?.candidateVersion === '7') && declared.requestId === this.requestId) {
          this.originalCandidateVersion = declared.candidateVersion;
          if (Array.isArray(declared.decisions) && declared.decisions.length >= 1 && declared.decisions.length <= 100)
            this.originalEnding = this.candidateTerminalIntent(declared);
        }
      }
      const shape = validateWholeTraceCandidate(value, this.requestId,
        { objectiveIds: this.bundle.worldReference.objectives.map(goal => goal.id) });
      if (!shape.valid) throw new WholeTraceCompileError(shape);
      const candidate = value as WholeTraceCandidate;
      if (this.originalCandidateVersion && candidate.candidateVersion !== this.originalCandidateVersion)
        throw new WholeTraceCompileError({ valid: false, code: 'REPAIR_CHANGED_VERSION',
          errors: ['Technical repair must preserve the original candidate version and its task/memory guards'] });
      if (this.preservedPrefix.length && canonicalMarketReplayJson(candidate.decisions.slice(0, this.preservedPrefix.length)) !== canonicalMarketReplayJson(this.preservedPrefix))
        throw new WholeTraceCompileError({ valid: false, code: 'REPAIR_CHANGED_PREFIX', errors: ['Technical repair must preserve the already accepted prefix'] });
      const ending = this.candidateTerminalIntent(candidate);
      if (this.attempts > 1 && this.originalEnding !== undefined && ending !== this.originalEnding)
        throw new WholeTraceCompileError({ valid: false, code: 'REPAIR_CHANGED_ENDING',
          errors: ['Technical repair must preserve the original terminal intent'] });
      this.originalEnding ??= ending === 'submit' || ending === 'giveUp' ? ending : 'horizon';
      stage = 'persistence';
      journal = beginGeneration(attemptPath, this.settings.snapshot, { ...this.settings, mode: 'llm', planningMode: 'whole-trace' },
        { personaVersion: this.bundle.persona.version, actorPolicyVersion: WHOLE_TRACE_POLICY_VERSION });
      stage = 'generation';
      const compiled = await compileWholeTraceCandidate(this.settings, this.bundle, candidate, this.attempts,
        checkpoint => journal!.checkpoint(checkpoint));
      const validationStart = performance.now();
      const validation = validateTrace(compiled.trace, this.settings.snapshot);
      if (!validation.valid) throw new WholeTraceCompileError(validation);
      const validatedAt = performance.now();
      stage = 'persistence';
      saveNew(`${this.outputPath}.snapshot.json`, this.settings.snapshot);
      snapshotSaved = true;
      saveNew(this.outputPath, compiled.trace); traceSaved = true;
      const knowledgeAuditPath = `${this.outputPath}.knowledge-audit.json`;
      const audit = { auditVersion: this.originalCandidateVersion === '7' ? '6' : this.originalCandidateVersion === '6' ? '5' : this.originalCandidateVersion === '5' ? '4' : this.originalCandidateVersion === '4' ? '3' : '2',
        ...this.wireMetadata(), requestId: this.requestId, inputHash: this.inputHash,
        traceId: compiled.trace.traceId, policyVersion: WHOLE_TRACE_POLICY_VERSION,
        referenceAccess: 'whole-world', actorKnowledgeScope: 'observed-and-remembered',
        validationScope: this.originalCandidateVersion === '7' ? 'declared-cues-persistent-tasks-working-memory-actor-state-and-game-guards' : this.originalCandidateVersion === '6' ? 'declared-cues-working-memory-actor-state-and-game-guards' : 'declared-cues-actor-state-and-game-guards',
        limitation: 'The actor receives the whole reference world. Cue validation cannot prove that hidden information had no implicit influence, nor establish clinical validity.',
        decisions: compiled.knowledgeAudit };
      const knowledgeAuditHash = createHash('sha256').update(canonicalMarketReplayJson(audit)).digest('hex');
      saveNew(knowledgeAuditPath, audit); auditSaved = true;
      const personaReviewPath = `${this.outputPath}.persona-review.json`;
      const review = { requestId: this.requestId, traceId: compiled.trace.traceId, knowledgeAuditHash,
        personaSource: this.bundle.persona.behavior.source, ...compiled.personaReview };
      const personaReviewHash = createHash('sha256').update(canonicalMarketReplayJson(review)).digest('hex');
      saveNew(personaReviewPath, review); reviewSaved = true;
      const completeAt = performance.now();
      const metrics = { planningSubmissions: this.attempts, repairSubmissions: this.attempts - 1,
        acceptedActions: compiled.acceptedActions, planningAndDeliveryWallMs: planningGapMs,
        compileAndValidationMs: validatedAt - compileStart, finalValidationMs: validatedAt - validationStart,
        persistenceMs: completeAt - validatedAt, wholeRequestWallMs: completeAt - this.createdTick,
        internalModelCalls: null, modelInferenceMs: null, networkMs: null,
        note: 'Native Codex internal model/transport timing is unavailable. Planning gap is elapsed time before the final compile, including preparation, task queue, model work, tool delivery, repair wait and earlier attempts\' local compilation/persistence.' };
      saveNew(join(this.diagnosticDirectory, 'metrics.json'), metrics);
      completedTrace = compiled.trace;
      this.state = 'complete';
      this.lastResult = { status: 'complete', ...this.wireMetadata(), requestId: this.requestId, outputPath: this.outputPath,
        snapshotFilePath: `${this.outputPath}.snapshot.json`, traceId: compiled.trace.traceId,
        knowledgeAuditPath, knowledgeAuditHash,
        personaReviewPath, personaReviewHash, personaReview: compiled.personaReview,
        personaId: compiled.trace.personaId, personaVersion: compiled.trace.personaVersion,
        steps: compiled.trace.steps.length, acceptedActions: compiled.acceptedActions, target: compiled.trace.target,
        ending: summarizeTrace(compiled.trace).ending, systemCompletion: compiled.trace.generation?.systemCompletion ?? null,
        validation, metrics, diagnosticDirectory: this.diagnosticDirectory, appExecuted: false };
    } catch (error) {
      if ((error as { stage?: string }).stage === 'persistence') stage = 'persistence';
      // Remove only files this attempt created, never a competing user's output.
      for (const [owned, file] of [[traceSaved, this.outputPath], [snapshotSaved, `${this.outputPath}.snapshot.json`], [auditSaved, `${this.outputPath}.knowledge-audit.json`], [reviewSaved, `${this.outputPath}.persona-review.json`]] as const)
        if (owned) { try { unlinkSync(file); } catch { /* Keep the original error. */ } }
      try { journal?.fail(stage); } catch { /* Preserve the first failure. */ }
      if (error instanceof WholeTraceCompileError) {
        const validation: WholeTraceValidation = error.validation;
        if (validation.validPrefix) this.preservedPrefix = structuredClone(validation.validPrefix);
        this.state = 'invalid';
        this.lastResult = { status: 'invalid', ...this.wireMetadata(), requestId: this.requestId, validation,
          attempts: this.attempts, canRepair: this.attempts < 1 + (this.settings.maxRepairs ?? 0),
          repairContext: { baseAttempt: this.attempts, fromDecisionIndex: this.preservedPrefix.length,
            remainingActionBudget: Math.max(0, Math.min(100, this.settings.maxActions ?? 100) - this.preservedPrefix.length),
            originalCandidateVersion: this.originalCandidateVersion ?? null,
            before: validation.before ?? null, knowledge: validation.knowledge ?? null, workingMemory: validation.workingMemory ?? null,
            rejectedWorkingMemoryProposal: validation.proposedWorkingMemory ?? null,
            taskMemory: validation.taskMemory ?? null, rejectedTaskMemoryProposal: validation.proposedTaskMemory ?? null,
            choiceFrame: (validation as any).choiceFrame ?? null, acceptedFrame: (validation as any).acceptedFrame ?? null },
          diagnosticDirectory: this.diagnosticDirectory, completeTrace: false, appExecuted: false };
      } else {
        this.state = 'failed';
        this.lastResult = { status: 'failed', ...this.wireMetadata(), requestId: this.requestId, stage, error: (error as Error).message,
          attempts: this.attempts, canRepair: false, completeTrace: false, appExecuted: false,
          diagnosticDirectory: this.diagnosticDirectory };
      }
      try { saveNew(`${attemptPath}.failure.json`, scrub(this.lastResult)); }
      catch (writeError) { this.lastResult.diagnosticWriteError = (writeError as Error).message; }
    }
    try {
      this.persistStatus();
      if (this.state === 'complete' && completedTrace) journal!.complete(completedTrace);
    }
    catch (error) {
      this.state = 'failed';
      this.lastResult = { status: 'failed', ...this.wireMetadata(), requestId: this.requestId, stage: 'persistence',
        error: (error as Error).message, attempts: this.attempts, canRepair: false, completeTrace: false,
        diagnosticDirectory: this.diagnosticDirectory, appExecuted: false };
      for (const [owned, file] of [[traceSaved, this.outputPath], [snapshotSaved, `${this.outputPath}.snapshot.json`], [auditSaved, `${this.outputPath}.knowledge-audit.json`], [reviewSaved, `${this.outputPath}.persona-review.json`]] as const)
        if (owned) { try { unlinkSync(file); } catch { /* Preserve the status failure. */ } }
      try { journal?.fail('persistence'); } catch { /* Preserve the status failure. */ }
      try { this.persistStatus(); } catch { /* Report failure even when diagnostics cannot be updated. */ }
    }
    return structuredClone(this.lastResult!);
  }
}
