#!/usr/bin/env node
'use strict';
// Deterministic, read-only audit of whole-trace actor records in a run directory.
// It decides only what records can prove (owner ledger, files, text). Anything that
// needs interpretation (intent behind an access, whether code chose actions, why a
// count differs) is placed in reviewQueue for a separate reviewer; it is never
// silently judged here. Writes <run>/scripted-record-audit.json (never overwrites).
//
// Usage: node market-simulator/scripts/audit-actor-records.cjs <runDirectory> [--out file] [--stdout]
const fs = require('node:fs');
const path = require('node:path');

const VERSION = 'scripted-actor-audit-v1';
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const exists = file => { try { return fs.statSync(file).isFile(); } catch { return false; } };

function events(slot) {
  const file = path.join(slot, 'actor-events.jsonl');
  if (!exists(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap(line => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}
function commands(slot) {
  return events(slot).filter(e => e.type === 'item.completed' && e.item?.type === 'command_execution')
    .map(e => ({ id: e.item.id, command: e.item.command ?? '', exitCode: e.item.exit_code ?? null, output: e.item.aggregated_output ?? '' }));
}
// Shell text arrives quoted inside `/bin/zsh -lc "..."`; normalise the escapes that matter for paths.
// Event text already holds real newlines; a literal "\\n" (e.g. inside printf) must stay as-is.
const unescape = text => text.replace(/\\(["'$])/g, '$1');
const clean = token => token.replace(/^["']+|["';)]+$/g, '');

function ownerLedger(slot) {
  const dir = path.join(slot, 'owner', 'responses');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(name => name.endsWith('.json')).map(name => {
    const file = path.join(dir, name), response = read(file);
    const commandFile = path.join(slot, 'owner', 'commands', name);
    const command = exists(commandFile) ? read(commandFile) : null;
    return { name, file, mtimeMs: fs.statSync(file).mtimeMs, response, command, tool: command?.tool ?? null };
  }).sort((a, b) => a.mtimeMs - b.mtimeMs || a.name.localeCompare(b.name));
}

// 1. Rewrite fidelity: the first rejected draft's choice must equal the finally accepted choice.
function rewriteChecks(ledger, allowUnavailable = false) {
  let lastMenu = null;
  const byIndex = new Map(), menuBefore = new Map();
  for (const entry of ledger) {
    const result = entry.response.result ?? {};
    if (entry.tool === 'begin_whole_trace_authoring' && result.menu) lastMenu = result.menu;
    if (entry.tool !== 'append_whole_trace_decision') continue;
    const decision = entry.command?.arguments?.decision;
    const index = result.decisionIndex ?? entry.response.error?.decisionIndex ?? null;
    if (index === null || index === undefined) continue;
    if (!menuBefore.has(index)) menuBefore.set(index, lastMenu);
    const attempt = { operationId: entry.response.operationId, choiceId: decision?.choiceRef?.choiceId ?? null,
      quantity: decision?.choiceRef?.quantity ?? null, accepted: entry.response.ok && result.accepted === true,
      rules: (result.issues ?? []).map(issue => issue.rule) };
    if (!byIndex.has(index)) byIndex.set(index, []);
    byIndex.get(index).push(attempt);
    if (attempt.accepted && result.menu) lastMenu = result.menu;
  }
  const checks = [];
  for (const [index, attempts] of [...byIndex].sort((a, b) => a[0] - b[0])) {
    if (!attempts.some(attempt => !attempt.accepted)) continue;
    const first = attempts.find(attempt => !attempt.accepted);
    const final = attempts.find(attempt => attempt.accepted) ?? attempts.at(-1);
    const changed = attempts.filter(attempt => attempt.choiceId !== first.choiceId || attempt.quantity !== first.quantity);
    const before = menuBefore.get(index);
    checks.push({ decisionNumber: index + 1, attempts: attempts.length, firstRejected: first, final,
      choicePreserved: changed.length === 0,
      choiceUnavailableRewrite: allowUnavailable && changed.length > 0 && before?.choiceIds?.includes(first.choiceId) === false
        && changed.every(attempt => attempt.choiceId !== first.choiceId && before.choiceIds.includes(attempt.choiceId))
        && final.accepted === true,
      ...(changed.length ? { changedTo: [...new Set(changed.map(attempt => attempt.choiceId))],
        originalChoiceInPrecedingMenu: before?.choiceIds ? before.choiceIds.includes(first.choiceId) : null } : {}) });
  }
  return checks;
}

// 2. Record completeness, derived from the mailbox calls the actor actually ran.
function callRecords(slot, cmds) {
  const calls = [];
  const receiptRoot = path.join(slot, 'owner', 'calls');
  if (fs.existsSync(receiptRoot)) {
    for (const name of fs.readdirSync(receiptRoot)) {
      const dir = path.join(receiptRoot, name);
      const completed = exists(path.join(dir, 'completion.json')) ? read(path.join(dir, 'completion.json')) : null;
      let operationId = completed?.operationId ?? null;
      try { operationId ??= read(path.join(dir, 'input.json')).operationId; } catch { /* preserve incomplete receipt */ }
      calls.push({ eventItem: `owner-call:${name}`, commandExit: completed?.exitCode ?? null, operationId,
        operationFile: path.relative(slot, path.join(dir, 'input.json')),
        delivered: !!operationId && exists(path.join(slot, 'owner', 'commands', `${operationId}.json`)),
        inputSaved: exists(path.join(dir, 'input.json')), stdoutSaved: exists(path.join(dir, 'stdout.log')),
        stderrSaved: exists(path.join(dir, 'stderr.log')), exitSaved: exists(path.join(dir, 'exit-code')) && !!completed });
    }
  }
  for (const cmd of cmds) {
    const text = unescape(cmd.command);
    const pattern = /whole-trace-mailbox\.cjs\s+call\s+(\S+)\s+--operation-file\s+(\S+)([^\n;&|]*)/g;
    let match;
    while ((match = pattern.exec(text))) {
      const tail = match[3] ?? '';
      const after = text.slice(match.index);
      const resolve = file => path.resolve(slot, clean(file));
      const operationFile = resolve(match[2]);
      const stdoutTarget = /(?:^|[^2&])>\s*(?!&)(\S+)/.exec(tail)?.[1] ?? /\|\s*tee\s+(?:-a\s+)?(\S+)/.exec(tail)?.[1];
      const stderrTarget = /2>\s*(?!&)(\S+)/.exec(tail)?.[1];
      const merged = /2>&1/.test(tail);
      // Exit status: `echo $? > f`, or `code=$?` (any shell quoting) followed by a redirect of $code.
      const exitTarget = /\$\?(?![^\n]*=)[^\n;]*?>\s*(\S+)/.exec(after)?.[1]
        ?? /\b(rc|code|status|exit\w*)=["']*\$\?[\s\S]*?\$\{?\1\}?["']*\s*>\s*(\S+)/.exec(after)?.[2];
      let operationId = null;
      if (exists(operationFile)) { try { operationId = read(operationFile).operationId ?? null; } catch { /* unreadable input */ } }
      operationId ??= /operationId['"]?\s*[:=]\s*['"]([A-Za-z0-9._-]+)/.exec(text)?.[1] ?? null;
      const delivered = !!operationId && exists(path.join(slot, 'owner', 'commands', `${operationId}.json`));
      if (calls.some(call => call.operationId === operationId && call.eventItem.startsWith('owner-call:'))) continue;
      calls.push({ eventItem: cmd.id, commandExit: cmd.exitCode, operationId, operationFile: path.relative(slot, operationFile), delivered,
        inputSaved: exists(operationFile),
        stdoutSaved: !!stdoutTarget && exists(resolve(stdoutTarget)),
        stderrSaved: merged ? 'merged-with-stdout' : !!stderrTarget && exists(resolve(stderrTarget)),
        exitSaved: !!exitTarget && exists(resolve(exitTarget)) });
    }
  }
  return calls;
}
function recordGaps(calls) {
  const gaps = [];
  for (const call of calls) {
    const missing = ['inputSaved', 'stdoutSaved', 'stderrSaved', 'exitSaved'].filter(key => call[key] === false);
    // An undelivered local attempt (e.g. a script error before the call) never reached the owner;
    // it is a separate, lesser gap than a delivered operation without its console record.
    if (missing.length) gaps.push({ type: call.delivered ? 'delivered-operation' : 'undelivered-local-attempt',
      operationId: call.operationId, eventItem: call.eventItem, commandExit: call.commandExit, missing: missing.map(key => key.replace('Saved', '')) });
  }
  return gaps;
}

// An operation input written more than once loses the earlier draft (the instructions forbid overwriting).
function overwrittenInputs(slot, cmds) {
  const writes = new Map();
  for (const cmd of cmds) {
    const text = unescape(cmd.command);
    const targets = [...text.matchAll(/cat\s+>\s*(\S+)\s+<</g)].map(m => m[1])
      .concat([...text.matchAll(/open\(\s*['"]([^'"]+)['"]\s*,\s*['"]w/g)].map(m => m[1]))
      .concat([...text.matchAll(/writeFileSync\(\s*['"]([^'"]+)['"]/g)].map(m => m[1]));
    for (const target of targets) {
      const file = path.resolve(slot, clean(target));
      if (!/\.json$/.test(file)) continue;
      if (!writes.has(file)) writes.set(file, []);
      writes.get(file).push(cmd.id);
    }
  }
  return [...writes].filter(([, items]) => items.length > 1).map(([file, items]) => ({ file: path.relative(slot, file), writes: items }));
}

// 3. Out-of-scope access signals (flags only; intent needs review).
const RUN_LEVEL = ['results.json', 'results.csv', 'selected-slots.json', 'PROTOCOL.md', 'REPORT', 'run-metadata.json', 'binding-', '/snapshots/', 'independent-record-audit'];
function accessFlags(slot, code, allCodes, cmds) {
  const flags = [];
  for (const cmd of cmds) {
    const text = unescape(cmd.command), hits = [];
    if (/prepare-response/.test(text)) hits.push('prepare-response');
    if (/worldReference|choiceCatalog/.test(text)) hits.push('hidden-bundle-key');
    if (/market-simulator\/(?!whole-trace-mailbox\.cjs)\S*/.test(text) || /frontend\/src/.test(text)) hits.push('simulator-source');
    if (/(^|[\s'"])\.\.\//.test(text)) hits.push('parent-directory');
    if (/\b(?:find|ls|tree)\b[^\n|;]*\bowner\b|rg\s+--files[^\n|;]*/.test(text)) hits.push('file-listing');
    for (const other of allCodes) if (other !== code && new RegExp(`actors/${other}\\b`).test(text)) hits.push(`other-slot:${other}`);
    for (const marker of RUN_LEVEL) if (text.includes(marker)) hits.push(`run-level:${marker}`);
    if (hits.length) flags.push({ eventItem: cmd.id, hits: [...new Set(hits)], command: text.slice(0, 300) });
  }
  return flags;
}

// 4. Programmatic action-choice signals (flags only).
function automationFlags(cmds) {
  const flags = [];
  for (const cmd of cmds) {
    const text = unescape(cmd.command);
    const appends = new Set([...text.matchAll(/append_whole_trace_decision/g)].map((_, i) => i)).size;
    const calls = [...text.matchAll(/whole-trace-mailbox\.cjs\s+call/g)].length;
    // Only the part that builds the operation (before the first mailbox call) can choose an action;
    // loops that merely print the response afterwards are not a signal.
    const building = calls > 0 ? text.slice(0, text.search(/whole-trace-mailbox\.cjs\s+call/)) : '';
    const loop = /\bfor\s*\(|\bfor\s+\w+\s+in\b|\bwhile\b|\.map\(|\.forEach\(|random|choice\(/.test(building);
    if (calls > 1 || appends > 1 || loop) flags.push({ eventItem: cmd.id, mailboxCalls: calls, appendMentions: appends, loopSyntax: loop, command: text.slice(0, 300) });
  }
  return flags;
}
// Novel-but-known signal: printing menu advisory fields the actor might copy.
function advisoryFlags(cmds) {
  return cmds.filter(cmd => /advisory/.test(cmd.command)).map(cmd => ({ eventItem: cmd.id, command: unescape(cmd.command).slice(0, 200) }));
}

// 5. Language of accepted actor prose.
const ID_LIKE = /^(?:[A-Z]\d+|objective|mL|L|ID|OK)$/;
function languageIssues(ledger) {
  const issues = [];
  for (const entry of ledger) {
    const result = entry.response.result ?? {};
    if (entry.tool !== 'append_whole_trace_decision' || !(entry.response.ok && result.accepted)) continue;
    const d = entry.command.arguments.decision, s = d.actorState ?? {};
    const fields = { reason: d.reason, task: s.task, ...Object.fromEntries(Object.entries(s.thought ?? {}).map(([k, v]) => [`thought.${k}`, v])) };
    for (const [field, value] of Object.entries(fields)) {
      if (typeof value !== 'string') continue;
      const han = /[㐀-鿿]/.test(value), kana = /[぀-ヿ]/.test(value);
      const latin = [...value.matchAll(/[A-Za-z]{3,}/g)].map(m => m[0]).filter(word => !ID_LIKE.test(word));
      if (han || kana || latin.length) issues.push({ decisionNumber: result.decisionIndex + 1, field,
        kinds: [han && 'han', kana && 'kana', latin.length && 'latin'].filter(Boolean), words: latin, snippet: value.slice(0, 120) });
    }
  }
  return issues;
}

function auditSlot(slot, code, allCodes) {
  const ledger = ownerLedger(slot), cmds = commands(slot);
  const appends = ledger.filter(entry => entry.tool === 'append_whole_trace_decision');
  const acceptedAppends = appends.filter(entry => entry.response.ok && entry.response.result?.accepted === true).length;
  const rejectedAppends = appends.length - acceptedAppends;
  const selfReport = exists(path.join(slot, 'actor-completion.json')) ? read(path.join(slot, 'actor-completion.json')) : null;
  const status = exists(path.join(slot, 'owner', 'status.json')) ? read(path.join(slot, 'owner', 'status.json')) : null;
  const projection = exists(path.join(slot, 'projection.json')) ? read(path.join(slot, 'projection.json')) : null;
  const rewrites = rewriteChecks(ledger, ['authoring-v4', 'authoring-v4-h200', 'authoring-v5', 'authoring-v5-h200', 'authoring-v5-h200-memo', 'authoring-v5-h200-memo-v2', 'authoring-v5-h200-memo-v3'].includes(projection?.actorInstructions?.templateId));
  const calls = callRecords(slot, cmds);
  const result = {
    owner: { state: status?.state ?? null, requestStatus: status?.requestStatus?.status ?? null,
      failureCode: status?.requestStatus?.result?.code ?? null, completionVerified: status?.completionVerified ?? null },
    ledger: { acceptedAppends, rejectedAppends, operations: ledger.length },
    rewriteChecks: rewrites,
    procedureViolations: rewrites.filter(check => !check.choicePreserved && !check.choiceUnavailableRewrite).map(check => ({ type: 'rewrite-changed-chosen-action',
      decisionNumber: check.decisionNumber, from: check.firstRejected.choiceId, to: check.changedTo,
      originalChoiceInPrecedingMenu: check.originalChoiceInPrecedingMenu })),
    ledgerVsSelfReport: { selfReport: selfReport && { acceptedDecisionCount: selfReport.acceptedDecisionCount, rejectionCount: selfReport.rejectionCount },
      match: !!selfReport && selfReport.acceptedDecisionCount === acceptedAppends && selfReport.rejectionCount === rejectedAppends },
    mailboxCalls: { total: calls.length, delivered: calls.filter(call => call.delivered).length },
    recordGaps: recordGaps(calls),
    overwrittenInputs: overwrittenInputs(slot, cmds),
    languageIssues: languageIssues(ledger),
    accessFlags: accessFlags(slot, code, allCodes, cmds),
    automationFlags: automationFlags(cmds),
    advisoryFlags: advisoryFlags(cmds),
  };
  result.reviewQueue = [
    ...result.accessFlags.map(flag => ({ kind: 'access', eventItem: flag.eventItem, hits: flag.hits })),
    ...result.automationFlags.map(flag => ({ kind: 'automation', eventItem: flag.eventItem })),
    ...(result.advisoryFlags.length ? [{ kind: 'advisory-printed', count: result.advisoryFlags.length }] : []),
    ...(result.ledgerVsSelfReport.match ? [] : [{ kind: 'self-report-mismatch' }]),
    ...result.overwrittenInputs.map(o => ({ kind: 'overwritten-input', file: o.file })),
    ...result.procedureViolations.map(v => ({ kind: 'violation-context', decisionNumber: v.decisionNumber })),
  ];
  return result;
}

function audit(runDirectory) {
  const run = path.resolve(runDirectory);
  const slots = read(path.join(run, 'selected-slots.json'));
  const codes = slots.map(slot => slot.code);
  const out = { version: VERSION, auditedAt: new Date().toISOString(), runDirectory: run,
    scope: 'Deterministic checks of saved records only. reviewQueue items require separate interpretation; they are not findings.', slots: {} };
  for (const slot of slots) out.slots[slot.code] = auditSlot(slot.directory, slot.code, codes);
  out.summary = Object.fromEntries(Object.entries(out.slots).map(([code, s]) => [code, {
    violations: s.procedureViolations.length, deliveredRecordGaps: s.recordGaps.filter(g => g.type === 'delivered-operation').length,
    undeliveredLocalAttempts: s.recordGaps.filter(g => g.type === 'undelivered-local-attempt').length,
    overwrittenInputs: s.overwrittenInputs.length, accessFlags: s.accessFlags.length, automationFlags: s.automationFlags.length, languageIssues: new Set(s.languageIssues.map(i => i.decisionNumber)).size,
    selfReportMatch: s.ledgerVsSelfReport.match, failureCode: s.owner.failureCode, reviewQueue: s.reviewQueue.length }]));
  return out;
}

module.exports = { VERSION, audit, auditSlot, rewriteChecks, callRecords, languageIssues };

if (require.main === module) {
  const args = process.argv.slice(2);
  const run = args.find(arg => !arg.startsWith('--'));
  if (!run) { process.stderr.write('Usage: audit-actor-records.cjs <runDirectory> [--out file] [--stdout]\n'); process.exit(2); }
  const result = audit(run);
  if (args.includes('--stdout')) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  else {
    const outIndex = args.indexOf('--out');
    const file = outIndex >= 0 ? path.resolve(args[outIndex + 1]) : path.join(path.resolve(run), 'scripted-record-audit.json');
    fs.writeFileSync(file, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    process.stdout.write(JSON.stringify({ file, summary: result.summary }, null, 2) + '\n');
  }
}
