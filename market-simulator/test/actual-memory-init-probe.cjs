'use strict';
// Read-only technical probe. No actor plan, game input, model call or archive append.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{performance}=require('node:perf_hooks');
require('../runtime.cjs');
const WebSocket=require('../../frontend/node_modules/ws'),WebSocketServer=WebSocket.Server;
const old=require('../learner-store.cjs'),{LearnerContextLoader}=require('../learner-context-loader.cjs');
const {marketReplayFingerprint}=require('../../frontend/src/game/marketReplayTrace.ts');
const file=process.argv[2],output=process.argv[3];if(!file||!output)throw new Error('Provide only the current experiment learner path and a technical result path');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
(async()=>{
 const before=hash(fs.readFileSync(file)),started=performance.now();const state=old.readLearner(file),experience=old.getLearnerExperience(file,state.identity),legacySeconds=(performance.now()-started)/1000;
 if(hash(fs.readFileSync(file))!==before)throw new Error('Actual learner changed during baseline probe; retry only after current append completes');
 const server=new WebSocketServer({host:'127.0.0.1',port:0});await new Promise(resolve=>server.once('listening',resolve));
 server.on('connection',socket=>socket.on('message',bytes=>socket.send(bytes)));
 const client=new WebSocket('ws://127.0.0.1:'+server.address().port);await new Promise((resolve,reject)=>{client.once('open',resolve);client.once('error',reject);});
 let sent=0,received=0,last=performance.now(),maximumEchoGapMs=0;client.on('message',()=>{const now=performance.now();maximumEchoGapMs=Math.max(maximumEchoGapMs,now-last);last=now;received++;});
 const interval=setInterval(()=>{sent++;client.send(JSON.stringify({type:'technical-heartbeat',sequence:sent}));},25),loader=new LearnerContextLoader(),workerStarted=performance.now();
 let context;
 try{context=await loader.read(file);await loader.assertCurrent(context);}finally{clearInterval(interval);client.close();await loader.close();await new Promise(resolve=>server.close(resolve));}
 const workerSeconds=(performance.now()-workerStarted)/1000,after=hash(fs.readFileSync(file));
 const sameIdentity=JSON.stringify(context.identity)===JSON.stringify(state.identity),sameExperience=marketReplayFingerprint(context.experience)===marketReplayFingerprint(experience);
 if(before!==after||!sameIdentity||!sameExperience)throw new Error('Read-only source or verified context mismatch');
 if(received<3||maximumEchoGapMs>=1000)throw new Error('Main-loop WebSocket heartbeat continuity was not demonstrated');
 const report={scope:'Isolated read-only technical comparison; no new actual or persona play',learnerPath:path.resolve(file),rounds:state.rounds.length,sourceSha256Before:before,sourceSha256After:after,sameIdentity,sameExperience,experienceFingerprint:marketReplayFingerprint(experience),legacyDoubleValidationSeconds:legacySeconds,workerSingleValidationSeconds:workerSeconds,webSocketHeartbeatsSent:sent,webSocketHeartbeatsReceived:received,maximumEchoGapMs};
 fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
