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

const chainFormat = chain => memo.memoFormatOf(chain.template ?? memo.CHAIN_TEMPLATE);

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
  const template = options.template ?? memo.CHAIN_TEMPLATE;
  const format = memo.memoFormatOf(template);
  const condition = options.condition ?? 'memory';
  if (!memo.CHAIN_CONDITIONS.includes(condition)) throw new Error(`Unknown condition ${condition}; use ${memo.CHAIN_CONDITIONS.join(' or ')}`);
  if (condition === 'no-memory' && options.carryAnyStoreFrom !== undefined) throw new Error('A no-memory control chain carries nothing from other stores');
  memo.visitMemoProfileOf(persona.id, persona.version, undefined, { routeInstructions: format.labels });
  const chain = { version: memo.CHAIN_VERSION, template, condition, memoFormat: format.version,
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
    const section = memo.parseVisitMemoSections(text.trim(), chainFormat(from).sections).find(entry => entry.id === 'anyStore');
    if (section && section.lines.length > 0)
      chain.carriedAnyStoreTips = { fromChain: fromFile, fromStoreKey: from.storeKey, fromVisit: lastValid.visit,
        fromMemoSha256: lastValid.outputMemoSha256, text: section.lines.join('\n') };
  }
  fs.mkdirSync(path.dirname(path.resolve(chainFile)), { recursive: true });
  fs.writeFileSync(chainFile, JSON.stringify(chain, null, 2) + '\n', { flag: 'wx' });
  return chain;
}

/** Checks one actor reply's memo against the chain's format. Returns the fixed rewrite request when it would not be recorded. */
function checkReply(chainFile, replyFile) {
  const { chain } = memo.readChain(chainFile);
  const format = chainFormat(chain);
  const extracted = memo.extractVisitMemo(fs.readFileSync(replyFile, 'utf8'));
  let problem = null, characters = null;
  if (!extracted) problem = '최종 답에 <visit-memo> 메모가 없거나 비어 있습니다';
  else {
    characters = Array.from(extracted).length;
    try { memo.validateVisitMemo(extracted, format); }
    catch (error) { problem = `${error.message} (지금 ${characters}자, 상한 ${format.maxCharacters}자)`; }
  }
  return { valid: problem === null, characters, limit: format.maxCharacters, problem, rewritesAllowed: format.rewrites ?? 0,
    rewritePromptVersion: problem && format.rewrites ? memo.MEMO_REWRITE_VERSION : null,
    rewritePrompt: problem && format.rewrites ? memo.memoRewritePrompt(problem, format) : null };
}

/**
 * Appends one visit. The slot's actor input must carry the visit number and
 * previous memo this chain would hand out now. The memo is the last tagged
 * memo in the actor's final reply, saved verbatim as memos/visit-<N>-<slot>.txt
 * beside the chain file, never inside the actor's slot. With a v3b chain the
 * replies to up to two memo rewrite requests follow in options.rewriteReplies;
 * the first valid memo in order is the visit's memo and every attempt is kept.
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
  const format = chainFormat(chain);
  const expectedMemo = expected.previousMemo ? memo.validateVisitMemo(expected.previousMemo.text, format).text : null;
  if (receivedMemo !== expectedMemo) throw new Error('Slot actor input did not receive the last valid memo of this chain');
  const rewriteReplies = options.rewriteReplies ?? [];
  if (rewriteReplies.length > (format.rewrites ?? 0))
    throw new Error(`${chain.template ?? memo.CHAIN_TEMPLATE} allows ${format.rewrites ?? 0} memo rewrites, not ${rewriteReplies.length}`);
  if (options.noVisit && rewriteReplies.length) throw new Error('A no-visit record has no memo to rewrite');
  const relative = file => path.relative(path.dirname(chainFile), path.resolve(file));
  // Kept beside the chain, outside the actor's slot: the actor may write any
  // file in its own slot, including one named like a memo.
  const saveMemo = (text, suffix) => {
    const memoFile = path.join(path.dirname(chainFile), 'memos', `visit-${expected.index}-${path.basename(slot)}${suffix}.txt`);
    fs.mkdirSync(path.dirname(memoFile), { recursive: true });
    if (!fs.existsSync(memoFile) || fs.readFileSync(memoFile, 'utf8') !== text) fs.writeFileSync(memoFile, text, { flag: 'wx' });
    return relative(memoFile);
  };
  const attempts = [replyFile, ...rewriteReplies].map((file, index) => {
    const replyText = fs.readFileSync(file, 'utf8');
    const extracted = memo.extractVisitMemo(replyText);
    const attempt = { kind: index === 0 ? 'final-reply' : 'memo-rewrite', replyFile: relative(file), replySha256: memo.sha256(replyText),
      memoFile: null, memoSha256: null, status: null, error: null, metrics: null };
    if (index > 0) attempt.rewritePromptVersion = memo.MEMO_REWRITE_VERSION;
    if (!extracted) { attempt.status = 'missing'; return { attempt, extracted, index }; }
    attempt.memoSha256 = memo.sha256(extracted);
    try { attempt.metrics = memo.visitMemoMetrics(extracted, format); attempt.status = 'valid'; }
    catch (error) { attempt.status = 'invalid'; attempt.error = error.message; }
    return { attempt, extracted, index };
  });
  const firstValid = attempts.findIndex(item => item.attempt.status === 'valid');
  if (firstValid !== -1 && firstValid < attempts.length - 1)
    throw new Error(`Memo attempt ${firstValid + 1} was already valid; a rewrite may only follow a memo that would not be recorded`);
  if (options.noVisit && attempts[0].extracted) throw new Error('A no-visit record must not carry a memo; the person did not experience this visit');
  // Files are written only after every check passed, so a refused record leaves nothing behind.
  for (const item of attempts) if (item.extracted) item.attempt.memoFile = saveMemo(item.extracted, item.index === 0 ? '' : `-rewrite-${item.index}`);
  const chosen = firstValid === -1 ? attempts[attempts.length - 1] : attempts[firstValid];
  const entry = { visit: options.noVisit ? null : expected.index, slot: path.relative(path.dirname(chainFile), slot),
    actorInputSha256: memo.sha256(actorInputText), inputMemoSha256: expected.previousMemo?.sha256 ?? null,
    replyFile: attempts[0].attempt.replyFile, replySha256: attempts[0].attempt.replySha256,
    outputMemoFile: null, outputMemoSha256: null, memoStatus: null, error: null, metrics: null,
    memoRewrites: rewriteReplies.length, ...(rewriteReplies.length ? { memoAttempts: attempts.map(item => item.attempt) } : {}),
    recordedAt: new Date().toISOString() };
  if (options.noVisit) {
    entry.memoStatus = 'no-visit';
  } else {
    entry.memoStatus = chosen.attempt.status;
    entry.outputMemoFile = chosen.attempt.memoFile;
    entry.outputMemoSha256 = chosen.attempt.memoSha256;
    entry.metrics = chosen.attempt.metrics;
    entry.error = chosen.attempt.error;
  }
  chain.entries.push(entry);
  writeChain(chainFile, chain);
  return entry;
}

/**
 * Whether a slot's owner showed the visit recall exactly as its actor input
 * said it would. A recall is expected only when the input builder wrote
 * owner/visit-recall.json, i.e. a memory chain with a previous valid memo.
 * An earlier missing or invalid memo correctly means no recall.
 */
function verifyRecall(slotDirectory) {
  const slot = path.resolve(slotDirectory);
  const owner = path.join(slot, 'owner');
  const recallFile = path.join(owner, 'visit-recall.json');
  const expected = fs.existsSync(recallFile);
  const events = fs.existsSync(path.join(owner, 'events.jsonl'))
    ? fs.readFileSync(path.join(owner, 'events.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
  const recallEvents = events.filter(item => item.type === 'visit-recall');
  const menus = fs.existsSync(path.join(owner, 'responses')) ? fs.readdirSync(path.join(owner, 'responses')).filter(name => name.endsWith('.json'))
    .map(name => JSON.parse(fs.readFileSync(path.join(owner, 'responses', name), 'utf8'))).filter(record => record.ok && record.result?.menu) : [];
  const withRecall = menus.filter(record => record.result.menu.rememberedVisit).length;
  const problems = [];
  if (recallEvents.length > 1) problems.push('the owner loaded the recall more than once');
  if (expected) {
    const sha = memo.sha256(fs.readFileSync(recallFile, 'utf8'));
    if (recallEvents[0]?.present !== true) problems.push('owner did not load the expected visit-recall.json');
    else if (recallEvents[0].sha256 !== sha) problems.push('owner loaded a different visit-recall.json');
    if (withRecall !== menus.length) problems.push(`${menus.length - withRecall} of ${menus.length} menus lack rememberedVisit`);
  } else {
    if (recallEvents.some(item => item.present)) problems.push('owner loaded a recall although none was expected');
    if (withRecall) problems.push(`${withRecall} menus carry rememberedVisit although no recall was expected`);
  }
  return { slot, recallExpected: expected, menus: menus.length, menusWithRecall: withRecall,
    recognizedMenus: menus.filter(record => record.result.menu.rememberedVisit?.recognized?.length).length, ok: problems.length === 0, problems };
}

/**
 * How the visit used its memory, read from the owner's own records in operation
 * order. For each accepted walk it notes whether the menu just before it marked
 * passages toward the plan's remembered position or in a direction the current
 * step names, and whether the choice was one of them; it also lists decisions
 * taken right after a recognised memo line. It counts; it does not judge intent.
 */
function memoUseOf(slotDirectory) {
  const owner = path.join(path.resolve(slotDirectory), 'owner');
  const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
  const order = fs.readFileSync(path.join(owner, 'events.jsonl'), 'utf8').trim().split('\n').filter(Boolean)
    .map(line => JSON.parse(line)).filter(item => item.type === 'operation').map(item => item.operationId);
  const use = { planCalls: 0, planRevisionsWithSteps: 0, finalPlan: null, acceptedDecisions: 0, walks: 0,
    walksWithHeading: 0, walksTowardHeading: 0, walksWithNamedDirections: 0, walksInNamedDirection: 0,
    decisionsAfterRecognition: [] };
  let menu = null;
  for (const operationId of order) {
    const responseFile = path.join(owner, 'responses', `${operationId}.json`);
    if (!fs.existsSync(responseFile)) continue;
    const command = read(path.join(owner, 'commands', `${operationId}.json`));
    const response = read(responseFile);
    if (!response.ok) continue;
    if (command.tool === 'visit_plan') {
      use.planCalls += 1;
      if (command.arguments.steps) use.planRevisionsWithSteps += 1;
      use.finalPlan = response.result.plan;
    }
    if (command.tool === 'append_whole_trace_decision' && response.result?.accepted === true) {
      use.acceptedDecisions += 1;
      const choiceId = command.arguments.decision?.choiceRef?.choiceId;
      const plan = menu?.visitPlan?.current;
      if (typeof choiceId === 'string' && choiceId.startsWith('walk/')) {
        use.walks += 1;
        if (plan?.passagesTowardRemembered?.length) {
          use.walksWithHeading += 1;
          if (plan.passagesTowardRemembered.includes(choiceId)) use.walksTowardHeading += 1;
        }
        if (plan?.passagesNamedInStep?.length) {
          use.walksWithNamedDirections += 1;
          if (plan.passagesNamedInStep.includes(choiceId)) use.walksInNamedDirection += 1;
        }
      }
      if (menu?.rememberedVisit?.recognized?.length)
        use.decisionsAfterRecognition.push({ decisionNumber: use.acceptedDecisions, choiceId: choiceId ?? null,
          recognized: menu.rememberedVisit.recognized.map(item => item.label) });
    }
    if (response.result?.menu) menu = response.result.menu;
  }
  return use;
}

/** One row per recorded visit, for comparing memo amount and form between personas. */
function chainMetrics(chainFile) {
  const { chain } = memo.readChain(chainFile);
  return chain.entries.map(entry => ({ personaId: chain.personaId, personaVersion: chain.personaVersion, storeKey: chain.storeKey,
    template: chain.template ?? memo.CHAIN_TEMPLATE, condition: chain.condition ?? 'memory',
    visit: entry.visit, memoStatus: entry.memoStatus, memoRewrites: entry.memoRewrites ?? 0,
    characters: entry.metrics?.characters ?? null, labels: entry.metrics?.labels ?? null,
    sureMarks: entry.metrics?.sureMarks ?? null, vagueMarks: entry.metrics?.vagueMarks ?? null,
    sectionItems: entry.metrics ? Object.fromEntries(entry.metrics.sections.map(section => [section.id, section.items])) : null,
    sectionLines: entry.metrics ? Object.fromEntries(entry.metrics.sections.map(section => [section.id, section.lines])) : null }));
}

module.exports = { initChain, checkReply, recordVisit, verifyRecall, memoUseOf, chainMetrics };

if (require.main === module) {
  const [command, ...args] = process.argv.slice(2);
  const options = {};
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--carry-any-store-from') options.carryAnyStoreFrom = args[++index];
    else if (args[index] === '--template') options.template = args[++index];
    else if (args[index] === '--condition') options.condition = args[++index];
    else if (args[index] === '--no-visit') options.noVisit = true;
    else if (args[index] === '--rewrite-reply') (options.rewriteReplies ??= []).push(args[++index]);
    else positional.push(args[index]);
  }
  const usage = 'Usage:\n'
    + '  node market-simulator/visit-memo-chain.cjs init <memo-chain.json> <slot>/owner/prepare-response.json [--template authoring-v5-h200-memo-v2|authoring-v5-h200-memo-v3] [--condition memory|no-memory] [--carry-any-store-from <other-store-chain.json>]\n'
    + '  node market-simulator/visit-memo-chain.cjs check <memo-chain.json> <actor-reply.txt>\n'
    + '  node market-simulator/visit-memo-chain.cjs record <memo-chain.json> <slot> <actor-final-reply.txt> [--rewrite-reply <reply.txt>]... [--no-visit]\n'
    + '  node market-simulator/visit-memo-chain.cjs verify-recall <slot>\n'
    + '  node market-simulator/visit-memo-chain.cjs memo-use <slot>\n'
    + '  node market-simulator/visit-memo-chain.cjs metrics <memo-chain.json> [...]\n'
    + 'Use --no-visit only when the session stopped before any decision was accepted.\n';
  try {
    let result;
    if (command === 'init' && positional.length === 2) result = initChain(positional[0], positional[1], options);
    else if (command === 'check' && positional.length === 2) result = checkReply(positional[0], positional[1]);
    else if (command === 'record' && positional.length === 3) result = recordVisit(positional[0], positional[1], positional[2], options);
    else if (command === 'verify-recall' && positional.length === 1) result = verifyRecall(positional[0]);
    else if (command === 'memo-use' && positional.length === 1) result = memoUseOf(positional[0]);
    else if (command === 'metrics' && positional.length >= 1) result = positional.flatMap(file => chainMetrics(file));
    else { process.stderr.write(usage); process.exitCode = 2; }
    if (result !== undefined) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
