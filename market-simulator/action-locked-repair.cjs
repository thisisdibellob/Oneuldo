'use strict';

// Harness protocol repair only. This module never supplies a memory belief,
// chooses an action, changes a cart, or converts a technical failure into a quit.
const { createHash } = require('node:crypto');
const LOCKED_FIELDS = Object.freeze(['choiceIds', 'delayMs', 'currentTasks', 'reasons']);
const CONTRACT = 'action-locked-cognition-repair-v1';
const clone = value => JSON.parse(JSON.stringify(value));
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
const hashJson = value => createHash('sha256').update(canonical(value)).digest('hex');
const same = (left, right) => canonical(left) === canonical(right);

class RepairContractError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'RepairContractError';
    this.code = code;
    this.technicalFailure = true;
    this.actorTermination = false;
    this.performanceEligible = false;
    this.details = details;
  }
}
function fail(code, message, details) { throw new RepairContractError(code, message, details); }
function classifyError(error) {
  const message = String(error?.message ?? error);
  if (error?.code === 'ACTION_LOCK_MISMATCH') return { kind: 'cognition-declaration', message, localLockViolation: true };
  if (error?.code === 'INVALID_CHOICE' || /Choice is not available in revision\s+\d+/i.test(message)) return { kind: 'invalid-choice', message };
  if (/Invalid v11 working\/task memory:/i.test(message)) return { kind: 'cognition-declaration', message };
  if (/stale|revision mismatch|revision does not match|unexpected revision|session (?:not found|expired)|FRAME_CHANGED/i.test(message)) return { kind: 'stale-frame', message };
  if (/transport|fetch failed|ECONN|timed?\s*out|timeout|authentication|unauthori[sz]ed|connected, authenticated/i.test(message)) return { kind: 'transport', message };
  return { kind: 'unclassified-technical', message };
}
function fieldsOf(decision) { return Object.fromEntries(LOCKED_FIELDS.map(key => [key, clone(decision[key])])); }
function assertEnvelope(decision) {
  if (!decision || typeof decision !== 'object' || Array.isArray(decision)) fail('INVALID_ENVELOPE', 'Decision must be an object; no executable action was identified');
  for (const field of LOCKED_FIELDS) if (!Array.isArray(decision[field]) || decision[field].length !== 1) fail('INVALID_ENVELOPE', field + ' must have exactly one element; cannot lock an incomplete action');
  if (typeof decision.choiceIds[0] !== 'string') fail('INVALID_ENVELOPE', 'choiceIds[0] must be a string');
  if (!Number.isInteger(decision.delayMs[0]) || decision.delayMs[0] < 1 || decision.delayMs[0] > 120000) fail('INVALID_ENVELOPE', 'delayMs[0] is outside the original actor schema');
  if (!(decision.currentTasks[0] === null || typeof decision.currentTasks[0] === 'string') || typeof decision.reasons[0] !== 'string') fail('INVALID_ENVELOPE', 'Task/reason cannot be locked without the original declared values');
}
function choiceFor(frame, id) {
  const matches = (frame?.availableChoices ?? []).filter(choice => choice.id === id);
  if (matches.length !== 1) fail('INVALID_CHOICE', 'Choice is not available in the original frame', { choiceId: id, matches: matches.length, frameSha256: hashJson(frame) });
  return matches[0];
}
function schemaForLock(actorSchema, fields) {
  const schema = clone(actorSchema);
  for (const key of LOCKED_FIELDS) {
    if (!schema.properties?.[key]) fail('INVALID_SCHEMA', 'Original actor schema lacks ' + key);
    schema.properties[key] = { ...schema.properties[key], const: clone(fields[key]) };
  }
  return schema;
}
function createActionLock({ frame, decision, actorSchema }) {
  assertEnvelope(decision);
  const originalFrame = clone(frame), originalDecision = clone(decision);
  const selectedChoice = clone(choiceFor(originalFrame, decision.choiceIds[0]));
  const fields = fieldsOf(originalDecision);
  const binding = {
    contract: CONTRACT, sessionId: frame.sessionId, revision: frame.revision,
    frameSha256: hashJson(originalFrame), initialDecisionSha256: hashJson(originalDecision),
    lockedFieldsSha256: hashJson(fields), selectedChoiceSha256: hashJson(selectedChoice),
    selectedActionSha256: hashJson(selectedChoice.action), lockedFields: clone(fields), selectedChoice: clone(selectedChoice)
  };
  function assertFrame(currentFrame) {
    if (hashJson(currentFrame) !== binding.frameSha256) fail('FRAME_CHANGED', 'Original frame changed during declaration repair; obtain a new decision only through explicit technical recovery', { expected: binding.frameSha256, actual: hashJson(currentFrame) });
    if (!same(choiceFor(currentFrame, fields.choiceIds[0]), selectedChoice)) fail('FRAME_CHANGED', 'The selected choice descriptor or its parameters changed');
  }
  function validateRepair(currentFrame, repairedDecision) {
    assertFrame(currentFrame);
    assertEnvelope(repairedDecision);
    const changedFields = LOCKED_FIELDS.filter(key => !same(repairedDecision[key], fields[key]));
    const extraFields = Object.keys(repairedDecision).filter(key => key !== 'cognition' && !LOCKED_FIELDS.includes(key));
    if (changedFields.length || extraFields.length) fail('ACTION_LOCK_MISMATCH', 'A cognition repair changed frozen action fields', { changedFields, extraFields, initialDecisionSha256: binding.initialDecisionSha256, proposedDecisionSha256: hashJson(repairedDecision) });
    if (!repairedDecision.cognition || typeof repairedDecision.cognition !== 'object' || Array.isArray(repairedDecision.cognition)) fail('ACTION_LOCK_MISMATCH', 'A cognition repair must return its own cognition declaration');
    return { actionFieldsPreserved: true, frameSha256: binding.frameSha256, lockedFieldsSha256: binding.lockedFieldsSha256, selectedActionSha256: binding.selectedActionSha256, decisionSha256: hashJson(repairedDecision) };
  }
  return {
    binding: clone(binding), assertFrame, validateRepair, assertRepair: validateRepair,
    buildLockedSchema() { return schemaForLock(actorSchema, fields); },
    buildPromptSuffix(error, attempt, currentFrame = originalFrame) {
      const packet = this.packet(error, attempt, currentFrame);
      return packet.instructions + '\n' + JSON.stringify(packet.envelope);
    },
    packet(error, attempt, currentFrame = originalFrame) {
      assertFrame(currentFrame);
      const failure = classifyError(error);
      if (failure.kind !== 'cognition-declaration') fail('NON_DECLARATION_REPAIR', 'Only an explicit cognition declaration rejection can trigger cognition repair', failure);
      return {
        kind: 'cognition-declaration-repair', schema: schemaForLock(actorSchema, fields),
        instructions: 'The action has already been selected. This is ONLY a protocol declaration repair on the identical original frame, not a new action decision. Return the complete decision JSON. Keep choiceIds, delayMs, currentTasks and reasons byte-for-byte equivalent JSON values to lockedFields (including quantity/product parameters encoded by choice ID). Rewrite only cognition.actorState and cognition.basis using your own beliefs and current visible/bounded evidence. Do not change the action, quantity, route, goal of the action or termination choice. Do not invent a correct memory value or treat a rejected declaration as an applied action. A mistaken or uncertain belief remains allowed. Resolve the validator complaint by your own truthful declaration under the existing cognition contract; the harness supplies no answer correction.',
        envelope: { contract: CONTRACT, stage: 'cognition-declaration-repair', attempt, frame: clone(originalFrame), originalDecision: clone(originalDecision), lockedFields: clone(fields), binding: clone(binding), validatorError: failure.message }
      };
    }
  };
}

function buildLockedSchema(options) { return createActionLock(options).buildLockedSchema(); }
function buildPromptSuffix(lock, error, attempt, frame) { return lock.buildPromptSuffix(error, attempt, frame); }
function assertRepair(lock, frame, decision) { return lock.validateRepair(frame, decision); }
function invalidChoicePacket({ frame, decision, actorSchema, attempt }) {
  assertEnvelope(decision);
  // This branch is allowed only if there was no legal action to freeze.
  try { choiceFor(frame, decision.choiceIds[0]); } catch (error) {
    if (error.code !== 'INVALID_CHOICE') throw error;
    const schema = clone(actorSchema);
    schema.properties.choiceIds.items = { ...schema.properties.choiceIds.items, enum: frame.availableChoices.map(choice => choice.id) };
    return {
      kind: 'invalid-choice-recovery', schema,
      instructions: 'The prior proposal used an unavailable choice ID and was not executed. This is an explicitly logged invalid-choice recovery on the identical original frame, not a cognition repair or persona failure. Select one actually available ID with your own delay, task, reason and cognition under the unchanged persona contract. No action, success, submission or quit is required. Do not infer new events from this technical rejection.',
      envelope: { contract: CONTRACT, stage: 'invalid-choice-recovery', attempt, frame: clone(frame), rejectedProposal: clone(decision), rejectedDecisionSha256: hashJson(decision), frameSha256: hashJson(frame), applied: false, behaviorOutcome: null }
    };
  }
  fail('INVALID_RECOVERY', 'A valid selected action cannot enter invalid-choice reselection');
}

// append is the only operation that may apply an action. requestProposal must
// start a fresh context and persist its raw response before returning {decision,file}.
async function runLockedAppend({ frame, initialProposal, actorSchema, requestProposal, append, onEvent = () => {}, repairLimit = 3, invalidChoiceLimit = 2 }) {
  if (!Number.isInteger(repairLimit) || repairLimit < 0 || !Number.isInteger(invalidChoiceLimit) || invalidChoiceLimit < 0) fail('INVALID_BUDGET', 'Repair budgets must be nonnegative integers');
  const sourceFrame = clone(frame), frameSha256 = hashJson(sourceFrame);
  const proposalOf = value => value?.decision ? value : { decision: value };
  const initialProposalSha256 = hashJson(proposalOf(initialProposal).decision);
  let proposal = proposalOf(initialProposal), invalidRecoveries = 0, repairs = 0, lock;
  const event = async (stage, extra = {}) => onEvent({ contract: CONTRACT, stage, sessionId: sourceFrame.sessionId, revision: sourceFrame.revision, frameSha256, initialProposalSha256, ...extra });
  await event('initial-proposal', { decisionSha256: hashJson(proposal.decision), sourceFile: proposal.file ?? null, applied: false });
  while (!lock) {
    if (hashJson(frame) !== frameSha256) fail('FRAME_CHANGED', 'Caller mutated the original frame before action locking');
    try { lock = createActionLock({ frame: sourceFrame, decision: proposal.decision, actorSchema }); }
    catch (error) {
      if (error.code !== 'INVALID_CHOICE') throw error;
      await event('invalid-choice-rejected', { decisionSha256: hashJson(proposal.decision), sourceFile: proposal.file ?? null, error: error.message, applied: false, behaviorOutcome: null });
      if (invalidRecoveries >= invalidChoiceLimit) fail('INVALID_CHOICE_EXHAUSTED', 'Invalid-choice recovery exhausted; no actor termination or behavior outcome is inferred');
      const packet = invalidChoicePacket({ frame: sourceFrame, decision: proposal.decision, actorSchema, attempt: ++invalidRecoveries });
      proposal = proposalOf(await requestProposal(packet));
      await event('invalid-choice-proposal', { attempt: invalidRecoveries, decisionSha256: hashJson(proposal.decision), sourceFile: proposal.file ?? null, applied: false });
    }
  }
  await event('action-locked', { binding: lock.binding, invalidRecoveries, applied: false });
  let lastError;
  for (;;) {
    lock.assertFrame(frame);
    const proof = lock.validateRepair(sourceFrame, proposal.decision);
    let response, appendError;
    try { response = await append(clone(proposal.decision), proposal); }
    catch (error) { appendError = error; }
    if (!appendError) {
      await event('accepted', { ...proof, decisionSha256: hashJson(proposal.decision), sourceFile: proposal.file ?? null, repairs, invalidRecoveries, applied: true });
      return { response, proposal, binding: lock.binding, proof, repairs, invalidRecoveries };
    } else {
      const error = appendError;
      const classified = classifyError(error);
      await event('append-rejected', { ...proof, sourceFile: proposal.file ?? null, decisionSha256: hashJson(proposal.decision), error: classified.message, errorKind: classified.kind, applied: false });
      if (classified.kind !== 'cognition-declaration') {
        // A valid original ID later rejected as unavailable is stale/inconsistent
        // server state, not permission to choose an alternative.
        fail('APPEND_TECHNICAL_FAILURE', 'Action append failed outside the declaration repair contract', classified);
      }
      lastError = error;
    }
    let validRepair = false;
    while (!validRepair) {
      if (repairs >= repairLimit) fail('COGNITION_REPAIR_EXHAUSTED', 'Declaration repair exhausted; original selected action remains unapplied; this is not persona giveUp', { binding: lock.binding, repairs });
      lock.assertFrame(frame);
      const packet = lock.packet(lastError, ++repairs, frame);
      await event('repair-requested', { attempt: repairs, binding: lock.binding, error: classifyError(lastError).message, schemaSha256: hashJson(packet.schema), applied: false });
      proposal = proposalOf(await requestProposal(packet));
      await event('repair-proposal', { attempt: repairs, decisionSha256: hashJson(proposal.decision), sourceFile: proposal.file ?? null, applied: false });
      try { lock.validateRepair(frame, proposal.decision); validRepair = true; }
      catch (error) {
        if (!['ACTION_LOCK_MISMATCH', 'INVALID_ENVELOPE'].includes(error.code)) throw error;
        await event('repair-rejected-locally', { attempt: repairs, decisionSha256: hashJson(proposal.decision), error: error.message, details: error.details, applied: false });
        lastError = new RepairContractError('ACTION_LOCK_MISMATCH', error.message, error.details);
      }
    }
  }
}

module.exports = { CONTRACT, LOCKED_FIELDS, RepairContractError, hashJson, classifyError, createActionLock, buildLockedSchema, buildPromptSuffix, assertRepair, invalidChoicePacket, runLockedAppend };
