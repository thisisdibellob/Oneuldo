export type LaundryItemId = 'cream-tee' | 'blue-jeans' | 'coral-towel' | 'sage-towel' | 'sock-left' | 'sock-right';
export type LaundryBatchId = 'lights' | 'colors';
export type LaundryDryMethod = 'low' | 'air';
export type LaundryMachineId = 'washer-1' | 'washer-2';
export type LaundryPhase = 'packing' | 'travel' | 'sorting' | 'washing' | 'drying' | 'folding' | 'returning' | 'finished';

/** Game-compressed waits, not real appliance cycle times. */
export const LAUNDRY_WASH_DURATION_MS = 6_000;
/** Practice amount only; no wallet balance or real payment is changed. */
export const LAUNDRY_WASH_PRICE = 3_000;
export const LAUNDRY_DRY_DURATION_MS: Readonly<Record<LaundryDryMethod, number>> = { low: 6_000, air: 6_000 };
export const LAUNDRY_BATCHES: Readonly<Record<LaundryBatchId, { id: LaundryBatchId; name: string }>> = {
  lights: { id: 'lights', name: '밝은 빨래' }, colors: { id: 'colors', name: '색 있는 빨래' },
};
export const LAUNDRY_DRY_LABELS: Readonly<Record<LaundryDryMethod, string>> = { low: '낮은 온도 건조', air: '자연 건조' };
export const LAUNDRY_MACHINES: readonly Readonly<{ id: LaundryMachineId; name: string; occupied: boolean }>[] = [
  { id: 'washer-1', name: '1번 세탁기', occupied: true },
  { id: 'washer-2', name: '2번 세탁기', occupied: false },
];
export type LaundryItem = Readonly<{
  id: LaundryItemId;
  name: string;
  batchId: LaundryBatchId;
  dryMethod: LaundryDryMethod;
  careLabel: string;
  pocketItem: 'receipt' | null;
  foldable: boolean;
  color: string;
}>;

/** These are labels on this game's garments, not universal rules for a material or color. */
export const LAUNDRY_ITEMS: readonly LaundryItem[] = [
  { id: 'cream-tee', name: '크림 티셔츠', batchId: 'lights', dryMethod: 'low', careLabel: '밝은 빨래 · 낮은 온도 건조', pocketItem: null, foldable: true, color: '#F0E6CD' },
  { id: 'blue-jeans', name: '청바지', batchId: 'colors', dryMethod: 'air', careLabel: '색 있는 빨래 · 자연 건조', pocketItem: 'receipt', foldable: true, color: '#8AA5BB' },
  { id: 'coral-towel', name: '산호색 수건', batchId: 'colors', dryMethod: 'low', careLabel: '색 있는 빨래 · 낮은 온도 건조', pocketItem: null, foldable: true, color: '#D99A86' },
  { id: 'sage-towel', name: '연두색 수건', batchId: 'colors', dryMethod: 'low', careLabel: '색 있는 빨래 · 낮은 온도 건조', pocketItem: null, foldable: true, color: '#ACB99B' },
  { id: 'sock-left', name: '양말 한 짝', batchId: 'lights', dryMethod: 'low', careLabel: '밝은 빨래 · 낮은 온도 건조', pocketItem: null, foldable: false, color: '#EEE7D5' },
  { id: 'sock-right', name: '나머지 양말', batchId: 'lights', dryMethod: 'low', careLabel: '밝은 빨래 · 낮은 온도 건조', pocketItem: null, foldable: false, color: '#EEE7D5' },
];
export type LaundryItemState = Readonly<{
  itemId: LaundryItemId;
  packed: boolean;
  careChecked: boolean;
  pocketChecked: boolean;
  receiptRemoved: boolean;
  batchId: LaundryBatchId | null;
  dryMethod: LaundryDryMethod | null;
  folded: boolean;
}>;
export type LaundryTimerJob = Readonly<{ startedAt: number; readyAt: number; completedAt: number | null }>;
export type LaundryWashJob = LaundryTimerJob & Readonly<{ batchId: LaundryBatchId; machineId: LaundryMachineId }>;
export type LaundryDryJob = LaundryTimerJob & Readonly<{ method: LaundryDryMethod }>;
export type LaundrySession = Readonly<{
  id: string;
  startedAt: number;
  completedAt: number | null;
  phase: LaundryPhase;
  items: readonly LaundryItemState[];
  payments: readonly Readonly<{ batchId: LaundryBatchId; machineId: LaundryMachineId }>[];
  washJobs: readonly LaundryWashJob[];
  dryJobs: readonly LaundryDryJob[];
  socksPaired: boolean;
  homeArrivalConfirmed: boolean;
  occupiedMachineSeen: boolean;
  helpUsed: boolean;
  lastActionError: string | null;
}>;
export type LaundryAction =
  | { type: 'PACK' | 'INSPECT_CARE' | 'INSPECT_POCKET' | 'REMOVE_RECEIPT' | 'FOLD'; itemId: LaundryItemId }
  | { type: 'PACK_ALL' | 'LEAVE_HOME' | 'ARRIVE_LAUNDROMAT' | 'PAIR_SOCKS' | 'ARRIVE_HOME' | 'ASK_HELP' | 'CLEAR_ERROR' }
  | { type: 'SORT'; itemId: LaundryItemId; batchId: LaundryBatchId }
  | { type: 'PAY_WASH'; batchId: LaundryBatchId; machineId: LaundryMachineId }
  | { type: 'START_WASH'; batchId: LaundryBatchId; machineId: LaundryMachineId; now: number }
  | { type: 'FINISH_WASH'; batchId: LaundryBatchId; now: number }
  | { type: 'SELECT_DRYING'; itemId: LaundryItemId; method: LaundryDryMethod }
  | { type: 'START_DRY' | 'FINISH_DRY'; method: LaundryDryMethod; now: number }
  | { type: 'PUT_AWAY'; now: number }
  | { type: 'RESET'; id: string; now: number };

let sessionSequence = 0;
export function createLaundrySession(options: { id?: string; now?: number } = {}): LaundrySession {
  const now = options.now ?? Date.now();
  if (!Number.isFinite(now)) throw new Error('빨래 시작 시각을 확인해 주세요.');
  return {
    id: options.id ?? `laundry-${now}-${++sessionSequence}`, startedAt: now, completedAt: null, phase: 'packing',
    items: LAUNDRY_ITEMS.map(item => ({ itemId: item.id, packed: false, careChecked: false, pocketChecked: false,
      receiptRemoved: false, batchId: null, dryMethod: null, folded: false })),
    payments: [], washJobs: [], dryJobs: [], socksPaired: false, homeArrivalConfirmed: false,
    occupiedMachineSeen: false, helpUsed: false, lastActionError: null,
  };
}
export function getLaundryItem(itemId: LaundryItemId): LaundryItem {
  return LAUNDRY_ITEMS.find(item => item.id === itemId)!;
}
export function getLaundryBatchItems(session: LaundrySession, batchId: LaundryBatchId): readonly LaundryItemState[] {
  return session.items.filter(item => item.batchId === batchId);
}
export function getLaundryTimerRemaining(job: LaundryTimerJob, now: number): number {
  if (job.completedAt !== null) return 0;
  return Math.max(0, job.readyAt - (Number.isFinite(now) ? now : job.startedAt));
}
function reject(session: LaundrySession, message: string): LaundrySession {
  return session.lastActionError === message ? session : { ...session, lastActionError: message };
}
function updateItem(session: LaundrySession, itemId: LaundryItemId, update: Partial<LaundryItemState>): LaundrySession {
  return { ...session, lastActionError: null,
    items: session.items.map(item => item.itemId === itemId ? { ...item, ...update } : item) };
}
function hasAllItems(session: LaundrySession): boolean {
  return session.items.length === LAUNDRY_ITEMS.length
    && LAUNDRY_ITEMS.every(definition => session.items.filter(item => item.itemId === definition.id).length === 1);
}
function readyToWash(session: LaundrySession): boolean {
  return hasAllItems(session) && session.items.every(item => {
    const definition = getLaundryItem(item.itemId);
    return item.packed && item.careChecked && item.pocketChecked && item.batchId === definition.batchId
      && (!definition.pocketItem || item.receiptRemoved);
  });
}
function latestWashCompletion(session: LaundrySession): number {
  return Math.max(session.startedAt, ...session.washJobs.map(job => job.completedAt ?? session.startedAt));
}
function latestDryCompletion(session: LaundrySession): number {
  return Math.max(latestWashCompletion(session), ...session.dryJobs.map(job => job.completedAt ?? session.startedAt));
}
function isValidTime(now: number, earliest: number): boolean { return Number.isFinite(now) && now >= earliest; }
function allFolded(session: LaundrySession): boolean {
  return hasAllItems(session) && session.socksPaired
    && session.items.every(item => !getLaundryItem(item.itemId).foldable || item.folded);
}
function advanceAfterFolding(session: LaundrySession): LaundrySession {
  return allFolded(session) ? { ...session, phase: 'returning' } : session;
}

/** UI owns proximity/travel; this reducer owns work order, simulated payment and timer gates. */
export function applyLaundryAction(session: LaundrySession, action: LaundryAction): LaundrySession {
  if (action.type === 'RESET') return createLaundrySession({ id: action.id, now: action.now });
  if (session.phase === 'finished') return session;
  if (action.type === 'CLEAR_ERROR') return session.lastActionError ? { ...session, lastActionError: null } : session;
  if (action.type === 'ASK_HELP') return { ...session, helpUsed: true, lastActionError: null };
  if ('itemId' in action && !session.items.some(item => item.itemId === action.itemId)) return reject(session, '바구니의 빨래를 골라 주세요.');
  switch (action.type) {
    case 'PACK':
    case 'PACK_ALL':
      if (session.phase !== 'packing') return reject(session, '챙긴 빨래는 바구니에 있어요.');
      return { ...session, lastActionError: null,
        items: session.items.map(item => action.type === 'PACK_ALL' || ('itemId' in action && item.itemId === action.itemId) ? { ...item, packed: true } : item) };
    case 'LEAVE_HOME':
      if (session.phase !== 'packing' || !hasAllItems(session) || !session.items.every(item => item.packed)) return reject(session, '빨래 여섯 개를 바구니에 챙겨 주세요.');
      return { ...session, phase: 'travel', lastActionError: null };
    case 'ARRIVE_LAUNDROMAT':
      return session.phase === 'travel' ? { ...session, phase: 'sorting', lastActionError: null }
        : reject(session, '빨래를 챙긴 뒤 세탁소로 가요.');
    case 'INSPECT_CARE':
    case 'INSPECT_POCKET':
      if (session.phase !== 'sorting') return reject(session, '분류대에서 빨래를 하나씩 확인해요.');
      return updateItem(session, action.itemId, action.type === 'INSPECT_CARE' ? { careChecked: true } : { pocketChecked: true });
    case 'REMOVE_RECEIPT': {
      if (session.phase !== 'sorting') return reject(session, '세탁 전에 주머니를 확인해요.');
      const item = session.items.find(entry => entry.itemId === action.itemId)!;
      if (!item.pocketChecked) return reject(session, '주머니 안을 먼저 확인해 주세요.');
      if (getLaundryItem(action.itemId).pocketItem !== 'receipt') return reject(session, '이 빨래에는 꺼낼 영수증이 없어요.');
      const updated = updateItem(session, action.itemId, { receiptRemoved: true });
      return readyToWash(updated) ? { ...updated, phase: 'washing' } : updated;
    }
    case 'SORT': {
      if (session.phase !== 'sorting') return reject(session, '분류를 마친 빨래는 세탁기에 넣어요.');
      const item = session.items.find(entry => entry.itemId === action.itemId)!;
      const definition = getLaundryItem(action.itemId);
      if (!item.careChecked || !item.pocketChecked) return reject(session, '이 빨래의 표시와 주머니를 먼저 확인해 주세요.');
      if (action.batchId !== definition.batchId) return reject(session, `이 빨래의 표시에는 ‘${LAUNDRY_BATCHES[definition.batchId].name}’라고 적혀 있어요.`);
      const updated = updateItem(session, action.itemId, { batchId: action.batchId });
      return readyToWash(updated) ? { ...updated, phase: 'washing' } : updated;
    }
    case 'PAY_WASH':
    case 'START_WASH': {
      if (session.phase !== 'washing' || !readyToWash(session)) return reject(session, '빨래 표시와 주머니를 확인하고 분류를 마쳐 주세요.');
      if (!(action.batchId in LAUNDRY_BATCHES)) return reject(session, '세탁할 바구니를 골라 주세요.');
      const machine = LAUNDRY_MACHINES.find(item => item.id === action.machineId);
      if (!machine) return reject(session, '사용할 세탁기를 골라 주세요.');
      if (machine.occupied) return reject({ ...session, occupiedMachineSeen: true }, '1번 세탁기는 사용 중이에요. 비어 있는 2번 세탁기를 이용해요.');
      if (session.washJobs.some(job => job.batchId === action.batchId)) return reject(session, '이 빨래는 이미 세탁을 시작했어요.');
      if (session.washJobs.some(job => job.completedAt === null)) return reject(session, '세탁이 끝난 빨래를 꺼낸 뒤 다음 바구니를 넣어요.');
      const payment = session.payments.find(entry => entry.batchId === action.batchId);
      if (action.type === 'PAY_WASH') {
        if (payment) return reject(session, '이 바구니는 결제했어요. 세탁 시작을 눌러 주세요.');
        return { ...session, lastActionError: null, payments: [...session.payments, { batchId: action.batchId, machineId: action.machineId }] };
      }
      if (!payment || payment.machineId !== action.machineId) return reject(session, '세탁기와 바구니를 확인하고 결제해 주세요.');
      if (!isValidTime(action.now, latestWashCompletion(session))) return reject(session, '세탁 시작 시각을 다시 확인해 주세요.');
      return { ...session, lastActionError: null, washJobs: [...session.washJobs,
        { batchId: action.batchId, machineId: action.machineId, startedAt: action.now, readyAt: action.now + LAUNDRY_WASH_DURATION_MS, completedAt: null }] };
    }
    case 'FINISH_WASH': {
      if (session.phase !== 'washing') return reject(session, '세탁을 시작한 뒤 빨래를 꺼낼 수 있어요.');
      const job = session.washJobs.find(entry => entry.batchId === action.batchId);
      if (!job) return reject(session, '이 바구니의 세탁을 먼저 시작해 주세요.');
      if (job.completedAt !== null) return reject(session, '이 빨래는 이미 꺼냈어요.');
      if (!isValidTime(action.now, job.readyAt)) return reject(session, '세탁 중이에요. 완료 표시가 켜지면 꺼내요.');
      const washJobs = session.washJobs.map(entry => entry.batchId === action.batchId ? { ...entry, completedAt: action.now } : entry);
      return { ...session, washJobs, phase: washJobs.length === 2 && washJobs.every(entry => entry.completedAt !== null) ? 'drying' : 'washing', lastActionError: null };
    }
    case 'SELECT_DRYING': {
      if (session.phase !== 'drying') return reject(session, '세탁을 마친 뒤 건조 방법을 골라요.');
      const definition = getLaundryItem(action.itemId);
      if (session.dryJobs.some(job => job.method === definition.dryMethod)) return reject(session, '이 빨래의 건조는 이미 시작했어요.');
      if (action.method !== definition.dryMethod) return reject(session, `이 빨래의 표시에는 ‘${LAUNDRY_DRY_LABELS[definition.dryMethod]}’라고 적혀 있어요.`);
      return updateItem(session, action.itemId, { dryMethod: action.method });
    }
    case 'START_DRY': {
      if (session.phase !== 'drying') return reject(session, '세탁을 모두 마친 뒤 건조해요.');
      if (!(action.method in LAUNDRY_DRY_LABELS)) return reject(session, '빨래 표시에 맞는 건조 방법을 골라요.');
      if (session.dryJobs.some(job => job.method === action.method)) return reject(session, '이 빨래는 이미 건조를 시작했어요.');
      const group = session.items.filter(item => getLaundryItem(item.itemId).dryMethod === action.method);
      if (!group.length || group.some(item => item.dryMethod !== action.method)) return reject(session, '이 방법으로 말릴 빨래를 모두 골라 주세요.');
      if (!isValidTime(action.now, latestWashCompletion(session))) return reject(session, '건조 시작 시각을 다시 확인해 주세요.');
      return { ...session, lastActionError: null, dryJobs: [...session.dryJobs,
        { method: action.method, startedAt: action.now, readyAt: action.now + LAUNDRY_DRY_DURATION_MS[action.method], completedAt: null }] };
    }
    case 'FINISH_DRY': {
      if (session.phase !== 'drying') return reject(session, '건조를 시작한 뒤 빨래를 걷어요.');
      const job = session.dryJobs.find(entry => entry.method === action.method);
      if (!job) return reject(session, '이 빨래를 먼저 말려 주세요.');
      if (job.completedAt !== null) return reject(session, '이 빨래는 이미 걷었어요.');
      if (!isValidTime(action.now, job.readyAt)) return reject(session, '아직 말리는 중이에요. 완료 표시가 켜지면 걷어요.');
      const dryJobs = session.dryJobs.map(entry => entry.method === action.method ? { ...entry, completedAt: action.now } : entry);
      return { ...session, dryJobs, phase: dryJobs.length === 2 && dryJobs.every(entry => entry.completedAt !== null) ? 'folding' : 'drying', lastActionError: null };
    }
    case 'FOLD':
      if (session.phase !== 'folding') return reject(session, '빨래를 모두 말린 뒤 정리해요.');
      if (!getLaundryItem(action.itemId).foldable) return reject(session, '양말 두 짝은 짝 맞추기로 함께 정리해요.');
      return advanceAfterFolding(updateItem(session, action.itemId, { folded: true }));
    case 'PAIR_SOCKS':
      if (session.phase !== 'folding') return reject(session, '빨래를 모두 말린 뒤 양말 짝을 맞춰요.');
      return advanceAfterFolding({ ...session, socksPaired: true, lastActionError: null });
    case 'ARRIVE_HOME':
      return session.phase === 'returning' ? { ...session, homeArrivalConfirmed: true, lastActionError: null }
        : reject(session, '빨래를 모두 정리하고 집으로 돌아가요.');
    case 'PUT_AWAY':
      if (session.phase !== 'returning' || !session.homeArrivalConfirmed || !allFolded(session)) return reject(session, '정리한 빨래를 집 옷장에 가져가 주세요.');
      if (!isValidTime(action.now, latestDryCompletion(session))) return reject(session, '빨래를 넣은 시각을 다시 확인해 주세요.');
      return { ...session, phase: 'finished', completedAt: action.now, lastActionError: null };
  }
}

export function getLaundryObjective(session: LaundrySession): string {
  switch (session.phase) {
    case 'packing': return session.items.every(item => item.packed) ? '바구니를 들고 세탁소로 가기' : '빨래 여섯 개 챙기기';
    case 'travel': return '마을 세탁소에 들어가기';
    case 'sorting': {
      const receipt = session.items.find(item => item.itemId === 'blue-jeans');
      if (receipt?.pocketChecked && !receipt.receiptRemoved) return '청바지 주머니의 영수증 꺼내기';
      return '표시와 주머니를 확인하고 분류하기';
    }
    case 'washing': return session.washJobs.some(job => job.completedAt === null) ? '세탁이 끝나면 빨래 꺼내기' : '빈 세탁기에 바구니 넣고 세탁하기';
    case 'drying': return session.dryJobs.length === 2 ? '마른 빨래 걷기' : '표시에 맞게 건조기와 건조대에 놓기';
    case 'folding': return session.items.filter(item => getLaundryItem(item.itemId).foldable).every(item => item.folded) ? '양말 두 짝 맞추기' : '마른 빨래 개고 양말 짝 맞추기';
    case 'returning': return session.homeArrivalConfirmed ? '옷장에 빨래 넣기' : '빨래 바구니를 들고 집으로 돌아가기';
    case 'finished': return '빨래 정리 완료';
  }
}

export type LaundryResult = Readonly<{
  sessionId: string;
  completedAt: number;
  itemsWashed: number;
  batchesWashed: number;
  itemsFolded: number;
  sockPairs: number;
  careLabelsChecked: number;
  pocketsChecked: number;
  receiptRemoved: boolean;
  usedAirDrying: boolean;
  occupiedMachineSeen: boolean;
  helpUsed: boolean;
  facts: readonly string[];
}>;
function validCompletedJob(job: LaundryTimerJob, earliest: number, duration: number): boolean {
  return isValidTime(job.startedAt, earliest) && job.readyAt === job.startedAt + duration
    && job.completedAt !== null && isValidTime(job.completedAt, job.readyAt);
}
/** Records only completed work; a forged phase flag alone does not create an album result. */
export function getLaundryResult(session: LaundrySession): LaundryResult | null {
  if (session.phase !== 'finished' || session.completedAt === null || !Number.isFinite(session.startedAt)
    || !isValidTime(session.completedAt, latestDryCompletion(session)) || !session.homeArrivalConfirmed
    || !readyToWash(session) || !allFolded(session) || session.payments.length !== 2
    || session.washJobs.length !== 2 || session.dryJobs.length !== 2) return null;
  let precedingWash = session.startedAt;
  for (const job of session.washJobs) {
    if (job.machineId !== 'washer-2' || !validCompletedJob(job, precedingWash, LAUNDRY_WASH_DURATION_MS)) return null;
    precedingWash = job.completedAt!;
  }
  for (const batch of Object.keys(LAUNDRY_BATCHES) as LaundryBatchId[]) {
    if (session.washJobs.filter(job => job.batchId === batch).length !== 1
      || session.payments.filter(payment => payment.batchId === batch && payment.machineId === 'washer-2').length !== 1) return null;
  }
  for (const method of Object.keys(LAUNDRY_DRY_LABELS) as LaundryDryMethod[]) {
    const jobs = session.dryJobs.filter(job => job.method === method);
    if (jobs.length !== 1 || !validCompletedJob(jobs[0], precedingWash, LAUNDRY_DRY_DURATION_MS[method])) return null;
  }
  if (session.items.some(item => item.dryMethod !== getLaundryItem(item.itemId).dryMethod)) return null;
  const itemsFolded = session.items.filter(item => item.folded && getLaundryItem(item.itemId).foldable).length;
  const facts = ['빨래 여섯 개의 표시와 주머니를 확인했어요.', '밝은 빨래와 색 있는 빨래를 나누어 세탁했어요.',
    '청바지 주머니에서 영수증을 꺼냈어요.', '표시에 따라 청바지는 자연 건조했어요.',
    `빨래 ${itemsFolded}개를 개고 양말 한 쌍을 맞췄어요.`, '집으로 돌아와 옷장에 정리했어요.'];
  if (session.occupiedMachineSeen) facts.push('사용 중인 세탁기를 확인하고 빈 세탁기를 골랐어요.');
  if (session.helpUsed) facts.push('빨래 안내를 다시 확인했어요.');
  return { sessionId: session.id, completedAt: session.completedAt, itemsWashed: session.items.length,
    batchesWashed: session.washJobs.length, itemsFolded, sockPairs: session.socksPaired ? 1 : 0,
    careLabelsChecked: session.items.filter(item => item.careChecked).length,
    pocketsChecked: session.items.filter(item => item.pocketChecked).length,
    receiptRemoved: !!session.items.find(item => item.itemId === 'blue-jeans')?.receiptRemoved,
    usedAirDrying: true, occupiedMachineSeen: session.occupiedMachineSeen, helpUsed: session.helpUsed, facts };
}
