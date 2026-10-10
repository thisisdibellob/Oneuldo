'use strict';
// Local experiment archive. The only append path accepts a completed app replay plus its DB receipt.
// Hashes detect accidental modification; they are not authentication of a database or a human subject.
const fs = require('node:fs');
const path = require('node:path');
const {createHash,randomUUID} = require('node:crypto');
require('./runtime.cjs');
const {validateLearnerIdentity,assertLearnerIdentity,assertPersonaLearningEligible} = require('./src/actorLearning.ts');
const {verifyExecution,confirmedExperience,bindLearningIdentity} = require('./pilot-evidence.cjs');
const {marketReplayFingerprint}=require('../frontend/src/game/marketReplayTrace.ts');
const experienceCache=new WeakMap();
function assertExperienceLineage(trace,experience,identity) {
  const supplied=identity.arm==='C'?undefined:experience;
  need(trace.generation?.experienceFingerprint===marketReplayFingerprint(supplied??{visit:'first-play'}), 'Trace memory lineage does not match the learner archive');
}
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const need = (value,message) => {if (!value) throw new Error(message);};
const allowedKeys = (value,keys) => value && typeof value==='object' && !Array.isArray(value) && Object.keys(value).every(k=>keys.includes(k));
function auditOptions(options={}) {
  need(allowedKeys(options,['allowNonMonotonicMovementTimestamps'])
    && (options.allowNonMonotonicMovementTimestamps===undefined || typeof options.allowNonMonotonicMovementTimestamps==='boolean'), 'Invalid learner audit options');
  return options.allowNonMonotonicMovementTimestamps ? {allowNonMonotonicMovementTimestamps:true} : {};
}
function sourceRecord(trace,snapshot,replay,receipt,options) {
  const evidence={trace,snapshot,replay,receipt,options:auditOptions(options)};
  return {...evidence,evidenceHash:hash(evidence)};
}
function signedState(identity,rounds) {
  const body={version:'1',identity,rounds};
  return {...body,integrity:hash(body)};
}
function writeAtomic(file,value,createOnly=false) {
  const temporary=`${file}.${randomUUID()}.tmp`;
  let fd;
  try {
    fd=fs.openSync(temporary,'wx',0o600);
    fs.writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
    if(createOnly) { fs.linkSync(temporary,file);fs.unlinkSync(temporary); }
    else fs.renameSync(temporary,file);
  } finally {
    if(fd!==undefined) fs.closeSync(fd);
    if(fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

// A complete owner record is linked atomically, so a crash cannot leave an empty claimed lock.
function acquireLock(file,depth=0) {
  need(depth<5, 'Repeated stale recovery locks require manual inspection');
  const owner={pid:process.pid,token:randomUUID()};
  for(let attempt=0;attempt<3;attempt++) {
    try { writeAtomic(file,owner,true);return owner; }
    catch(error) { if(error.code!=='EEXIST') throw error; }
    let previous;
    try { previous=JSON.parse(fs.readFileSync(file,'utf8')); }
    catch(error) { if(error.code==='ENOENT') continue;throw new Error('Learner lock is ambiguous; inspect its owner before manual recovery'); }
    need(Number.isSafeInteger(previous.pid) && previous.pid>0 && typeof previous.token==='string', 'Learner lock has no verifiable owner');
    let dead=false;
    try { process.kill(previous.pid,0); }
    catch(error) { if(error.code==='ESRCH') dead=true; else if(error.code!=='EPERM') throw error; }
    need(dead, 'Learner archive is locked by a live process');
    const recovery=`${file}.recover`;
    const recoveryOwner=acquireLock(recovery,depth+1);
    try {
      // Serialise stale-owner recovery so a second recoverer cannot unlink a newly acquired lock.
      let current;
      try { current=JSON.parse(fs.readFileSync(file,'utf8')); } catch(error) { if(error.code!=='ENOENT') throw error; }
      if(current?.pid===previous.pid && current?.token===previous.token) fs.unlinkSync(file);
    } finally { releaseLock(recovery,recoveryOwner); }
  }
  throw new Error('Learner lock contention; retry after the active writer completes');
}
function releaseLock(file,owner) {
  const current=JSON.parse(fs.readFileSync(file,'utf8'));
  need(current.pid===owner.pid && current.token===owner.token, 'Learner lock ownership changed');
  fs.unlinkSync(file);
}

/** Create a new individual/experiment binding. Existing learners are never silently reset. */
function createLearner({directory,identity}) {
  validateLearnerIdentity(identity);
  need(typeof directory==='string' && directory.length>0, 'Learner directory is required');
  need(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(identity.learnerId), 'learnerId must be a safe filename identifier (1..80 letters, digits, _, ., -)');
  fs.mkdirSync(path.resolve(directory),{recursive:true});
  const learnerFile=path.resolve(directory,`${identity.learnerId}.learner.json`);
  const state=signedState(structuredClone(identity),[]);
  writeAtomic(learnerFile,state,true);
  return {learnerFile,state};
}

/** Verify the archive from its source evidence; no caller-authored episode/strategy field is accepted. */
function readLearner(learnerFile) {
  need(typeof learnerFile==='string' && learnerFile.length>0, 'Learner file is required');
  const file=path.resolve(learnerFile);
  need(fs.lstatSync(file).isFile(), 'Learner archive must be a regular file');
  const state=JSON.parse(fs.readFileSync(file,'utf8'));
  need(allowedKeys(state,['version','identity','rounds','integrity']) && state.version==='1' && Array.isArray(state.rounds), 'Invalid learner archive');
  validateLearnerIdentity(state.identity);
  need(state.integrity===hash({version:state.version,identity:state.identity,rounds:state.rounds}), 'Learner archive integrity mismatch');
  const replays=new Set(),sessions=new Set();
  let experience;
  for(const round of state.rounds) {
    need(allowedKeys(round,['trace','snapshot','replay','receipt','options','evidenceHash']), 'Unexpected learner evidence field');
    const {trace,snapshot,replay,receipt,options}=round;
    need(round.evidenceHash===sourceRecord(trace,snapshot,replay,receipt,options).evidenceHash, 'Learner round evidence integrity mismatch');
    verifyExecution(trace,snapshot,replay,receipt,options);assertPersonaLearningEligible(trace);bindLearningIdentity(state.identity,trace,replay);
    need(!replays.has(replay.replayId) && !sessions.has(replay.sessionId), 'Duplicate learner replay or session');
    assertExperienceLineage(trace,experience,state.identity);
    experience=confirmedExperience(trace,snapshot,replay,receipt,experience,{...options,identity:state.identity});
    replays.add(replay.replayId);sessions.add(replay.sessionId);
  }
  experienceCache.set(state,{value:experience});
  return state;
}

function reconstructExperience(state) {
  const cached=experienceCache.get(state);if(cached) return structuredClone(cached.value);
  let experience;
  for(const {trace,snapshot,replay,receipt,options} of state.rounds)
    experience=confirmedExperience(trace,snapshot,replay,receipt,experience,{...options,identity:state.identity});
  return experience;
}

/** The memory-free comparison arm archives evidence but never returns it as actor input. */
function getLearnerExperience(learnerFile,expectedIdentity) {
  const state=readLearner(learnerFile);
  if(expectedIdentity) assertLearnerIdentity(state.identity,expectedIdentity);
  if(state.identity.arm==='C') return undefined;
  return reconstructExperience(state);
}

/** Append a verified execution atomically. Repeating an identical receipt is idempotent. */
function recordLearnerRound({learnerFile,trace,snapshot,replay,receipt,options={}}) {
  const file=path.resolve(learnerFile),lock=`${file}.lock`;
  const owner=acquireLock(lock);
  try {
    const state=readLearner(file);
    const record=sourceRecord(trace,snapshot,replay,receipt,options);
    verifyExecution(trace,snapshot,replay,receipt,record.options);assertPersonaLearningEligible(trace);bindLearningIdentity(state.identity,trace,replay);
    const previous=state.rounds.find(r=>r.replay.replayId===replay.replayId);
    if(previous) {
      need(previous.evidenceHash===record.evidenceHash, 'Conflicting evidence for an already recorded replay');
      return {state,experience:state.identity.arm==='C'?undefined:reconstructExperience(state),idempotent:true};
    }
    need(!state.rounds.some(r=>r.replay.sessionId===replay.sessionId), 'A session cannot be recorded with another replay');
    assertExperienceLineage(trace,reconstructExperience(state),state.identity);
    const updated=signedState(state.identity,[...state.rounds,record]);
    // Reconstruct before writing so malformed or unbound observations cannot enter the archive.
    const experience=reconstructExperience(updated);
    writeAtomic(file,updated);
    return {state:updated,experience:state.identity.arm==='C'?undefined:experience,idempotent:false};
  } finally {
    releaseLock(lock,owner);
  }
}

module.exports={createLearner,readLearner,recordLearnerRound,getLearnerExperience,assertExperienceLineage};
