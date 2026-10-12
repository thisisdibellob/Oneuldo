import { createMarketEnvironment } from '../src/game/marketEnvironment';
import { getMarketEnvironmentContext } from '../src/game/marketEnvironmentPlan';
import { getMarketRuntimeContext } from '../src/game/marketAdaptivePlan';
process.env.EXPO_PUBLIC_API_URL='http://quest-jobs-test';
const {getMarketAiQuest,marketQuestProgressText}=require('../src/api/marketPersonalization') as typeof import('../src/api/marketPersonalization');
const originalFetch=global.fetch;
afterEach(()=>{global.fetch=originalFetch;jest.useRealTimers();});
const context=()=>{const world=createMarketEnvironment({seed:'job-test'});return {...getMarketEnvironmentContext(world),runtimeContext:getMarketRuntimeContext(world)};};
it('shares one running request, restores progress for another subscriber, and terminates on server timeout',async()=>{
 jest.useFakeTimers();const first=jest.fn(),second=jest.fn();
 global.fetch=jest.fn().mockResolvedValueOnce({ok:true,json:async()=>({jobId:'j1',status:'RUNNING',stage:'ANALYZING_MOVEMENT',elapsedMs:1000,deadlineSeconds:300})}).mockResolvedValueOnce({ok:true,json:async()=>({jobId:'j1',status:'FAILED',stage:'FAILED',elapsedMs:300000,deadlineSeconds:300,errorCode:'QUEST_GENERATION_TIMEOUT'})});
 const a=getMarketAiQuest('one',context(),first);const failure=expect(a).rejects.toThrow('5분');await Promise.resolve();await Promise.resolve();await Promise.resolve();const b=getMarketAiQuest('one',context(),second);expect(b).toBe(a);
 await jest.advanceTimersByTimeAsync(1600);await failure;expect(global.fetch).toHaveBeenCalledTimes(2);expect(first).toHaveBeenCalledWith(expect.objectContaining({stage:'ANALYZING_MOVEMENT'}));expect(second).toHaveBeenCalledWith(expect.objectContaining({jobId:'j1'}));
});
it('rejects malformed successful status rather than polling without a job',async()=>{
 global.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>({quest:{}})});await expect(getMarketAiQuest('bad',context())).rejects.toThrow('응답 형식');expect(global.fetch).toHaveBeenCalledTimes(1);
});
it('describes actual phase and elapsed server time',()=>{expect(marketQuestProgressText({jobId:'j',status:'RUNNING',stage:'REPAIRING',elapsedMs:45000,deadlineSeconds:300})).toContain('수정하고 있어요 · 45초 / 최대 300초');});

it('continues polling past five minutes within the server deadline and uses its timeout duration',async()=>{
 jest.useFakeTimers();let expired=false;
 global.fetch=jest.fn().mockImplementation(async()=>({ok:true,json:async()=>({jobId:'long-job',status:expired?'FAILED':'RUNNING',stage:expired?'FAILED':'ANALYZING_MOVEMENT',elapsedMs:expired?3600000:360000,deadlineSeconds:3600,...(expired?{errorCode:'QUEST_GENERATION_TIMEOUT'}:{})})}));
 const progress=jest.fn();const request=getMarketAiQuest('long-source',context(),progress);let settled=false;request.then(()=>{settled=true;},()=>{settled=true;});
 const failure=expect(request).rejects.toThrow('60분');
 await jest.advanceTimersByTimeAsync(320000);
 expect(settled).toBe(false);expect(global.fetch).toHaveBeenCalledTimes(214);
 expired=true;await jest.advanceTimersByTimeAsync(1600);await failure;
});
it('limits a resumed job by its remaining server time rather than granting a new full deadline',async()=>{
 jest.useFakeTimers();
 global.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>({jobId:'resumed-job',status:'RUNNING',stage:'REVIEWING',elapsedMs:3599000,deadlineSeconds:3600})});
 const request=getMarketAiQuest('resumed',context());const failure=expect(request).rejects.toThrow('생성 상태');
 await jest.advanceTimersByTimeAsync(18000);await failure;
});
