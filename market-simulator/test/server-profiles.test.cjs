'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createService, definitions, authoringDefinitions, PROFILES } = require('../server.cjs');

const list = async profile => (await createService({ profile, bridge: {} })
  .dispatch({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).result.tools.map(tool => tool.name);

test('default profile keeps the original public catalog with authoring tools unlisted', async () => {
  const names = await list(undefined);
  assert.deepEqual(names, definitions.map(tool => tool.name));
  for (const tool of authoringDefinitions) assert.ok(!names.includes(tool.name));
});

test('generation profile lists whole-trace authoring and hides legacy tools', async () => {
  const names = await list('generation');
  assert.deepEqual(names, ['prepare_whole_trace', 'submit_whole_trace', 'repair_whole_trace', 'whole_trace_status',
    'begin_whole_trace_authoring', 'append_whole_trace_decision', 'whole_trace_authoring_menu', 'finish_whole_trace_authoring',
    'list_personas', 'validate_trace']);
});

test('validation profile adds persona validation to generation tools', async () => {
  const names = await list('validation');
  for (const name of ['prepare_whole_trace', 'append_whole_trace_decision', 'prepare_persona_validation', 'persona_validation_report'])
    assert.ok(names.includes(name), name);
  assert.ok(!names.includes('begin_feedback_plan'));
});

test('tools outside the profile are rejected before argument checks', async () => {
  const service = createService({ profile: 'generation', bridge: {} });
  await assert.rejects(service.invokeTool('begin_feedback_plan', {}), /not available in the generation profile/);
  await assert.rejects(service.invokeTool('pair_app_session', {}), /not available in the generation profile/);
});

test('unknown profiles fail fast', () => {
  assert.throws(() => createService({ profile: 'nope' }), /Unknown tool profile: nope/);
  assert.deepEqual(Object.keys(PROFILES), ['all', 'generation', 'validation', 'replay']);
});
