'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { audit } = require('../scripts/audit-actor-records.cjs');

const MAILBOX = '/repo/market-simulator/whole-trace-mailbox.cjs';
const decision = (choiceId, reason = '통로로 걸어간다') => ({ choiceRef: { choiceId }, delayMs: 900, reason,
  basis: { intent: 'explore', goalId: null, memoryUses: [] },
  actorState: { activity: 'orient', task: '통로 따라가기', heldGoalIds: [], uncertainGoalIds: [], focusedGoalId: null, focusedProductId: null, orientation: 'unfamiliar' } });

function slotFixture(t, ops, extraCommands = []) {
  const run = fs.mkdtempSync(path.join(os.tmpdir(), 'actor-audit-'));
  t.after(() => fs.rmSync(run, { recursive: true, force: true }));
  const slot = path.join(run, 'actors', 's-01');
  for (const dir of ['owner/commands', 'owner/responses', 'ops']) fs.mkdirSync(path.join(slot, dir), { recursive: true });
  const events = [];
  let time = Date.now() - 100000, item = 0;
  for (const op of ops) {
    const command = { operationId: op.id, tool: op.tool, arguments: op.args };
    fs.writeFileSync(path.join(slot, 'owner/commands', `${op.id}.json`), JSON.stringify(command));
    const response = path.join(slot, 'owner/responses', `${op.id}.json`);
    fs.writeFileSync(response, JSON.stringify({ operationId: op.id, ok: true, result: op.result }));
    time += 1000; fs.utimesSync(response, time / 1000, time / 1000);
    const input = path.join(slot, 'ops', `${op.id}.json`);
    fs.writeFileSync(input, JSON.stringify(command));
    const base = `ops/${op.id}`;
    const saveConsole = op.saveConsole !== false;
    if (saveConsole) for (const ext of ['stdout', 'stderr', 'exit']) fs.writeFileSync(path.join(slot, `${base}.${ext}`), '0');
    const redirect = saveConsole ? ` > ${base}.stdout 2> ${base}.stderr; code="'$?; printf '"'%s\\n' \\""'$code" > ${base}.exit` : '';
    events.push({ type: 'item.completed', item: { id: `item_${++item}`, type: 'command_execution', exit_code: 0,
      command: `/bin/zsh -lc "node ${MAILBOX} call ${slot}/owner --operation-file ${input}${redirect}"` } });
  }
  for (const command of extraCommands) events.push({ type: 'item.completed', item: { id: `item_${++item}`, type: 'command_execution', exit_code: 0, command } });
  fs.writeFileSync(path.join(slot, 'actor-events.jsonl'), events.map(e => JSON.stringify(e)).join('\n') + '\n');
  fs.writeFileSync(path.join(slot, 'actor-completion.json'), JSON.stringify({ status: 'complete', acceptedDecisionCount: 2, rejectionCount: 1 }));
  fs.writeFileSync(path.join(run, 'selected-slots.json'), JSON.stringify([{ code: 's-01', directory: slot }]));
  return { run, slot };
}
const begin = { id: 'b-1', tool: 'begin_whole_trace_authoring', args: { maxRewritesPerDecision: 3 }, result: { menu: { choiceIds: ['walk/W1', 'walk/W2'] } } };
const accepted = (id, index, choiceId, menu) => ({ id, tool: 'append_whole_trace_decision', args: { decision: decision(choiceId) },
  result: { accepted: true, decisionIndex: index, menu: { choiceIds: menu } } });
const rejected = (id, index, choiceId) => ({ id, tool: 'append_whole_trace_decision', args: { decision: decision(choiceId) },
  result: { accepted: false, decisionIndex: index, issues: [{ rule: 'AUTHORING_CHOICE_NOT_AVAILABLE' }] } });

test('a rewrite that keeps the choice is clean; console records with shell-quoted exit capture count as saved', t => {
  const { run } = slotFixture(t, [begin, accepted('d-1', 0, 'walk/W1', ['walk/W3', 'open/fresh']),
    rejected('d-2', 1, 'open/fresh'), accepted('d-2-r1', 1, 'open/fresh', ['walk/W4'])]);
  const s = audit(run).slots['s-01'];
  assert.deepEqual(s.procedureViolations, []);
  assert.equal(s.rewriteChecks[0].choicePreserved, true);
  assert.deepEqual(s.recordGaps, []);
  assert.equal(s.ledgerVsSelfReport.match, true);
});

test('a rewrite that changes the chosen action is a violation, with the preceding-menu context', t => {
  const { run } = slotFixture(t, [begin, accepted('d-1', 0, 'walk/W1', ['walk/W3']),
    rejected('d-2', 1, 'open/checkout'), accepted('d-2-r1', 1, 'walk/W3', ['walk/W4'])]);
  const [violation] = audit(run).slots['s-01'].procedureViolations;
  assert.deepEqual(violation, { type: 'rewrite-changed-chosen-action', decisionNumber: 2, from: 'open/checkout', to: ['walk/W3'], originalChoiceInPrecedingMenu: false });
});

test('missing console records, overwritten inputs, mixed language and access/automation signals are reported', t => {
  const { run } = slotFixture(t, [{ ...begin, saveConsole: false }, accepted('d-1', 0, 'walk/W1', ['walk/W2']),
    { ...accepted('d-2', 1, 'walk/W2', []), args: { decision: decision('walk/W2', '북쪽 passage를 따라 探して 걷는다') } }], [
    `/bin/zsh -lc "cat > ops/d-9.json <<'EOF'\n{}\nEOF"`, `/bin/zsh -lc "cat > ops/d-9.json <<'EOF'\n{}\nEOF"`,
    '/bin/zsh -lc "cat owner/prepare-response.json"',
    `/bin/zsh -lc "for i in 1 2 3; do node ${MAILBOX} call owner --operation-file ops/x-$i.json; done"`]);
  const s = audit(run).slots['s-01'];
  assert.deepEqual(s.recordGaps.map(g => [g.operationId, g.type, g.missing]), [['b-1', 'delivered-operation', ['stdout', 'stderr', 'exit']],
    [null, 'undelivered-local-attempt', ['input', 'stdout', 'stderr', 'exit']]], 'the loop call never reached the owner');
  assert.deepEqual(s.overwrittenInputs.map(o => o.file), ['ops/d-9.json']);
  assert.deepEqual(s.languageIssues.map(i => [i.decisionNumber, i.kinds]), [[2, ['han', 'kana', 'latin']]]);
  assert.ok(s.accessFlags.some(f => f.hits.includes('prepare-response')));
  assert.ok(s.automationFlags.some(f => f.loopSyntax));
  assert.equal(s.ledgerVsSelfReport.match, false, "the fixture self-report claims 1 rejection but the ledger has none");
});

test('v4 permits an unavailable reference correction but still flags changes of available choices and quantities', t => {
  const { run, slot } = slotFixture(t, [begin, rejected('d-1', 0, 'open/missing'),
    accepted('d-1-r1', 0, 'walk/W1', ['walk/W2', 'walk/W3']),
    rejected('d-2', 1, 'walk/W2'), accepted('d-2-r1', 1, 'walk/W3', [])]);
  fs.writeFileSync(path.join(slot, 'projection.json'), JSON.stringify({ actorInstructions: { templateId: 'authoring-v4-h200' } }));
  const s = audit(run).slots['s-01'];
  assert.equal(s.rewriteChecks[0].choiceUnavailableRewrite, true);
  assert.equal(s.procedureViolations.length, 1);
  assert.equal(s.procedureViolations[0].decisionNumber, 2);
});


test('file write audit separates actor edits, shell targets, mailbox transport and unaccounted files', t => {
  const { run, slot } = slotFixture(t, [], [
    `node ${MAILBOX} call owner --tool append_whole_trace_decision --json '{"decision":{"reason":"a > b"}}'`,
    'cat > actor-completion.json << EOF\n{}\nEOF',
    'echo bad > /tmp/actor-file.json',
    'node -e "require(\'fs\').writeFileSync(\'local.json\', \'{}\')"',
  ]);
  fs.appendFileSync(path.join(slot, 'actor-events.jsonl'), JSON.stringify({ type:'item.completed', item: {
    id:'patch', type:'file_change', changes:[{path:path.join(slot, 'edit.json'),kind:'add'}] } })+'\n');
  fs.writeFileSync(path.join(slot, 'actor-file-baseline.json'), JSON.stringify({files:['actor-events.jsonl','actor-completion.json','actor-file-baseline.json'],launcherOutputs:[]}));
  fs.writeFileSync(path.join(slot, 'unexpected.txt'), 'preserved');
  const writes = audit(run).slots['s-01'].actorFileWrites;
  assert.equal(writes.writes.length, 4);
  assert.equal(writes.writes.filter(w => !w.insideSlot).length, 1);
  assert.ok(writes.writes.every(w => !w.mailboxMediated));
  assert.deepEqual(writes.unaccountedFiles, ['unexpected.txt']);
});
