#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const { invokeTool } = require('./server.cjs');
const commands = { personas: 'list_personas', episode: 'generate_episode', batch: 'generate_batch', validate: 'validate_episode_schema', export: 'export_to_backend' };
async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (command === '--help' || command === '-h' || !command) {
    process.stdout.write('Usage: node market-simulator/cli.cjs <personas|episode|batch|validate|export> [JSON options | --options-file path]\nExamples:\n  node market-simulator/cli.cjs episode \'{"personaId":"careful-checker","seed":"sample-1"}\'\n  node market-simulator/cli.cjs batch --options-file batch-options.json\n  node market-simulator/cli.cjs validate \'{"batchFilePath":"/tmp/samples.jsonl"}\'\n');
    return;
  }
  if (!commands[command]) throw new Error(`Unknown command: ${command}`);
  if (rest.length > 1 && !(rest.length === 2 && rest[0] === '--options-file')) throw new Error('Pass one JSON argument or --options-file path');
  const options = rest[0] === '--options-file' ? JSON.parse(fs.readFileSync(rest[1], 'utf8')) : rest[0] ? JSON.parse(rest[0]) : {};
  const result = await invokeTool(commands[command], options);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (commands[command] === 'validate_episode_schema' && !result.valid) process.exitCode = 1;
}
main().catch((error) => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
