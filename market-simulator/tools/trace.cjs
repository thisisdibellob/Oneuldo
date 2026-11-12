'use strict';
// Trace validation against a mission snapshot.
// Handler bodies were moved verbatim from server.cjs.
const { string, object, schema } = require('./schema.cjs');
const { readTrace } = require('./common.cjs');
const definitions = [
  { name: 'validate_trace', description: 'Validate a trace and its target mission snapshot with the shared schema and game guards.', inputSchema: schema({ trace: object, traceFilePath: string, tabId: string, snapshot: object, snapshotFilePath: string }), annotations: { readOnlyHint: true } },
];
async function invoke(name, args, ctx) {
  const { getSnapshot, validate } = ctx;
  if (name === 'validate_trace') return validate(readTrace(args), await getSnapshot(args));
  throw new Error('Unsupported tool.');
}
module.exports = { definitions, invoke };
