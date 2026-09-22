require('./runtime.cjs');
const { parentPort } = require('node:worker_threads');
const { generateEpisode } = require('./src/simulator.ts');
parentPort.on('message', async options => {
  try {
    const result = await generateEpisode(options);
    parentPort.postMessage({ line: JSON.stringify(result), summary: result.summary });
  } catch (error) { parentPort.postMessage({ error: error.message }); }
});
