import { createMarketEnvironment, isNearMarketStation } from '../src/game/marketEnvironment';
import { resolveMarketEnvironmentMovement } from '../src/game/marketMovement';
import { DEFAULT_REPLAY_PRESENTATION, wholeReplayWaypointCatalog, canApproachVisibleStation } from '../src/game/marketReplayPerception';
import { createMotionReport, walkToObservedStation, walkToVisibleStation } from '../src/replay/motor';
import type { ReplayMotionPort } from '../src/replay/ports';

const presentation={...DEFAULT_REPLAY_PRESENTATION,viewport:{width:1280,height:720}};
const environment=createMarketEnvironment({seed:'observed-approach',layoutId:'classic',employeeCount:1,customerCount:1,pillarCount:0,chairCount:0,cashierCount:2,kioskLane:'none',shelfOrder:['drink','meal','household','fresh','produce']});
const cashiers={checkout:true,'checkout-2':true};
const movement={speedMultiplier:1,accelerationMs:100};
beforeEach(()=>{jest.useFakeTimers();jest.setSystemTime(0)});
afterEach(()=>{jest.clearAllTimers();jest.useRealTimers()});
test('visible target approach reaches interaction distance with ordinary movement and no hidden route or teleport',async()=>{
 const target=wholeReplayWaypointCatalog(environment,cashiers).find(p=>canApproachVisibleStation(environment,p.point,'fresh',presentation,cashiers)&&!isNearMarketStation(environment,'fresh',p.point));expect(target).toBeDefined();
 let position={...target!.point},driver:((timestamp:number,dt:number)=>{x:number;y:number})|undefined;
 const port:ReplayMotionPort={read:()=>({position:{...position},environment,cashiers,locked:false,presentation}),
  drive:jest.fn(fn=>{driver=fn}),stop:jest.fn(()=>{driver=undefined})};
 await expect(walkToVisibleStation(port,'fresh',presentation,movement,new AbortController().signal,createMotionReport())).rejects.toThrow(/nearby affordance/);
 const report=createMotionReport();let settled=false,error:unknown;
 const run=walkToObservedStation(port,'fresh',presentation,movement,new AbortController().signal,report).then(()=>{settled=true},e=>{settled=true;error=e});
 let integrated=0;
 for(let i=0;i<2000&&!settled;i++){
  await Promise.resolve();jest.advanceTimersByTime(16);
  if(driver){const input=driver(Date.now(),.016);position=resolveMarketEnvironmentMovement(environment,position,{x:input.x*190*.016,y:input.y*190*.016},cashiers).position;integrated++;}
 }
 await run;expect(error).toBeUndefined();expect(integrated).toBeGreaterThan(1);expect(isNearMarketStation(environment,'fresh',position)).toBe(true);
 expect(report.frames).toBeGreaterThan(1);expect(report.inputViolations).toBe(0);expect(report.displacementViolations).toBe(0);expect(report.replans).toBe(0);
});
test('unobserved targets fail before any movement input',async()=>{
 const drive=jest.fn();const port={read:()=>({position:environment.spawn,environment,cashiers,locked:false,presentation}),drive,stop:jest.fn()} as unknown as ReplayMotionPort;
 await expect(walkToObservedStation(port,'fresh',presentation,movement,new AbortController().signal,createMotionReport())).rejects.toThrow(/currently visible/);expect(drive).not.toHaveBeenCalled();
});
