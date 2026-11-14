import { playMarketTrace } from '../src/replay/player';
import { isMarketReplaySystemCompletionStep } from '../src/game/marketReplayTrace';
import { walkToStation, walkToVisibleStation, walkToObservedStation } from '../src/replay/motor';
jest.mock('../src/game/marketReplayTrace',()=>({validateMarketReplayTrace:jest.fn(()=>({valid:true,errors:[]})),isMarketReplaySystemCompletionStep:jest.fn((_trace,id)=>id==='controller')}));
jest.mock('../src/game/marketReplayPerception',()=>({replayPresentationKey:jest.fn(()=> 'fixed'),validateReplayPresentation:jest.fn(()=>true)}));
jest.mock('../src/replay/motor',()=>({createMotionReport:jest.fn(()=>({})),walkToStation:jest.fn(async()=>{}),walkToVisibleStation:jest.fn(async()=>{}),walkToObservedStation:jest.fn(async()=>{}),walkToAnchor:jest.fn(),moveDirection:jest.fn(),dragProduct:jest.fn()}));
test('actor walks remain local while only the validated controller suffix uses the normal full input motor',async()=>{
 const trace:any={traceSchemaVersion:'2',steps:[{id:'actor',type:'walkTo',target:{stationId:'fresh'},movement:{},reactionDelayMs:0,timeoutMs:1000,reason:'actor choice'},{id:'controller',type:'walkTo',target:{stationId:'checkout'},movement:{},reactionDelayMs:0,timeoutMs:1000,reason:'controller ending'}]};
 const ui:any={snapshot:()=>({presentation:{}}),read:()=>({briefing:true,briefingStep:0}),presentation:()=>({})};const motion:any={read:()=>({locked:false}),stop:jest.fn()};const progress=jest.fn();
 await playMarketTrace(trace,()=>ui,motion,new AbortController().signal,progress);
 expect(isMarketReplaySystemCompletionStep).toHaveBeenCalledWith(trace,'actor');expect(isMarketReplaySystemCompletionStep).toHaveBeenCalledWith(trace,'controller');
 expect(walkToVisibleStation).toHaveBeenCalledTimes(1);expect(walkToVisibleStation).toHaveBeenCalledWith(motion,'fresh',expect.anything(),expect.anything(),expect.anything(),expect.anything(),1000);
 expect(walkToStation).toHaveBeenCalledTimes(1);expect(walkToStation).toHaveBeenCalledWith(motion,'checkout',expect.anything(),expect.anything(),expect.anything(),1000);
 expect(progress.mock.calls.at(-1)?.[0].status).toBe('completed');
});
test('v11 alone routes actor-selected visible approaches to the new motor while the controller remains separate',async()=>{
 jest.clearAllMocks();
 const trace:any={traceSchemaVersion:'2',generation:{actorPolicyVersion:'episodic-choice-v11'},steps:[{id:'actor',type:'walkTo',target:{stationId:'fresh'},movement:{},reactionDelayMs:0,timeoutMs:1000,reason:'actor choice'},{id:'controller',type:'walkTo',target:{stationId:'checkout'},movement:{},reactionDelayMs:0,timeoutMs:1000,reason:'controller ending'}]};
 const ui:any={snapshot:()=>({presentation:{}}),read:()=>({briefing:true,briefingStep:0}),presentation:()=>({})};const motion:any={read:()=>({locked:false}),stop:jest.fn()};
 await playMarketTrace(trace,()=>ui,motion,new AbortController().signal,jest.fn());
 expect(walkToObservedStation).toHaveBeenCalledTimes(1);expect(walkToObservedStation).toHaveBeenCalledWith(motion,'fresh',expect.anything(),expect.anything(),expect.anything(),expect.anything(),1000);
 expect(walkToVisibleStation).not.toHaveBeenCalled();expect(walkToStation).toHaveBeenCalledTimes(1);
});
