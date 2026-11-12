'use strict';
// Where a trait-omitted baseline sits between configured levels. Descriptive only: no expected direction or verdict.
const { cliffsDelta, bootstrap } = require('./personaValidationStatistics.cjs');
const FLAGS = Object.freeze({ descriptiveOnly: true, usedForPrimaryDecision: false });
const INTERPRETATION = '기준 프로필은 성향 문장만 뺀 같은 맥락이다. 모델의 기본 경향을 보여줄 뿐 실제 사람의 평균이나 정상 범위가 아니다.';
const DISABILITY_NOTE = '기본 인물이 지적장애 성인 설정이어도 기준 프로필 결과는 합성 모델의 기본 경향이며, 지적장애 특성이나 실제 지적장애인의 행동 근거로 쓰지 않는다.';
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const approx = row => !row?.interval || row.interval[0] <= 0 && row.interval[1] >= 0;

/** A profile's metrics against a baseline: its configured non-medium axes and every axis of a matched contrast it belongs to. */
function relevantMetrics(profile, metrics, contrasts) {
  const contrasted = new Set(contrasts.filter(c => [c.higherProfileId, c.lowerProfileId].includes(profile.id)).map(c => c.traitKey));
  return metrics.filter(metric => profile.traits?.[metric.traitKey] !== 'medium' || contrasted.has(metric.traitKey));
}

function compare({ runId, byKey, seeds, pair, metric, condition, count }) {
  const pairs = []; let missingPairs = 0, unexercised = 0;
  for (const seed of seeds) {
    const profile = byKey.get(`${condition}:${String(seed)}:${pair.profileId}`), baseline = byKey.get(`${condition}:${String(seed)}:${pair.baselineProfileId}`);
    if (!profile || !baseline) { missingPairs++; continue; }
    const a = profile.metrics?.[metric.kind], b = baseline.metrics?.[metric.kind];
    if (a?.status !== 'measured' || b?.status !== 'measured') { unexercised++; continue; }
    pairs.push([a.value, b.value]);
  }
  const seed = `${runId}:${pair.id}:${metric.id}:${condition}:baseline`;
  return { baselineProfileId: pair.baselineProfileId, profileId: pair.profileId, traitKey: metric.traitKey, level: pair.traits[metric.traitKey],
    metricId: metric.id, kind: metric.kind, condition, ...FLAGS, status: pairs.length ? 'measured' : 'unexercised',
    estimator: 'two-sample-cliffs-delta', intervalMethod: 'matched-pair-bootstrap', seed, bootstrapReplicates: count,
    pairs: pairs.length, unexercised, missingPairs, delta: cliffsDelta(pairs.map(p => p[0]), pairs.map(p => p[1])),
    interval: bootstrap(pairs, seed, count), profileMean: mean(pairs.map(p => p[0])), baselineMean: mean(pairs.map(p => p[1])) };
}

/** Rules are the text of spec.baselineComparison.positionRule; "≈" means the 95% interval includes 0. */
function classify(lower, higher, minValidPairs) {
  if (!lower.interval || !higher.interval || lower.pairs < minValidPairs || higher.pairs < minValidPairs)
    return { position: 'indistinguishable', reason: 'insufficient-pairs-or-interval' };
  const lowerApprox = approx(lower), higherApprox = approx(higher);
  if (lowerApprox && higherApprox) return { position: 'indistinguishable', reason: 'both-intervals-include-zero' };
  if (lowerApprox) return { position: 'high-only-shift', reason: 'baseline-approximates-lower' };
  if (higherApprox) return { position: 'low-only-shift', reason: 'baseline-approximates-higher' };
  return lower.delta < 0 && higher.delta > 0 ? { position: 'both-shift', reason: 'baseline-between' }
    : { position: 'baseline-beyond-range', reason: 'both-shifts-same-sign' };
}

function analyzeBaseline({ manifest, samples, spec, contrasts = [], baselineContrasts = [], conditions = ['low', 'high'] }) {
  if (!baselineContrasts.length) return { ...FLAGS, comparisons: [], positions: [], reason: 'no-baseline-profile', interpretation: INTERPRETATION, disabilityNote: DISABILITY_NOTE };
  const byKey = new Map(samples.map(s => [`${s.condition}:${String(s.seed)}:${s.personaId}`, s]));
  const count = spec.bootstrapReplicates, profiles = manifest.profiles;
  const comparisons = baselineContrasts.flatMap(pair => relevantMetrics(profiles[pair.profileId], spec.metrics, contrasts)
    .flatMap(metric => conditions.filter(condition => metric.applies === 'both' || metric.applies === condition)
      .map(condition => compare({ runId: manifest.runId, byKey, seeds: manifest.seeds, pair, metric, condition, count }))));
  const rowOf = (baselineProfileId, profileId, metric, condition) => comparisons.find(row => row.baselineProfileId === baselineProfileId
    && row.profileId === profileId && row.metricId === metric.id && row.condition === condition);
  const traceMean = (profileId, kind, condition) => mean(samples.filter(s => s.personaId === profileId && s.condition === condition)
    .map(s => s.metrics?.[kind]).filter(m => m?.status === 'measured').map(m => m.value));
  const baselineIds = [...new Set(baselineContrasts.map(pair => pair.baselineProfileId))];
  const positions = baselineIds.flatMap(baselineProfileId => contrasts
    .filter(c => [c.higherProfileId, c.lowerProfileId].every(id => baselineContrasts.some(p => p.baselineProfileId === baselineProfileId && p.profileId === id)))
    .flatMap(contrast => spec.metrics.filter(metric => metric.traitKey === contrast.traitKey).flatMap(metric => conditions
      .filter(condition => metric.applies === 'both' || metric.applies === condition).map(condition => {
        const lower = rowOf(baselineProfileId, contrast.lowerProfileId, metric, condition), higher = rowOf(baselineProfileId, contrast.higherProfileId, metric, condition);
        return { baselineProfileId, contrastId: contrast.id, traitKey: contrast.traitKey, lowerProfileId: contrast.lowerProfileId,
          higherProfileId: contrast.higherProfileId, lowerLevel: contrast.lowerLevel, higherLevel: contrast.higherLevel,
          metricId: metric.id, kind: metric.kind, condition, ...FLAGS,
          lowerMean: traceMean(contrast.lowerProfileId, metric.kind, condition), baselineMean: traceMean(baselineProfileId, metric.kind, condition),
          higherMean: traceMean(contrast.higherProfileId, metric.kind, condition),
          lowerDelta: lower.delta, lowerInterval: lower.interval, lowerPairs: lower.pairs,
          higherDelta: higher.delta, higherInterval: higher.interval, higherPairs: higher.pairs,
          ...classify(lower, higher, spec.minValidPairs) };
      }))));
  return { ...FLAGS, rule: spec.baselineComparison?.positionRule ?? null, approximateRule: spec.baselineComparison?.approximateRule ?? null,
    minValidPairs: spec.minValidPairs, comparisons, positions, interpretation: INTERPRETATION, disabilityNote: DISABILITY_NOTE };
}

const number = value => Number.isFinite(value) ? String(Math.round(value * 10000) / 10000) : '—';
const interval = value => value?.map(number).join(' ~ ') ?? '—';
function baselineMarkdown(output) {
  const result = output.baselineComparison;
  if (!result) return [];
  const head = ['', '## 기준 프로필 대비 (설명 지표)', '', result.interpretation, result.disabilityNote, '',
    'baselineComparison은 descriptiveOnly이며 주 판정·성향 판정·블라인드 점수에 사용하지 않는다. delta는 성향 프로필 대 같은 seed 기준 프로필의 Cliff’s delta다. 기대 방향이나 통과·실패를 정하지 않는다.'];
  if (result.reason) return [...head, '', `기준 프로필 없음: ${result.reason}.`];
  const paired = new Set(result.positions.flatMap(row => [row.lowerProfileId, row.higherProfileId].map(id => `${row.baselineProfileId}:${id}:${row.metricId}:${row.condition}`)));
  const single = result.comparisons.filter(row => !paired.has(`${row.baselineProfileId}:${row.profileId}:${row.metricId}:${row.condition}`));
  return [...head, '', `위치 분류: ≈는 delta의 95% 구간이 0을 포함한다는 뜻이다. 유효 쌍이 ${result.minValidPairs} 미만이면 indistinguishable이다.`, '',
    '| 기준 | 성향 | 지표 | 조건 | 낮음 평균 | 기준 평균 | 높음 평균 | 낮음 대 기준 delta | 높음 대 기준 delta | 위치 분류 | 유효 쌍 (낮음/높음) |',
    '| --- | --- | --- | --- | ---: | ---: | ---: | --- | --- | --- | --- |',
    ...result.positions.map(row => `| ${row.baselineProfileId} | ${row.traitKey} (${row.lowerLevel}/${row.higherLevel}) | ${row.kind} | ${row.condition} | ${number(row.lowerMean)} | ${number(row.baselineMean)} | ${number(row.higherMean)} | ${number(row.lowerDelta)} [${interval(row.lowerInterval)}] | ${number(row.higherDelta)} [${interval(row.higherInterval)}] | ${row.position} | ${row.lowerPairs}/${row.higherPairs} |`),
    ...(single.length ? ['', '낮음·높음 짝이 없는 성향은 위치 분류 없이 delta만 보고한다.', '',
      '| 기준 | 프로필 | 성향 수준 | 지표 | 조건 | 유효 쌍 | 미발생 | 누락 | delta | 95% 구간 |', '| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- |',
      ...single.map(row => `| ${row.baselineProfileId} | ${row.profileId} | ${row.traitKey}=${row.level} | ${row.kind} | ${row.condition} | ${row.pairs} | ${row.unexercised} | ${row.missingPairs} | ${number(row.delta)} | ${interval(row.interval)} |`)] : [])];
}
module.exports = { analyzeBaseline, baselineMarkdown, classify, relevantMetrics, INTERPRETATION, DISABILITY_NOTE };
