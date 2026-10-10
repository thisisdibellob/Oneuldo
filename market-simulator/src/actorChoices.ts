import { createHash } from 'node:crypto';
import type { ActorObservation, AttentionMemory, Decision } from './types';
export type ActorChoice = { id: string; label: string; action: Decision['action']; effect?: string;
  observedContext?: { label: string; direction: string; distanceBand: string; recordedArrivals: number; currentLocation: boolean } };
/** Enumerate available controls, never rank products, supply a correct answer, or choose for the actor. */
export function actorChoices(o: ActorObservation, memory?: { anchors: AttentionMemory['anchors']; currentAnchor: string | null }): ActorChoice[] {
  const actions: Decision['action'][]=[];
  if (o.phase === 'shopping') {
    if (o.view === 'cart' || o.view === 'help') {
      actions.push({type:'closeView'});
      if (o.cart) for (const [productId,n] of Object.entries(o.cart).filter(([id]) => o.removableProductIds?.includes(id)))
        for(let quantity=1;quantity<=n;quantity++) actions.push({type:'remove',productId,quantity});
    } else if (o.activeStation) {
      actions.push({type:'closeStation'});
      if (o.shelf) {
        actions.push({type:'viewCart'});
        for(const p of o.products) for(let quantity=1;quantity<=Math.min(99,p.stock);quantity++) actions.push({type:'add',productId:p.id,quantity});
        for(const scrollFraction of o.shelf.pageFractions ?? []) actions.push({type:'browse',scrollFraction,durationMs:1500});
      }
      if(o.activeStation.startsWith('staff:')) for(const [id,available] of Object.entries(o.cashiers))
        if(available===false) actions.push({type:'requestCashier',checkoutId:id as 'checkout'|'checkout-2'});
    } else {
      actions.push({type:'viewCart'},{type:'viewHelp'});
      if(o.listAvailable) actions.push({type:'readList',durationMs:2000});
      for(const a of o.anchors) actions.push({type:'walkToAnchor',anchorId:a.id});
      for(const s of o.visibleStations.filter(s=>s.near)) {
        if(s.kind==='shelf'||s.kind==='employee') actions.push({type:'interact',station:s.id});
        if(s.kind==='checkout') actions.push({type:'checkout',checkoutId:s.id as 'checkout'|'checkout-2'});
      }
    }
    actions.push({type:'lookAround',durationMs:1500},{type:'pause',durationMs:1500},{type:'giveUp'});
  } else if(o.phase==='checkout') {
    actions.push({type:'closeStation'},{type:'giveUp'});
    if(o.activeStation && o.cashiers[o.activeStation]) actions.push({type:'submit'});
  }
  return actions.map(action=>{
    const anchor=action.type==='walkToAnchor' ? o.anchors.find(a=>a.id===action.anchorId) : undefined;
    const station=action.type==='interact' ? o.visibleStations.find(s=>s.id===action.station) : undefined;
    const product=action.type==='add' ? o.products.find(p=>p.id===action.productId) : undefined;
    const labels: Partial<Record<Decision['action']['type'], string>> = {
      readList:'화면의 장보기 목록 읽기',viewCart:'장바구니 보기',viewHelp:'이용 방법 보기',
      closeView:'열린 화면 닫기',closeStation:'진열대 또는 대화 닫기',giveUp:'이번 장보기 그만하기',
      lookAround:'현재 자리에서 주변 보기',pause:'현재 자리에서 잠시 멈추기',submit:'AI 수행 검토 요청하기',
    };
    const label = anchor ? `${anchor.label}로 걷기` : station ? `${station.label} ${station.kind==='employee'?'말 걸기':'살펴보기'}`
      : product && action.type==='add' ? `${product.name} ${action.quantity ?? 1}개 담기`
      : action.type==='checkout' || action.type==='requestCashier' ? `${action.checkoutId==='checkout-2'?2:1}번 계산대 ${action.type==='checkout'?'이용하기':'직원 호출하기'}`
      : action.type==='browse' ? `진열대 스크롤 ${Math.round(action.scrollFraction*100)}% 위치 보기`
      : action.type==='remove' ? `장바구니의 ${action.productId} ${action.quantity ?? 1}개 내려놓기`
      : labels[action.type] ?? action.type;
    return {id:`choice-${createHash('sha256').update(JSON.stringify(action)).digest('hex').slice(0, 12)}`,label,action,
    ...(anchor ? {observedContext:{label:anchor.label,direction:anchor.direction,distanceBand:anchor.distanceBand,
      recordedArrivals:memory?.anchors.find(a=>a.id===anchor.id)?.visits??0,currentLocation:memory?.currentAnchor===anchor.id}}:{}),
    ...(anchor ? {effect:'Move to this currently visible passage. Directions describe the screen: north is up, east is right. This is not a route to an unseen destination.'}:{}),
    ...(['lookAround','pause'].includes(action.type) ? {effect:'Stay in place and wait. This control does not pan/rotate the camera, move, or reveal another area.'}:{}),
    ...(action.type==='readList' ? {effect:'Read the current shopping list. Previously read contents remain in observedThisVisit.lastReadList.'}:{}),
  };});
}

/** Neutral, reproducible presentation. No preferred action, visit count or answer enters this order. */
export function presentActorChoices(choices: ActorChoice[], seed: string | number, decisionIndex: number): ActorChoice[] {
  const key = (choice: ActorChoice) => createHash('sha256').update(JSON.stringify([seed, decisionIndex, choice.id])).digest('hex');
  return [...choices].sort((a, b) => key(a).localeCompare(key(b)) || a.id.localeCompare(b.id));
}
