'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { canonicalMarketReplayJson } = require('../../../frontend/src/game/marketReplayTrace.ts');
const hash = value => crypto.createHash('sha256').update(canonicalMarketReplayJson(value)).digest('hex');
const archived = {
  legacy: require('../../validation/archive/persona-validation-spec.v2.json'),
  traits: require('../../validation/archive/persona-trait-validation-spec.v1.json'),
};
function assertSpec(manifest, current, mode) {
  const name = mode === 'traits' ? 'persona-trait-validation-spec' : 'persona-validation-spec';
  const previous = archived[mode];
  const candidates = [
    { value: previous, file: `archive/${name}.v${previous.version}.json` },
    { value: require(`../../validation/${name}.json`), file: `${name}.json` },
    ...(mode === 'traits' ? ['v2', 'v3'].map(v => ({ value: require(`../../validation/persona-trait-validation-spec-${v}.json`), file: `persona-trait-validation-spec-${v}.json` })) : []),
  ];
  const selected = candidates.find(candidate => manifest.specHash === hash(candidate.value));
  if (!selected) throw new Error('Validation spec changed; create a separate run');
  const expected = selected.value;
  const file = path.join(__dirname, '../../validation', selected.file);
  if (manifest.specHash !== hash(expected) || manifest.specHash !== hash(JSON.parse(fs.readFileSync(file, 'utf8')))
    || manifest.specVersion !== undefined && manifest.specVersion !== expected.version
    || manifest.analysisVersion !== expected.analysisVersion
    || expected.analysisVersion && manifest.specVersion !== expected.version)
    throw new Error('Validation spec changed; create a separate run');
  return expected;
}
function historical(manifest) {
  return manifest.analysisVersion === undefined || manifest.version === 3 && manifest.analysisVersion !== 2;
}
function powerWarning(seeds) {
  return seeds.length < 20 ? { code: 'fewer-than-recommended-seeds', provided: seeds.length, recommended: 20,
    message: '조건별 seed 20개 이상을 권장한다. 기회 미발생으로 유효 쌍은 더 적을 수 있으며 8개 통과 기준은 유지한다.' } : null;
}
function preserveMeasurement(manifest, file, result) {
  if (!historical(manifest) || !fs.existsSync(file)) return false;
  if (hash(JSON.parse(fs.readFileSync(file, 'utf8'))) !== hash(result))
    throw new Error('Historical measurements would change; preserve this run and create a separate runId');
  return true;
}
function historicalReport(manifest, measurements) {
  if (!historical(manifest)) return null;
  const reportPath = path.join(manifest.runDirectory, 'report.json'), markdownPath = path.join(manifest.runDirectory, 'report.ko.md');
  if (!fs.existsSync(reportPath) && !fs.existsSync(markdownPath)) return null;
  if (!fs.existsSync(reportPath) || !fs.existsSync(markdownPath)) throw new Error('Historical report is incomplete; preserve it and use a separate runId');
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  if (report.dataFingerprint !== measurements.dataFingerprint) throw new Error('Historical report is stale; preserve it and use a separate runId');
  return { reportPath, markdownPath, completed: report.completed, required: report.required,
    fixtureOnly: report.fixtureOnly, historicalArtifactPreserved: true };
}
module.exports = { assertSpec, powerWarning, preserveMeasurement, historicalReport };
