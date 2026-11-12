'use strict';
const path = require('node:path');
const crypto = require('node:crypto');

// Used once against the pre-change checkout to capture the golden, and by the
// regression test against the current checkout. No actor or saved output is used.
async function capture(root = path.resolve(__dirname, '../..'), movementFeedbackVersion) {
  require(path.join(root, 'runtime.cjs'));
  const { createMarketSession } = require(path.join(root, '../frontend/src/game/marketSession.ts'));
  const { createMarketReplaySnapshot } = require(path.join(root, '../frontend/src/game/marketReplayTrace.ts'));
  const { buildWholeTraceBundle } = require(path.join(root, 'src/wholeTraceBundle.ts'));
  const { createWholeTraceExecutionAuthoringCursor } = require(path.join(root, 'src/wholeTraceExecutionAuthoring.ts'));
  const { compileWholeTraceCandidate } = require(path.join(root, 'src/wholeTraceCompiler.ts'));
  const settings = { snapshot: createMarketReplaySnapshot(createMarketSession({ seed: 'anchor-feedback-off-golden',
    environment: { cashierCount: 2 } })), personaId: 'mild-intellectual-disability-adult',
    seed: 'anchor-feedback-off-golden', timingProfile: 'original', maxActions: 100, maxRepairs: 0,
    ...(movementFeedbackVersion ? { movementFeedbackVersion } : {}) };
  const bundle = buildWholeTraceBundle(settings, 'anchor-feedback-off-request');
  const cursor = await createWholeTraceExecutionAuthoringCursor(settings, bundle), menus = [await cursor.menu()];
  for (let index = 0; index < 8; index++) {
    const choiceId = index === 7 ? 'control/giveUp' : index === 6 ? 'control/pause'
      : menus.at(-1).choiceIds.filter(id => id.startsWith('walk/'))[index % 2];
    const ending = choiceId === 'control/giveUp';
    const result = await cursor.append({ choiceRef: { choiceId }, delayMs: 731,
      reason: '현재 보이는 선택을 수행한다', basis: { intent: ending ? 'finish' : 'explore', goalId: null, memoryUses: [] },
      actorState: { activity: ending ? 'finish' : 'orient', task: '현재 화면을 살핀다', heldGoalIds: [],
        uncertainGoalIds: [], focusedGoalId: null, focusedProductId: null, orientation: 'unfamiliar' } });
    if (!result.accepted) throw new Error(JSON.stringify(result));
    menus.push(result.menu);
  }
  // UUID is nondeterministic transport metadata, fixed before generating either side.
  const randomUUID = crypto.randomUUID;
  let compiled;
  try {
    crypto.randomUUID = () => '10000000-0000-4000-8000-000000000001';
    compiled = await compileWholeTraceCandidate(settings, bundle, cursor.finish());
  } finally { crypto.randomUUID = randomUUID; }
  const comparable = structuredClone(bundle);
  // User-approved exception: paths/order remain part of the golden; actual file
  // hashes legitimately change when these sources are edited.
  comparable.sourceFiles.forEach(source => { source.sha256 = '<actual-source-sha256>'; });
  const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
  return { bundle: hash(comparable), inputHash: bundle.inputHash, menus: hash(menus), trace: hash(compiled.trace),
    knowledgeAudit: hash(compiled.knowledgeAudit), candidate: hash(cursor.finish()) };
}
module.exports = { capture };
if (require.main === module) capture(process.argv[2], process.argv[3]).then(result => process.stdout.write(JSON.stringify(result, null, 2) + '\n'))
  .catch(error => { process.stderr.write(String(error.stack) + '\n'); process.exitCode = 1; });
