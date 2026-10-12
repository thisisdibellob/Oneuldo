'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Diagnostics describe planned observations only. They never become a replay file,
// behavior log, or verified learner experience. Do not retain provider exchanges.
const excluded = /^(?:exchange|(?:raw|provider)?(?:request|response)|attempts|messages|thinking|reasoning|reasoning_?content|chainOfThought|authorization|headers|apiKey|apiKeyEnv|access_?token|token|password|secret|credentials|cookie|baseUrl|endpoint|url|env|environmentVariables)$/i;
function safeJson(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) return value.map(safeJson).filter(v => v !== undefined);
  if (!value || typeof value !== 'object') return undefined;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !excluded.test(key))
    .map(([key, child]) => [key, safeJson(child)]).filter(([, child]) => child !== undefined));
}
function pick(value, fields) {
  return safeJson(Object.fromEntries(fields.filter(key => value?.[key] !== undefined).map(key => [key, value[key]])));
}
function safeOptions(options) {
  const result = pick(options, ['personaId', 'seed', 'mode', 'maxActions', 'timeBudgetMs', 'timingProfile',
    'attentionExperience', 'learnerIdentity', 'trialBinding', 'actorPolicyVersion', 'tracePolicyVersion', 'feedbackMovement']);
  result.mode ??= 'llm';
  result.maxActions ??= 1000;
  result.timingProfile ??= ['feedback-choice-v1','feedback-choice-v2','feedback-choice-v3','feedback-choice-v4', 'feedback-choice-v5', 'feedback-choice-v6', 'feedback-choice-v7','whole-trace-v3'].includes(options.actorPolicyVersion) ? 'original' : 'compact';
  if (['feedback-choice-v3', 'feedback-choice-v4', 'feedback-choice-v5', 'feedback-choice-v6', 'feedback-choice-v7'].includes(result.actorPolicyVersion) && result.feedbackMovement === undefined)
    result.feedbackMovement = { wanderProbability: .2 };
  if (result.mode === 'llm') {
    result.llm = pick(options.llm, ['model', 'protocol', 'maxCalls', 'timeoutMs']);
    result.llm.model ??= process.env.MARKET_LLM_MODEL;
    result.llm.protocol ??= 'openai';
    result.llm.maxCalls ??= 300;
    result.llm.timeoutMs ??= 45000;
  }
  return result;
}
function sanitizeCheckpoint(entry) {
  if (!entry || !['decision', 'controlled-stop', 'system-completion'].includes(entry.kind) || !Number.isInteger(entry.index) || entry.index < 0)
    throw new Error('Invalid generation checkpoint');
  const result = { source: 'current-planning-observation', ...pick(entry, ['kind', 'index', 'activity']) };
  if (entry.kind === 'decision') {
    result.before = safeJson(entry.before);
    result.after = safeJson(entry.after);
    result.decision = pick(entry.decision, ['action', 'delayMs', 'reason', 'currentTask', 'attentionTag', 'cueRefs', 'feedbackMemory', 'dragOutcome', 'movementPolicy']);
  }
  return result;
}
function writeNew(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
}
function existsError(file) {
  const error = new Error(`EEXIST: generation output already exists, '${file}'`);
  error.code = 'EEXIST';
  return error;
}

/** Claim one output and capture its input before any actor/model call. */
function beginGeneration(destination, snapshot, options, versions) {
  const diagnosticDirectory = `${path.resolve(destination)}.generation`;
  for (const file of [destination, `${destination}.snapshot.json`]) if (fs.existsSync(file)) throw existsError(file);
  fs.mkdirSync(path.dirname(diagnosticDirectory), { recursive: true });
  // Exclusive mkdir is also the reservation for concurrent calls targeting one file.
  fs.mkdirSync(diagnosticDirectory, { mode: 0o700 });
  let closed = false, entries = 0, fd;
  const startedAt = new Date().toISOString();
  const statusPath = path.join(diagnosticDirectory, 'status.json');
  function updateStatus(state, details = {}) {
    const temporary = `${statusPath}.partial`;
    const data = JSON.stringify({ schemaVersion: 'generation-diagnostics-v1', source: 'planned-trace-diagnostics',
      state, startedAt, checkpointCount: entries, ...(state === 'running' ? {} : { finishedAt: new Date().toISOString() }), ...details }, null, 2) + '\n';
    let statusFd;
    try {
      statusFd = fs.openSync(temporary, 'wx', 0o600);
      fs.writeFileSync(statusFd, data);
      fs.closeSync(statusFd);
      fs.renameSync(temporary, statusPath);
    } catch (error) {
      if (statusFd !== undefined) {
        try { fs.closeSync(statusFd); } catch { /* Already closed, or preserve the write error. */ }
        try { fs.unlinkSync(temporary); } catch { /* Remove only our exclusively created temporary. */ }
      }
      throw error;
    }
  }
  function finish(state, details) {
    if (closed) return;
    if (fd !== undefined) { fs.closeSync(fd); fd = undefined; }
    updateStatus(state, details);
    closed = true;
  }
  try {
    writeNew(path.join(diagnosticDirectory, 'snapshot.json'), safeJson(snapshot));
    writeNew(path.join(diagnosticDirectory, 'options.json'), { schemaVersion: 'generation-options-v1',
      options: safeOptions(options), versions: safeJson(versions) });
    fd = fs.openSync(path.join(diagnosticDirectory, 'checkpoints.jsonl'), 'wx', 0o600);
    updateStatus('running');
  } catch (error) {
    if (fd !== undefined) fs.closeSync(fd);
    // Preserve any initial files rather than removing evidence of an interrupted write.
    throw withDiagnostics(error, diagnosticDirectory);
  }
  return {
    diagnosticDirectory,
    checkpoint(entry) {
      if (closed) throw new Error('Generation journal is closed');
      fs.writeSync(fd, JSON.stringify(sanitizeCheckpoint(entry)) + '\n');
      entries++;
    },
    complete(trace) { finish('complete', { traceId: trace.traceId, steps: trace.steps.length,
      ...(trace.generation?.controlledStop ? { ...pick(trace.generation, ['controlledStop']),
        outcome: 'system-intervention',
        ...(trace.generation.controlledStop.reason === 'action-limit' ? { completion: 'action-limit-incomplete',
          actorDecisionCount: trace.generation.controlledStop.afterDecisions,
          systemEndingStepIds: trace.steps.slice(-3).map(step => step.id) } : {}),
        learningEligible: false, performanceEligible: false } : {}),
      ...(trace.generation?.systemCompletion ? { systemCompletion: trace.generation.systemCompletion,
        completion: 'assisted-review-requested', actorDecisionCount: trace.generation.systemCompletion.afterDecisions,
        systemEndingStepIds: trace.steps.slice(trace.steps.findIndex(step => step.id === trace.generation.systemCompletion.firstStepId)).map(step => step.id),
        learningScope: 'actor-prefix-after-confirmed-app-replay', performanceEligible: false,
        analysisRequested: false, appExecuted: false } : {}) }); },
    fail(stage) { finish('failed', { stage, code: stage === 'generation' ? 'TRACE_GENERATION_FAILED' : 'TRACE_FILE_SAVE_FAILED' }); },
  };
}
function withDiagnostics(error, diagnosticDirectory) {
  const wrapped = new Error(`${error?.message ?? 'Trace generation failed'}; diagnostics: ${diagnosticDirectory}`, { cause: error });
  wrapped.code = error?.code;
  wrapped.diagnosticDirectory = diagnosticDirectory;
  return wrapped;
}
module.exports = { beginGeneration, withDiagnostics, sanitizeCheckpoint };
