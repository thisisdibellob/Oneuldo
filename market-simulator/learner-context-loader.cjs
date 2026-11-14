'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {Worker}=require('node:worker_threads');
const changed=()=>new Error('Learner archive changed during asynchronous verification');

/** Per-request workers only. No cross-begin memory/verification cache or fallback. */
class LearnerContextLoader {
  constructor(){this.pending=new Set();this.closed=false;}
  read(learnerFile){
    if(this.closed)return Promise.reject(new Error('Learner context loader is closed'));
    if(typeof learnerFile!=='string'||!learnerFile.length)return Promise.reject(new Error('Learner file is required'));
    const file=path.resolve(learnerFile);
    return new Promise((resolve,reject)=>{
      const worker=new Worker(path.join(__dirname,'learner-context-worker.cjs'),{workerData:{learnerFile:file}});
      const request={worker,reject,settled:false};this.pending.add(request);let response;
      const finish=(error,value)=>{if(request.settled)return;request.settled=true;this.pending.delete(request);error?reject(error):resolve(value);};
      request.cancel=()=>finish(new Error('Learner context loader is closed'));
      worker.once('message',message=>{response=message;});
      worker.once('error',error=>finish(error));
      worker.once('exit',code=>{
        if(code!==0)return finish(new Error('Learner verification worker exited: '+code));
        if(!response||typeof response.ok!=='boolean')return finish(new Error('Invalid learner verification worker response'));
        if(!response.ok){const error=new Error(response.error?.message??'Learner verification failed');error.name=response.error?.name??'Error';if(response.error?.code)error.code=response.error.code;return finish(error);}
        if(response.context?.source?.path!==file)return finish(new Error('Learner verification source path changed'));
        finish(null,response.context);
      });
    });
  }
  async assertCurrent(context){
    if(this.closed)throw new Error('Learner context loader is closed');
    const source=context?.source;if(!source||typeof source.path!=='string'||typeof source.sha256!=='string')throw changed();
    const before=await fs.promises.lstat(source.path);if(!before.isFile())throw changed();
    const bytes=await fs.promises.readFile(source.path),after=await fs.promises.lstat(source.path);
    for(const field of ['dev','ino','size','mtimeMs'])if(before[field]!==source[field]||after[field]!==source[field])throw changed();
    if(createHash('sha256').update(bytes).digest('hex')!==source.sha256)throw changed();
    if(this.closed)throw new Error('Learner context loader is closed');
  }
  async close(){
    this.closed=true;const requests=[...this.pending];
    for(const request of requests)request.cancel();
    await Promise.allSettled(requests.map(request=>request.worker.terminate()));
  }
}
module.exports={LearnerContextLoader};
