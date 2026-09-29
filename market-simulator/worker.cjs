require('./runtime.cjs');
const { parentPort } = require('node:worker_threads');
const { generateTrace, summarizeTrace } = require('./src/simulator.ts');
parentPort.on('message', async options => {
  try {
    const result = await generateTrace(options);
    parentPort.postMessage({ line: JSON.stringify(result), summary: summarizeTrace(result) });
  } catch (error) { parentPort.postMessage({ error: error.message }); }
});
