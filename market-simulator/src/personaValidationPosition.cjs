'use strict';
// Within-trace early/late description from saved opportunityRows. Never feeds findings, verdicts or blind scores.
const { Random } = require('./random.ts');
const { cliffsDelta, bootstrap } = require('./personaValidationStatistics.cjs');
const { percentileInterval } = require('./personaValidationSupplementary.cjs');
const FLAGS = Object.freeze({ descriptiveOnly: true, usedForPrimaryDecision: false });
const INTERPRETATION = '뒷부분은 남은 목표·상황이 달라 과제 단계 효과가 섞인다. 대비 약화(attenuation)만으로 성향 감쇠를 확정하지 않는다.';
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
function median(values) {
  const sorted = [...values].sort((a, b) => a - b), middle = sorted.length >> 1;
  return !sorted.length ? null : sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
const countBy = rows => rows.reduce((counts, row) => ({ ...counts, [row.reason]: (counts[row.reason] ?? 0) + 1 }), {});

/** Opportunity order halves. An odd middle opportunity goes to oddMiddle; both halves are never empty. */
function splitOpportunities(rows, { minOpportunitiesPerTrace = 2, oddMiddle = 'early' } = {}) {
  if (!Array.isArray(rows)) return { status: 'missing-opportunity-rows', opportunities: null };
  if (rows.some(row => !Number.isInteger(row?.decisionIndex))) return { status: 'missing-decision-index', opportunities: rows.length };
  if (rows.length < Math.max(2, minOpportunitiesPerTrace)) return { status: 'insufficient-opportunities', opportunities: rows.length };
  const ordered = rows.map((row, order) => ({ row, order }))
    .sort((a, b) => a.row.decisionIndex - b.row.decisionIndex || a.order - b.order).map(item => item.row);
  const cut = oddMiddle === 'late' ? Math.floor(ordered.length / 2) : Math.ceil(ordered.length / 2);
  const half = part => ({ opportunities: part.length, hits: part.filter(row => row.hit).length,
    rate: part.filter(row => row.hit).length / part.length, decisionIndexes: part.map(row => row.decisionIndex) });
  const early = half(ordered.slice(0, cut)), late = half(ordered.slice(cut));
  return { status: 'split', opportunities: ordered.length, early, late, shift: late.rate - early.rate };
}

/** Trace-cluster percentile interval for a mean of per-trace shifts. */
function meanInterval(values, seed, count) {
  if (values.length < 2) return null;
  const random = new Random(seed), distribution = [];
  for (let b = 0; b < count; b++) distribution.push(mean(Array.from({ length: values.length }, () => values[Math.floor(random.next() * values.length)])));
  return percentileInterval(distribution);
}

/** Resample same-seed high/low pairs together; both halves use the same resample. */
function attenuationInterval(pairs, seed, count) {
  if (!pairs.length) return null;
  const random = new Random(seed), distribution = [];
  for (let b = 0; b < count; b++) {
    const sample = Array.from({ length: pairs.length }, () => pairs[Math.floor(random.next() * pairs.length)]);
    distribution.push(Math.abs(cliffsDelta(sample.map(p => p.early[0]), sample.map(p => p.early[1])))
      - Math.abs(cliffsDelta(sample.map(p => p.late[0]), sample.map(p => p.late[1]))));
  }
  return percentileInterval(distribution);
}

function profileShift({ runId, samples, profileIds, metrics, conditions, options, count }) {
  return profileIds.flatMap(profileId => conditions.flatMap(condition => metrics
    .filter(metric => metric.applies === 'both' || metric.applies === condition).map(metric => {
      const used = [], excluded = [];
      for (const sample of samples.filter(s => s.personaId === profileId && s.condition === condition)) {
        const split = splitOpportunities(sample.metrics?.[metric.kind]?.opportunityRows, options);
        if (split.status === 'split') used.push({ seed: String(sample.seed), shift: split.shift });
        else excluded.push({ seed: String(sample.seed), tracePath: sample.tracePath, reason: split.status, opportunities: split.opportunities });
      }
      const shifts = used.map(row => row.shift), seed = `${runId}:${profileId}:${metric.id}:${condition}:position-shift`;
      return { profileId, condition, metricId: metric.id, kind: metric.kind, traitKey: metric.traitKey, ...FLAGS,
        status: used.length ? 'measured' : 'unexercised', estimator: 'mean-late-minus-early-rate',
        intervalMethod: 'trace-bootstrap-percentile', seed, bootstrapReplicates: count,
        usedTraces: used.length, excludedTraces: excluded.length, exclusionReasons: countBy(excluded),
        mean: mean(shifts), median: median(shifts), interval: meanInterval(shifts, seed, count), traces: used, excluded };
    })));
}

function contrastAttenuation({ runId, samples, seeds, contrasts, metrics, conditions, options, count }) {
  const byKey = new Map(samples.map(s => [`${s.condition}:${String(s.seed)}:${s.personaId}`, s]));
  return contrasts.flatMap(contrast => metrics.filter(metric => metric.traitKey === contrast.traitKey).flatMap(metric => conditions
    .filter(condition => metric.applies === 'both' || metric.applies === condition).map(condition => {
      const pairs = [], excluded = [];
      for (const seed of seeds) {
        const high = byKey.get(`${condition}:${String(seed)}:${contrast.higherProfileId}`), low = byKey.get(`${condition}:${String(seed)}:${contrast.lowerProfileId}`);
        if (!high || !low) { excluded.push({ seed: String(seed), reason: 'missing-trace' }); continue; }
        const higher = splitOpportunities(high.metrics?.[metric.kind]?.opportunityRows, options);
        const lower = splitOpportunities(low.metrics?.[metric.kind]?.opportunityRows, options);
        if (higher.status !== 'split' || lower.status !== 'split') {
          excluded.push({ seed: String(seed), reason: higher.status !== 'split' && lower.status !== 'split' ? 'both-unsplittable'
            : higher.status !== 'split' ? 'higher-unsplittable' : 'lower-unsplittable', higher: higher.status, lower: lower.status });
          continue;
        }
        pairs.push({ seed: String(seed), early: [higher.early.rate, lower.early.rate], late: [higher.late.rate, lower.late.rate] });
      }
      const seed = `${runId}:${contrast.id}:${metric.id}:${condition}:position`;
      const deltaEarly = cliffsDelta(pairs.map(p => p.early[0]), pairs.map(p => p.early[1]));
      const deltaLate = cliffsDelta(pairs.map(p => p.late[0]), pairs.map(p => p.late[1]));
      return { ...contrast, metricId: metric.id, kind: metric.kind, condition, ...FLAGS,
        status: pairs.length ? 'measured' : 'unexercised', estimator: 'abs-early-cliffs-delta-minus-abs-late',
        intervalMethod: 'matched-seed-pair-bootstrap', seed, bootstrapReplicates: count,
        pairs: pairs.length, excludedSeeds: excluded.length, exclusionReasons: countBy(excluded),
        deltaEarly, deltaLate, deltaEarlyInterval: bootstrap(pairs.map(p => p.early), `${seed}:early`, count),
        deltaLateInterval: bootstrap(pairs.map(p => p.late), `${seed}:late`, count),
        attenuation: pairs.length ? Math.abs(deltaEarly) - Math.abs(deltaLate) : null,
        attenuationInterval: attenuationInterval(pairs, `${seed}:attenuation`, count), seedPairs: pairs, excluded };
    })));
}

/** Per seed: the profile's (late − early) minus the same-seed baseline's (late − early); seeds are resampled. */
function baselineAdjusted({ runId, samples, seeds, profiles, contrasts, baselineContrasts, metrics, conditions, options, count }) {
  if (!baselineContrasts.length) return { ...FLAGS, value: null, reason: 'no-baseline-profile' };
  const { relevantMetrics } = require('./personaValidationBaseline.cjs');
  const byKey = new Map(samples.map(s => [`${s.condition}:${String(s.seed)}:${s.personaId}`, s]));
  const rows = baselineContrasts.flatMap(pair => relevantMetrics(profiles[pair.profileId], metrics, contrasts).flatMap(metric => conditions
    .filter(condition => metric.applies === 'both' || metric.applies === condition).map(condition => {
      const used = [], excluded = [];
      for (const seed of seeds) {
        const profile = byKey.get(`${condition}:${String(seed)}:${pair.profileId}`), baseline = byKey.get(`${condition}:${String(seed)}:${pair.baselineProfileId}`);
        if (!profile || !baseline) { excluded.push({ seed: String(seed), reason: 'missing-trace' }); continue; }
        const own = splitOpportunities(profile.metrics?.[metric.kind]?.opportunityRows, options);
        const base = splitOpportunities(baseline.metrics?.[metric.kind]?.opportunityRows, options);
        if (own.status !== 'split' || base.status !== 'split') {
          excluded.push({ seed: String(seed), reason: own.status !== 'split' && base.status !== 'split' ? 'both-unsplittable'
            : own.status !== 'split' ? 'profile-unsplittable' : 'baseline-unsplittable', profile: own.status, baseline: base.status });
          continue;
        }
        used.push({ seed: String(seed), profileShift: own.shift, baselineShift: base.shift, adjusted: own.shift - base.shift });
      }
      const values = used.map(row => row.adjusted), seed = `${runId}:${pair.id}:${metric.id}:${condition}:position-baseline`;
      return { baselineProfileId: pair.baselineProfileId, profileId: pair.profileId, traitKey: metric.traitKey, level: pair.traits[metric.traitKey],
        metricId: metric.id, kind: metric.kind, condition, ...FLAGS, status: used.length ? 'measured' : 'unexercised',
        estimator: 'mean-profile-shift-minus-same-seed-baseline-shift', intervalMethod: 'seed-pair-bootstrap-percentile', seed, bootstrapReplicates: count,
        pairs: used.length, excludedSeeds: excluded.length, exclusionReasons: countBy(excluded),
        mean: mean(values), median: median(values), interval: meanInterval(values, seed, count), seedPairs: used, excluded };
    })));
  return { ...FLAGS, reason: null, rows };
}

function analyzePosition({ manifest, samples, contrasts = [], baselineContrasts = [], spec, conditions = ['low', 'high'] }) {
  const config = spec.positionStability;
  const options = { minOpportunitiesPerTrace: config.minOpportunitiesPerTrace, oddMiddle: config.oddMiddle };
  const metrics = spec.metrics.filter(metric => metric.positionSplit), count = spec.bootstrapReplicates;
  const shared = { runId: manifest.runId, samples, metrics, conditions, options, count };
  return { ...FLAGS, version: 1, split: config.split, oddMiddle: config.oddMiddle,
    minOpportunitiesPerTrace: config.minOpportunitiesPerTrace, kinds: metrics.map(metric => metric.kind),
    profileShift: profileShift({ ...shared, profileIds: manifest.personaIds ?? [...new Set(samples.map(s => s.personaId))] }),
    contrastAttenuation: contrastAttenuation({ ...shared, seeds: manifest.seeds, contrasts }),
    baselineAdjusted: baselineAdjusted({ ...shared, seeds: manifest.seeds, profiles: manifest.profiles ?? {}, contrasts, baselineContrasts }),
    interpretation: INTERPRETATION,
    limitations: ['기회 순서로 나눈 설명 지표이며 시간 길이나 결정 수로 나누지 않는다.',
      '기회가 최소 수 미만이거나 decisionIndex가 없으면 해당 trace를 제외하고 0으로 채우지 않는다.',
      '주 판정·성향 판정·블라인드 점수에 사용하지 않는다.'] };
}

const number = value => Number.isFinite(value) ? String(Math.round(value * 10000) / 10000) : '—';
const interval = value => value?.map(number).join(' ~ ') ?? '—';
const reasons = value => Object.entries(value ?? {}).map(([reason, n]) => `${reason} ${n}`).join(', ') || '—';
function positionMarkdown(output) {
  const position = output.positionStability;
  if (!position) return [];
  const shifts = position.profileShift.filter(row => row.status === 'measured');
  return ['', '## 앞뒤 성향 유지 (설명 지표)', '', position.interpretation, '',
    `positionStability는 descriptiveOnly이며 주 판정에 사용하지 않는다. 각 trace의 기회를 decisionIndex 순서로 반씩 나누고 홀수 가운데 기회는 ${position.oddMiddle === 'early' ? '앞' : '뒤'}쪽에 둔다. 기회가 ${position.minOpportunitiesPerTrace}개 미만인 trace는 제외한다.`,
    '', '### 높음/낮음 대비의 앞뒤 차이', '',
    '약화 = |앞 delta| − |뒤 delta|. 양수는 뒷부분에서 대비가 줄었다는 설명이다. 구간은 같은 seed 쌍을 함께 재표집한다.', '',
    '| 성향 | 높은 / 낮은 프로필 | 지표 | 조건 | 쌍 | 제외 seed | 앞 delta | 뒤 delta | 약화 | 95% 구간 | 제외 이유 |',
    '| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |',
    ...position.contrastAttenuation.map(row => `| ${row.traitKey} | ${row.higherProfileId} / ${row.lowerProfileId} | ${row.kind} | ${row.condition} | ${row.pairs} | ${row.excludedSeeds} | ${number(row.deltaEarly)} | ${number(row.deltaLate)} | ${number(row.attenuation)} | ${interval(row.attenuationInterval)} | ${reasons(row.exclusionReasons)} |`),
    '', '### 프로필별 앞뒤 변화', '',
    `변화 = 뒤 비율 − 앞 비율의 trace 평균. 분할 가능한 trace가 있는 ${shifts.length}/${position.profileShift.length}행만 표시하며 나머지와 제외 이유는 report.json에 있다.`, '',
    '| 프로필 | 조건 | 지표 | 사용 trace | 제외 trace | 평균 변화 | 중앙값 | 95% 구간 |', '| --- | --- | --- | ---: | ---: | ---: | ---: | --- |',
    ...shifts.map(row => `| ${row.profileId} | ${row.condition} | ${row.kind} | ${row.usedTraces} | ${row.excludedTraces} | ${number(row.mean)} | ${number(row.median)} | ${interval(row.interval)} |`),
    ...(position.baselineAdjusted.rows ? ['', '### 기준 프로필 보정 앞뒤 변화', '',
      '보정 = 성향 프로필의 (뒤 − 앞) − 같은 seed 기준 프로필의 (뒤 − 앞). 과제 단계 효과의 일부를 덜어내지만 성향 감쇠를 확정하지 않는다.', '',
      '| 기준 | 프로필 | 성향 수준 | 지표 | 조건 | 쌍 | 제외 seed | 평균 | 95% 구간 | 제외 이유 |', '| --- | --- | --- | --- | --- | ---: | ---: | ---: | --- | --- |',
      ...position.baselineAdjusted.rows.map(row => `| ${row.baselineProfileId} | ${row.profileId} | ${row.traitKey}=${row.level} | ${row.kind} | ${row.condition} | ${row.pairs} | ${row.excludedSeeds} | ${number(row.mean)} | ${interval(row.interval)} | ${reasons(row.exclusionReasons)} |`)]
      : ['', `기준 프로필 보정(baselineAdjusted): ${position.baselineAdjusted.reason}.`])];
}
module.exports = { splitOpportunities, analyzePosition, positionMarkdown, INTERPRETATION };
