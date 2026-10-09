#!/usr/bin/env node
// Local direct-assistant context builder. No model calls, game actions or synthetic game logs.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
require('../runtime.cjs');
const { researchLearnerProfile, getResearchLearnerProfile, researchEncodingContext, researchRetrievalContext,
  researchLearnerContext, researchPracticeAudit } = require('../src/researchLearnerContext.ts');
const workspace = path.resolve(__dirname, '../..');
const [command, ...args] = process.argv.slice(2);
const flags = {};
for (let i = 0; i < args.length; i += 2) {
  if (!args[i]?.startsWith('--') || args[i + 1] === undefined || flags[args[i].slice(2)] !== undefined)
    throw new Error('Use named flags, each with one value');
  flags[args[i].slice(2)] = args[i + 1];
}
function requireFlags(names, optional = []) {
  if (Object.keys(flags).some(k => ![...names, ...optional].includes(k)) || names.some(k => !flags[k]))
    throw new Error(`Required flags: ${names.map(k => '--' + k).join(' ')}`);
}
const read = name => JSON.parse(fs.readFileSync(path.resolve(flags[name]), 'utf8'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function receipts(values) {
  // Existence/hash binding cannot prove that the learner saw or understood the content.
  for (const v of values) {
    if (typeof v.observationRef !== 'string' || !/\.(txt|json|png|jpg|jpeg|webp)$/i.test(v.observationRef))
      throw new Error('UI receipt must be a saved text, JSON or image file');
    const file = path.resolve(workspace, v.observationRef);
    if (hash(file) !== v.observationSha256) throw new Error('UI_RECEIPT_CHANGED: ' + v.observationRef);
  }
}
function write(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
}
if (command === 'init') {
  requireFlags(['run-id', 'out'], ['persona-id']);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(flags['run-id'])) throw new Error('Invalid run ID');
  const out = path.resolve(flags.out);
  // Refuse to reset an existing learner or resume an old-condition trial silently.
  fs.mkdirSync(out, { mode: 0o700 });
  const selected = getResearchLearnerProfile(flags['persona-id'] || researchLearnerProfile.id);
  const identity = { personaId: selected.id, runId: flags['run-id'] };
  write(path.join(out, 'archive.json'), { version: 'research-observed-v2', ...identity, episodes: [] });
  write(path.join(out, 'memory.json'), { version: 'research-memory-v2', ...identity,
    revisionId: 'initial-empty', writtenAt: new Date().toISOString(), associations: [] });
  write(path.join(out, 'condition.json'), { version: 'research-learning-v2', ...identity,
    initializedAt: new Date().toISOString(), actor: 'direct-codex-assistant', teacher: 'existing-analysis-ai',
    previousConditionImported: false, clinicalCalibration: false,
    files: Object.fromEntries(['personas/research-learning-minjae-v2.json', 'src/researchLearnerContext.ts',
      'personas/research-learning-seoyeon-v2.json', 'personas/research-learning-minsu-v2.json',
      'scripts/prepare-research-learner.cjs', '../market-persona-skill/assistant-learning-protocol.md',
      '../docs/ai/research/intellectual-disability/learning-model-sources-2026-10-01.json']
      .map(p => [p, hash(path.resolve(__dirname, '..', p))])) });
  process.stdout.write('Fresh research-learning-v2 condition initialized. No plays or learning outcomes created.\n');
} else {
  const expected = { encode: ['archive', 'memory', 'episodes', 'out'],
    retrieve: ['archive', 'memory', 'current', 'out'], decision: ['archive', 'memory', 'current', 'recall', 'out'],
    audit: ['archive', 'practice', 'out'] }[command];
  if (!expected) throw new Error('Commands: init, encode, retrieve, decision, audit');
  requireFlags(expected);
  const archive = read('archive');
  // Do not validate old v1 artifacts by silently converting them to the new condition.
  if (archive.version !== 'research-observed-v2' || !Array.isArray(archive.episodes)) throw new Error('NEW_V2_ARCHIVE_REQUIRED');
  let context;
  if (command === 'audit') context = researchPracticeAudit(archive, read('practice'));
  else {
    const memory = read('memory');
    if (command === 'encode') context = researchEncodingContext(archive, memory, flags.episodes.split(','));
    else {
      const current = read('current');
      context = command === 'retrieve' ? researchRetrievalContext(archive, memory, current)
        : researchLearnerContext({ archive, memory, current, recall: read('recall') });
      receipts([current]);
    }
  }
  receipts(archive.episodes);
  write(path.resolve(flags.out), context);
  process.stdout.write(`${context.version} saved. Receipt hashes verified; UI content/provenance still requires review.\n`);
}
