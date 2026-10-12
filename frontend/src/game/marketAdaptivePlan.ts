import policy from '../../../shared/market/adaptive-policy.json';
import { createMarketEnvironment, getMarketLayoutSlots, getMarketLayoutStructure, isMarketEnvironmentBlocked, isNearMarketStation, type MarketEnvironment, type MarketEnvironmentConfig } from './marketEnvironment';
import type { MarketSessionConfig } from './marketSession';
import type { MarketMission } from './scenarios';
import { getMarketProduct } from './scenarios';

export type MarketRuntimePlan = {
  environment: { layoutId: 'classic'|'aisles'|'corner'; employeeCount: number; customerCount: number; pillarCount: number; chairCount: number;
    cashierCount: 0|1|2; kioskLane: 'none'|'checkout'|'checkout-2'; entranceConstruction: boolean };
  learning: { stockoutProductId: string|null; allowSubstitution: boolean; budgetChoiceEnabled: boolean; choiceBudget: number; checkoutReviewMode: 'normal'|'overcharge'|'random' };
  matchRule: 'exact'|'family'; stockPerProduct: number; stockOverrides: Record<string,number>;
  alarmPenaltyPoints: number; wrongWayPenaltyPoints: number; cashierRequestPenaltyPoints: number;
};
export type MarketObservationPlan = { purpose: string; behaviorObservation: string; movementObservation: string;
  behaviorEvidenceIds: string[]; movementEvidenceIds: string[]; alternativeExplanations: string[]; unknowns: string[];
  changeReasons: Array<{path:string;reason:string}>; evaluationFocus: string };
export type MarketRuntimeContext = { version: typeof policy.version; currentSettings: Partial<MarketEnvironmentConfig>; lockedSettings: Record<string,unknown>; layoutTemplates: unknown[] };

export function getMarketRuntimeContext(environment: MarketEnvironment, lockedSettings: Record<string,unknown> = {}): MarketRuntimeContext {
  return { version: policy.version, currentSettings: environment.config, lockedSettings,
    layoutTemplates: policy.layouts.map(id => {const layoutId=id as MarketRuntimePlan['environment']['layoutId'];
      return {layoutId, shelves: getMarketLayoutSlots(layoutId).shelves,
        structure: { world: environment.world, walls: getMarketLayoutStructure(layoutId).walls }, scope: 'Supported template; actual people/obstacles depend on chosen counts and seed. No observed outcome.'};}) };
}
export function resolveMarketRuntimePlan(value: unknown, required=false): MarketRuntimePlan|undefined {
  if(value==null){if(required)throw new Error('AI 연습 환경 설정이 빠져 있어요.');return;}
  const p=value as MarketRuntimePlan;
  const exact=(o:unknown,keys:string[])=>{if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).sort().join()!==keys.sort().join())throw new Error('AI 연습 환경 설정의 필드를 확인해 주세요.');};
  exact(p,['environment','learning','matchRule','stockPerProduct','stockOverrides','alarmPenaltyPoints','wrongWayPenaltyPoints','cashierRequestPenaltyPoints']);
  exact(p.environment,['layoutId','employeeCount','customerCount','pillarCount','chairCount','cashierCount','kioskLane','entranceConstruction']);
  exact(p.learning,['stockoutProductId','allowSubstitution','budgetChoiceEnabled','choiceBudget','checkoutReviewMode']);
  const range=(v:unknown,b:number[])=>{if(typeof v!=='number'||!Number.isInteger(v)||v<b[0]||v>b[1])throw new Error('AI 연습 환경 수치가 허용 범위를 벗어났어요.');};
  for(const f of ['employeeCount','customerCount','pillarCount','chairCount','cashierCount'] as const)range(p.environment[f],policy[f]);
  if(!policy.layouts.includes(p.environment.layoutId)||!policy.kioskLanes.includes(p.environment.kioskLane)||typeof p.environment.entranceConstruction!=='boolean'
    ||!['exact','family'].includes(p.matchRule)||!policy.checkoutReviewModes.includes(p.learning.checkoutReviewMode)
    ||typeof p.learning.allowSubstitution!=='boolean'||typeof p.learning.budgetChoiceEnabled!=='boolean'
    ||!(p.learning.stockoutProductId===null||typeof p.learning.stockoutProductId==='string'))throw new Error('AI 연습 환경 선택값을 확인해 주세요.');
  if(p.environment.kioskLane!=='none'&&p.environment.cashierCount>1)throw new Error('셀프 계산대를 사용할 때 계산원은 한 명까지 배치할 수 있어요.');
  range(p.stockPerProduct,policy.stockPerProduct);range(p.learning.choiceBudget,policy.choiceBudget);
  for(const f of ['alarmPenaltyPoints','wrongWayPenaltyPoints','cashierRequestPenaltyPoints'] as const)range(p[f],policy.penaltyPoints);
  if(!p.stockOverrides||typeof p.stockOverrides!=='object'||Array.isArray(p.stockOverrides))throw new Error('AI 재고 설정을 확인해 주세요.');
  for(const [id,count] of Object.entries(p.stockOverrides)){if(!getMarketProduct(id))throw new Error('등록되지 않은 재고 상품이에요.');range(count,[0,20]);}
  return JSON.parse(JSON.stringify(p));
}
export function runtimeSessionConfig(plan: MarketRuntimePlan): Partial<MarketSessionConfig> {
  const {stockoutProductId,...learning}=plan.learning;
  return {environment: {...plan.environment}, difficulty: plan.matchRule, stockPerProduct:plan.stockPerProduct,stockOverrides: {...plan.stockOverrides},
    alarmPenaltyPoints:plan.alarmPenaltyPoints,wrongWayPenaltyPoints:plan.wrongWayPenaltyPoints,cashierRequestPenaltyPoints:plan.cashierRequestPenaltyPoints,
    learning:{...learning,stockoutEnabled:stockoutProductId!==null,stockoutProductId}};
}
export function runtimeSettingLocks(config:MarketSessionConfig,environment:MarketEnvironment,paths:string[]):Record<string,unknown> {
  const locks:Record<string,unknown>={};
  for(const path of paths){
    if(path==='environment.shelfOrder'){locks['/environmentPlan/shelfOrder']=Object.entries(environment.shelves).sort((a,b)=>
      getMarketLayoutSlots(environment.config.layoutId).shelves.findIndex(s=>s.slotId===a[1].slotId)-getMarketLayoutSlots(environment.config.layoutId).shelves.findIndex(s=>s.slotId===b[1].slotId)).map(([id])=>id);continue;}
    if(path.startsWith('environment.')){const field=path.split('.')[1];const counts:Record<string,number>={employeeCount:environment.employees.length,customerCount:environment.customers.length,pillarCount:environment.objects.filter(o=>o.kind==='pillar').length,chairCount:environment.objects.filter(o=>o.kind==='chair').length,cashierCount:environment.checkouts.filter(c=>c.cashierPresent).length};
      const value=counts[field]??(config.environment as Record<string,unknown>)[field];
      if(['layoutId','employeeCount','customerCount','pillarCount','chairCount','cashierCount','kioskLane','entranceConstruction'].includes(field))locks['/runtimePlan/environment/'+field]=value;
    } else if(path.startsWith('learning.')) {const field=path.split('.')[1];
      if(field==='stockoutEnabled'||field==='stockoutProductId')locks['/runtimePlan/learning/stockoutProductId']=config.learning?.stockoutEnabled?(config.learning.stockoutProductId??config.objectives[0].productId):null;
      else if(['allowSubstitution','budgetChoiceEnabled','choiceBudget','checkoutReviewMode'].includes(field))locks['/runtimePlan/learning/'+field]=(config.learning as Record<string,unknown>)[field];
    } else if(path==='difficulty')locks['/runtimePlan/matchRule']=config.difficulty;
    else if(['stockPerProduct','stockOverrides','alarmPenaltyPoints','wrongWayPenaltyPoints','cashierRequestPenaltyPoints'].includes(path))locks['/runtimePlan/'+path]=(config as unknown as Record<string,unknown>)[path];
  }return locks;
}
export function applyAdaptiveMarketEnvironment(previous:MarketEnvironment,mission:MarketMission):MarketEnvironment {
  const plan=resolveMarketRuntimePlan(mission.runtimePlan,true)!;
  const environment=createMarketEnvironment({...plan.environment,seed:previous.seed,shelfOrder:mission.environmentPlan?.shelfOrder});
  assertAdaptiveReachability(environment,mission);
  return environment;
}
/** Traversal uses the same collision footprint as gameplay; proximity alone is insufficient. */
export function assertAdaptiveReachability(environment:MarketEnvironment,mission:MarketMission) {
  const step=12,start=environment.spawn;
  const required=new Set<string>([...mission.objectives.map(o=>getMarketProduct(o.productId)!.categoryId),
    ...(mission.runtimePlan?.learning.budgetChoiceEnabled?['drink']:[])]);
  const reached=new Set<string>();let staff=false,checkout=false;
  const queue=[start],seen=new Set<string>(['0,0']);let cursor=0;
  while(cursor<queue.length){const point=queue[cursor++];
    for(const id of required)if(!reached.has(id)&&isNearMarketStation(environment,id as keyof MarketEnvironment['stations'],point))reached.add(id);
    if(!staff)staff=environment.employees.some(e=>isNearMarketStation(environment,`staff:${e.id}`,point));
    if(!checkout)checkout=environment.checkouts.some(c=>isNearMarketStation(environment,c.id,point))||environment.kiosks.some(k=>isNearMarketStation(environment,k.id,point));
    if(reached.size===required.size&&staff&&checkout)return;
    for(const [dx,dy] of [[step,0],[-step,0],[0,step],[0,-step]]){const next={x:point.x+dx,y:point.y+dy};const key=`${Math.round((next.x-start.x)/step)},${Math.round((next.y-start.y)/step)}`;
      if(seen.has(key)||next.x<0||next.y<0||next.x>environment.world.width||next.y>environment.world.height)continue;
      seen.add(key);if(!isMarketEnvironmentBlocked(environment,next)&&!isMarketEnvironmentBlocked(environment,{x:point.x+dx/2,y:point.y+dy/2}))queue.push(next);
    }
  }
  throw new Error('추천 배치에서 목표 매대·직원·계산대로 가는 통로를 확인하지 못했어요. 배치를 다시 생성해 주세요.');
}
