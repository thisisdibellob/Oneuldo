import { resolveMarketAiMission } from '../game/scenarios';
import { resolveMarketEnvironmentPlan, type MarketEnvironmentContext, type MarketEnvironmentPlan } from '../game/marketEnvironmentPlan';
import { resolveMarketTimeLimitSeconds } from '../game/marketQuestTime';
import { resolveMarketRuntimePlan, type MarketRuntimePlan, type MarketObservationPlan } from '../game/marketAdaptivePlan';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

export type MarketDifficultyRecommendation = {
  recommendationId: string;
  analysisInputSnapshotId: string | null;
  analysisId: string;
  profileId: string;
  profileVersion: number;
  gameId: 'MARKET_SIMULATION';
  recommendedDifficulty: 1 | 2 | 3;
  personalizationMode: 'AI_ANALYSIS' | 'AI_PROFILE';
  adjustments: {
    itemCount: 1 | 2 | 3 | 4;
    quantityComplexity: 'LOW' | 'MEDIUM' | 'HIGH';
    budgetPressure: 'LOW' | 'MEDIUM' | 'HIGH';
    textSupport: 'SIMPLIFIED' | 'STANDARD' | 'REDUCED';
  };
  reasonCodes: string[];
  policyVersion: string;
  generatedAt: string;
};

export async function getMarketDifficultyRecommendation(accessToken: string) {
  if (!API_BASE_URL) throw new Error('EXPO_PUBLIC_API_URL이 설정되지 않았습니다.');
  const response = await fetch(`${API_BASE_URL}/api/market-personalization/recommendation`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`장보기 개인화 추천 조회 실패: ${response.status}`);
  }
  return response.json() as Promise<MarketDifficultyRecommendation>;
}

export type MarketAiQuestResponse = {
  generationId: string;
  analysisId: string;
  profileId: string;
  source: 'AI';
  model: string | null;
  latencyMs: number;
  personalizationMode: 'AI_ANALYSIS' | 'AI_PROFILE';
  promptVersion: string;
  quest: {
    runtimePlan?: MarketRuntimePlan;
    observationPlan?: MarketObservationPlan;
    id: string;
    scenarioId: string;
    catalogVersion: string;
    scenarioVersion: string;
    difficulty: 1 | 2 | 3;
    environmentPlan?: MarketEnvironmentPlan;
    title: string;
    description: string;
    budget: number;
    timeLimitSeconds?: number;
    objectives: Array<{ productId: string; quantity: number }>;
    briefing: string[];
    checkoutDialogue: string[];
    successMessage: string;
  };
  adaptationSummary: string;
  reasonCodes: string[];
};

export class MarketQuestReadinessError extends Error {
  constructor(readonly pending: boolean, readonly stage: string, message: string) {
    super(message);
    this.name = 'MarketQuestReadinessError';
  }
}

export class FirstPlayRequiredError extends Error {
  readonly code = 'MARKET_BASELINE_REQUIRED';
  readonly stage = 'FIRST_PLAY';
  constructor(message = '첫 관찰 과제로 장보기를 시작해 주세요.') {
    super(message);
    this.name = 'FirstPlayRequiredError';
  }
}

export type MarketQuestProgress={jobId:string;status:string;stage:string;elapsedMs:number;deadlineSeconds:number;errorCode?:string;result?:MarketAiQuestResponse};
const jobMessages:Record<string,string>={DESIGNING_CONDITIONS:'실제 연습 환경의 변경점을 고르고 있어요',READING_EVIDENCE:'행동·이동 기록을 확인하고 있어요',ANALYZING_MOVEMENT:'행동 순서와 실제 이동 경로를 분석하고 있어요',SYNTHESIZING_OBSERVATIONS:'전체 경로의 관찰 결과와 근거를 종합하고 있어요',GENERATING:'연습 목표와 매장 조건을 구성하고 있어요',REVIEWING:'근거와 완료 조건을 검토하고 있어요',REPAIRING:'검토에서 발견한 부분을 수정하고 있어요',QUEUED:'생성을 기다리고 있어요'};
export function marketQuestProgressText(p:MarketQuestProgress){return `${jobMessages[p.stage]??'연습을 준비하고 있어요'} · ${Math.floor(p.elapsedMs/1000)}초 / 최대 ${p.deadlineSeconds}초`;}
async function requestMarketAiQuest(accessToken: string, environmentContext?: MarketEnvironmentContext, onProgress?:(p:MarketQuestProgress)=>void) {
  if (!API_BASE_URL) throw new Error('EXPO_PUBLIC_API_URL이 설정되지 않았습니다.');
  const adaptive=!!environmentContext?.runtimeContext;
  const startController=new AbortController();
  const startTimeout=adaptive?setTimeout(()=>startController.abort(),15000):undefined;
  const response = await fetch(`${API_BASE_URL}/api/market-personalization/${adaptive?'quest-jobs':'quest'}`, {
    method: 'POST',
    ...(adaptive?{signal:startController.signal}:{}),
    headers: { Authorization: `Bearer ${accessToken}`, ...(environmentContext ? { 'Content-Type': 'application/json' } : {}) },
    ...(environmentContext ? { body: JSON.stringify({ environmentContext }) } : {}),
  }).finally(()=>{if(startTimeout)clearTimeout(startTimeout);});
  if (!response.ok) {
    let body: { code?: string; stage?: string; message?: string } | null = null;
    try { body = await response.json(); } catch { /* Non-readiness responses keep their HTTP error. */ }
    if (response.status === 404 && body?.code === 'MARKET_BASELINE_REQUIRED' && body.stage === 'FIRST_PLAY') {
      throw new FirstPlayRequiredError(body.message);
    }
    if (body?.code === 'LATEST_PLAY_PROFILE_PENDING' || body?.code === 'LATEST_PLAY_PROFILE_FAILED') {
      throw new MarketQuestReadinessError(body.code === 'LATEST_PLAY_PROFILE_PENDING', body.stage ?? 'PROFILE',
        body.message ?? '최신 플레이 분석과 프로필 반영 상태를 분석 탭에서 확인해 주세요.');
    }
    throw new Error(`AI 맞춤 장보기 퀘스트 생성 실패: ${response.status}`);
  }
  let result:MarketAiQuestResponse;
  if(adaptive){let job=await response.json() as MarketQuestProgress;
    const remainingMs=job.deadlineSeconds*1000-Math.max(0,job.elapsedMs??0);
    const pollingDeadline=Date.now()+Math.max(0,remainingMs)+15000;
    while(true){if(!job?.jobId||!['RUNNING','READY','FAILED'].includes(job.status))throw new Error('추천 생성 응답 형식이 올바르지 않아요.');onProgress?.(job);if(job.status==='READY'&&job.result){result=job.result;break;}
      if(job.status==='FAILED')throw new Error(job.errorCode==='QUEST_GENERATION_TIMEOUT'?`연습 생성이 ${Math.ceil(job.deadlineSeconds/60)}분 안에 완료되지 않았어요. 진행 중인 생성을 중단했어요.`:`연습 조건 검토를 완료하지 못했어요 (${job.errorCode??'AI_QUEST_FAILED'}).`);
      if(!Number.isFinite(pollingDeadline)||Date.now()>pollingDeadline)throw new Error('생성 상태를 확인할 수 없어요. 다시 확인해 주세요.');
      await new Promise(resolve=>setTimeout(resolve,1500));
      const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),15000);
      try{const status=await fetch(`${API_BASE_URL}/api/market-personalization/quest-jobs/${job.jobId}`,{headers:{Authorization:`Bearer ${accessToken}`},signal:controller.signal});
        if(!status.ok)throw new Error('추천 생성 상태를 확인하지 못했어요.');job=await status.json() as MarketQuestProgress;
      }finally{clearTimeout(timeout);}
    }
  }else result=await response.json() as MarketAiQuestResponse;
  const promptVersion = /^market-ai-quest-v(\d+)/.exec(result.promptVersion ?? '');
  const timeLimitSeconds = resolveMarketTimeLimitSeconds(result.quest.timeLimitSeconds,
    promptVersion !== null && Number(promptVersion[1]) >= 20);
  const environmentPlan = resolveMarketEnvironmentPlan(result.quest.environmentPlan,
    promptVersion !== null && Number(promptVersion[1]) >= 18);
  if (environmentContext?.preserveShelfOrder && environmentPlan
    && environmentPlan.shelfOrder.some((categoryId, index) => categoryId !== environmentContext.shelfSlots[index]?.categoryId)) {
    throw new Error('AI 안내가 직접 설정한 진열대 순서와 일치하지 않아요. 다시 생성해 주세요.');
  }
  const runtimePlan=resolveMarketRuntimePlan(result.quest.runtimePlan,adaptive);
  return { ...result, quest: { ...result.quest, ...resolveMarketAiMission({ ...result.quest, environmentPlan, timeLimitSeconds, ...(runtimePlan?{runtimePlan}:{}) }) } };
}

// Survives screen unmount/re-entry. No fulfilled result or token is retained after completion.
type PendingQuest={request:ReturnType<typeof requestMarketAiQuest>;listeners:Set<(p:MarketQuestProgress)=>void>;latest?:MarketQuestProgress};
const pendingMarketQuests = new Map<string,PendingQuest>();
export function getMarketAiQuest(accessToken: string, environmentContext?: MarketEnvironmentContext,onProgress?:(p:MarketQuestProgress)=>void) {
  const context = environmentContext ? JSON.parse(JSON.stringify(environmentContext)) as MarketEnvironmentContext : undefined;
  const key = JSON.stringify([accessToken, context ?? null]);
  const pending = pendingMarketQuests.get(key);
  if (pending) {if(onProgress){pending.listeners.add(onProgress);if(pending.latest)onProgress(pending.latest);}return pending.request;}
  const listeners=new Set<(p:MarketQuestProgress)=>void>();if(onProgress)listeners.add(onProgress);
  const entry={} as PendingQuest;
  const request = requestMarketAiQuest(accessToken, context,p=>{entry.latest=p;listeners.forEach(listener=>listener(p));}).finally(() => {
    if (pendingMarketQuests.get(key)?.request === request) pendingMarketQuests.delete(key);
  });
  Object.assign(entry,{request,listeners});pendingMarketQuests.set(key,entry);
  return request;
}
