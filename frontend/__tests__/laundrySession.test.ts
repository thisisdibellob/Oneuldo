import {
  applyLaundryAction, createLaundrySession, getLaundryItem, getLaundryObjective, getLaundryResult,
  getLaundryTimerRemaining, LAUNDRY_ITEMS, LAUNDRY_WASH_DURATION_MS, LAUNDRY_DRY_DURATION_MS,
  type LaundryAction, type LaundryBatchId, type LaundrySession,
} from '../src/game/laundrySession';
import { clearLaundryDraft, getLaundryDraft, keepLaundryDraft } from '../src/game/laundryStore';

const START = 10_000;
function apply(session: LaundrySession, ...actions: LaundryAction[]) {
  return actions.reduce(applyLaundryAction, session);
}
function sorted(): LaundrySession {
  let session = apply(createLaundrySession({ id: 'laundry-test', now: START }),
    { type: 'PACK_ALL' }, { type: 'LEAVE_HOME' }, { type: 'ARRIVE_LAUNDROMAT' });
  for (const item of LAUNDRY_ITEMS) {
    session = apply(session, { type: 'INSPECT_CARE', itemId: item.id }, { type: 'INSPECT_POCKET', itemId: item.id });
    if (item.pocketItem) session = applyLaundryAction(session, { type: 'REMOVE_RECEIPT', itemId: item.id });
    session = applyLaundryAction(session, { type: 'SORT', itemId: item.id, batchId: item.batchId });
  }
  return session;
}
function washed(order: readonly LaundryBatchId[] = ['lights', 'colors']): LaundrySession {
  let session = sorted();
  let now = START;
  for (const batchId of order) {
    session = apply(session, { type: 'PAY_WASH', batchId, machineId: 'washer-2' },
      { type: 'START_WASH', batchId, machineId: 'washer-2', now });
    now += LAUNDRY_WASH_DURATION_MS;
    session = applyLaundryAction(session, { type: 'FINISH_WASH', batchId, now });
  }
  return session;
}
function dried(): LaundrySession {
  let session = washed();
  for (const item of LAUNDRY_ITEMS) session = applyLaundryAction(session, { type: 'SELECT_DRYING', itemId: item.id, method: item.dryMethod });
  const now = START + 2 * LAUNDRY_WASH_DURATION_MS;
  return apply(session, { type: 'START_DRY', method: 'low', now }, { type: 'START_DRY', method: 'air', now },
    { type: 'FINISH_DRY', method: 'low', now: now + LAUNDRY_DRY_DURATION_MS.low },
    { type: 'FINISH_DRY', method: 'air', now: now + LAUNDRY_DRY_DURATION_MS.air });
}
function returning(): LaundrySession {
  let session = dried();
  for (const item of LAUNDRY_ITEMS.filter(item => item.foldable)) session = applyLaundryAction(session, { type: 'FOLD', itemId: item.id });
  return applyLaundryAction(session, { type: 'PAIR_SOCKS' });
}
function finished(): LaundrySession {
  return apply(returning(), { type: 'ARRIVE_HOME' }, { type: 'PUT_AWAY', now: 30_000 });
}

describe('laundry day', () => {
  it('completes six garments, two paid wash batches, drying, folding, sock pairing and the home wardrobe', () => {
    const session = finished();
    expect(session.phase).toBe('finished');
    expect(session.completedAt).toBe(30_000);
    expect(getLaundryResult(session)).toMatchObject({
      sessionId: 'laundry-test', completedAt: 30_000, itemsWashed: 6, batchesWashed: 2, itemsFolded: 4,
      sockPairs: 1, careLabelsChecked: 6, pocketsChecked: 6, receiptRemoved: true,
      usedAirDrying: true, occupiedMachineSeen: false, helpUsed: false,
    });
    expect(getLaundryResult(session)?.facts).toHaveLength(6);
    expect(getLaundryObjective(session)).toBe('빨래 정리 완료');
  });

  it('keeps the basket at home until all six items are packed and requires actual arrival', () => {
    const initial = createLaundrySession({ id: 'trip', now: START });
    const partial = apply(initial, { type: 'PACK', itemId: 'cream-tee' }, { type: 'LEAVE_HOME' });
    expect(partial.phase).toBe('packing');
    expect(partial.items.filter(item => item.packed)).toHaveLength(1);
    const travelling = apply(partial, { type: 'PACK_ALL' }, { type: 'LEAVE_HOME' });
    expect(travelling.phase).toBe('travel');
    expect(applyLaundryAction(travelling, { type: 'SORT', itemId: 'cream-tee', batchId: 'lights' }).items[0].batchId).toBeNull();
    expect(applyLaundryAction(travelling, { type: 'ARRIVE_LAUNDROMAT' }).phase).toBe('sorting');
  });

  it('checks the label and pocket before sorting and does not place a garment into the wrong batch', () => {
    let session = apply(createLaundrySession({ now: START }), { type: 'PACK_ALL' }, { type: 'LEAVE_HOME' }, { type: 'ARRIVE_LAUNDROMAT' });
    session = applyLaundryAction(session, { type: 'SORT', itemId: 'blue-jeans', batchId: 'colors' });
    expect(session.lastActionError).toContain('표시와 주머니');
    session = apply(session, { type: 'INSPECT_CARE', itemId: 'blue-jeans' }, { type: 'INSPECT_POCKET', itemId: 'blue-jeans' },
      { type: 'SORT', itemId: 'blue-jeans', batchId: 'lights' });
    expect(session.items.find(item => item.itemId === 'blue-jeans')?.batchId).toBeNull();
    expect(session.lastActionError).toContain('색 있는 빨래');
    session = applyLaundryAction(session, { type: 'SORT', itemId: 'blue-jeans', batchId: 'colors' });
    expect(session.lastActionError).toBeNull();
    expect(session.items.find(item => item.itemId === 'blue-jeans')?.batchId).toBe('colors');
  });

  it('lets the receipt be found and removed without losing the garment or skipping preparation', () => {
    let session = apply(createLaundrySession({ now: START }), { type: 'PACK_ALL' }, { type: 'LEAVE_HOME' }, { type: 'ARRIVE_LAUNDROMAT' });
    session = applyLaundryAction(session, { type: 'REMOVE_RECEIPT', itemId: 'blue-jeans' });
    expect(session.items.find(item => item.itemId === 'blue-jeans')?.receiptRemoved).toBe(false);
    for (const item of LAUNDRY_ITEMS) session = apply(session, { type: 'INSPECT_CARE', itemId: item.id },
      { type: 'INSPECT_POCKET', itemId: item.id }, { type: 'SORT', itemId: item.id, batchId: item.batchId });
    expect(session.phase).toBe('sorting');
    expect(getLaundryObjective(session)).toContain('영수증');
    const denied = applyLaundryAction(session, { type: 'PAY_WASH', batchId: 'colors', machineId: 'washer-2' });
    expect(denied.payments).toHaveLength(0);
    session = applyLaundryAction(denied, { type: 'REMOVE_RECEIPT', itemId: 'blue-jeans' });
    expect(session.phase).toBe('washing');
    expect(session.lastActionError).toBeNull();
  });

  it('offers the empty washer after an occupied machine without a penalty or payment', () => {
    const session = applyLaundryAction(sorted(), { type: 'PAY_WASH', batchId: 'lights', machineId: 'washer-1' });
    expect(session.occupiedMachineSeen).toBe(true);
    expect(session.lastActionError).toContain('2번');
    expect(session.payments).toHaveLength(0);
    const continued = apply(session, { type: 'PAY_WASH', batchId: 'lights', machineId: 'washer-2' },
      { type: 'START_WASH', batchId: 'lights', machineId: 'washer-2', now: START });
    expect(continued.lastActionError).toBeNull();
    expect(continued.washJobs).toHaveLength(1);
  });

  it('requires one simulated payment for the selected batch and does not charge twice', () => {
    const unpaid = applyLaundryAction(sorted(), { type: 'START_WASH', batchId: 'lights', machineId: 'washer-2', now: START });
    expect(unpaid.washJobs).toHaveLength(0);
    expect(unpaid.lastActionError).toContain('결제');
    const paid = apply(unpaid, { type: 'PAY_WASH', batchId: 'lights', machineId: 'washer-2' }, { type: 'PAY_WASH', batchId: 'lights', machineId: 'washer-2' });
    expect(paid.payments).toHaveLength(1);
    expect(applyLaundryAction(paid, { type: 'START_WASH', batchId: 'colors', machineId: 'washer-2', now: START }).washJobs).toHaveLength(0);
  });

  it('does not run two batches in the same available washer at once', () => {
    const washing = apply(sorted(), { type: 'PAY_WASH', batchId: 'lights', machineId: 'washer-2' },
      { type: 'START_WASH', batchId: 'lights', machineId: 'washer-2', now: START });
    const second = apply(washing, { type: 'PAY_WASH', batchId: 'colors', machineId: 'washer-2' },
      { type: 'START_WASH', batchId: 'colors', machineId: 'washer-2', now: START });
    expect(second.washJobs).toHaveLength(1);
    expect(second.payments).toHaveLength(1);
    expect(second.lastActionError).toContain('꺼낸 뒤');
  });

  it('allows either batch first while requiring both before drying', () => {
    const session = washed(['colors', 'lights']);
    expect(session.phase).toBe('drying');
    expect(session.washJobs.map(job => job.batchId)).toEqual(['colors', 'lights']);
  });

  it('gates wash completion by its ready timestamp and never double-completes a batch', () => {
    let session = apply(sorted(), { type: 'PAY_WASH', batchId: 'lights', machineId: 'washer-2' },
      { type: 'START_WASH', batchId: 'lights', machineId: 'washer-2', now: START });
    for (const now of [START, START + LAUNDRY_WASH_DURATION_MS - 1, NaN, Infinity]) {
      session = applyLaundryAction(session, { type: 'FINISH_WASH', batchId: 'lights', now });
      expect(session.washJobs[0].completedAt).toBeNull();
    }
    const readyAt = START + LAUNDRY_WASH_DURATION_MS;
    session = applyLaundryAction(session, { type: 'FINISH_WASH', batchId: 'lights', now: readyAt });
    const twice = applyLaundryAction(session, { type: 'FINISH_WASH', batchId: 'lights', now: readyAt + 100 });
    expect(twice.washJobs[0].completedAt).toBe(readyAt);
    expect(twice.phase).toBe('washing');
  });

  it('rejects invalid and backward start times, preserving the paid batch for retry', () => {
    let session = applyLaundryAction(sorted(), { type: 'PAY_WASH', batchId: 'lights', machineId: 'washer-2' });
    for (const now of [START - 1, NaN, Infinity]) session = applyLaundryAction(session, { type: 'START_WASH', batchId: 'lights', machineId: 'washer-2', now });
    expect(session.payments).toHaveLength(1);
    expect(session.washJobs).toHaveLength(0);
    expect(applyLaundryAction(session, { type: 'START_WASH', batchId: 'lights', machineId: 'washer-2', now: START }).washJobs).toHaveLength(1);
  });

  it('uses the garment label for drying instead of a universal denim or towel rule', () => {
    const session = washed();
    const wrong = applyLaundryAction(session, { type: 'SELECT_DRYING', itemId: 'blue-jeans', method: 'low' });
    expect(wrong.lastActionError).toContain('이 빨래의 표시');
    expect(wrong.items.find(item => item.itemId === 'blue-jeans')?.dryMethod).toBeNull();
    const correct = applyLaundryAction(wrong, { type: 'SELECT_DRYING', itemId: 'blue-jeans', method: 'air' });
    expect(correct.lastActionError).toBeNull();
    expect(getLaundryItem('blue-jeans').careLabel).toContain('자연 건조');
  });

  it('requires every garment in a drying group and supports concurrent low and air drying', () => {
    let session = washed();
    session = apply(session, { type: 'SELECT_DRYING', itemId: 'cream-tee', method: 'low' }, { type: 'START_DRY', method: 'low', now: 22_000 });
    expect(session.dryJobs).toHaveLength(0);
    for (const item of LAUNDRY_ITEMS) session = applyLaundryAction(session, { type: 'SELECT_DRYING', itemId: item.id, method: item.dryMethod });
    session = apply(session, { type: 'START_DRY', method: 'low', now: 22_000 }, { type: 'START_DRY', method: 'air', now: 22_000 });
    expect(session.dryJobs).toHaveLength(2);
    const duplicate = applyLaundryAction(session, { type: 'START_DRY', method: 'air', now: 22_500 });
    expect(duplicate.dryJobs).toEqual(session.dryJobs);
  });

  it('waits for both dry methods and rejects folding wet laundry', () => {
    let session = washed();
    for (const item of LAUNDRY_ITEMS) session = applyLaundryAction(session, { type: 'SELECT_DRYING', itemId: item.id, method: item.dryMethod });
    session = apply(session, { type: 'START_DRY', method: 'low', now: 22_000 }, { type: 'START_DRY', method: 'air', now: 22_000 },
      { type: 'FINISH_DRY', method: 'low', now: 27_999 }, { type: 'FOLD', itemId: 'cream-tee' });
    expect(session.dryJobs[0].completedAt).toBeNull();
    expect(session.items[0].folded).toBe(false);
    session = applyLaundryAction(session, { type: 'FINISH_DRY', method: 'low', now: 28_000 });
    expect(session.phase).toBe('drying');
    session = applyLaundryAction(session, { type: 'FINISH_DRY', method: 'air', now: 28_000 });
    expect(session.phase).toBe('folding');
  });

  it('requires four folded garments and one sock pair, regardless of folding order', () => {
    let session = applyLaundryAction(dried(), { type: 'FOLD', itemId: 'sock-left' });
    expect(session.socksPaired).toBe(false);
    expect(session.items.find(item => item.itemId === 'sock-left')?.folded).toBe(false);
    session = apply(session, { type: 'PAIR_SOCKS' }, { type: 'PAIR_SOCKS' });
    for (const item of [...LAUNDRY_ITEMS].reverse().filter(item => item.foldable)) session = applyLaundryAction(session, { type: 'FOLD', itemId: item.id });
    expect(session.phase).toBe('returning');
    expect(session.items.filter(item => item.folded)).toHaveLength(4);
  });

  it('does not complete the activity until arrival home and wardrobe interaction', () => {
    const folded = returning();
    const premature = applyLaundryAction(folded, { type: 'PUT_AWAY', now: 30_000 });
    expect(premature.phase).toBe('returning');
    expect(getLaundryResult(premature)).toBeNull();
    const home = applyLaundryAction(premature, { type: 'ARRIVE_HOME' });
    expect(home.phase).toBe('returning');
    expect(getLaundryObjective(home)).toBe('옷장에 빨래 넣기');
    expect(getLaundryResult(home)).toBeNull();
    expect(applyLaundryAction(home, { type: 'PUT_AWAY', now: 27_999 }).completedAt).toBeNull();
    expect(applyLaundryAction(home, { type: 'PUT_AWAY', now: 30_000 }).phase).toBe('finished');
  });

  it('does not infer success from a phase flag, duplicate jobs or missing checks', () => {
    const complete = finished();
    const corrupt: LaundrySession[] = [
      { ...createLaundrySession({ now: START }), phase: 'finished', completedAt: 30_000 },
      { ...complete, washJobs: [complete.washJobs[0], complete.washJobs[0]] },
      { ...complete, dryJobs: [complete.dryJobs[0], complete.dryJobs[0]] },
      { ...complete, payments: [] },
      { ...complete, items: complete.items.map(item => item.itemId === 'blue-jeans' ? { ...item, receiptRemoved: false } : item) },
      { ...complete, items: complete.items.map(item => item.itemId === 'cream-tee' ? { ...item, careChecked: false } : item) },
      { ...complete, items: [complete.items[0], ...complete.items.slice(0, 5)] },
      { ...complete, completedAt: 12_000 },
    ];
    for (const session of corrupt) expect(getLaundryResult(session)).toBeNull();
  });

  it('records help and an occupied washer only when those actions actually occurred', () => {
    const complete = finished();
    expect(getLaundryResult(complete)?.facts.join(' ')).not.toMatch(/빈 세탁기|안내를 다시/);
    // Carry forward the optional encounter flags just as the later work actions do.
    const encounter = apply(sorted(), { type: 'ASK_HELP' }, { type: 'PAY_WASH', batchId: 'lights', machineId: 'washer-1' });
    const result = getLaundryResult({ ...complete, helpUsed: encounter.helpUsed, occupiedMachineSeen: encounter.occupiedMachineSeen });
    expect(result?.facts.join(' ')).toContain('빈 세탁기');
    expect(result?.facts.join(' ')).toContain('안내를 다시');
    expect(result?.itemsWashed).toBe(6);
  });

  it('keeps completed sessions unchanged and creates an explicit fresh session on reset', () => {
    const complete = finished();
    for (const action of [{ type: 'PUT_AWAY', now: 50_000 }, { type: 'ASK_HELP' }, { type: 'ARRIVE_HOME' }] as LaundryAction[]) {
      expect(applyLaundryAction(complete, action)).toBe(complete);
    }
    const reset = applyLaundryAction(complete, { type: 'RESET', id: 'laundry-retry', now: 40_000 });
    expect(reset).toEqual(createLaundrySession({ id: 'laundry-retry', now: 40_000 }));
    expect(reset.items.every(item => !item.packed)).toBe(true);
  });

  it('replays identical inputs deterministically without mutating the earlier basket', () => {
    const original = createLaundrySession({ id: 'deterministic', now: START });
    const snapshot = JSON.stringify(original);
    const actions: LaundryAction[] = [{ type: 'PACK_ALL' }, { type: 'LEAVE_HOME' }, { type: 'ARRIVE_LAUNDROMAT' },
      { type: 'INSPECT_CARE', itemId: 'blue-jeans' }, { type: 'INSPECT_POCKET', itemId: 'blue-jeans' }, { type: 'REMOVE_RECEIPT', itemId: 'blue-jeans' }];
    expect(apply(original, ...actions)).toEqual(apply(original, ...actions));
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it('clamps timer display without marking a job complete and preserves the current run across room changes', () => {
    const job = { startedAt: START, readyAt: START + 6_000, completedAt: null };
    expect(getLaundryTimerRemaining(job, START + 1_000)).toBe(5_000);
    expect(getLaundryTimerRemaining(job, START + 9_000)).toBe(0);
    expect(job.completedAt).toBeNull();
    const session = sorted();
    keepLaundryDraft(session);
    expect(getLaundryDraft()).toBe(session);
    expect(keepLaundryDraft(session)).toBe(session);
    clearLaundryDraft();
    expect(getLaundryDraft()).toBeNull();
  });
});
