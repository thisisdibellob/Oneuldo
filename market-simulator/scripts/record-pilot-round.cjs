#!/usr/bin/env node
'use strict';
// Collect already recorded app evidence. Never generates or POSTs behavior logs.
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {confirmedExperience,measureRound} = require('../pilot-evidence.cjs');
const [directory,traceName,replayId,database,priorFile,auditFlag] = process.argv.slice(2);
if (auditFlag && auditFlag !== '--allow-nonmonotonic-movement-timestamps') throw new Error('Unknown audit flag');
const options = {allowNonMonotonicMovementTimestamps:auditFlag === '--allow-nonmonotonic-movement-timestamps'};
if (!directory || !traceName || !/^[a-f0-9-]{36}$/.test(replayId??'') || !/^oneuldo_pilot_[a-z0-9_]+$/.test(database??'')) {
  throw new Error('Usage: record-pilot-round.cjs OUTPUT_DIR TRACE_FILENAME REPLAY_UUID oneuldo_pilot_NAME [PRIOR_EXPERIENCE_FILE]');
}
const dir=path.resolve(directory), file=path.resolve(dir,traceName);
if (path.dirname(file)!==dir || !file.endsWith('.json')) throw new Error('Trace must be a JSON file inside the run directory');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const trace=read(file), snapshot=read(file+'.snapshot.json');
let replay;
for (const line of fs.readFileSync(path.join(dir,'replay-manifest.jsonl'),'utf8').trim().split('\n')) {
  const item=JSON.parse(line); if(item.replayId===replayId) replay=item;
}
if (!replay || !/^[a-f0-9-]{36}$/.test(replay.sessionId??'') || !/^[a-f0-9-]{36}$/.test(replay.memberId??'')) throw new Error('No replay/session identity');
function query(sql){const raw=execFileSync('psql',['-X','-h','127.0.0.1','-p','5432','-d',database,'-qAt','-v','ON_ERROR_STOP=1','-c',`BEGIN READ ONLY; ${sql}; COMMIT;`],{encoding:'utf8'}).trim();return raw?JSON.parse(raw):null;}
const receipt=query(`WITH events AS (
  SELECT *,lag(occurred_at) OVER(ORDER BY event_sequence) previous_time FROM behavior_logs
  WHERE session_id='${replay.sessionId}' AND member_id='${replay.memberId}'
) SELECT json_build_object('sessionId','${replay.sessionId}','memberId','${replay.memberId}',
  'eventCount',count(*),'firstSequence',min(event_sequence),'lastSequence',max(event_sequence),
  'uniqueSequences',count(DISTINCT event_sequence),'uniqueClientEvents',count(DISTINCT client_event_id),
  'endEvents',count(*) FILTER(WHERE event_code='SHOP.SESSION_ENDED'),
  'timeReversals',count(*) FILTER(WHERE occurred_at<previous_time)) FROM events`);
if (receipt.timeReversals) receipt.timeReversalDetails=query(`WITH events AS (
 SELECT event_sequence,event_code,occurred_at,lag(occurred_at) OVER(ORDER BY event_sequence) previous_time,
 lag(event_code) OVER(ORDER BY event_sequence) previous_code FROM behavior_logs
 WHERE session_id='${replay.sessionId}' AND member_id='${replay.memberId}'
) SELECT json_agg(json_build_object('sequence',event_sequence,'eventCode',event_code,'previousEventCode',previous_code,
 'occurredAt',occurred_at,'previousTime',previous_time,'reversalMs',extract(epoch FROM previous_time-occurred_at)*1000))
 FROM events WHERE occurred_at<previous_time`);
const job=query(`SELECT row_to_json(j) FROM (SELECT id,session_id,status,stage,analysis_id,error_code,created_at,updated_at
 FROM ai_analysis_jobs WHERE session_id='${replay.sessionId}' AND member_id='${replay.memberId}' ORDER BY created_at DESC LIMIT 1) j`);
const prior=priorFile?read(path.resolve(priorFile)):undefined;
const experience=confirmedExperience(trace,snapshot,replay,receipt,prior,options);
const measurement=measureRound(trace,snapshot,replay,receipt,options);
const stem=file.replace(/\.json$/,'');
for(const [suffix,value] of Object.entries({replay,receipt,measurement,experience,job})) {
  fs.writeFileSync(`${stem}.${suffix}.json`,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
}
console.log(JSON.stringify({replayId,sessionId:replay.sessionId,measurement,analysisStatus:job?.status??'NOT_FOUND',
  analysisReady:job?.status==='READY',questLinkageVerified:false,experienceFile:path.basename(stem+'.experience.json')},null,2));
