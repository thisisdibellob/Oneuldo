#!/usr/bin/env node
'use strict';
// Records a person's visit memos to one store as a chain. Each visit's actor
// input takes its visit number and previous memo from this chain
// (whole-trace-actor-input.cjs --visit-memo-chain), and `record` checks that
// the visit really received the last valid memo before appending the new one.
// Memos are stored verbatim; invalid or missing memos are recorded as such and
// never repaired. Design: docs/ai/visit-memo-v2-design-2026-11-24.md

const fs = require('node:fs');
const path = require('node:path');
const memo = require('./visit-memo.cjs');

const MEMO_FORMAT = memo.MEMO_FORMATS[memo.CHAIN_TEMPLATE];

function writeChain(file, chain) {
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(chain, null, 2) + '\n', { flag: 'wx' });
  fs.renameSync(temporary, file);
}

/** Starts an empty chain for the prepared person and store. Never overwrites. */
function initChain(chainFile, prepareResponseFile, options = {}) {
  const prepareResponse = JSON.parse(fs.readFileSync(prepareResponseFile, 'utf8'));
  const persona = prepareResponse.bundle?.persona;
  if (!persona?.id) throw new Error('prepare response has no bundle.persona.id');
  memo.visitMemoProfileOf(persona.id, persona.version);
  const chain = { version: memo.CHAIN_VERSION, template: memo.CHAIN_TEMPLATE, memoFormat: MEMO_FORMAT.version,
    personaId: persona.id, personaVersion: String(persona.version), storeKey: memo.storeKeyOf(prepareResponse),
    storeKeyBasis: memo.STORE_KEY_BASIS, carriedAnyStoreTips: null, entries: [] };
  if (options.carryAnyStoreFrom !== undefined) {
    const fromFile = path.resolve(options.carryAnyStoreFrom);
    const { chain: from } = memo.readChain(fromFile);
    if (from.personaId !== chain.personaId) throw new Error(`Cannot carry tips from ${from.personaId} to ${chain.personaId}`);
    if (from.storeKey === chain.storeKey) throw new Error('The source chain is for the same store; continue that chain instead');
    const lastValid = [...from.entries].reverse().find(entry => entry.memoStatus === 'valid');
    if (!lastValid) throw new Error('The source chain has no valid memo to carry tips from');
    const text = memo.readChainMemo(lastValid, fromFile);
    const section = memo.parseVisitMemoSections(text.trim()).find(entry => entry.id === 'anyStore');
    if (section && section.lines.length > 0)
      chain.carriedAnyStoreTips = { fromChain: fromFile, fromStoreKey: from.storeKey, fromVisit: lastValid.visit,
        fromMemoSha256: lastValid.outputMemoSha256, text: section.lines.join('\n') };
  }
  fs.mkdirSync(path.dirname(path.resolve(chainFile)), { recursive: true });
  fs.writeFileSync(chainFile, JSON.stringify(chain, null, 2) + '\n', { flag: 'wx' });
  return chain;
}

/**
 * Appends one visit. The slot's actor input must carry the visit number and
 * previous memo this chain would hand out now. The memo is the last tagged
 * memo in the actor's final reply, saved verbatim as <slot>/visit-memo.txt.
 */
function recordVisit(chainFile, slotDirectory, replyFile, options = {}) {
  chainFile = path.resolve(chainFile);
  const { chain } = memo.readChain(chainFile);
  const slot = path.resolve(slotDirectory);
  const actorInputText = fs.readFileSync(path.join(slot, 'actor-input.json'), 'utf8');
  const actorInput = JSON.parse(actorInputText);
  const expected = memo.nextVisitOf(chain, chainFile);
  if (chain.entries.some(entry => path.resolve(path.dirname(chainFile), entry.slot) === slot))
    throw new Error(`${slot} is already recorded in this chain`);
  if (actorInput.visit?.version !== memo.CHAIN_VERSION || actorInput.visit.number !== expected.number)
    throw new Error(`Slot actor input is visit ${actorInput.visit?.number ?? 'unknown'}, but this chain expects visit ${expected.number}`);
  const receivedMemo = actorInput.previousVisit?.memo ?? null;
  const expectedMemo = expected.previousMemo ? memo.validateVisitMemo(expected.previousMemo.text, MEMO_FORMAT).text : null;
  if (receivedMemo !== expectedMemo) throw new Error('Slot actor input did not receive the last valid memo of this chain');
  const replyText = fs.readFileSync(replyFile, 'utf8');
  const extracted = memo.extractVisitMemo(replyText);
  const entry = { visit: options.noVisit ? null : expected.number, slot: path.relative(path.dirname(chainFile), slot),
    actorInputSha256: memo.sha256(actorInputText), inputMemoSha256: expected.previousMemo?.sha256 ?? null,
    replyFile: path.relative(path.dirname(chainFile), path.resolve(replyFile)), replySha256: memo.sha256(replyText),
    outputMemoFile: null, outputMemoSha256: null, memoStatus: null, error: null, metrics: null, recordedAt: new Date().toISOString() };
  if (options.noVisit) {
    if (extracted) throw new Error('A no-visit record must not carry a memo; the person did not experience this visit');
    entry.memoStatus = 'no-visit';
  } else if (!extracted) {
    entry.memoStatus = 'missing';
  } else {
    const memoFile = path.join(slot, 'visit-memo.txt');
    fs.writeFileSync(memoFile, extracted, { flag: 'wx' });
    entry.outputMemoFile = path.relative(path.dirname(chainFile), memoFile);
    entry.outputMemoSha256 = memo.sha256(extracted);
    try {
      entry.metrics = memo.visitMemoMetrics(extracted);
      entry.memoStatus = 'valid';
    } catch (error) {
      entry.memoStatus = 'invalid';
      entry.error = error.message;
    }
  }
  chain.entries.push(entry);
  writeChain(chainFile, chain);
  return entry;
}

/** One row per recorded visit, for comparing memo amount and form between personas. */
function chainMetrics(chainFile) {
  const { chain } = memo.readChain(chainFile);
  return chain.entries.map(entry => ({ personaId: chain.personaId, personaVersion: chain.personaVersion, storeKey: chain.storeKey,
    visit: entry.visit, memoStatus: entry.memoStatus, characters: entry.metrics?.characters ?? null,
    sureMarks: entry.metrics?.sureMarks ?? null, vagueMarks: entry.metrics?.vagueMarks ?? null,
    sectionItems: entry.metrics ? Object.fromEntries(entry.metrics.sections.map(section => [section.id, section.items])) : null,
    sectionLines: entry.metrics ? Object.fromEntries(entry.metrics.sections.map(section => [section.id, section.lines])) : null }));
}

module.exports = { initChain, recordVisit, chainMetrics };

if (require.main === module) {
  const [command, ...args] = process.argv.slice(2);
  const options = {};
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--carry-any-store-from') options.carryAnyStoreFrom = args[++index];
    else if (args[index] === '--no-visit') options.noVisit = true;
    else positional.push(args[index]);
  }
  const usage = 'Usage:\n'
    + '  node market-simulator/visit-memo-chain.cjs init <memo-chain.json> <slot>/owner/prepare-response.json [--carry-any-store-from <other-store-chain.json>]\n'
    + '  node market-simulator/visit-memo-chain.cjs record <memo-chain.json> <slot> <actor-final-reply.txt> [--no-visit]\n'
    + '  node market-simulator/visit-memo-chain.cjs metrics <memo-chain.json> [...]\n'
    + 'Use --no-visit only when the session stopped before any decision was accepted.\n';
  try {
    let result;
    if (command === 'init' && positional.length === 2) result = initChain(positional[0], positional[1], options);
    else if (command === 'record' && positional.length === 3) result = recordVisit(positional[0], positional[1], positional[2], options);
    else if (command === 'metrics' && positional.length >= 1) result = positional.flatMap(file => chainMetrics(file));
    else { process.stderr.write(usage); process.exitCode = 2; }
    if (result !== undefined) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
