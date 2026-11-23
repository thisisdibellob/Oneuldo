import type { MarketEnvironment } from './marketEnvironment';

export type MarketTrainingConfig = {
  task: 'shopping' | 'mother-request' | 'shelf-finder';
  mapHint: boolean;
  directionHint: boolean;
  incidents: 'none' | 'crowd' | 'sound-light' | 'both';
  routeIntervalSeconds: number;
};
export const DEFAULT_MARKET_TRAINING: MarketTrainingConfig = {
  task: 'shopping',
  mapHint: false,
  directionHint: false,
  incidents: 'none',
  routeIntervalSeconds: 5,
};
export const MARKET_TRAINING_PRESETS = [
  { id: 'basic', label: '기본 장보기', config: {} },
  { id: 'mother', label: '어머니 심부름', config: { task: 'mother-request' } },
  { id: 'find', label: '매대 위치 찾기', config: { task: 'shelf-finder' } },
  {
    id: 'direction',
    label: '직원 안내 연습',
    config: { task: 'mother-request', directionHint: true },
  },
  { id: 'map', label: '지도 활용 연습', config: { mapHint: true } },
  { id: 'unexpected', label: '돌발 상황 도전', config: { incidents: 'both' } },
] as const;
export function normalizeMarketTraining(
  value?: Partial<MarketTrainingConfig>
): MarketTrainingConfig {
  if (
    value !== undefined &&
    (!value || typeof value !== 'object' || Array.isArray(value))
  )
    throw new Error('연습 과제 설정을 확인해 주세요.');
  for (const key of Object.keys(value ?? {}))
    if (!Object.hasOwn(DEFAULT_MARKET_TRAINING, key))
      throw new Error('알 수 없는 연습 과제 항목: ' + key);
  const result = { ...DEFAULT_MARKET_TRAINING, ...value };
  if (
    !['shopping', 'mother-request', 'shelf-finder'].includes(result.task) ||
    !['none', 'crowd', 'sound-light', 'both'].includes(result.incidents) ||
    typeof result.mapHint !== 'boolean' ||
    typeof result.directionHint !== 'boolean' ||
    ![2, 5, 10].includes(result.routeIntervalSeconds)
  )
    throw new Error('연습 과제·힌트·경로 표시 간격을 확인해 주세요.');
  return result;
}
export function marketTrainingInstruction(
  training?: Partial<MarketTrainingConfig>
) {
  const task = normalizeMarketTraining(training).task;
  return task === 'mother-request'
    ? '어머니의 부탁 목록을 보고, 매대를 찾아 필요한 물건을 가져와 계산해요.'
    : task === 'shelf-finder'
      ? '목록에 적힌 물건의 매대를 찾아 가까이에서 살펴봐요. 물건을 사지는 않아도 돼요.'
      : '목록을 보고 필요한 물건을 골라 보세요!';
}
export type MarketIncident = {
  id: string;
  kind: 'crowd' | 'sound-light';
  elapsedSeconds: number;
  point: { x: number; y: number };
  durationSeconds: number;
};
/** Seeded distractions are identical for human and synthetic sessions; no hidden random timer. */
export function marketIncidentPlan(
  environment: MarketEnvironment,
  training?: Partial<MarketTrainingConfig>
): MarketIncident[] {
  const config = normalizeMarketTraining(training);
  const categories = Object.values(environment.shelves);
  let hash = 0;
  for (const c of String(environment.seed))
    hash = (Math.imul(hash, 31) + c.charCodeAt(0)) >>> 0;
  const plan: MarketIncident[] = [];
  const point = (index: number) => ({
    ...categories[(hash + index) % categories.length].point,
  });
  if (config.incidents === 'crowd' || config.incidents === 'both')
    plan.push({
      id: 'crowd-1',
      kind: 'crowd',
      elapsedSeconds: 18,
      point: point(0),
      durationSeconds: 18,
    });
  if (config.incidents === 'sound-light' || config.incidents === 'both')
    plan.push({
      id: 'sound-light-1',
      kind: 'sound-light',
      elapsedSeconds: config.incidents === 'both' ? 40 : 18,
      point: point(2),
      durationSeconds: 8,
    });
  return plan;
}
