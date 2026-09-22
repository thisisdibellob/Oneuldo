#!/usr/bin/env node
// Offline, reproducible sampling of one persona; raw artifacts stay in ignored output/.
'use strict';
require('../runtime.cjs').register();
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { generateEpisode, listPersonas } = require('../src/simulator.ts');
const { validateGeneratedEpisode } = require('../src/schemaValidation.ts');
const { createMarketAgentAdapter } = require('../../frontend/src/game/marketSession.ts');
const PERSONA_ID = 'mild-intellectual-disability-adult';
// Existing game objectives only; increase simultaneous conditions without forcing mistakes.
const OBJECTIVES = [
  { productId: 'milk', quantity: 1 }, { productId: 'apple', quantity: 2 },
  { productId: 'curry', quantity: 2 }, { productId: 'eggs', quantity: 2 },
  { productId: 'juice', quantity: 2 },
];
const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const round = (value) => Math.round(value * 100) / 100;
const quantile = (values, probability) => values.length ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * probability))] : 0;
const withoutTime = (action) => { const { at, ...rest } = action; return rest; };
function readOptions(argv) {
  const options = { output: path.resolve(__dirname, '../output/persona-v2-validation'), count: 36,
    seed: 'persona-v2-sample', environmentSeed: 'persona-v2-fixed-store', difficulty: 'exact' };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index], value = argv[index + 1];
    if (!value || !['--output', '--count', '--seed', '--environment-seed'].includes(flag)) throw new Error('사용법: node scripts/verify-persona.cjs [--output 경로] [--count 36] [--seed 값] [--environment-seed 값]');
    if (flag === '--output') options.output = path.resolve(value);
    if (flag === '--count') options.count = Number(value);
    if (flag === '--seed') options.seed = value;
    if (flag === '--environment-seed') options.environmentSeed = value;
  }
  if (!Number.isInteger(options.count) || options.count < 24 || options.count > 1000) throw new Error('--count는 24~1000 사이 정수여야 합니다.');
  return options;
}
function repetitionCandidates(trace) {
  const decisions = trace.map((entry, index) => ({ ...entry, index })).filter((entry) => entry.action.type !== 'move');
  const candidates = [];
  for (let index = 1; index < decisions.length; index++) {
    const current = decisions[index], previous = decisions[index - 1];
    const same = (a, b) => a.observationHash === b.observationHash && hash(withoutTime(a.action)) === hash(withoutTime(b.action));
    if (same(current, previous)) candidates.push({ traceIndex: current.index, kind: 'same-action-and-visible-state', action: current.action.type, reason: current.reason, previousReason: previous.reason });
    // A repeated check/close pair with identical observations and no intervening
    // purchase, feedback or movement is a candidate for manual inspection.
    if (index >= 3 && same(current, decisions[index - 2]) && same(previous, decisions[index - 3])
      && current.index === decisions[index - 3].index + 3
      && [current.action.type, previous.action.type].every((type) => ['viewCart', 'viewHelp', 'closeView'].includes(type))) {
      candidates.push({ traceIndex: current.index, kind: 'unchanged-check-close-cycle', action: current.action.type, reason: current.reason });
    }
  }
  return candidates;
}
function observedContext(result) {
  const adapter = createMarketAgentAdapter(result.episode.config);
  return result.trace.map((entry, index) => {
    const before = adapter.observe();
    adapter.act(entry.action);
    const after = adapter.observe();
    return { index, ...entry, observation: { phase: before.phase, view: before.view, activeStation: before.activeStation,
      playerPosition: before.playerPosition, objectives: before.objectives, cart: before.cart,
      products: before.products, stock: before.stock, feedback: before.feedback, attempts: before.attempts,
      lastActionError: before.lastActionError }, result: { playerPosition: after.playerPosition, phase: after.phase,
      activeStation: after.activeStation, cart: after.cart, products: after.products, stock: after.stock, feedback: after.feedback, lastActionError: after.lastActionError } };
  });
}
function measure(result, validation, index) {
  const nonMovement = result.trace.filter((entry) => entry.action.type !== 'move');
  const submissions = result.episode.events.filter((event) => event.type === 'purchase_submitted');
  const failed = submissions.filter((event) => event.payload.evaluation.success === false);
  const corrections = result.episode.events.filter((event) => event.type === 'cart_changed' && event.payload.operation === 'remove');
  const firstFailedAt = failed[0] ? Date.parse(failed[0].timestamp) : Infinity;
  const feedbackCorrections = corrections.filter((event) => Date.parse(event.timestamp) > firstFailedAt);
  const candidates = repetitionCandidates(result.trace);
  return { index, seed: result.summary.seed, policyVersion: result.run.policyVersion, valid: validation.valid, validationErrors: validation.errors,
    outcome: result.episode.outcome, termination: result.summary.termination,
    actionCount: result.summary.actionCount, moveCount: result.summary.moveCount,
    completeActionFingerprint: hash(result.trace.map((entry) => withoutTime(entry.action))),
    nonMovementFingerprint: hash(nonMovement.map((entry) => withoutTime(entry.action))),
    nonMovementActionCount: nonMovement.length, rejectedActions: result.summary.rejectedActions,
    teleportActions: result.trace.filter((entry) => entry.action.type === 'setPosition').length,
    oversizedMoves: result.trace.filter((entry) => entry.action.type === 'move' && Math.hypot(entry.action.dx, entry.action.dy) > 32 + 1e-8).length,
    maxMoveDistance: result.summary.maxMoveDistance,
    missingActionReasons: result.trace.filter((entry) => typeof entry.reason !== 'string' || !entry.reason.trim()).length,
    wrongSelections: result.summary.wrongSelections, selections: result.summary.selections,
    corrections: corrections.length, feedbackCorrections: feedbackCorrections.length,
    failedSubmissions: failed.length, submissions: submissions.length, retries: result.summary.retries,
    helpRequests: result.summary.helpRequests, cartChecks: result.summary.cartChecks,
    decisionMedianMs: result.summary.decisionP50Ms, decisionP90Ms: result.summary.decisionP90Ms,
    unchangedRepetitionCandidates: candidates, reasonCounts: Object.fromEntries([...new Set(nonMovement.map((entry) => entry.reason))]
      .map((reason) => [reason, nonMovement.filter((entry) => entry.reason === reason).length])) };
}
function aggregate(rows, reactionTimes) {
  const sum = (key) => rows.reduce((total, row) => total + row[key], 0);
  return { episodes: rows.length, policyVersions: [...new Set(rows.map((row) => row.policyVersion))], validEpisodes: rows.filter((row) => row.valid).length,
    successes: rows.filter((row) => row.outcome === 'success').length,
    gaveUp: rows.filter((row) => row.outcome === 'gave-up').length,
    uniqueFullActionSequences: new Set(rows.map((row) => row.completeActionFingerprint)).size,
    uniqueNonMovementActionSequences: new Set(rows.map((row) => row.nonMovementFingerprint)).size,
    actions: sum('actionCount'), moves: sum('moveCount'), rejectedActions: sum('rejectedActions'),
    teleportActions: sum('teleportActions'), oversizedMoves: sum('oversizedMoves'),
    maxMoveDistance: Math.max(...rows.map((row) => row.maxMoveDistance)), missingActionReasons: sum('missingActionReasons'),
    selections: sum('selections'), wrongSelections: sum('wrongSelections'),
    wrongSelectionRate: sum('wrongSelections') / Math.max(1, sum('selections')),
    correctionActions: sum('corrections'), feedbackCorrectionActions: sum('feedbackCorrections'),
    episodesWithCorrection: rows.filter((row) => row.corrections > 0).length,
    successAfterWrongSelection: rows.filter((row) => row.wrongSelections > 0 && row.outcome === 'success').length,
    successAfterCorrection: rows.filter((row) => row.corrections > 0 && row.outcome === 'success').length,
    failedSubmissions: sum('failedSubmissions'), retries: sum('retries'),
    helpRequests: sum('helpRequests'), episodesWithHelp: rows.filter((row) => row.helpRequests > 0).length,
    cartChecks: sum('cartChecks'), meanCartChecks: sum('cartChecks') / rows.length,
    decisionMedianMs: quantile(reactionTimes, .5), decisionP90Ms: quantile(reactionTimes, .9),
    unchangedRepetitionCandidates: rows.reduce((total, row) => total + row.unchangedRepetitionCandidates.length, 0),
    reasonlessRepetitionCandidates: rows.reduce((total, row) => total + row.unchangedRepetitionCandidates.filter((item) => !item.reason?.trim()).length, 0) };
}
function representativeExamples(trace) {
  const selected = [];
  const add = (predicate) => { const entry = trace.find((item) => predicate(item) && !selected.includes(item)); if (entry) selected.push(entry); };
  add((entry) => entry.action.type === 'add' && /similar-visible|recall-slip|quantity-slip|confus/.test(entry.reason));
  add((entry) => entry.action.type === 'retry');
  add((entry) => entry.action.type === 'viewCart' && entry.observation.attempts > 0);
  add((entry) => ['remove', 'requestReturn'].includes(entry.action.type));
  add((entry) => entry.action.type === 'submit' && entry.result.feedback?.success === true);
  add((entry) => ['requestCashier', 'viewHelp'].includes(entry.action.type));
  add((entry) => entry.action.type === 'viewCart' && Object.keys(entry.result.cart ?? {}).length > 0);
  add((entry) => entry.action.type === 'add');
  return selected.slice(0, 5).sort((a, b) => a.index - b.index).map((entry) => {
    const before = entry.observation;
    const product = before.products.find((item) => item.id === entry.action.productId);
    const evidence = [`상태 ${before.phase}, 구역 ${before.activeStation ?? '이동 중'}`];
    if (product) {
      evidence.push(`눈앞 상품 ${product.name}, 재고 ${before.stock[product.id]}`);
      if (entry.action.type === 'add') {
        const token = product.name.split(' ').at(-1);
        const similar = before.products.filter((item) => item.name.includes(token)).map((item) => item.name).slice(0, 4);
        if (similar.length > 1) evidence.push(`진열 비교 후보 ${similar.join(', ')}`);
      }
    }
    if (entry.action.type === 'viewCart') evidence.push(`확인 결과 ${JSON.stringify(entry.result.cart)}`);
    if (before.feedback) evidence.push(`공개 피드백 ${JSON.stringify(before.feedback)}`);
    if (entry.action.type === 'submit') evidence.push(`제출 후 공개 피드백 ${JSON.stringify(entry.result.feedback)}`);
    if (!before.feedback && entry.action.type !== 'viewCart') evidence.push(`공개 목록 ${before.objectives.map((item) => `${item.label} ${item.quantity}`).join(', ')}`);
    return { traceIndex: entry.index, action: withoutTime(entry.action), reason: entry.reason, evidence: evidence.join('; ') };
  });
}
function markdown(report) {
  const m = report.metrics;
  const cell = (text) => String(text).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const observedExamples = report.representative.examples.map((entry) => `| ${entry.traceIndex} | ${cell(JSON.stringify(entry.action))} | ${cell(entry.reason)} | ${cell(entry.evidence)} |`).join('\n');
  const checks = report.checks.map((check) => `- ${check.passed ? '통과' : '확인 필요'}: ${check.description}`).join('\n');
  const examples = report.episodes.slice(0, 6).map((row) => `| ${row.seed} | ${row.nonMovementFingerprint.slice(0, 12)} | ${row.outcome} | ${row.wrongSelections} | ${row.corrections} | ${row.helpRequests} | ${row.cartChecks} |`).join('\n');
  return `# 페르소나 v2 로컬 표본 검증\n\n` +
    `확률 정책으로 ${m.episodes}개 에피소드를 생성했다. 페르소나는 \`${PERSONA_ID}\` v${report.personaVersion}, 난이도는 \`exact\`다. 모든 실행은 동일한 매장 seed \`${report.environmentSeed}\`와 서로 다른 행동 seed를 사용했다. 기존 상품 5종(우유 1, 사과 2, 카레 2, 달걀 2, 주스 2)의 수량 조건을 사용했다. 브라우저·앱·모델 API·백엔드 전송은 사용하지 않았다.\n\n` +
    `| 관찰 지표 | 결과 |\n| --- | ---: |\n` +
    `| 타입·provenance·상태머신 재생 검증 통과 | ${m.validEpisodes}/${m.episodes} |\n` +
    `| 성공 / 포기 | ${m.successes} / ${m.gaveUp} |\n` +
    `| 이동·시각을 제외한 행동 시퀀스 종류 | ${m.uniqueNonMovementActionSequences} |\n` +
    `| 시각을 제외한 전체 행동 시퀀스 종류 | ${m.uniqueFullActionSequences} |\n` +
    `| 거절된 행동 / 순간이동 / 32px 초과 이동 | ${m.rejectedActions} / ${m.teleportActions} / ${m.oversizedMoves} |\n` +
    `| 최대 이동 거리 | ${round(m.maxMoveDistance)}px |\n` +
    `| 잘못된 상품·초과 수량 선택 / 담기 횟수 | ${m.wrongSelections} / ${m.selections} (${round(m.wrongSelectionRate * 100)}%) |\n` +
    `| 수정 동작 / 수정 후 성공 에피소드 | ${m.correctionActions} / ${m.successAfterCorrection} |\n` +
    `| 계산 실패 / 재시도 / 피드백 후 반납 수정 | ${m.failedSubmissions} / ${m.retries} / ${m.feedbackCorrectionActions} |\n` +
    `| 도움 요청 / 도움 사용 에피소드 | ${m.helpRequests} / ${m.episodesWithHelp} |\n` +
    `| 장바구니 재확인 / 에피소드 평균 | ${m.cartChecks} / ${round(m.meanCartChecks)} |\n` +
    `| 가상 판단시간 중앙값 / 90백분위 | ${m.decisionMedianMs}ms / ${m.decisionP90Ms}ms |\n` +
    `| 이유가 빈 행동 / 상태 불변 반복 후보 | ${m.missingActionReasons} / ${m.unchangedRepetitionCandidates} |\n\n` +
    `이동 반복 자체는 오류로 세지 않는다. 반복 후보는 설명 문구가 달라도 같은 행동·관찰의 연속 또는 새 행동·이동 없이 반복된 확인/닫기 순환이며, 원인 없는 반복으로 단정하지 않고 대표 기록을 확인한다. 상품 선택 오류는 실제 목표 밖 상품 또는 필요 수량을 넘긴 담기다. 수정은 실제 반납 이벤트로 집계하며 부족분 추가는 이 수치에 포함하지 않는다. 판단시간은 정책이 생성한 가상 시간이다.\n\n` +
    `## 확인 결과\n\n${checks}\n\n` +
    `## seed별 예시\n\n| 행동 seed | 이동·시각 제외 지문 | 결과 | 선택 오류 | 반납 수정 | 도움 | 재확인 |\n| --- | --- | --- | ---: | ---: | ---: | ---: |\n${examples}\n\n` +
    `## 대표 행동과 실제 공개 단서\n\n| trace 번호 | 행동 | 기록된 짧은 이유 | 실행에서 확인한 공개 정보 |\n| ---: | --- | --- | --- |\n${observedExamples}\n\n` +
    `대표 기록은 \`representative-trace.json\`에 저장했다(${report.representative.seed}). 이유는 짧은 행동 설명이며 관찰 전후의 공개 정보와 함께 기록했다. 전체 에피소드는 \`episodes.jsonl\`, 개별 서버 로그는 \`behavior-logs.jsonl\`, 수치는 \`report.json\`에서 확인한다.\n\n` +
    `## 해석 범위\n\n${report.limitations.map((text) => `- ${text}`).join('\n')}\n`;
}
async function main() {
  const options = readOptions(process.argv.slice(2));
  const profile = listPersonas().find((item) => item.id === PERSONA_ID);
  if (profile?.version !== '2') throw new Error('페르소나 v2 구현 후 실행하세요.');
  fs.mkdirSync(options.output, { recursive: true });
  const names = ['episodes.jsonl', 'behavior-logs.jsonl', 'report.json', 'report.md', 'representative-trace.json'];
  for (const name of names) if (fs.existsSync(path.join(options.output, name))) throw new Error(`${name}이 이미 있습니다. 새 --output 경로를 선택하세요.`);
  const episodeFile = fs.openSync(path.join(options.output, 'episodes.jsonl'), 'wx', 0o600);
  const logsFile = fs.openSync(path.join(options.output, 'behavior-logs.jsonl'), 'wx', 0o600);
  const rows = [], reactionTimes = [];
  let representative, representativeScore = -Infinity;
  try {
    for (let index = 0; index < options.count; index++) {
      const result = await generateEpisode({ personaId: PERSONA_ID, mode: 'stochastic', seed: `${options.seed}:${index}`,
        environmentSeed: options.environmentSeed, difficulty: options.difficulty, maxActions: 2500, config: { objectives: OBJECTIVES } });
      const validation = validateGeneratedEpisode(result);
      const row = measure(result, validation, index);
      rows.push(row);
      fs.writeSync(episodeFile, JSON.stringify(result) + '\n');
      for (const event of result.behaviorLogs) fs.writeSync(logsFile, JSON.stringify(event) + '\n');
      for (const entry of result.trace) if (entry.action.type !== 'move' && entry.source !== 'limit') reactionTimes.push(entry.delayMs);
      const score = Number(row.outcome === 'success') * 3 + Number(row.wrongSelections > 0) * 5 + Number(row.corrections > 0) * 5 + Number(row.helpRequests > 0) * 2 + Number(row.failedSubmissions > 0) * 2;
      if (score > representativeScore) { representative = result; representativeScore = score; }
    }
  } finally { fs.closeSync(episodeFile); fs.closeSync(logsFile); }
  const metrics = aggregate(rows, reactionTimes);
  const traceWithContext = observedContext(representative);
  const checks = [
    { description: '모든 표본이 정책 v2 사용', passed: metrics.policyVersions.length === 1 && metrics.policyVersions[0] === '2' },
    { description: '모든 표본의 프런트엔드 타입·합성 출처·상태머신 재생 일치', passed: metrics.validEpisodes === metrics.episodes },
    { description: '순간이동과 32px 초과 이동 없음', passed: metrics.teleportActions === 0 && metrics.oversizedMoves === 0 },
    { description: '실행 중 거절된 행동 없음', passed: metrics.rejectedActions === 0 },
    { description: '이동 좌표·시간을 제외해도 seed별 행동 차이 관찰', passed: metrics.uniqueNonMovementActionSequences > 1 },
    { description: '모든 행동에 짧은 이유 기록', passed: metrics.missingActionReasons === 0 },
    { description: '상태 불변 반복 후보 없음', passed: metrics.unchangedRepetitionCandidates === 0 },
  ];
  const report = { schema: 'oneuldo.market.persona-validation', version: 1, personaId: PERSONA_ID, personaVersion: profile.version,
    mode: 'stochastic', policySeedPrefix: options.seed, environmentSeed: options.environmentSeed, difficulty: options.difficulty, objectives: OBJECTIVES,
    character: profile.character, metrics, checks, episodes: rows,
    representative: { seed: representative.summary.seed, examples: representativeExamples(traceWithContext), selectionRule: '성공·선택 오류·수정·도움·계산 피드백이 함께 관찰된 표본을 우선 선택; 동률은 앞선 seed' },
    limitations: [
      '이 수치는 지정된 한 매장과 seed 집합에서 관찰한 합성 표본의 결과다. 다른 환경·seed에서 같은 성공률이나 오류 부재를 보장하지 않는다.',
      '사람이나 장애 집단에서 측정한 확률이 아니며, 특정 개인의 행동 예측·집단 대표성·임상적 충실성을 검증하지 않는다.',
      '현재 게임에는 자유 발화나 질문 방식 입력이 없으므로 성인 말투, 발화 특성, 동의 편향의 상황별 반응은 실행으로 검증할 수 없다. 원문 보존과 프롬프트 포함 여부를 별도 소스 테스트로 확인한다.',
      '실제 LLM endpoint는 호출하지 않았다. 이 보고서는 확률 정책의 행동 표본이며 LLM 응답의 자연스러움이나 원문 준수를 실증한 결과가 아니다.',
      '고정한 exact 과제는 비슷한 상품과 여러 수량 조건을 구분하는 표본이다. 추가 과제·지원 방식·당사자 피드백을 통한 검증은 별도로 필요하다.',
    ] };
  fs.writeFileSync(path.join(options.output, 'representative-trace.json'), JSON.stringify({ personaId: PERSONA_ID, personaVersion: profile.version,
    seed: representative.summary.seed, environmentSeed: options.environmentSeed, provenance: representative.episode.provenance,
    summary: representative.summary, trace: traceWithContext }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  fs.writeFileSync(path.join(options.output, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  fs.writeFileSync(path.join(options.output, 'report.md'), markdown(report), { flag: 'wx' });
  process.stdout.write(JSON.stringify({ outputPath: options.output, metrics, checks, representativeSeed: representative.summary.seed }, null, 2) + '\n');
  if (checks.some((check) => !check.passed)) process.exitCode = 1;
}
main().catch((error) => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
