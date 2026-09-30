const test=require('node:test');const assert=require('node:assert/strict');require('../runtime.cjs');
const {compactTraceTiming}=require('../src/traceTiming.ts');
const {generateTrace: originalGenerateTrace,validateTrace}=require('../src/simulator.ts');
const generateTrace = options => originalGenerateTrace({mode:'stochastic',...options});
const {createMarketSession}=require('../../frontend/src/game/marketSession.ts');
const {createMarketReplaySnapshot,marketReplayTraceId}=require('../../frontend/src/game/marketReplayTrace.ts');
const snapshot=createMarketReplaySnapshot(createMarketSession({seed:'timing-regression'}));
const withoutTiming=s=>{const c=structuredClone(s);delete c.reactionDelayMs;if(c.movement)delete c.movement.speedMultiplier;return c;};
test('compact generation preserves all decisions, target and memory while keeping original reproduction available',async()=>{
 const options={personaId:'mild-intellectual-disability-adult',seed:'timing-regression',snapshot};
 const original=await generateTrace({...options,timingProfile:'original'});const copy=structuredClone(original);
 const compact=await generateTrace(options);
 assert.deepEqual(compact.steps.map(withoutTiming),original.steps.map(withoutTiming));
 assert.deepEqual(compact.attentionExperience,original.attentionExperience);assert.deepEqual(compact.target,original.target);
 assert.equal(compact.generation.sourceTraceId,original.traceId);assert.equal(compact.generation.timingProfile,'compact-v1');
 assert.equal(validateTrace(compact,snapshot).valid,true);assert.deepEqual(original,copy);
 assert.deepEqual(compact,compactTraceTiming(original));assert.deepEqual(compactTraceTiming(compact),compact);
 const {traceId,...body}=compact;assert.equal(traceId,marketReplayTraceId(body));
 assert.ok(compact.steps.reduce((a,s)=>a+s.reactionDelayMs,0)<original.steps.reduce((a,s)=>a+s.reactionDelayMs,0));
});
test('continuous walking has no additional pause; decisions and explicit observation durations remain',()=>{
 const step=(type,extra={})=>({id:type,type,reactionDelayMs:8000,timeoutMs:120000,reason:'test',...extra});
 const walk=step('walkToAnchor',{target:{anchorId:'one'},movement:{style:'careful',speedMultiplier:.5,running:false,motorSeed:'a'}});
 const original={traceId:'source',steps:[walk,{...walk,id:'two'},step('readList',{durationMs:4000}),{...walk,id:'three'}]};
 const compact=compactTraceTiming(original);
 assert.deepEqual(compact.steps.map(s=>s.reactionDelayMs),[350,0,1500,350]);assert.equal(compact.steps[2].durationMs,4000);
 assert.equal(compact.steps[0].movement.speedMultiplier,.75);assert.equal(compact.steps[0].movement.running,false);
});
test('unknown timing presets fail before generation',async()=>{
 await assert.rejects(generateTrace({personaId:'careful-checker',seed:'x',snapshot,timingProfile:'turbo'}),/Unknown timingProfile/);
});
