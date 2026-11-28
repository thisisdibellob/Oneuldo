export type CafeGuestId = 'minsu' | 'jiyoung' | 'sujin';
export type CafeRecipeId = 'iced-latte' | 'hot-americano' | 'iced-americano' | 'iced-peach-tea';
export type CafeCup = 'glass' | 'mug';
export type CafeIngredient = 'ice' | 'milk' | 'espresso' | 'water' | 'peach';
export type CafeGuestStage = 'waiting' | 'order-change' | 'preparing' | 'ready' | 'carrying' | 'served' | 'cleaned';

export const CAFE_INGREDIENT_LABELS: Readonly<Record<CafeIngredient, string>> = {
  ice: '얼음', milk: '우유', espresso: '에스프레소', water: '물', peach: '복숭아 베이스',
};
export const CAFE_CUP_LABELS: Readonly<Record<CafeCup, string>> = { glass: '차가운 음료 컵', mug: '머그잔' };

export type CafeRecipe = Readonly<{
  id: CafeRecipeId;
  name: string;
  cup: CafeCup;
  /** A suggested assembly order. Equivalent ingredient orders are also accepted. */
  ingredients: readonly CafeIngredient[];
  color: string;
}>;

/** Simplified game recipes; amounts, machine operation and food safety training are out of scope. */
export const CAFE_RECIPES: Readonly<Record<CafeRecipeId, CafeRecipe>> = {
  'iced-latte': { id: 'iced-latte', name: '아이스 라테', cup: 'glass', ingredients: ['ice', 'milk', 'espresso'], color: '#C49C76' },
  'hot-americano': { id: 'hot-americano', name: '따뜻한 아메리카노', cup: 'mug', ingredients: ['water', 'espresso'], color: '#92654E' },
  'iced-americano': { id: 'iced-americano', name: '아이스 아메리카노', cup: 'glass', ingredients: ['ice', 'water', 'espresso'], color: '#946246' },
  'iced-peach-tea': { id: 'iced-peach-tea', name: '복숭아 아이스티', cup: 'glass', ingredients: ['peach', 'water', 'ice'], color: '#E1A075' },
};

export type CafeGuest = Readonly<{
  id: CafeGuestId;
  name: string;
  order: CafeRecipeId;
  changedOrder?: CafeRecipeId;
  orderLine: string;
  changeLine?: string;
  thanksLine: string;
}>;

export const CAFE_GUESTS: readonly CafeGuest[] = [
  { id: 'minsu', name: '민수', order: 'iced-latte', orderLine: '차가운 라테 한 잔 주세요.', thanksLine: '고마워! 우유랑 커피가 예쁘게 섞였네.' },
  { id: 'jiyoung', name: '지영', order: 'hot-americano', changedOrder: 'iced-americano', orderLine: '따뜻한 아메리카노 한 잔 부탁해.', changeLine: '아, 만들기 전에 차가운 아메리카노로 바꿔도 될까?', thanksLine: '주문 바꿔 줘서 고마워. 시원하게 잘 마실게.' },
  { id: 'sujin', name: '수진', order: 'iced-peach-tea', orderLine: '복숭아 아이스티 한 잔 주세요.', thanksLine: '복숭아 향이 좋다. 고마워!' },
];

export type CafeGuestState = Readonly<{
  guestId: CafeGuestId;
  recipeId: CafeRecipeId;
  stage: CafeGuestStage;
  orderConfirmed: boolean;
  cup: CafeCup | null;
  ingredients: readonly CafeIngredient[];
  askedAgain: boolean;
  helpUsed: boolean;
  remakes: number;
}>;
export type CafeSession = Readonly<{
  id: string;
  startedAt: number;
  completedAt: number | null;
  phase: 'briefing' | 'working' | 'finished';
  guestIndex: number;
  guests: readonly CafeGuestState[];
  lastActionError: string | null;
}>;
export type CafeAction =
  | { type: 'START' | 'TAKE_ORDER' | 'ACKNOWLEDGE_CHANGE' | 'FINISH_DRINK' | 'PICK_UP_TRAY' | 'CLEAN_TABLE' | 'NEXT_GUEST' | 'ASK_AGAIN' | 'ASK_HELP' | 'REMAKE' | 'CLEAR_ERROR' }
  | { type: 'CHOOSE_CUP'; cup: CafeCup }
  | { type: 'ADD_INGREDIENT'; ingredient: CafeIngredient }
  | { type: 'SERVE'; guestId: CafeGuestId }
  | { type: 'REPORT'; now: number }
  | { type: 'RESET'; id: string; now: number };

let sessionSequence = 0;
export function createCafeSession(options: { id?: string; now?: number } = {}): CafeSession {
  const now = options.now ?? Date.now();
  if (!Number.isFinite(now)) throw new Error('카페 근무 시작 시각을 확인해 주세요.');
  return {
    id: options.id ?? `cafe-${now}-${++sessionSequence}`, startedAt: now, completedAt: null,
    phase: 'briefing', guestIndex: 0, lastActionError: null,
    guests: CAFE_GUESTS.map(guest => ({ guestId: guest.id, recipeId: guest.order, stage: 'waiting',
      orderConfirmed: false, cup: null, ingredients: [], askedAgain: false, helpUsed: false, remakes: 0 })),
  };
}

export function getCurrentCafeGuest(session: CafeSession): CafeGuestState | null {
  return session.guests[session.guestIndex] ?? null;
}
export function getCafeRecipe(session: CafeSession): CafeRecipe | null {
  const guest = getCurrentCafeGuest(session);
  return guest ? CAFE_RECIPES[guest.recipeId] : null;
}
export function getCafeGuest(guestId: CafeGuestId): CafeGuest {
  return CAFE_GUESTS.find(guest => guest.id === guestId)!;
}

function reject(session: CafeSession, message: string): CafeSession {
  return session.lastActionError === message ? session : { ...session, lastActionError: message };
}
function updateCurrent(session: CafeSession, update: Partial<CafeGuestState>): CafeSession {
  return { ...session, lastActionError: null,
    guests: session.guests.map((guest, index) => index === session.guestIndex ? { ...guest, ...update } : guest) };
}
function recipeMatches(guest: CafeGuestState): boolean {
  const recipe = CAFE_RECIPES[guest.recipeId];
  return guest.cup === recipe.cup && guest.ingredients.length === recipe.ingredients.length
    && new Set(guest.ingredients).size === recipe.ingredients.length
    && recipe.ingredients.every(ingredient => guest.ingredients.includes(ingredient));
}
export function canReportCafeShift(session: CafeSession): boolean {
  return session.phase === 'working' && session.guests.length === CAFE_GUESTS.length
    && session.guests.every((guest, index) => guest.guestId === CAFE_GUESTS[index].id
      && guest.recipeId === (CAFE_GUESTS[index].changedOrder ?? CAFE_GUESTS[index].order)
      && guest.stage === 'cleaned' && guest.orderConfirmed && recipeMatches(guest));
}

/** UI owns walking and proximity. This reducer owns work order and prevents duplicate completion. */
export function applyCafeAction(session: CafeSession, action: CafeAction): CafeSession {
  if (action.type === 'RESET') return createCafeSession({ id: action.id, now: action.now });
  if (session.phase === 'finished') return session;
  if (action.type === 'CLEAR_ERROR') return session.lastActionError ? { ...session, lastActionError: null } : session;
  if (action.type === 'START') return session.phase === 'briefing'
    ? { ...session, phase: 'working', lastActionError: null } : reject(session, '이미 근무를 시작했어요.');
  if (session.phase !== 'working') return reject(session, '동료에게 먼저 업무를 받아 주세요.');
  const guest = getCurrentCafeGuest(session);
  if (!guest) return reject(session, '지금 맡은 주문을 확인해 주세요.');
  const profile = getCafeGuest(guest.guestId);
  switch (action.type) {
    case 'TAKE_ORDER':
      if (guest.stage !== 'waiting') return reject(session, '받은 주문은 주문표에서 다시 볼 수 있어요.');
      return updateCurrent(session, { stage: profile.changedOrder ? 'order-change' : 'preparing', orderConfirmed: !profile.changedOrder });
    case 'ACKNOWLEDGE_CHANGE':
      if (guest.stage !== 'order-change' || !profile.changedOrder) return reject(session, '지금은 변경할 주문이 없어요.');
      return updateCurrent(session, { stage: 'preparing', recipeId: profile.changedOrder, orderConfirmed: true });
    case 'ASK_AGAIN':
      if (!['order-change', 'preparing', 'ready', 'carrying'].includes(guest.stage)) return reject(session, '손님에게 먼저 주문을 받아 주세요.');
      return updateCurrent(session, { askedAgain: true });
    case 'ASK_HELP':
      return updateCurrent(session, { helpUsed: true });
    case 'CHOOSE_CUP':
      if (guest.stage !== 'preparing' || !guest.orderConfirmed) return reject(session, '손님 주문을 먼저 확인해 주세요.');
      if (!(action.cup in CAFE_CUP_LABELS)) return reject(session, '음료를 담을 컵을 골라 주세요.');
      if (guest.ingredients.length && guest.cup !== action.cup) return reject(session, '재료가 들어 있어요. 다시 만들기를 누르면 컵을 바꿀 수 있어요.');
      return updateCurrent(session, { cup: action.cup });
    case 'ADD_INGREDIENT':
      if (guest.stage !== 'preparing' || !guest.orderConfirmed) return reject(session, '손님 주문을 먼저 확인해 주세요.');
      if (!guest.cup) return reject(session, '재료를 넣기 전에 컵을 놓아 주세요.');
      if (!(action.ingredient in CAFE_INGREDIENT_LABELS)) return reject(session, '넣을 재료를 확인해 주세요.');
      if (guest.ingredients.includes(action.ingredient)) return reject(session, `${CAFE_INGREDIENT_LABELS[action.ingredient]}은 이미 넣었어요.`);
      return updateCurrent(session, { ingredients: [...guest.ingredients, action.ingredient] });
    case 'REMAKE':
      if (!['preparing', 'ready', 'carrying'].includes(guest.stage)) return reject(session, '음료를 만들 때 다시 시작할 수 있어요.');
      if (!guest.cup && guest.ingredients.length === 0) return { ...session, lastActionError: null };
      return updateCurrent(session, { stage: 'preparing', cup: null, ingredients: [], remakes: guest.remakes + 1 });
    case 'FINISH_DRINK': {
      if (guest.stage !== 'preparing' || !guest.orderConfirmed) return reject(session, '손님 주문을 먼저 확인해 주세요.');
      const recipe = CAFE_RECIPES[guest.recipeId];
      if (!guest.cup) return reject(session, '컵을 놓고 음료를 만들어 주세요.');
      if (guest.cup !== recipe.cup) return reject(session, `${recipe.name}는 ${CAFE_CUP_LABELS[recipe.cup]}에 담아요. 다시 만들기로 컵을 바꿔 주세요.`);
      const extra = guest.ingredients.filter(ingredient => !recipe.ingredients.includes(ingredient));
      if (extra.length) return reject(session, `이번 주문에는 ${extra.map(ingredient => CAFE_INGREDIENT_LABELS[ingredient]).join(', ')}이 들어가지 않아요. 다시 만들 수 있어요.`);
      const missing = recipe.ingredients.filter(ingredient => !guest.ingredients.includes(ingredient));
      if (missing.length) return reject(session, `${missing.map(ingredient => CAFE_INGREDIENT_LABELS[ingredient]).join(', ')}을 넣으면 완성이에요.`);
      if (!recipeMatches(guest)) return reject(session, '주문표와 재료를 다시 확인해 주세요.');
      return updateCurrent(session, { stage: 'ready' });
    }
    case 'PICK_UP_TRAY':
      return guest.stage === 'ready' ? updateCurrent(session, { stage: 'carrying' }) : reject(session, '완성한 음료를 쟁반에 올려 주세요.');
    case 'SERVE':
      if (guest.stage !== 'carrying') return reject(session, '음료를 쟁반에 담아 가져와 주세요.');
      if (action.guestId !== guest.guestId) return reject(session, `이 음료는 ${profile.name}의 주문이에요. 주문한 손님에게 가져다주세요.`);
      return updateCurrent(session, { stage: 'served' });
    case 'CLEAN_TABLE':
      return guest.stage === 'served' ? updateCurrent(session, { stage: 'cleaned' }) : reject(session, '음료를 건넨 뒤 자리를 정리해 주세요.');
    case 'NEXT_GUEST':
      if (guest.stage !== 'cleaned') return reject(session, '지금 손님의 자리를 먼저 정리해 주세요.');
      if (session.guestIndex >= session.guests.length - 1) return reject(session, '손님 응대를 마쳤어요. 동료에게 알려 주세요.');
      return { ...session, guestIndex: session.guestIndex + 1, lastActionError: null };
    case 'REPORT': {
      if (!canReportCafeShift(session)) return reject(session, '남은 주문과 자리 정리를 마친 뒤 알려 주세요.');
      const now = action.now;
      if (!Number.isFinite(now) || now < session.startedAt) return reject(session, '근무 완료 시각을 다시 확인해 주세요.');
      return { ...session, phase: 'finished', completedAt: now, lastActionError: null };
    }
  }
}

export function getCafeObjective(session: CafeSession): string {
  if (session.phase === 'briefing') return '동료에게 업무 받기';
  if (session.phase === 'finished') return '카페 근무 완료';
  if (canReportCafeShift(session)) return '동료에게 근무 완료 알리기';
  const guest = getCurrentCafeGuest(session);
  if (!guest) return '주문표 확인하기';
  const profile = getCafeGuest(guest.guestId);
  const goals: Record<CafeGuestStage, string> = {
    waiting: `${profile.name}에게 주문 받기`,
    'order-change': '바뀐 주문 확인하기',
    preparing: `${CAFE_RECIPES[guest.recipeId].name} 만들기`,
    ready: '음료를 쟁반에 올리기',
    carrying: `${profile.name}에게 음료 건네기`,
    served: '손님 자리 정리하기',
    cleaned: '다음 손님 맞이하기',
  };
  return goals[guest.stage];
}

export type CafeResult = Readonly<{
  sessionId: string;
  guestsServed: number;
  tablesCleaned: number;
  orderChangeConfirmed: boolean;
  askedAgain: number;
  helpUsed: number;
  remakes: number;
  drinkIds: readonly CafeRecipeId[];
  facts: readonly string[];
}>;
export function getCafeResult(session: CafeSession): CafeResult | null {
  if (session.phase !== 'finished' || session.completedAt === null || !Number.isFinite(session.completedAt)
    || session.completedAt < session.startedAt || !canReportCafeShift({ ...session, phase: 'working' })) return null;
  const guestsServed = session.guests.filter(guest => guest.stage === 'cleaned').length;
  const askedAgain = session.guests.filter(guest => guest.askedAgain).length;
  const helpUsed = session.guests.filter(guest => guest.helpUsed).length;
  const remakes = session.guests.reduce((total, guest) => total + guest.remakes, 0);
  const orderChangeConfirmed = session.guests.some(guest => !!getCafeGuest(guest.guestId).changedOrder && guest.orderConfirmed);
  const facts = [`손님 ${guestsServed}명에게 주문한 음료를 건넸어요.`, `사용한 자리 ${guestsServed}곳을 정리했어요.`];
  if (orderChangeConfirmed) facts.push('지영의 변경된 주문을 확인했어요.');
  if (askedAgain) facts.push('손님에게 주문을 다시 물어봤어요.');
  if (helpUsed) facts.push('동료에게 도움을 요청했어요.');
  if (remakes) facts.push('음료를 다시 만들어 주문에 맞췄어요.');
  return { sessionId: session.id, guestsServed, tablesCleaned: guestsServed, orderChangeConfirmed,
    askedAgain, helpUsed, remakes, drinkIds: session.guests.map(guest => guest.recipeId), facts };
}
