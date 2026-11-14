'use strict';
const {parentPort,workerData}=require('node:worker_threads');
try {
  // Every request runs the existing complete archive verifier exactly once.
  // Return the verified identity/derived memory, never the large raw round archive.
  const context=require('./learner-store.cjs').readVerifiedLearnerContext(workerData.learnerFile);
  parentPort.postMessage({ok:true,context});
} catch(error) {
  parentPort.postMessage({ok:false,error:{name:error.name,message:error.message,...(error.code?{code:error.code}:{})}});
} finally {parentPort.close();}
