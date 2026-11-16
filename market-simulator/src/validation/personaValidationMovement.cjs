'use strict';

const ANCHOR_FEEDBACK_VERSIONS = ['recent-movement-anchor-v1', 'recent-movement-anchor-capacity-v1'];
const KEYS = ['movementValidationVersion', 'movementVersion', 'movementFeedbackVersion', 'wayfindingVersion'];

/** Explicit run binding only; absence preserves the historical validation contract. */
function movementOptions(value = {}) {
  const present = KEYS.filter(key => value[key] !== undefined);
  if (!present.length) return {};
  if (value.movementValidationVersion !== '1')
    throw new Error('movementValidationVersion 1 is required for validation movement options');
  if (value.movementVersion !== undefined && value.movementVersion !== 'directional-v2')
    throw new Error('Validation movementVersion must be directional-v2 when supplied');
  const observationVersion = value.observationVersion !== undefined ? value.observationVersion : (!value.movementVersion && !value.trialBinding
    ? 'anchor-visible-structures-v1' : undefined);
  if (value.movementFeedbackVersion !== undefined
    && !(value.movementFeedbackVersion === 'recent-movement-v1' && value.movementVersion === 'directional-v2')
    && !(ANCHOR_FEEDBACK_VERSIONS.includes(value.movementFeedbackVersion) && value.movementVersion === undefined
      && observationVersion === 'anchor-visible-structures-v1'))
    throw new Error('movementFeedbackVersion requires recent-movement-v1 with directional-v2, or recent-movement-anchor-v1/recent-movement-anchor-capacity-v1 with omitted movementVersion and anchor-visible-structures-v1');
  if (value.wayfindingVersion !== undefined && (!['wayfinding-v1', 'wayfinding-v2', 'wayfinding-v3', 'wayfinding-v4'].includes(value.wayfindingVersion) || value.movementVersion !== undefined
    || observationVersion !== 'anchor-visible-structures-v1'))
    throw new Error('wayfindingVersion wayfinding-v1/v2 requires omitted movementVersion and anchor-visible-structures-v1');
  return Object.fromEntries(present.map(key => [key, value[key]]));
}

function assertMovementBinding(expected, actual, label = 'Validation movement binding') {
  const a = movementOptions(expected), b = movementOptions(actual);
  if (KEYS.some(key => a[key] !== b[key])) throw new Error(`${label} differs; use the exact prepared movement options`);
  return a;
}

function assertMovementManifest(manifest) {
  const options = movementOptions(manifest);
  for (const slot of manifest.slots ?? []) assertMovementBinding(options, slot, 'Validation slot movement binding');
  return options;
}

/** Both load/measurement and readiness use this same evidence boundary. */
function assertMovementEvidence(manifest, { trace, bundle, audit }) {
  const expected = movementOptions(manifest);
  const generation = trace?.generation ?? {};
  assertMovementBinding(expected, {
    movementValidationVersion: generation.wholeTraceMovementValidationVersion,
    movementVersion: generation.wholeTraceMovementVersion,
    movementFeedbackVersion: generation.wholeTraceMovementFeedbackVersion,
    wayfindingVersion: generation.wholeTraceWayfindingVersion,
  }, 'Trace movement evidence');
  assertMovementBinding(expected, bundle ?? {}, 'Bundle movement evidence');
  assertMovementBinding(expected, audit ?? {}, 'Knowledge audit movement evidence');
  if (ANCHOR_FEEDBACK_VERSIONS.includes(expected.movementFeedbackVersion)
    && [generation.wholeTraceObservationVersion, bundle?.observationVersion, audit?.observationVersion]
      .some(version => version !== 'anchor-visible-structures-v1'))
    throw new Error(`${expected.movementFeedbackVersion} requires anchor-visible-structures-v1 in trace, bundle and knowledge audit`);
  if (expected.movementFeedbackVersion === 'recent-movement-anchor-capacity-v1') {
    const id = trace?.personaId, profile = manifest.profiles?.[id];
    if (!manifest.personaIds?.includes(id) || !profile || bundle?.persona?.id !== id)
      throw new Error('Capacity feedback requires the manifest-bound persona identity');
    // Trait manifests carry the validated full persona; legacy manifests bind
    // canonical files by version/hash before reaching this evidence boundary.
    const persona = manifest.version === 3 ? profile.persona : manifest.version === 2 && /^[a-z0-9-]+$/.test(id)
      ? JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname, '../../personas', `${id}.json`), 'utf8')) : undefined;
    const capacity = persona?.attention?.spatialMemoryCapacity;
    if (persona?.id !== id || trace.personaVersion !== persona.version || bundle.persona.version !== persona.version
      || !Number.isInteger(capacity) || capacity < 4 || bundle.persona.behavior?.behavioralContext?.spatialMemoryCapacity !== capacity)
      throw new Error('Capacity feedback requires the canonical validation persona spatialMemoryCapacity in the prepared bundle');
  }
  if (!expected.movementValidationVersion && (audit?.navigationEvidence !== undefined
    || audit?.decisions?.some(decision => decision.navigationEvidence !== undefined)))
    throw new Error('Historical validation cannot use movement navigation evidence');
  if (expected.movementValidationVersion && audit?.navigationEvidence?.version !== 'continuous-route-v1')
    throw new Error('Validation movement navigation evidence must use continuous-route-v1');
  if (expected.movementValidationVersion && (!Array.isArray(audit?.decisions)
    || audit.decisions.some(decision => decision?.navigationEvidence?.version !== 'continuous-route-v1')))
    throw new Error('Every validation decision requires continuous-route-v1 movement navigation evidence');
}

function movementReportFields(manifest, rows) {
  const options = movementOptions(manifest);
  if (!options.movementValidationVersion) return {};
  return { ...options, movementOpportunities: { version: 'continuous-route-v1', descriptiveOnly: true,
    perTrace: rows.map(row => ({ personaId: row.personaId, condition: row.condition, seed: row.seed, tracePath: row.tracePath,
      metrics: row.movementOpportunities?.metrics ?? row.metrics,
      coverage: row.movementOpportunities?.coverage ?? row.coverage })) } };
}

function movementMarkdown(report) {
  if (!report.movementValidationVersion) return [];
  const rows = report.movementOpportunities?.perTrace ?? [];
  const kinds = [...new Set(rows.flatMap(row => Object.keys(row.metrics ?? {})))];
  return ['', '## 명시적 이동 검증 계약', '',
    `movementValidationVersion=${report.movementValidationVersion}; movementVersion=${report.movementVersion ?? '생략(anchor 대조)'}; movementFeedbackVersion=${report.movementFeedbackVersion ?? '생략'}; wayfindingVersion=${report.wayfindingVersion ?? '생략'}.`, '',
    '연속 경로 근거는 continuous-route-v1이다. 동선 고수 기회는 방문한 anchor와 미방문 anchor가 함께 보이는 실제 anchor 선택에서만 센다. 방향 입력과 실제 도착·차단은 별도 진단에 남긴다. 아래 값은 관찰 기회의 기술 통계이며 별도의 성향 판정이나 성공률이 아니다. legacy의 기존 지표·판정은 유지한다. 개별 근거·제외 이유는 report.json의 movementOpportunities를 따른다.', '',
    '| 기회 지표 | 관찰 기회 합 | 측정 trace | 미발생·근거 부족 trace |',
    '| --- | ---: | ---: | ---: |',
    ...kinds.map(kind => {
      const metrics = rows.map(row => row.metrics?.[kind]).filter(Boolean);
      const measured = metrics.filter(metric => metric.status === 'measured');
      return `| ${kind} | ${measured.reduce((sum, metric) => sum + (metric.denominator ?? 0), 0)} | ${measured.length} | ${rows.length - measured.length} |`;
    }), ''];
}

module.exports = { movementOptions, assertMovementBinding, assertMovementManifest, assertMovementEvidence,
  movementReportFields, movementMarkdown };
