'use strict';
// Argument checking and trace file helpers shared by tool modules.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '..');
function checkArguments(value, contract, at = 'arguments') {
  if (contract.anyOf) { if (!contract.anyOf.some(option => { try { checkArguments(value, option, at); return true; } catch { return false; } })) throw new Error(`${at}: invalid value`); return; }
  if (contract.enum && !contract.enum.includes(value)) throw new Error(`${at}: expected ${contract.enum.join(' | ')}`);
  if (contract.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${at}: expected object`);
    for (const key of contract.required ?? []) if (!Object.hasOwn(value, key)) throw new Error(`${at}.${key}: required`);
    for (const [key, child] of Object.entries(value)) {
      if (Object.hasOwn(contract.properties ?? {}, key)) checkArguments(child, contract.properties[key], `${at}.${key}`);
      else if (contract.additionalProperties === false) throw new Error(`${at}.${key}: unknown argument`);
    }
  }
  if (contract.type === 'string' && (typeof value !== 'string' || !value.trim())) throw new Error(`${at}: expected nonempty string`);
  if (contract.type === 'array' && !Array.isArray(value)) throw new Error(`${at}: expected array`);
  if (contract.type === 'boolean' && typeof value !== 'boolean') throw new Error(`${at}: expected boolean`);
  if (['number', 'integer'].includes(contract.type)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || (contract.type === 'integer' && !Number.isInteger(value))) throw new Error(`${at}: expected ${contract.type}`);
    if ((contract.minimum !== undefined && value < contract.minimum) || (contract.maximum !== undefined && value > contract.maximum)) throw new Error(`${at}: out of range`);
  }
}
function readJson(file) { return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')); }
function readTrace(args) {
  if (Boolean(args.trace) === Boolean(args.traceFilePath)) throw new Error('Provide exactly one of trace or traceFilePath.');
  return args.trace ?? readJson(args.traceFilePath);
}
function saveTrace(trace, snapshot, outputPath) {
  const destination = path.resolve(outputPath ?? path.join(ROOT, 'output', `trace-${crypto.randomUUID()}.json`));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const snapshotDestination = `${destination}.snapshot.json`;
  fs.writeFileSync(snapshotDestination, JSON.stringify(snapshot, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  try { fs.writeFileSync(destination, JSON.stringify(trace, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); }
  catch (error) { fs.unlinkSync(snapshotDestination); throw error; }
  return { outputPath: destination, snapshotFilePath: snapshotDestination, traceId: trace.traceId,
    personaId: trace.personaId, personaVersion: trace.personaVersion, steps: trace.steps.length, target: trace.target,
    ending: require('../src/simulator.ts').summarizeTrace(trace).ending,
    controlledStop: trace.generation?.controlledStop ?? null,
    systemCompletion: trace.generation?.systemCompletion ?? null };
}
module.exports = { checkArguments, readJson, readTrace, saveTrace };
