'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');

function error(code, message, cause) {
  return Object.assign(new Error(message, cause ? { cause } : undefined), { code });
}
function candidateObject(value, requestId) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || Object.keys(value).sort().join(',') !== 'candidateVersion,decisions,requestId'
    || typeof value.candidateVersion !== 'string' || !Array.isArray(value.decisions)
    || value.requestId !== requestId)
    throw error('DELIVERY_INVALID_CANDIDATE', 'Expected the complete candidate object returned by finish for this request.');
  return value;
}
function readCandidate(file, requestId) {
  let text, candidate;
  try {
    if (!fs.lstatSync(file).isFile())
      throw error('DELIVERY_CANDIDATE_PATH', 'Candidate path must be a regular file, not a symlink.');
    text = fs.readFileSync(file, 'utf8');
    candidate = JSON.parse(text);
  } catch (cause) {
    if (cause.code === 'DELIVERY_CANDIDATE_PATH') throw cause;
    throw error('DELIVERY_CANDIDATE_FILE', 'Candidate file must contain exactly one JSON object; existing bytes were not changed.', cause);
  }
  candidateObject(candidate, requestId);
  return { candidate, sha256: createHash('sha256').update(text).digest('hex') };
}
function saveCandidate(file, candidate, requestId) {
  // Serialize the returned object itself, never a JSONL response stream. A
  // round trip must retain every actor-authored field before any file is made.
  let text, roundTrip;
  try { text = JSON.stringify(candidate, null, 2) + '\n'; roundTrip = JSON.parse(text); }
  catch (cause) { throw error('DELIVERY_INVALID_CANDIDATE', 'Finished candidate is not a JSON value.', cause); }
  if (!isDeepStrictEqual(roundTrip, candidate))
    throw error('DELIVERY_INVALID_CANDIDATE', 'JSON serialization would change the finished candidate.');
  const staging = `${file}.delivery-${randomUUID()}.partial`;
  let owned = false;
  try {
    const fd = fs.openSync(staging, 'wx', 0o600); owned = true;
    try { fs.writeFileSync(fd, text); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    // Publish complete bytes without replacing an existing destination.
    try { fs.linkSync(staging, file); }
    catch (cause) { if (cause.code !== 'EEXIST') throw cause; }
  } finally { if (owned) fs.unlinkSync(staging); }
  const saved = readCandidate(file, requestId);
  if (!isDeepStrictEqual(saved.candidate, candidate))
    throw error('DELIVERY_CANDIDATE_MISMATCH', 'Existing candidate differs from finish; it was preserved and was not submitted.');
  return saved;
}
function checkedStatus(value, requestId) {
  if (!value || value.requestId !== requestId
    || !['prepared', 'compiling', 'invalid', 'complete', 'failed'].includes(value.status))
    throw error('DELIVERY_INVALID_STATUS', 'Status did not confirm the same whole-trace request.');
  return value;
}
function result(requestId, requestStatus, fields = {}) {
  return { requestId, status: requestStatus.status,
    complete: requestStatus.status === 'complete',
    terminal: requestStatus.status === 'complete' || requestStatus.status === 'failed'
      || requestStatus.status === 'invalid' && requestStatus.canRepair === false,
    ...fields, requestStatus };
}

/** Mechanical delivery only. Does not author, repair, prepare, or close a request. */
async function finishAndSubmit({ invokeTool, requestId, candidateFilePath } = {}) {
  if (typeof invokeTool !== 'function' || typeof requestId !== 'string' || !requestId.trim()
    || typeof candidateFilePath !== 'string' || !path.isAbsolute(candidateFilePath))
    throw error('DELIVERY_INVALID_INPUT', 'Expected invokeTool, a requestId, and an absolute candidateFilePath.');
  const status = async () => checkedStatus(await invokeTool('whole_trace_status', { requestId }), requestId);
  try {
    const before = await status();
    // A failed/repairable request is never regenerated or automatically repaired.
    if (before.status !== 'prepared' && before.status !== 'complete')
      return result(requestId, before, { candidateFilePath });
    let saved;
    if (before.status === 'prepared') {
      const finished = await invokeTool('finish_whole_trace_authoring', { requestId });
      if (finished?.requestId !== requestId)
        throw error('DELIVERY_INVALID_CANDIDATE', 'Finish response belongs to a different request.');
      const candidate = candidateObject(finished.candidate, requestId);
      saved = saveCandidate(candidateFilePath, candidate, requestId);
    } else {
      // A delivery acknowledgement may have been lost. The engine must verify
      // this file against its completed candidate hash before we claim success.
      saved = readCandidate(candidateFilePath, requestId);
    }
    const submission = await invokeTool('submit_whole_trace', { requestId, candidateFilePath });
    const after = await status();
    const confirmed = readCandidate(candidateFilePath, requestId);
    if (confirmed.sha256 !== saved.sha256 || !isDeepStrictEqual(confirmed.candidate, saved.candidate))
      throw error('DELIVERY_CANDIDATE_CHANGED', 'Candidate bytes changed during delivery; completion is not acknowledged.');
    if (submission?.requestId !== requestId)
      throw error('DELIVERY_INVALID_SUBMISSION', 'Submission response belongs to a different request.');
    if (after.status === 'complete' && (submission.status !== 'complete' || submission.validation?.valid !== true))
      throw error('DELIVERY_UNCONFIRMED_COMPLETION', 'A completed status must agree with a successful validated submission.');
    return result(requestId, after, { candidateFilePath, candidateSha256: saved.sha256, submission });
  } catch (cause) {
    // The supervisor owns process lifetime. Even a parse/transport exception is
    // returned with the live request state when available, never converted to EOF.
    try { cause.requestStatus = await status(); } catch { /* Preserve the original error. */ }
    throw cause;
  }
}

module.exports = { finishAndSubmit };
