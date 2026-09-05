// Read-only local audit. Usage: node scripts/verify-compact-analysis.mjs OLD_RUN_UUID NEW_RUN_UUID
// Prints metrics only; no prompts, account credentials or behavioral contents are exported.
import { execFileSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
const [beforeId, afterId] = process.argv.slice(2);
const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
if (!uuid.test(beforeId ?? '') || !uuid.test(afterId ?? '')) throw new Error('Two analysis UUIDs required');
function load(id) {
  const sql = `SELECT json_build_object('datasetId',dataset_id,'prompt',input_prompt,'status',status,'errorCode',error_code,'latencyMs',latency_ms,'attempts',attempts) FROM ai_behavior_analyses WHERE id='${id}';`;
  return JSON.parse(execFileSync('docker', ['exec', 'oneuldo-postgres', 'psql', '-U', 'oneuldo', '-d', 'oneuldo', '-Atc', sql], { encoding:'utf8', maxBuffer:32*1024*1024 }));
}
function stripNulls(value) {
  if (Array.isArray(value)) return value.map(stripNulls);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([,v]) => v !== null).map(([k,v]) => [k,stripNulls(v)]));
  return value;
}
function merge(a,b) {
  for (const [key,value] of Object.entries(b)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && a[key] && typeof a[key] === 'object' && !Array.isArray(a[key])) merge(a[key],value);
    else a[key]=value;
  }
  return a;
}
function expand(source) {
  const result=structuredClone(source);
  if(result.encoding!=='behavior-timeline-compact-v1') throw new Error('Unexpected encoding');
  delete result.encoding; delete result.encodingRules; delete result.movementColumns;
  for(const session of result.sessions) {
    session.events=session.events.map(encoded => {
      let event;
      if(Array.isArray(encoded)) {
        if(encoded.length!==12 || encoded[0]!=='M') throw new Error('Invalid movement');
        event=encoded[11];
        ['behaviorLogId','sequence','elapsedFromSessionStartMs','occurredAt','receivedAt','contextRef'].forEach((key,i)=>{if(encoded[i+1]!==null) event[key]=encoded[i+1];});
        event.payload ??={}; event.action ??={};
        ['x','y','blocked','controlMode'].forEach((key,i)=>{if(encoded[i+7]!==null) event.payload[key]=encoded[i+7];});
        event.action.eventCode='SHOP.MOVEMENT_SAMPLED';
      } else event=encoded;
      const context=session.contexts[event.contextRef];
      if(!context) throw new Error('Missing context');
      delete event.contextRef;
      return merge(structuredClone(context),event);
    });
    delete session.contexts;
  }
  return result;
}
function decodeTables(value) {
  if(Array.isArray(value)) return value.map(decodeTables);
  if(!value || typeof value!=='object') return value;
  const object = obj => Object.fromEntries(Object.entries(obj).map(([k,v])=>[k,decodeTables(v)]));
  if(Object.hasOwn(value,'$literal')) return object(value.$literal);
  if(!Object.hasOwn(value,'$table')) return object(value);
  return value.rows.map(row=>{
    if(row.length!==value.$table.length) throw new Error('Invalid table row');
    const item=object(value.defaults);
    row.forEach((cell,i)=>{if(!(cell && typeof cell==='object' && Object.keys(cell).length===1 && cell.$missing===true)) item[value.$table[i]]=decodeTables(cell);});
    return item;
  });
}
const before=load(beforeId),after=load(afterId);
const beforePrompt=decodeTables(JSON.parse(before.prompt)),afterPrompt=decodeTables(JSON.parse(after.prompt));
const actual=expand(afterPrompt.behaviorTimeline);
if (afterPrompt.referenceEncoding) {
  if(!uuid.test(after.datasetId)) throw new Error('Invalid dataset UUID');
  const snapshot=JSON.parse(execFileSync('docker',['exec','oneuldo-postgres','psql','-U','oneuldo','-d','oneuldo','-Atc',
    `SELECT input_data FROM behavior_analysis_input_snapshots WHERE id='${after.datasetId}';`],{encoding:'utf8',maxBuffer:32*1024*1024}));
  const refs=new Map(); let s=0,e=0;
  for(const session of snapshot.sessions) {
    refs.set(`S${++s}`,session.sessionId);
    for(const event of session.events) refs.set(`E${++e}`,event.behaviorLogId);
  }
  if(afterPrompt.referenceEncoding.includes('U숫자')) {
    const originals=new Set(refs.values());
    function collect(value) {
      if(typeof value==='string' && uuid.test(value)) {
        if(!originals.has(value)) {refs.set(`U${refs.size+1}`,value);originals.add(value);}
      } else if(Array.isArray(value)) value.forEach(collect);
      else if(value && typeof value==='object') Object.keys(value).sort().forEach(key=>collect(value[key]));
    }
    collect(snapshot);
  }
  function restore(value) {
    if(value && typeof value==='object') {
      for(const key of Object.keys(value)) {
        if(typeof value[key]==='string' && refs.has(value[key])) value[key]=refs.get(value[key]);
        else restore(value[key]);
      }
    }
  }
  restore(actual);
}
const expected=beforePrompt.behaviorTimeline.encoding ? expand(beforePrompt.behaviorTimeline) : stripNulls(beforePrompt.behaviorTimeline);
if(before.datasetId!==after.datasetId || !isDeepStrictEqual(actual,expected)) throw new Error('Timeline preservation check failed');
const events=actual.sessions.flatMap(s=>s.events);
const leafPrompts=after.attempts.map(a=>a.inputPrompt).filter(p=>p.includes('OBSERVE:') && /\n구간 \d+\/\d+/.test(p));
const leafEventIds=[]; const seenChunks=new Set();
for(const prompt of leafPrompts) {
  const chunk=prompt.match(/\n구간 (\d+)\/(\d+)/);
  if(seenChunks.has(chunk[1])) continue; // One format retry is not a second observation segment.
  seenChunks.add(chunk[1]);
  const wire=decodeTables(JSON.parse(prompt.slice(0,prompt.indexOf('\n구간 '))));
  leafEventIds.push(...expand(wire.behaviorTimeline).sessions.flatMap(s=>s.events.map(e=>e.behaviorLogId)));
}
const allExpectedAliases=events.map((_,i)=>`E${i+1}`);
console.log(JSON.stringify({
  sameDataset:true,allSanitizedObservationsPreserved:true,eventCount:events.length,
  movementCount:events.filter(e=>e.action?.eventCode==='SHOP.MOVEMENT_SAMPLED').length,
  beforeChars:before.prompt.length,afterChars:after.prompt.length,
  reductionPercent:Math.round((1-after.prompt.length/before.prompt.length)*10000)/100,
  contextCounts:afterPrompt.behaviorTimeline.sessions.map(s=>Object.keys(s.contexts).length),
  supplementalProductCount:afterPrompt.matchingContentCatalog?.products?.length ?? 0,
  rawEventsInAttemptedLeafRequests:leafEventIds.length,
  allRawEventsSentInOrder:leafEventIds.length>0 && isDeepStrictEqual(leafEventIds,allExpectedAliases),
  chunks:after.attempts[0]?.inputPrompt.match(/구간 1\/(\d+)/)?.[1] ?? null,
  attempts:after.attempts.length,status:after.status,errorCode:after.errorCode,latencyMs:after.latencyMs,
},null,2));
