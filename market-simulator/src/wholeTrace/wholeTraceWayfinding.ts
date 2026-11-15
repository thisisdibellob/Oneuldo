import type { ActorDirection, ActorObservation, Persona } from '../types';

/**
 * wayfinding-v1 (explicit opt-in)
 *
 * 1. Perception: the observation carries the boundaries the world view actually
 *    draws (wall, furniture, the list note covering the floor, open floor).
 * 2. Memory: an actor-side spatial memory built only from the actor's own
 *    accepted observations and walks. Distances are rough step estimates from
 *    the displayed near/medium/far bands, never coordinates or a hidden map.
 * 3. Judgment: the actor authors a free-form thought (what it noticed, its
 *    hypothesis, plan and next intent) which is handed back verbatim in the
 *    next menu. giveUp is offered only after the person has actually explored
 *    or tried recovery; the system never selects or substitutes an action.
 */
export const WHOLE_TRACE_WAYFINDING_VERSION = 'wayfinding-v1' as const;
export type WholeTraceWayfindingVersion = typeof WHOLE_TRACE_WAYFINDING_VERSION;
export const WAYFINDING_GIVE_UP_LOCKED = 'WAYFINDING_GIVE_UP_LOCKED';

export const WHOLE_TRACE_THOUGHT_FIELDS = ['noticed', 'hypothesis', 'plan', 'next'] as const;
export type WholeTraceThought = Partial<Record<typeof WHOLE_TRACE_THOUGHT_FIELDS[number], string>>;
export const WHOLE_TRACE_THOUGHT_MAX_LENGTH = 200;

export function validateWholeTraceThought(value: unknown): string[] {
  if (value === undefined) return [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['actorState.thought must be a JSON object'];
  const entries = Object.entries(value as Record<string, unknown>);
  const errors: string[] = [];
  if (!entries.length) errors.push('actorState.thought must contain at least one of noticed, hypothesis, plan, next');
  for (const [key, text] of entries) {
    if (!(WHOLE_TRACE_THOUGHT_FIELDS as readonly string[]).includes(key)) errors.push(`Unknown actorState.thought field ${key}`);
    else if (typeof text !== 'string' || !text.trim() || text.length > WHOLE_TRACE_THOUGHT_MAX_LENGTH)
      errors.push(`actorState.thought.${key} must be a nonempty sentence of at most ${WHOLE_TRACE_THOUGHT_MAX_LENGTH} characters`);
  }
  return errors;
}

/* ------------------------------------------------------------------ persona */

export const WAYFINDING_RECOVERY_STRATEGIES = {
  'return-to-known-landmark': '이미 본 입구·계산대·매대 같은 아는 곳으로 돌아가 다시 둘러본다',
  'follow-wide-aisle': '넓게 트인 통로를 따라 매장 안쪽으로 들어간다',
  'scan-unvisited-direction': '아직 가 보지 않은 방향을 하나 정해 끝까지 훑는다',
  'view-help': '이용 방법 안내를 다시 본다',
  'seek-staff': '보이는 직원에게 다가가 물어본다',
  'reread-list': '장보기 목록을 다시 읽고 무엇을 찾는지 확인한다',
} as const;
export type WayfindingRecoveryStrategy = keyof typeof WAYFINDING_RECOVERY_STRATEGIES;

export type WayfindingProfile = {
  version: '1';
  /** landmark: directly seen landmarks only. layout-schema: also general knowledge of how shops are usually arranged. */
  cueLevel: 'landmark' | 'layout-schema';
  planHorizon: 'next-step' | 'short-sequence';
  maxHypotheses: number;
  memoryForm: 'route-sequence' | 'area-coverage';
  recoveryOrder: WayfindingRecoveryStrategy[];
  thoughtForm: 'one-sentence-concrete' | 'conditional-short';
  /** Planned-time floor (simulated ms) before giveUp is offered while unexplored passages remain. */
  explorationBudgetMs: number;
  /** Distinct places walked to, together with tried recovery, after which giveUp is offered. */
  minDistinctPlacesBeforeGiveUp: number;
  /** Persona fields this profile is derived from; documentation for review, not instructions. */
  basedOn: string[];
};

export const DEFAULT_WAYFINDING_PROFILE: WayfindingProfile = {
  version: '1', cueLevel: 'layout-schema', planHorizon: 'short-sequence', maxHypotheses: 2, memoryForm: 'area-coverage',
  recoveryOrder: ['scan-unvisited-direction', 'view-help', 'seek-staff'], thoughtForm: 'conditional-short',
  explorationBudgetMs: 240000, minDistinctPlacesBeforeGiveUp: 20, basedOn: [],
};

export function validateWayfindingProfile(value: unknown): string[] {
  const errors: string[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['wayfinding must be an object'];
  const p = value as Record<string, unknown>;
  const keys = ['version', 'cueLevel', 'planHorizon', 'maxHypotheses', 'memoryForm', 'recoveryOrder', 'thoughtForm',
    'explorationBudgetMs', 'minDistinctPlacesBeforeGiveUp', 'basedOn'];
  if (Object.keys(p).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(p, key))) errors.push('wayfinding fields mismatch');
  if (p.version !== '1') errors.push('unknown wayfinding version');
  if (!['landmark', 'layout-schema'].includes(p.cueLevel as string)) errors.push('wayfinding.cueLevel');
  if (!['next-step', 'short-sequence'].includes(p.planHorizon as string)) errors.push('wayfinding.planHorizon');
  if (!Number.isInteger(p.maxHypotheses) || (p.maxHypotheses as number) < 1 || (p.maxHypotheses as number) > 3) errors.push('wayfinding.maxHypotheses');
  if (!['route-sequence', 'area-coverage'].includes(p.memoryForm as string)) errors.push('wayfinding.memoryForm');
  if (!Array.isArray(p.recoveryOrder) || !p.recoveryOrder.length || new Set(p.recoveryOrder).size !== p.recoveryOrder.length
    || p.recoveryOrder.some(s => !Object.hasOwn(WAYFINDING_RECOVERY_STRATEGIES, s as string))) errors.push('wayfinding.recoveryOrder');
  if (!['one-sentence-concrete', 'conditional-short'].includes(p.thoughtForm as string)) errors.push('wayfinding.thoughtForm');
  if (!Number.isInteger(p.explorationBudgetMs) || (p.explorationBudgetMs as number) < 30000 || (p.explorationBudgetMs as number) > 3600000) errors.push('wayfinding.explorationBudgetMs');
  if (!Number.isInteger(p.minDistinctPlacesBeforeGiveUp) || (p.minDistinctPlacesBeforeGiveUp as number) < 1 || (p.minDistinctPlacesBeforeGiveUp as number) > 100) errors.push('wayfinding.minDistinctPlacesBeforeGiveUp');
  if (!Array.isArray(p.basedOn) || p.basedOn.some(entry => typeof entry !== 'string' || !entry.trim())) errors.push('wayfinding.basedOn');
  return errors;
}

export function wayfindingProfileOf(persona: Pick<Persona, 'wayfinding'>): WayfindingProfile {
  return structuredClone(persona.wayfinding ?? DEFAULT_WAYFINDING_PROFILE);
}

const CUE_TEXT = {
  landmark: '직접 본 랜드마크(입구·계산대·넓은 통로·이미 본 매대·벽)를 기준으로 방향을 정한다. 보지 않은 곳의 배치를 일반 상식으로 추측해 계획의 근거로 삼지 않는다.',
  'layout-schema': '직접 본 랜드마크와 함께 "계산대는 보통 출입구 가까이, 상품 매대는 매장 안쪽에 모여 있다" 같은 일반적인 매장 구조 지식으로 가설을 세울 수 있다. 가설은 실제 화면으로 확인하고 틀리면 바꾼다.',
} as const;
const HORIZON_TEXT = {
  'next-step': '한 번에 다음 한 걸음(한 번의 이동이나 확인)만 정한다.',
  'short-sequence': '두세 번의 이동으로 된 짧은 계획을 세우고, 화면이 바뀌면 다시 고친다.',
} as const;
const MEMORY_TEXT = {
  'route-sequence': '기억은 지나온 순서로 떠올린다(예: 입구 → 계산대 지나서 → 왼쪽 통로).',
  'area-coverage': '기억은 훑은 범위로 떠올린다(예: 출발점 남쪽과 동쪽은 다 봤다, 북쪽은 아직이다).',
} as const;
const THOUGHT_TEXT = {
  'one-sentence-concrete': 'thought는 지금 보이는 것 하나와 다음 행동 하나를 짧고 구체적인 한 문장 정도로 쓴다.',
  'conditional-short': 'thought에는 짧은 조건문(예: 위쪽이 막혀 있으면 왼쪽부터 본다)을 쓸 수 있다.',
} as const;

/** Instruction section derived from the persona profile; it shapes how, never whether, to keep looking. */
export function renderWayfindingInstructions(profile: WayfindingProfile): string {
  return [
    '## 길을 찾고 판단하는 방식 (wayfinding-v1)',
    `- 단서: ${CUE_TEXT[profile.cueLevel]}`,
    `- 계획 범위: ${HORIZON_TEXT[profile.planHorizon]} 동시에 마음에 두는 추측은 ${profile.maxHypotheses}개까지다.`,
    `- ${MEMORY_TEXT[profile.memoryForm]}`,
    `- 목표가 보이지 않거나 막히면 이 순서로 시도하는 편이다: ${profile.recoveryOrder.map((key, index) => `${index + 1}) ${WAYFINDING_RECOVERY_STRATEGIES[key]}`).join(' ')}`,
    `- ${THOUGHT_TEXT[profile.thoughtForm]}`,
  ].join('\n');
}

/** Common to every persona: personas differ in how they search, not in whether they keep searching. */
export const WAYFINDING_COMMON_INSTRUCTIONS = `wayfinding-v1 공통 규칙:
- 처음 온 매장에서는 시작 지점에서 매대가 보이지 않는 것이 정상이다. 화면에 상호작용할 것이 없다는 사실만으로 장보기를 그만두지 않는다. 대신 currentObservation.observation.boundaries(벽·집기·목록에 가려진 곳·트인 통로)와 menu.spatialMemory(내가 걸어 온 대략의 위치·훑은 범위·본 랜드마크·벽)를 보고 매장 구조를 스스로 추정해 탐색 전략을 세운다.
- boundaries의 kind:"covered"는 화면의 장보기 목록이 그 방향 바닥을 가린 것이지 벽이 아니다. 그 방향으로 통로가 이어질 수 있다. kind:"wall"은 실제로 그려진 벽이나 매장 끝이다. kind:"open"은 바닥이 화면 끝까지 이어진다는 뜻이다.
- 각 결정의 actorState.thought에 자유롭게 판단을 쓴다: noticed(지금 알아챈 것), hypothesis(매장 구조나 목표 위치에 대한 추측), plan(앞으로의 계획), next(이번 행동의 의도). 필요한 항목만 쓰고, 최소 한 항목은 쓴다. 예: {"noticed":"오른쪽은 벽이다","hypothesis":"매대는 위쪽 안쪽에 있을 것 같다","next":"위쪽 통로로 올라가 본다"}.
- 다음 메뉴의 ownNotes에 내가 쓴 thought가 그대로 돌아온다. 이는 내 이전 추측이며 틀릴 수 있다. 새 화면과 어긋나면 고쳐 쓰고, 맞으면 계획을 이어 간다. thought는 관찰한 사실이나 단서 원장이 아니며 상품·매대 위치의 근거(cueRefs)로 쓰지 않는다.
- reason에는 지금처럼 관찰 가능한 짧은 설명만 쓴다. thought에도 장애를 연기한다는 설명이나 시스템·모델에 대한 언급을 쓰지 않는다.
- 그만두기(giveUp)는 menu.spatialMemory.giveUp.available이 true일 때만 선택지에 나타난다. 가 볼 곳이 남아 있고 회복 전략을 아직 써 보지 않았다면 그만두기 대신 탐색이나 도움을 고른다. 그만둘 때는 thought.plan에 무엇을 시도했고 왜 그만두는지 쓴다.`;

/* ------------------------------------------------------------------ memory */

const UNIT: Record<ActorDirection, [number, number]> = {
  // [north, east]
  north: [1, 0], northeast: [Math.SQRT1_2, Math.SQRT1_2], east: [0, 1], southeast: [-Math.SQRT1_2, Math.SQRT1_2],
  south: [-1, 0], southwest: [-Math.SQRT1_2, -Math.SQRT1_2], west: [0, -1], northwest: [Math.SQRT1_2, -Math.SQRT1_2],
};
const STEPS = { near: 1, medium: 2, far: 3 } as const;
const round = (value: number) => Math.round(value) || 0;
const describe = (north: number, east: number) => {
  const n = round(north), e = round(east);
  const parts = [n > 0 ? `북쪽 ${n}` : n < 0 ? `남쪽 ${-n}` : '', e > 0 ? `동쪽 ${e}` : e < 0 ? `서쪽 ${-e}` : ''].filter(Boolean);
  return parts.length ? `출발점에서 ${parts.join(' · ')} 걸음쯤` : '출발점 근처';
};

export type WholeTraceSpatialMemory = {
  kind: 'actor-spatial-memory-v1'; notice: string;
  position: { fromStart: string; north: number; east: number };
  explored: { north: number; south: number; east: number; west: number };
  placesVisited: number; passagesSeenNotVisited: number;
  landmarks: { label: string; kind: string; seenAtDecision: number; seenFrom: string; direction: ActorDirection; distanceBand: string }[];
  wallsSeen: { seenFrom: string; direction: ActorDirection; distanceBand: string }[];
  recovery: { readList: boolean; viewedHelp: boolean; staffSeen: boolean; talkedToStaff: boolean };
  plannedTimeMs: number;
  giveUp: { available: boolean; notice: string };
};

/** Built from accepted observations only; never reads the environment, catalogue or hidden map. */
export class WholeTraceWayfindingMemory {
  private north = 0;
  private east = 0;
  private readonly extent = { north: 0, south: 0, east: 0, west: 0 };
  private readonly visits = new Map<string, number>();
  private readonly seenAnchors = new Set<string>();
  private readonly landmarks = new Map<string, WholeTraceSpatialMemory['landmarks'][number]>();
  private readonly walls = new Map<string, WholeTraceSpatialMemory['wallsSeen'][number]>();
  private readonly recovery = { readList: false, viewedHelp: false, staffSeen: false, talkedToStaff: false };
  private previous?: ActorObservation;
  private lastSequence?: number;
  private decisions = 0;
  private elapsedMs = 0;
  constructor(private readonly profile: WayfindingProfile) {}

  /** Idempotent per displayed observation sequence. */
  observe(o: ActorObservation, acceptedDecisions: number): void {
    if (o.sequence !== undefined && o.sequence === this.lastSequence) return;
    this.lastSequence = o.sequence;
    this.decisions = acceptedDecisions;
    this.elapsedMs = o.elapsedMs ?? this.elapsedMs;
    const result = o.result as (ActorObservation['result'] & { anchorId?: string }) | undefined;
    if (result?.accepted && result.actionType === 'walkToAnchor' && result.anchorId) {
      const shown = this.previous?.anchors.find(anchor => anchor.id === result.anchorId);
      if (shown) {
        const [n, e] = UNIT[shown.direction as ActorDirection], steps = STEPS[shown.distanceBand as keyof typeof STEPS] ?? 1;
        this.north += n * steps; this.east += e * steps;
        this.extent.north = Math.max(this.extent.north, this.north); this.extent.south = Math.max(this.extent.south, -this.north);
        this.extent.east = Math.max(this.extent.east, this.east); this.extent.west = Math.max(this.extent.west, -this.east);
      }
      this.visits.set(result.anchorId, (this.visits.get(result.anchorId) ?? 0) + 1);
    }
    if (result?.accepted && result.actionType === 'readList') this.recovery.readList = true;
    if (o.view === 'help') this.recovery.viewedHelp = true;
    if (o.activeStation?.startsWith('staff:')) this.recovery.talkedToStaff = true;
    const from = describe(this.north, this.east);
    for (const anchor of o.anchors) this.seenAnchors.add(anchor.id);
    for (const station of o.visibleStations) {
      if (station.kind === 'employee') this.recovery.staffSeen = true;
      this.landmarks.set(station.label, { label: station.label, kind: station.kind, seenAtDecision: acceptedDecisions,
        seenFrom: from, direction: station.direction as ActorDirection, distanceBand: station.distanceBand });
    }
    for (const body of o.visibleStructures ?? []) this.landmarks.set(`진열대(이름 안 보임):${from}`, { label: '이름이 안 보이는 진열대',
      kind: 'shelf-body', seenAtDecision: acceptedDecisions, seenFrom: from, direction: body.direction, distanceBand: body.distanceBand });
    for (const boundary of o.boundaries ?? []) if (boundary.kind === 'wall')
      this.walls.set(`${from}:${boundary.direction}`, { seenFrom: from, direction: boundary.direction, distanceBand: boundary.distanceBand });
    if (o.phase === 'shopping' && o.view === 'world' && !o.activeStation) this.previous = structuredClone(o);
  }

  visitCount(anchorId: string): number { return this.visits.get(anchorId) ?? 0; }

  giveUpStatus(o: Pick<ActorObservation, 'phase'>): { available: boolean; notice: string } {
    if (o.phase !== 'shopping') return { available: true, notice: '계산 단계에서는 언제든 그만둘 수 있다.' };
    const unvisited = [...this.seenAnchors].filter(id => !this.visits.has(id)).length;
    const places = this.visits.size;
    const tried = this.recovery.viewedHelp && (this.recovery.talkedToStaff || !this.recovery.staffSeen);
    if (this.elapsedMs >= this.profile.explorationBudgetMs)
      return { available: true, notice: '충분히 오래 둘러봤다. 계속할지 그만둘지는 스스로 정한다.' };
    if (places >= this.profile.minDistinctPlacesBeforeGiveUp && tried)
      return { available: true, notice: '여러 곳을 걸어 봤고 도움도 확인했다. 계속할지 그만둘지는 스스로 정한다.' };
    if (places >= 3 && unvisited === 0)
      return { available: true, notice: '본 통로는 모두 가 봤다. 계속할지 그만둘지는 스스로 정한다.' };
    const missing = [
      places < this.profile.minDistinctPlacesBeforeGiveUp ? `가 본 곳 ${places}/${this.profile.minDistinctPlacesBeforeGiveUp}` : '',
      !this.recovery.viewedHelp ? '이용 방법 안내를 아직 보지 않음' : '',
      this.recovery.staffSeen && !this.recovery.talkedToStaff ? '본 직원에게 아직 묻지 않음' : '',
      unvisited ? `봤지만 아직 안 가 본 통로 ${unvisited}곳` : '',
    ].filter(Boolean);
    return { available: false, notice: `아직 탐색할 수 있다: ${missing.join(', ')}. 그만두기는 선택지에 없다.` };
  }

  snapshot(o: ActorObservation): WholeTraceSpatialMemory {
    return {
      kind: 'actor-spatial-memory-v1',
      notice: '내가 실제로 본 화면과 걸은 방향만으로 만든 대략적인 기억이다. 걸음 수는 화면의 near=1, medium=2, far=3을 어림해 더한 값이며 지도·좌표·경로 추천이 아니다. 해석과 계획은 내가 한다.',
      position: { fromStart: describe(this.north, this.east), north: round(this.north), east: round(this.east) },
      explored: { north: round(this.extent.north), south: round(this.extent.south), east: round(this.extent.east), west: round(this.extent.west) },
      placesVisited: this.visits.size,
      passagesSeenNotVisited: [...this.seenAnchors].filter(id => !this.visits.has(id)).length,
      landmarks: [...this.landmarks.values()].sort((a, b) => b.seenAtDecision - a.seenAtDecision).slice(0, 12),
      wallsSeen: [...this.walls.values()].slice(-12),
      recovery: { ...this.recovery },
      plannedTimeMs: this.elapsedMs,
      giveUp: this.giveUpStatus(o),
    };
  }
}

/** The actor's own thoughts, handed back verbatim; never summarised or corrected by the system. */
export function wholeTraceOwnNotes(decisions: { actorState: { thought?: WholeTraceThought } }[], recent = 4) {
  const withThought = decisions.map((decision, index) => ({ decisionNumber: index + 1, thought: decision.actorState.thought }))
    .filter((entry): entry is { decisionNumber: number; thought: WholeTraceThought } => !!entry.thought);
  const lastPlan = [...withThought].reverse().find(entry => entry.thought.plan);
  return {
    kind: 'actor-own-notes-v1' as const,
    notice: '내가 이전 결정에서 직접 쓴 판단을 그대로 돌려준 것이다. 사실이 아니라 그때의 추측이며 틀릴 수 있다. 새 화면과 맞지 않으면 고친다.',
    ...(lastPlan ? { currentPlan: { decisionNumber: lastPlan.decisionNumber, plan: lastPlan.thought.plan! } } : {}),
    recent: withThought.slice(-recent).map(entry => structuredClone(entry)),
  };
}
