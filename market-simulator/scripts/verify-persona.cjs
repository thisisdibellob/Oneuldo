#!/usr/bin/env node
// Persona intention sampling only: no browser, generated application logs, or backend writes.
'use strict';
require('../runtime.cjs');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { generateTrace, summarizeTrace, listPersonas } = require('../src/simulator.ts');
const { validateTrace } = require('../src/traceValidation.ts');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot, marketReplayFingerprint } = require('../../frontend/src/game/marketReplayTrace.ts');
const PERSONA_ID = 'mild-intellectual-disability-adult';
const OBJECTIVES = [{ productId: 'milk', quantity: 1 }, { productId: 'apple', quantity: 2 },
  { productId: 'curry', quantity: 2 }, { productId: 'eggs', quantity: 2 }, { productId: 'juice', quantity: 2 }];
function readOptions(argv) {
  const options = { output: path.resolve(__dirname, `../output/persona-traces-${Date.now()}`), count: 36,
    seed: 'persona-trace-sample', environmentSeed: 'persona-fixed-store' };
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i], value = argv[i + 1];
    if (!value || !['--output', '--count', '--seed', '--environment-seed'].includes(flag)) throw new Error('Usage: verify-persona.cjs [--output directory] [--count 36] [--seed value] [--environment-seed value]');
    if (flag === '--output') options.output = path.resolve(value);
    if (flag === '--count') options.count = Number(value);
    if (flag === '--seed') options.seed = value;
    if (flag === '--environment-seed') options.environmentSeed = value;
  }
  if (!Number.isInteger(options.count) || options.count < 3 || options.count > 1000) throw new Error('--count must be 3..1000.');
  return options;
}
async function main() {
  const options = readOptions(process.argv.slice(2));
  const profile = listPersonas().find(p => p.id === PERSONA_ID);
  const snapshot = createMarketReplaySnapshot(createMarketSession({ seed: options.environmentSeed, difficulty: 'exact', objectives: OBJECTIVES }));
  await fs.mkdir(options.output, { recursive: true });
  const file = await fs.open(path.join(options.output, 'traces.jsonl'), 'wx', 0o600);
  const rows = [], reactions = [], sequences = new Set();
  let representative;
  try {
    for (let i = 0; i < options.count; i++) {
      const trace = await generateTrace({ personaId: PERSONA_ID, seed: `${options.seed}:${i}`, snapshot });
      const result = validateTrace(trace, snapshot);
      assert.ok(result.valid, result.errors.join('; '));
      await file.write(JSON.stringify(trace) + '\n');
      const sequence = trace.steps.map(s => [s.type, s.target?.stationId ?? s.target?.anchorId, s.productId, s.quantity]);
      const signature = marketReplayFingerprint(sequence);
      sequences.add(signature);
      rows.push({ seed: trace.seed, traceId: trace.traceId, semanticSequence: signature, ...summarizeTrace(trace),
        corrections: trace.steps.filter(s => s.type === 'removeProduct' || s.type === 'talkToStaff' && s.choice === 'returnProduct').length });
      for (const s of trace.steps) if (s.reactionDelayMs) reactions.push(s.reactionDelayMs);
      if (!representative) representative = trace;
    }
  } finally { await file.close(); }
  reactions.sort((a, b) => a - b);
  const report = { schema: 'oneuldo.market.persona-trace-validation', version: 1, personaId: PERSONA_ID, personaVersion: profile.version,
    policyVersion: representative.policyVersion, snapshotId: snapshot.snapshotId, traces: rows.length, validTraces: rows.length,
    distinctSequencesIgnoringTimings: sequences.size, plannedReactionMedianMs: reactions[Math.floor(reactions.length * .5)],
    plannedReactionP90Ms: reactions[Math.floor(reactions.length * .9)], samples: rows,
    limitations: [
      '이 보고서는 계획된 의도와 대기 시간의 표본이다. 실제 앱에서 수행된 행동이나 서버 로그가 아니다.',
      '검토 요청 의도는 구매 성공 또는 AI 분석 성공을 뜻하지 않는다. AI 분석 결과·재시도 학습은 이 생성 단계에서 가정하지 않는다.',
      '자료에 근거한 허구의 한 개인 설정이며 장애 집단의 실측 확률·대표성·임상적 충실성을 검증하지 않는다.',
      '자유 발화·동의 편향·실제 LLM 행동 준수는 이 확률 정책 표본으로 검증하지 않는다. 원문 보존은 persona-sources.test.cjs에서 별도로 검증한다.',
    ] };
  assert.ok(sequences.size > 1, 'Different seeds must vary semantic choices, not only waiting time.');
  await fs.writeFile(path.join(options.output, 'snapshot.json'), JSON.stringify(snapshot, null, 2) + '\n', { flag: 'wx' });
  await fs.writeFile(path.join(options.output, 'representative-trace.json'), JSON.stringify(representative, null, 2) + '\n', { flag: 'wx' });
  await fs.writeFile(path.join(options.output, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  process.stdout.write(JSON.stringify({ outputPath: options.output, traces: rows.length, distinctSequencesIgnoringTimings: sequences.size,
    plannedReactionMedianMs: report.plannedReactionMedianMs, valid: true }) + '\n');
}
main().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
