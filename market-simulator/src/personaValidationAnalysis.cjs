'use strict';
// Supplementary outputs never participate in the primary verdict.
function analyze(manifest, samples, findings, spec) {
  const { extractSequenceMetrics, summarizeSequenceMetrics } = require('./personaValidationSequence.cjs');
  const { stratifiedPairedBootstrap, simulateDeltaPower } = require('./personaValidationSupplementary.cjs');
  const perTrace = samples.map(s => ({ personaId: s.personaId, condition: s.condition, seed: s.seed, tracePath: s.tracePath,
    sequenceMetrics: extractSequenceMetrics(s.trace, s.snapshot, s.persona, s.audit,
      { actorDecisions: s.actorDecisions, personaReview: s.personaReview }) }));
  const byKey = new Map(samples.map(s => [JSON.stringify([s.condition, String(s.seed), s.personaId]), s]));
  const groups = new Map();
  for (const finding of findings) {
    const key = JSON.stringify([finding.id ?? finding.personaId, finding.metricId]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(finding);
  }
  const pooledAnalysis = [...groups.values()].map(rows => {
    const f = rows[0], metric = spec.metrics.find(m => m.id === f.metricId), pairs = [];
    const actorPersonaId = f.higherProfileId ?? f.personaId;
    const referencePersonaId = f.lowerProfileId ?? spec.controlPersonaId;
    for (const row of rows) for (const seed of manifest.seeds) {
      const a = byKey.get(JSON.stringify([row.condition, String(seed), actorPersonaId]))?.metrics[metric.kind];
      const b = byKey.get(JSON.stringify([row.condition, String(seed), referencePersonaId]))?.metrics[metric.kind];
      if (a?.status === 'measured' && b?.status === 'measured') pairs.push({ condition: row.condition, seed: String(seed), pair: [a.value, b.value] });
    }
    return { metricId: f.metricId, actorPersonaId, referencePersonaId, applies: metric.applies,
      expectedDirection: metric.expectedDirection ?? metric.expectedAgainstControl, descriptiveOnly: true, usedForPrimaryDecision: false,
      ...stratifiedPairedBootstrap(pairs, `${manifest.runId}:${f.id ?? actorPersonaId}:${f.metricId}:pooled`, spec.bootstrapReplicates) };
  });
  const simulations = new Map();
  const powerAnalysis = findings.map(f => {
    if (!simulations.has(f.pairs)) simulations.set(f.pairs, simulateDeltaPower(f.pairs, { seed: 'persona-validation-power-v1' }));
    return { metricId: f.metricId, comparisonId: f.id ?? f.personaId, condition: f.condition, ...simulations.get(f.pairs) };
  });
  return { sequenceMetrics: { ...summarizeSequenceMetrics(perTrace), perTrace }, pooledAnalysis,
    powerAnalysis, referenceComparison: null };
}
function causes(readiness, findings, samples = []) {
  return [
    { cause: '표본 부족', unit: '비교', count: findings.filter(f => f.pairs < 8).length,
      detail: `유효 쌍 8 미만 비교. 저장 trace ${readiness.complete}/${readiness.required}; 누락·짝 불일치는 readinessDetails 참조.` },
    { cause: '대조군 없음', unit: '비교 기준', count: readiness.control.required && !readiness.control.present ? 1 : readiness.referenceControls.filter(r => !r.completed).length,
      detail: readiness.control.required ? '지정 대조군의 완료 trace 여부.' : '같은 맥락·단일 성향 대비의 낮은 수준 프로필이 비교 기준이다.' },
    { cause: '기회 미발생', unit: '지표별 쌍', count: findings.reduce((n, f) => n + f.unexercised, 0),
      perTraceCount: samples.reduce((n, s) => n + Object.values(s.metrics ?? {}).filter(metric => metric?.status === 'unexercised').length, 0),
      detail: '쌍 기준은 양쪽 trace가 모두 완료되었으나 지표 기회가 없는 쌍의 합계다. 개별 trace 기준은 짝 여부와 무관하게 저장 trace에서 미발생한 지표 수다. 구조적 가능성은 opportunityAudit 참조.' },
    { cause: '기술 실패', unit: '슬롯', count: readiness.technicalFailures.length,
      detail: '확인된 저장·생성 오류만 집계한다. 미시도 슬롯을 기술 실패로 간주하지 않는다. 출처 변조는 측정에서 거절한다.' },
  ];
}
function readinessFields(readiness, findings, samples) {
  return { readiness: readiness.readiness, readinessReasons: readiness.reasons, readinessDetails: readiness,
    inabilityCauses: causes(readiness, findings, samples) };
}
function reportFields(measurements) {
  return Object.fromEntries(['analysisVersion', 'specVersion', 'readiness', 'readinessReasons', 'readinessDetails', 'inabilityCauses',
    'opportunityAudit', 'powerWarning', 'sequenceMetrics', 'pooledAnalysis', 'powerAnalysis'].map(key => [key, measurements[key] ?? null]));
}
function readinessMarkdown(output) {
  if (!output.readiness) return [];
  return ['', '## 판정 불가 원인', '', `readiness: "${output.readiness}"`,
    ...(output.readinessReasons ?? []).map(reason => `- ${reason.code}: ${reason.message}`), '',
    '같은 비교에 원인이 겹칠 수 있으므로 행의 수를 합산하지 않는다.', '',
    '| 원인 | 수 | 단위 | 해석 |', '| --- | ---: | --- | --- |',
    ...(output.inabilityCauses ?? []).map(row => Number.isInteger(row.perTraceCount)
      ? `| ${row.cause} | 쌍 ${row.count} / 개별 trace ${row.perTraceCount} | 지표별 쌍 / 지표별 trace | ${row.detail} |`
      : `| ${row.cause} | ${row.count} | ${row.unit} | ${row.detail} |`), ''];
}
const number = value => Number.isFinite(value) ? String(Math.round(value * 10000) / 10000) : '—';
function supplementaryMarkdown(output) {
  if (!output.sequenceMetrics) return [];
  const scenario = output.powerAnalysis?.find(row => row.model);
  return ['', '## 순서·변동성과 보조 분석', '',
    'sequenceMetrics와 pooledAnalysis는 descriptiveOnly이며 주 판정에 사용하지 않는다. 실수 강제 금지: 오류가 많다는 이유로 장애 특성에 충실하다고 해석하지 않는다.',
    '대기시간은 배우가 작성한 값이다. 오류·회복·반복의 step ID와 전이 행렬·bigram은 report.json의 sequenceMetrics에 저장했다. 미발생은 null/unexercised다.', '',
    '| 인물 | 조건 | 시간 관측 수 | 중앙값 ms | IQR ms | 변동계수 | 상위 꼬리 평균 ms | 전이 엔트로피 bit |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...output.sequenceMetrics.groups.map(row => `| ${row.personaId} | ${row.condition} | ${row.delayDistribution.n} | ${number(row.delayDistribution.median)} | ${number(row.delayDistribution.iqr)} | ${number(row.delayDistribution.coefficientOfVariation)} | ${number(row.delayDistribution.upperTenPercent?.mean)} | ${number(row.actionTransitions.entropyBits)} |`),
    '', '### 조건을 묶은 층화 쌍 부트스트랩', '',
    '조건별 효과를 같은 가중치로 묶고 동일 seed의 조건 간 의존성을 보존한다. partial은 두 조건이 모두 관찰되지 않았다는 뜻이며 적용 부하도 함께 읽는다.', '',
    '| 지표 | 비교 프로필 | 적용 부하 | 상태 | 관측 쌍 | 독립 seed | 효과 | 95% 구간 |', '| --- | --- | --- | --- | ---: | ---: | ---: | --- |',
    ...(output.pooledAnalysis ?? []).map(row => `| ${row.metricId} | ${row.actorPersonaId} / ${row.referencePersonaId} | ${row.applies} | ${row.status} | ${row.n} | ${row.independentSeedCount} | ${number(row.delta)} | ${row.interval?.map(number).join(' ~ ') ?? '—'} |`),
    '', '### 현재 유효 쌍 수의 모의 검정력', '',
    '고정 seed의 가정 기반 시뮬레이션이다. |delta| 0.33의 CI 검출과 기존 pass 기준 충족 확률을 구분하며 실제 데이터의 검정력을 입증하지 않는다.',
    ...(scenario ? [`가정: 같은 분산의 정규 위치 이동, 쌍 내 상관 ${scenario.model.withinPairCorrelation}. 시뮬레이션 ${scenario.simulations}회, 모의 쌍 부트스트랩 ${scenario.bootstrapReplicates}회. seed: ${scenario.seed}.`,
      '실제 비율·이산값·동률·0 집중 분포에서는 달라질 수 있다. MC 표준오차는 시뮬레이션 오차만 나타낸다. n=1은 퇴화 구간이므로 검출률을 계산하지 않는다.'] : []), '',
    '| 비교 / 지표 | 조건 | 유효 쌍 | CI 검출 확률 | pass 확률 | 검출률 MC 표준오차 |', '| --- | --- | ---: | ---: | ---: | ---: |',
    ...(output.powerAnalysis ?? []).map(row => `| ${row.comparisonId} / ${row.metricId} | ${row.condition} | ${row.n} | ${number(row.detectionPower)} | ${number(row.passProbability)} | ${number(row.monteCarloStandardError?.detectionPower)} |`)];
}
function blindMarkdown(output) {
  const agreements = Object.entries(output.interReviewerAgreement ?? {}).flatMap(([panel, value]) =>
    Object.entries(value.perTrait ?? { persona: value.persona }).filter(([, row]) => row).map(([kind, row]) => ({ panel, kind, ...row })));
  const accuracy = score => number(score?.macroAccuracy ?? score?.accuracy);
  return ['', '## 판별자별 점수와 일치도', '',
    'reviewerKind는 자기 신고다. κ는 판별자 사이의 일치도이며 정답 정확도나 실제 사람과의 유사성 점수가 아니다. 판별자별 혼동행렬·보류·coverage는 report.json에 보존한다.', '',
    '| 판별자 | 자기 신고 종류 | A 정확도 | B 정확도 |', '| --- | --- | ---: | ---: |',
    ...(output.blindReviews ?? []).map(row => `| ${row.reviewerId} | ${row.reviewerKind} | ${accuracy(row.scores.A)} | ${accuracy(row.scores.B)} |`), '',
    '| 판 | 구분 | 판별자 수 | 공통 표본 | 방식 | κ | 상태 |', '| --- | --- | ---: | ---: | --- | ---: | --- |',
    ...agreements.map(row => `| ${row.panel} | ${row.kind} | ${row.reviewers} | ${row.commonItems} | ${row.method ?? '—'} | ${number(row.kappa)} | ${row.status} |`)];
}

module.exports = { analyze, readinessFields, reportFields, readinessMarkdown, supplementaryMarkdown, blindMarkdown };
