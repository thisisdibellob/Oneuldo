#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const { invokeTool, close } = require('./server.cjs');
const commands = { personas: 'list_personas', generate: 'generate_trace', validate: 'validate_trace', pair: 'pair_app_session', sessions: 'list_app_sessions', play: 'play_trace', status: 'replay_status', stop: 'stop_replay' };
async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (command === 'serve') { require('./server.cjs').start(); return; }
  if (!command || ['--help', '-h'].includes(command)) {
    process.stdout.write('Usage: node market-simulator/cli.cjs <personas|generate|validate> [JSON | --options-file path]\nReplay tools require a persistent server: node market-simulator/server.cjs (MCP STDIO).\nFor direct interactive local use: node market-simulator/cli.cjs interactive\nThe interactive shell accepts one {tool,arguments} JSON object per line.\n'); return;
  }
  if (command === 'interactive') {
    const rl = require('node:readline').createInterface({ input: process.stdin, crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      try { const request = JSON.parse(line); process.stdout.write(JSON.stringify(await invokeTool(request.tool, request.arguments ?? {})) + '\n'); }
      catch (error) { process.stderr.write(error.message + '\n'); }
    }
    await close(); return;
  }
  if (['pair', 'sessions', 'play', 'status', 'stop'].includes(command)) throw new Error('Replay commands need a persistent connection. Use MCP tools or cli.cjs interactive.');
  if (!commands[command]) throw new Error(`Unknown command: ${command}`);
  if (rest.length > 1 && !(rest.length === 2 && rest[0] === '--options-file')) throw new Error('Pass one JSON argument or --options-file path.');
  const args = rest[0] === '--options-file' ? JSON.parse(fs.readFileSync(rest[1], 'utf8')) : rest[0] ? JSON.parse(rest[0]) : {};
  try { const result = await invokeTool(commands[command], args); process.stdout.write(JSON.stringify(result, null, 2) + '\n'); if (command === 'validate' && !result.valid) process.exitCode = 1; }
  finally { await close(); }
}
main().catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
