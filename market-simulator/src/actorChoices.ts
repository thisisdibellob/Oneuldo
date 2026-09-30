import type { ActorObservation, AttentionMemory, Decision } from './types';
export type ActorChoice = { id: string; action: Decision['action']; effect?: string;
  observedContext?: { direction: string; distanceBand: string; recordedArrivals: number; currentLocation: boolean } };
/** Enumerate available controls, never rank products, supply a correct answer, or choose for the actor. */
export function actorChoices(o: ActorObservation, memory?: { anchors: AttentionMemory['anchors']; currentAnchor: string | null }): ActorChoice[] {
  const actions: Decision['action'][]=[];
  if (o.phase === 'shopping') {
    if (o.view === 'cart' || o.view === 'help') {
      actions.push({type:'closeView'});
      if (o.cart) for (const [productId,n] of Object.entries(o.cart))
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
  return actions.map((action,i)=>{
    const anchor=action.type==='walkToAnchor' ? o.anchors.find(a=>a.id===action.anchorId) : undefined;
    return {id:`C${i+1}`,action,
    ...(anchor ? {observedContext:{direction:anchor.direction,distanceBand:anchor.distanceBand,
      recordedArrivals:memory?.anchors.find(a=>a.id===anchor.id)?.visits??0,currentLocation:memory?.currentAnchor===anchor.id}}:{}),
    ...(['lookAround','pause'].includes(action.type) ? {effect:'Stay in place and wait. This control does not pan/rotate the camera, move, or reveal another area.'}:{}),
    ...(action.type==='readList' ? {effect:'Read the current shopping list. Previously read contents remain in observedThisVisit.lastReadList.'}:{}),
  };});
}
