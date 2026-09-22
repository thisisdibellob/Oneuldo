const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
require('../runtime.cjs').register();
const { generateEpisode } = require('../src/simulator.ts');
const { exportToBackend, loadExportTarget, stableBatchId } = require('../src/backendExport.ts');
test('export needs explicit isolated targets and blocks production/non-loopback local', () => {
  const previous = process.env.MARKET_SIM_TARGETS;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'market-targets-'));
  try {
    delete process.env.MARKET_SIM_TARGETS;
    assert.throws(() => loadExportTarget('local'), /No backend target/);
    assert.throws(() => loadExportTarget('production'), /production export is disabled/);
    const config = path.join(directory, 'targets.json'); process.env.MARKET_SIM_TARGETS = config;
    fs.writeFileSync(config, JSON.stringify({ local: { baseUrl: 'http://example.com', isolated: true } }));
    assert.throws(() => loadExportTarget('local'), /loopback/);
    fs.writeFileSync(config, JSON.stringify({ local: { baseUrl: 'http://127.0.0.1:9090', isolated: false } }));
    assert.throws(() => loadExportTarget('local'), /isolated:true/);
    fs.writeFileSync(config, JSON.stringify({ staging: { baseUrl: 'http://staging.example.com', isolated: true } }));
    assert.throws(() => loadExportTarget('staging'), /HTTPS/);
  } finally { if (previous === undefined) delete process.env.MARKET_SIM_TARGETS; else process.env.MARKET_SIM_TARGETS = previous; fs.rmSync(directory, { recursive: true, force: true }); }
});
test('export validates all rows before upload, caps batches at 50 and retries identical IDs/body', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'market-export-'));
  const previous = process.env.MARKET_SIM_TARGETS;
  const requests = []; let failFirst = true;
  const server = http.createServer((request, response) => {
    let body = ''; request.on('data', (chunk) => { body += chunk; }); request.on('end', () => {
      const payload = JSON.parse(body); requests.push({ path: request.url, body, payload });
      if (failFirst) { failFirst = false; response.writeHead(503); response.end('{}'); return; }
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ batchId: payload.batchId, events: payload.events.map((event) => ({ id: event.metadata.clientEventId, clientEventId: event.metadata.clientEventId, eventSequence: event.metadata.eventSequence, status: 'ACCEPTED', receivedAt: '2026-01-01T00:00:00.000Z' })) }));
    });
  });
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const config = path.join(directory, 'targets.json'); process.env.MARKET_SIM_TARGETS = config;
    fs.writeFileSync(config, JSON.stringify({ local: { baseUrl: `http://127.0.0.1:${server.address().port}`, isolated: true } }));
    const sample = await generateEpisode({ personaId: 'careful-checker', seed: 'export-test' });
    const file = path.join(directory, 'batch.jsonl');
    fs.writeFileSync(file, JSON.stringify(sample) + '\n{"broken":true}\n');
    await assert.rejects(exportToBackend({ batchFilePath: file, targetEnv: 'local' }), /JSONL line 2/);
    assert.equal(requests.length, 0);
    fs.writeFileSync(file, JSON.stringify(sample) + '\n');
    const result = await exportToBackend({ batchFilePath: file, targetEnv: 'local' });
    assert.equal(result.acceptedCount, sample.behaviorLogs.length);
    assert.equal(requests[0].body, requests[1].body);
    assert.equal(stableBatchId(requests[0].payload.events), requests[0].payload.batchId);
    assert.ok(requests.every((request) => request.path === '/api/behavior-logs/batches' && request.payload.events.length <= 50));
    assert.equal(result.batchCount, Math.ceil(sample.behaviorLogs.length / 50));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (previous === undefined) delete process.env.MARKET_SIM_TARGETS; else process.env.MARKET_SIM_TARGETS = previous;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
