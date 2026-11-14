import { playMarketTrace, type ReplayProgress } from '../src/replay/player';
import type { ReplayUiPort, ReplayMotionPort } from '../src/replay/ports';
import type { MarketReplayTrace } from '../src/game/marketReplayTrace';
jest.mock('../src/game/marketReplayTrace', () => ({ validateMarketReplayTrace: () => ({ valid: true, errors: [] }) }));
beforeEach(() => jest.useFakeTimers());
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });
test('replay opens the actual menu before asking the selected objective and never alters the cart', async () => {
  let menu=false, briefing=true, phase='shopping';const cart={milk:1},calls:string[]=[];
  const ui={snapshot:()=>({}),sessionId:()=> 'location-probe',
    read:()=>({briefing,briefingStep:0,phase,staffOpen:true,staffLocationHelp:menu,cart}),
    advanceBriefing:()=>{briefing=false},
    openLocationHelp:()=>{menu=true;calls.push('menu')},
    askLocation:(id:string)=>{expect(menu).toBe(true);calls.push(id)},
    backToStaff:()=>{menu=false;calls.push('back')},
    giveUp:()=>{phase='finished'}, skipRating:()=>{},leave:async()=>{},
  } as unknown as ReplayUiPort;
  const motion={read:()=>({locked:false}),stop:()=>{}} as unknown as ReplayMotionPort;
  const trace={steps:[{type:'start'},...['openLocationHelp','askLocation','backToStaff'].map(choice=>({type:'talkToStaff',stationId:'staff:probe',choice, ...(choice==='askLocation'?{objectiveId:'objective-1'}:{})})),{type:'giveUp'},{type:'skipRating'},{type:'leave'}].map((s,i)=>({...s,id:String(i),reactionDelayMs:0,timeoutMs:3000,reason:'interface regression'}))} as unknown as MarketReplayTrace;
  const progress:ReplayProgress[]=[];const run=playMarketTrace(trace,()=>ui,motion,new AbortController().signal,p=>progress.push(p));
  await jest.advanceTimersByTimeAsync(20000);await run;
  expect(progress.at(-1)?.status).toBe('completed');expect(calls).toEqual(['menu','objective-1','back']);expect(cart).toEqual({milk:1});
});
