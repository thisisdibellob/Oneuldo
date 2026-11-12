'use strict';
// Preserve v2 evidence and the original four-person request shape.
// New profile definitions, subsets, and explicit traits mode use the v3 runner.
const fs = require('node:fs');
const path = require('node:path');
const legacy = require('./personaValidationLegacyRun.cjs');
const universal = () => require('./personaTraitValidationRun.cjs');
const legacyIds = ['mild-intellectual-disability-adult', 'careful-checker', 'quick-decider', 'neutral-adult-control'];
function runner(directory) {
  const manifest = JSON.parse(fs.readFileSync(path.join(path.resolve(directory), 'manifest.json'), 'utf8'));
  return manifest.version === 3 ? universal() : legacy;
}
function prepare(args) {
  if (args.validationMode !== undefined && !['traits', 'legacy'].includes(args.validationMode)) throw new Error('Unknown validationMode');
  if (args.validationMode === 'legacy' && args.profiles !== undefined) throw new Error('Legacy validation cannot accept trait profiles');
  const oldShape = args.catalogSchemaVersion === undefined && args.profiles === undefined && Array.isArray(args.personaIds)
    && args.personaIds.length === legacyIds.length && legacyIds.every(id => args.personaIds.includes(id));
  const selected = args.validationMode === 'legacy' || args.validationMode === undefined && oldShape ? legacy : universal();
  if (selected === legacy && args.lowGoalCount !== undefined) throw new Error('lowGoalCount is supported only for traits catalog v2');
  return selected.prepare(args);
}
function lookupValidationSlot(args, snapshot) {
  if (args.outputPath) {
    const directory = path.dirname(path.dirname(path.dirname(path.dirname(path.resolve(args.outputPath)))));
    const file = path.join(directory, 'manifest.json');
    if (fs.existsSync(file) && JSON.parse(fs.readFileSync(file, 'utf8')).version === 3)
      return universal().lookupValidationSlot(args, snapshot);
  }
  return legacy.lookupControlSlot(args, snapshot);
}
module.exports = {
  prepare, checkReadiness: args => require('./personaValidationReadiness.cjs').check(args), lookupValidationSlot, lookupControlSlot: lookupValidationSlot,
  refresh: manifest => (manifest.version === 3 ? universal() : legacy).refresh(manifest),
  load: (manifest, options) => (manifest.version === 3 ? universal() : legacy).load(manifest, options),
  readManifest: directory => runner(directory).readManifest(directory),
  ...Object.fromEntries(['measure', 'prepareBlind', 'submitBlind', 'report'].map(name =>
    [name, args => runner(args.runDirectory)[name](args)])),
};
