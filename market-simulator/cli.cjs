#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const commands = { personas: 'list_personas', generate: 'generate_trace', validate: 'validate_trace', pair: 'pair_app_session', sessions: 'list_app_sessions', play: 'play_trace', status: 'replay_status', stop: 'stop_replay',
  'begin-feedback':'begin_feedback_plan', 'step-feedback':'step_feedback_plan', 'observe-feedback':'observe_feedback_plan', 'finalize-feedback':'finalize_feedback_plan',
  'create-learner': 'create_learner', 'create-trial': 'create_learning_trial', 'prepare-round': 'prepare_learning_round',
  'generate-round': 'generate_learning_round', 'record-round': 'record_learning_round', 'record-failure': 'record_learning_failure', 'compare-trial': 'compare_learning_trial',
  'create-whole-learner':'create_whole_trace_learner','prepare-whole':'prepare_whole_trace','submit-whole':'submit_whole_trace','repair-whole':'repair_whole_trace','whole-status':'whole_trace_status',
  'begin-whole-authoring':'begin_whole_trace_authoring','append-whole-decision':'append_whole_trace_decision',
  'whole-authoring-menu':'whole_trace_authoring_menu','finish-whole-authoring':'finish_whole_trace_authoring',
  'prepare-persona-validation':'prepare_persona_validation', 'check-persona-validation-readiness':'check_persona_validation_readiness', 'measure-persona-validation':'measure_persona_validation', 'prepare-blind-review':'prepare_blind_review', 'submit-blind-review':'submit_blind_review', 'persona-validation-report':'persona_validation_report' };
function error(code, message) { return Object.assign(new Error(message), { code }); }
const authoringTools = new Set(['begin_whole_trace_authoring', 'append_whole_trace_decision',
  'whole_trace_authoring_menu', 'finish_whole_trace_authoring', 'submit_whole_trace',
  'repair_whole_trace', 'whole_trace_status']);
async function authorWhole(input) {
  // Reject argv mistakes before opening a file, connecting a host, or loading
  // the simulator. The only payload source is one JSON file or stdin.
  if (input.length !== 1 || !input[0] || input[0].startsWith('-') && input[0] !== '-')
    throw error('AUTHORING_UNEXPECTED_ARGUMENT', 'author-whole accepts exactly one JSON file path or - for stdin; flags, duplicate paths and remaining positional arguments are not accepted.');
  const request = JSON.parse(fs.readFileSync(input[0] === '-' ? 0 : input[0], 'utf8'));
  if (!request || typeof request !== 'object' || Array.isArray(request))
    throw error('AUTHORING_INVALID_INPUT', 'Expected {contextFilePath,operationId,tool,arguments}.');
  if (Object.hasOwn(request, 'hostDirectory') || Object.hasOwn(request, 'requestId'))
    throw error('AUTHORING_CONTEXT_OVERRIDE', 'hostDirectory and requestId come only from contextFilePath; do not repeat them in the operation envelope.');
  if (Object.keys(request).some(key => !['contextFilePath', 'operationId', 'tool', 'arguments'].includes(key))
    || typeof request.contextFilePath !== 'string' || !request.contextFilePath.trim()
    || typeof request.operationId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(request.operationId)
    || typeof request.tool !== 'string'
    || !request.arguments || typeof request.arguments !== 'object' || Array.isArray(request.arguments))
    throw error('AUTHORING_INVALID_INPUT', 'Expected {contextFilePath,operationId,tool,arguments} with a stable operationId, an arguments object and no extra fields.');
  if (Object.hasOwn(request.arguments, 'hostDirectory') || Object.hasOwn(request.arguments, 'requestId'))
    throw error('AUTHORING_CONTEXT_OVERRIDE', 'hostDirectory and requestId come only from contextFilePath; do not repeat them in arguments. Candidate and repair contents remain actor-authored.');
  const tool = commands[request.tool] ?? request.tool;
  if (!authoringTools.has(tool))
    throw error('AUTHORING_INVALID_INPUT', 'author-whole accepts only authoring, submit, repair and status for an already prepared request. Use host-call for preparation and other administrator operations.');
  const inputDirectory = input[0] === '-' ? process.cwd() : path.dirname(path.resolve(input[0]));
  const contextPath = path.resolve(inputDirectory, request.contextFilePath);
  let context;
  try { context = JSON.parse(fs.readFileSync(contextPath, 'utf8')); }
  catch (cause) { throw error('AUTHORING_INVALID_CONTEXT', `Cannot read context JSON at ${contextPath} (${cause.code ?? 'invalid JSON'}).`); }
  if (!context || typeof context !== 'object' || Array.isArray(context)
    || typeof context.hostDirectory !== 'string' || !context.hostDirectory.trim()
    || typeof context.requestId !== 'string' || !/^[a-zA-Z0-9._:-]{1,128}$/.test(context.requestId))
    throw error('AUTHORING_INVALID_CONTEXT', 'Context must contain a nonempty hostDirectory and a valid prepared requestId.');
  // Bind transport only. Never insert or replace fields inside a candidate,
  // repair, decision, state or belief; their existing validators remain in charge.
  const hostDirectory = path.resolve(path.dirname(contextPath), context.hostDirectory);
  return require('./whole-trace-host.cjs').callHost(hostDirectory, {
    operationId: request.operationId, tool, arguments: { ...request.arguments, requestId: context.requestId },
  });
}
async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (command === 'author-whole') {
    const result = await authorWhole(rest);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return;
  }
  if (['host-start', 'host-call', 'host-status', 'host-close'].includes(command)) {
    const host = require('./whole-trace-host.cjs');
    const [directory, ...input] = rest;
    if (!directory) throw new Error(`${command} requires a host directory.`);
    let result;
    if (command === 'host-call') {
      if (!(input.length === 1 || input.length === 2 && input[0] === '--options-file')) throw new Error('host-call <directory> <JSON | --options-file path> requires {operationId,tool,arguments}.');
      const request = JSON.parse(input[0] === '--options-file' ? fs.readFileSync(input[1], 'utf8') : input[0]);
      request.tool = commands[request.tool] ?? request.tool;
      result = await host.callHost(directory, request);
    } else {
      if (input.length) throw new Error(`${command} takes only a host directory.`);
      result = await ({ 'host-start': host.startHost, 'host-status': host.hostStatus, 'host-close': host.closeHost })[command](directory);
    }
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return;
  }
  const { invokeTool, close } = require('./server.cjs');
  if (command === 'serve') { require('./server.cjs').start(); return; }
  if (!command || ['--help', '-h'].includes(command)) {
    process.stdout.write('Usage: node market-simulator/cli.cjs <personas|generate|validate|create-learner|create-whole-learner|create-trial|prepare-round|generate-round|record-round|record-failure|compare-trial> [JSON | --options-file path]\nReplay tools and tabId options require a persistent server: node market-simulator/server.cjs (MCP STDIO).\nFor direct interactive local use: node market-simulator/cli.cjs interactive\nThe interactive shell accepts one {tool,arguments} JSON object per line; tool may also be a CLI alias.\nWhole-trace prepare-whole, submit-whole, repair-whole and whole-status require the same persistent MCP or interactive process; requests are not restored across separate CLI commands.\nFor actor-independent offline process ownership: host-start <new-directory>, host-call <directory> <JSON | --options-file path>, host-status <directory>, host-close <directory>.\nWhole-trace authoring: node market-simulator/cli.cjs author-whole <request.json | ->\nThe JSON file or stdin contains {contextFilePath,operationId,tool,arguments}; prepared context supplies only transport hostDirectory/requestId. Never duplicate them in the envelope or arguments.\nRelative contextFilePath is based on the input JSON directory, or cwd for stdin; relative context hostDirectory is based on the context directory. Candidate/decision contents are never filled or changed. Prepare context with administrator host-call.\nEach host operation requires {operationId,tool,arguments}. Retry uncertain calls with the same operationId and unchanged inputs. Host journals never restore sessions.\n'); return;
  }
  if (command === 'interactive') {
    const rl = require('node:readline').createInterface({ input: process.stdin, crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      try { const request = JSON.parse(line); process.stdout.write(JSON.stringify(await invokeTool(commands[request.tool]??request.tool, request.arguments ?? {})) + '\n'); }
      catch (error) { process.stderr.write(error.message + '\n'); }
    }
    await close(); return;
  }
  if (['pair', 'sessions', 'play', 'status', 'stop'].includes(command)) throw new Error('Replay commands need a persistent connection. Use MCP tools or cli.cjs interactive.');
  if (['begin-feedback','step-feedback','observe-feedback','finalize-feedback'].includes(command)) throw new Error('Feedback sessions need one persistent MCP or cli.cjs interactive process; separate CLI commands cannot restore a session.');
  if(['prepare-whole','submit-whole','repair-whole','whole-status','begin-whole-authoring','append-whole-decision','whole-authoring-menu','finish-whole-authoring'].includes(command)) throw new Error('Whole-trace requests need the same persistent MCP or cli.cjs interactive process; separate CLI commands cannot restore a prepared request.');
  if (!commands[command]) throw new Error(`Unknown command: ${command}`);
  if (rest.length > 1 && !(rest.length === 2 && rest[0] === '--options-file')) throw new Error('Pass one JSON argument or --options-file path.');
  const args = rest[0] === '--options-file' ? JSON.parse(fs.readFileSync(rest[1], 'utf8')) : rest[0] ? JSON.parse(rest[0]) : {};
  try { const result = await invokeTool(commands[command], args); process.stdout.write(JSON.stringify(result, null, 2) + '\n'); if (command === 'validate' && !result.valid) process.exitCode = 1; }
  finally { await close(); }
}
main().catch(error => { process.stderr.write(`${error.code ? `${error.code}: ` : ''}${error.message}\n`); process.exitCode = 1; });
