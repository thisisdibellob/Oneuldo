import { createHash } from 'node:crypto';
import type { ActorObservation, AttentionMemory, Decision } from './types';
import type { RememberedPlace } from './rememberedRoute';
export type ExtendedActorChoice = { id: string; label: string; action: Decision['action']; effect?: string;
  observedContext?: { label: string; direction: string; distanceBand: string; recordedArrivals: number; currentLocation: boolean;
    rememberedFromEarlierRounds?: RememberedPlace[] } };
/** Enumerate available controls, never rank products, supply a correct answer, or choose for the actor. */
export function extendedActorChoices(o: ActorObservation, memory?: { anchors: AttentionMemory['anchors']; currentAnchor: string | null },
  recall?: Map<string, RememberedPlace[]>): ExtendedActorChoice[] {
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
      if(o.activeStation.startsWith('staff:') && o.staffLocationHelp !== undefined) {
        if (o.staffLocationHelp) {
          actions.push({type:'backToStaff'});
          for (const choice of o.locationChoices ?? []) actions.push({type:'askLocation',objectiveId:choice.id});
        } else actions.push({type:'openLocationHelp'});
      }
      if(o.activeStation.startsWith('staff:') && !o.staffLocationHelp) for(const [id,available] of Object.entries(o.cashiers))
        if(available===false) actions.push({type:'requestCashier',checkoutId:id as 'checkout'|'checkout-2'});
    } else {
      actions.push({type:'viewCart'},{type:'viewHelp'});
      if(o.listAvailable) actions.push({type:'readList',durationMs:2000});
      for(const a of o.anchors) actions.push({type:'walkToAnchor',anchorId:a.id});
      // visible-travel-v1 (direct v11): like holding the joystick toward any place on screen, not only clear nearby segments.
      if(o.visibleApproachEnabled) for(const s of o.visibleStations.filter(s=>!s.near))
        actions.push({type:'walkTo',station:s.id});
      for(const s of o.visibleStations.filter(s=>s.near)) {
        if(s.kind==='shelf'||s.kind==='employee') actions.push({type:'interact',station:s.id});
        if(s.kind==='checkout') actions.push({type:'checkout',checkoutId:s.id as 'checkout'|'checkout-2'});
      }
    }
    // ui-fidelity-v2 (direct v11 only): the app's 그만두기 (장보기 포기) is in the store-floor menu, not inside a shelf, cart, help or dialogue.
    const floor=o.view!=='cart'&&o.view!=='help'&&!o.activeStation;
    actions.push({type:'lookAround',durationMs:1500},{type:'pause',durationMs:1500},...(o.visibleApproachEnabled!==true||floor?[{type:'giveUp'} as const]:[]));
  } else if(o.phase==='checkout') {
    actions.push({type:'closeStation'},{type:'giveUp'});
    if(o.activeStation && o.cashiers[o.activeStation]) actions.push({type:'submit'});
  }
  return actions.map(action=>{
    // The direct v11 observation opts in; stored/legacy and feedback choice descriptions stay unchanged.
    const describeUiEffects=o.visibleApproachEnabled===true;
    const anchor=action.type==='walkToAnchor' ? o.anchors.find(a=>a.id===action.anchorId) : undefined;
    const station=action.type==='interact'||action.type==='walkTo' ? o.visibleStations.find(s=>s.id===action.station) : undefined;
    const product=action.type==='add' ? o.products.find(p=>p.id===action.productId) : undefined;
    const labels: Partial<Record<Decision['action']['type'], string>> = {
      openLocationHelp:'이 물건은 어디에 있나요?',backToStaff:'뒤로가기',
      readList:'화면의 장보기 목록 읽기',viewCart:'장바구니 보기',viewHelp:'이용 방법 보기',
      closeView:'열린 화면 닫기',closeStation:'진열대 또는 대화 닫기',giveUp:describeUiEffects?(o.phase==='checkout'?'그만두기 (장보기 포기)':'메뉴의 그만두기 (장보기 포기)'):'이번 장보기 그만하기',
      lookAround:'현재 자리에서 주변 보기',pause:'현재 자리에서 잠시 멈추기',submit:describeUiEffects?'구매 확정':'AI 수행 검토 요청하기',
    };
    // remembered-route-v1 learners only: the same passage control, annotated with the actor's own earlier sightings.
    const remembered=anchor ? recall?.get(anchor.id) : undefined;
    const label = anchor ? `${anchor.label}로 걷기${remembered ? ` (전에 이 길로 가서 본 곳: ${remembered.map(p=>p.label).join(', ')})` : ''}` : station ? action.type==='walkTo' ? (station.approachable===false ? `보이는 ${station.label} 쪽으로 걸어가기 (멀리 보임)` : `보이는 ${station.label} 쪽으로 가까이 걷기`) : `${station.label} ${station.kind==='employee'?'말 걸기':'살펴보기'}`
      : product && action.type==='add' ? `${product.name} ${action.quantity ?? 1}개 담기`
      : action.type==='checkout' || action.type==='requestCashier' ? `${action.checkoutId==='checkout-2'?2:1}번 계산대 ${action.type==='checkout'?'이용하기':'직원 호출하기'}`
      : action.type==='askLocation' ? `${o.locationChoices?.find(x=>x.id===action.objectiveId)?.label ?? ''} 위치 물어보기`
      : action.type==='browse' ? `진열대 스크롤 ${Math.round(action.scrollFraction*100)}% 위치 보기`
      : action.type==='remove' ? `장바구니의 ${action.productId} ${action.quantity ?? 1}개 내려놓기`
      // ui-fidelity-v1 (direct v11 only): use the actual app button text for the same closeStation control.
      : describeUiEffects&&action.type==='closeStation' ? (o.phase==='checkout' ? '다시 고르기' : o.shelf ? '다 골랐어요' : '대화 닫기')
      : labels[action.type] ?? action.type;
    return {id:`choice-${createHash('sha256').update(JSON.stringify(action)).digest('hex').slice(0, 12)}`,label,action,
    ...(anchor ? {observedContext:{label:anchor.label,direction:anchor.direction,distanceBand:anchor.distanceBand,
      recordedArrivals:memory?.anchors.find(a=>a.id===anchor.id)?.visits??0,currentLocation:memory?.currentAnchor===anchor.id,
      ...(remembered?{rememberedFromEarlierRounds:remembered}:{})}}:{}),
    ...(anchor ? {effect:'Move to this currently visible passage. Directions describe the screen: north is up, east is right. This is not a route to an unseen destination.'
      +(remembered?` In earlier rounds you yourself walked on from this passage and then saw: ${remembered.map(p=>`${p.label} (${p.passages} passage${p.passages>1?'s':''} on)`).join(', ')}. This is your own past experience, not advice or a guarantee; each later passage is still a separate choice on its own screen.`:'')}:{}),
    ...(action.type==='walkTo'&&station ? {effect:station.approachable===false
      ? `Walk toward ${station.label}, which you can see now, going around shelves along the store floor (like holding the joystick toward it) until you are next to it. This does not open a shelf, start dialogue, reveal hidden products, or select a purchase.`
      : `Walk along the visible unobstructed approach toward ${station.label}. This does not open a shelf, start dialogue, reveal hidden products, or select a purchase.`}:{}),
    ...(['lookAround','pause'].includes(action.type) ? {effect:'Stay in place and wait. This control does not pan/rotate the camera, move, or reveal another area.'}:{}),
    ...(action.type==='readList' ? {effect:'Read the current shopping list. Previously read contents remain in observedThisVisit.lastReadList.'}:{}),
    ...(describeUiEffects&&action.type==='add' ? {effect:`Add ${action.quantity ?? 1} more unit(s) of this currently displayed product to the cart. This is an increase, not a command to set the cart total to that quantity.`}:{}),
    ...(describeUiEffects&&action.type==='remove' ? {effect:`Remove ${action.quantity ?? 1} unit(s) of this product from the cart. This is a decrease, not a command to set the remaining cart total to that quantity.`}:{}),
    ...(describeUiEffects&&action.type==='checkout' ? {effect:'Open this checkout confirmation panel. Opening it does not confirm a purchase or submit the cart.'}:{}),
    ...(describeUiEffects&&action.type==='submit' ? {effect:'Press the existing 구매 확정 control: confirm the current cart and submit this attempt for review. This does not add, remove or correct products or quantities.'}:{}),
    ...(describeUiEffects&&action.type==='giveUp' ? {effect:'Press the app\'s 그만두기 (장보기 포기) control: give up and end this shopping attempt now. Nothing in the cart is bought or paid for, and the shopping is not completed.'}:{}),
    ...(describeUiEffects&&action.type==='closeStation' ? {effect:o.phase==='checkout'
      ? 'Close this checkout panel without confirming; the cart stays as it is and you return to the store.'
      : o.shelf ? 'Close this shelf and return to the store floor. Products already in the cart stay in the cart.'
      : 'Close this conversation and return to the store floor.'}:{}),
  };});
}

/** Neutral, reproducible presentation. No preferred action, visit count or answer enters this order. */
export function presentActorChoices(choices: ExtendedActorChoice[], seed: string | number, decisionIndex: number): ExtendedActorChoice[] {
  const key = (choice: ExtendedActorChoice) => createHash('sha256').update(JSON.stringify([seed, decisionIndex, choice.id])).digest('hex');
  return [...choices].sort((a, b) => key(a).localeCompare(key(b)) || a.id.localeCompare(b.id));
}

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
      if(o.activeStation.startsWith('staff:') && o.staffLocationHelp !== undefined) {
        if (o.staffLocationHelp) {
          actions.push({type:'backToStaff'});
          for (const choice of o.locationChoices ?? []) actions.push({type:'askLocation',objectiveId:choice.id});
        } else actions.push({type:'openLocationHelp'});
      }
      if(o.activeStation.startsWith('staff:') && !o.staffLocationHelp) for(const [id,available] of Object.entries(o.cashiers))
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
