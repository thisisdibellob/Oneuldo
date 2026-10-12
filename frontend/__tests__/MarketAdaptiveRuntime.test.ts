import { applyAdaptiveMarketEnvironment, getMarketRuntimeContext, resolveMarketRuntimePlan, runtimeSettingLocks, type MarketRuntimePlan } from '../src/game/marketAdaptivePlan';
import { createMarketEnvironment } from '../src/game/marketEnvironment';
import { createMissionSession } from '../src/game/marketMissionSession';
import { applyMarketAction, type MarketSession } from '../src/game/marketSession';
import { buildMarketScenarioMission, getMarketProduct } from '../src/game/scenarios';

const runtime:MarketRuntimePlan={environment:{layoutId:'classic',employeeCount:3,customerCount:5,pillarCount:4,chairCount:4,cashierCount:1,kioskLane:'none',entranceConstruction:false},learning:{stockoutProductId:'banana',allowSubstitution:false,budgetChoiceEnabled:false,choiceBudget:3000,checkoutReviewMode:'normal'},matchRule:'exact',stockPerProduct:5,stockOverrides:{},alarmPenaltyPoints:10,wrongWayPenaltyPoints:10,cashierRequestPenaltyPoints:0};
const mission=()=>({...buildMarketScenarioMission('S01'),scenarioId:'CUSTOM',runtimePlan:runtime,environmentPlan:{shelfOrder:['drink','fresh','household','meal','produce'] as const,rationale:'배치 이동 기능 검사'}});
function visit(game:MarketSession,station:any){game=applyMarketAction(game,{type:'closeView'});game=applyMarketAction(game,{type:'setPosition',point:game.environment.stations[station as keyof typeof game.environment.stations]});game=applyMarketAction(game,{type:'interact',station});expect(game.lastActionError).toBeNull();return game;}
it.each(['classic','aisles','corner'] as const)('%s existing layout applies all chosen settings with reachable objectives/staff/checkout',(layoutId)=>{
 const m=mission();m.runtimePlan={...runtime,environment:{...runtime.environment,layoutId}};
 const previous=createMarketEnvironment({seed:'adaptive-reachability-'+layoutId});const world=applyAdaptiveMarketEnvironment(previous,m);const game=createMissionSession({seed:previous.seed},m,world);
 expect(game.environment.config.layoutId).toBe(layoutId);expect(game.environment.employees).toHaveLength(3);expect(game.environment.customers).toHaveLength(5);
 expect(game.learning.stockout?.requestedProductId).toBe('banana');expect(game.stock.banana).toBe(0);expect(game.stock.milk).toBe(5);
 expect(JSON.stringify(getMarketRuntimeContext(world)).length).toBeLessThan(30000);
});
it('stockout does not auto-pass: shelf/staff/requester resolution and remaining purchases are required',()=>{
 let game=createMissionSession({seed:'adaptive-stockout'},mission());
 game=applyMarketAction(visit(game,game.environment.checkouts.find(c=>game.cashierAvailability[c.id])!.id),{type:'submit'});expect(game.outcome).not.toBe('success');game=applyMarketAction(game,{type:'retry'});
 game=visit(game,'produce');game=visit(game,game.environment.stationDetails.find(s=>s.kind==='employee')!.id);game=applyMarketAction(game,{type:'checkStock',productId:'banana'});expect(game.learning.stockout?.staffChecked).toBe(true);
 game=applyMarketAction(game,{type:'viewRequester'});game=applyMarketAction(game,{type:'reportUnavailable',reason:'replacement-not-allowed'});expect(game.learning.stockout?.status).toBe('waived');expect(game.objectives.map(o=>o.productId)).toEqual(['milk']);
 game=visit(game,'fresh');game=applyMarketAction(game,{type:'add',productId:'milk',quantity:1});game=applyMarketAction(visit(game,game.environment.checkouts.find(c=>game.cashierAvailability[c.id])!.id),{type:'submit'});expect(game.outcome).toBe('success');expect(game.events.some(e=>e.type==='unavailable_reported')).toBe(true);
});
it('manual edits override the plan and expose only explicit locks',()=>{
 const m=mission();const game=createMissionSession({seed:'manual',environment:{employeeCount:1},learning:{stockoutEnabled:false}},m,undefined,true);
 expect(game.environment.employees).toHaveLength(1);expect(game.learning.stockout).toBeNull();expect(runtimeSettingLocks(game.config,game.environment,['environment.employeeCount','learning.stockoutEnabled'])).toEqual({'/runtimePlan/environment/employeeCount':1,'/runtimePlan/learning/stockoutProductId':null});
});
it('rejects unknown settings and impossible numeric values without silently changing them',()=>{
 expect(()=>resolveMarketRuntimePlan({...runtime,environment:{...runtime.environment,employeeCount:99}})).toThrow();expect(()=>resolveMarketRuntimePlan({...runtime,teleport:true})).toThrow();
});
