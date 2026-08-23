import type { QuestDetail } from '../api/quest';
import { generateFullQuestStep } from './questStepGenerator';

const QUEST_VARIATION_TARGET_CATEGORY = 'PUBLIC_TRANSPORT';

export type QuestGenerationSnapshot = {
  questId: string;
  state: 'idle' | 'generating' | 'ready';
  quest: QuestDetail | null;
  sources: Array<'ai' | 'original'>;
  failures: Array<string | null>;
};

// 완료 결과와 진행 중 Promise를 따로 보관해 같은 퀘스트를 중복 생성하지 않는다.
const snapshots = new Map<string, QuestGenerationSnapshot>();
const pending = new Map<string, Promise<QuestGenerationSnapshot>>();
const listeners = new Set<() => void>();
let generationSequence = 0;

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function subscribeQuestGeneration(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getQuestGenerationSnapshot(questId: string): QuestGenerationSnapshot {
  return snapshots.get(questId) ?? {
    questId,
    state: 'idle',
    quest: null,
    sources: [],
    failures: [],
  };
}

export function warmFullQuest(quest: QuestDetail): Promise<QuestGenerationSnapshot> {
  // 현재 Phase 4 적용 대상이 아닌 퀘스트는 AI를 호출하지 않는다.
  if (quest.categoryCode !== QUEST_VARIATION_TARGET_CATEGORY) {
    return Promise.resolve({ questId: quest.id, state: 'ready', quest, sources: [], failures: [] });
  }
  const ready = snapshots.get(quest.id);
  if (ready?.state === 'ready') return Promise.resolve(ready);
  const existing = pending.get(quest.id);
  if (existing) return existing;

  snapshots.set(quest.id, { questId: quest.id, state: 'generating', quest: null, sources: [], failures: [] });
  emit();
  const task = (async () => {
    // 퀘스트 한 번에는 테마 하나만 사용해 4단계 상황이 서로 이어지게 한다.
    const approvedThemes = quest.difficulty === 'NORMAL'
      ? ['사람이 많은 퇴근 시간', '안내가 잘 들리지 않는 순간', '비가 와서 이동이 느린 날']
      : ['한산한 낮', '비가 살짝 오는 날', '사람이 조금 있는 시간'];
    const variationTheme = approvedThemes[generationSequence % approvedThemes.length];
    const generatedSteps = [];
    const sources: Array<'ai' | 'original'> = [];
    const failures: Array<string | null> = [];
    let failedStepIndex = -1;
    // 네이티브 런타임은 동시 생성을 허용하지 않으므로 단계별로 순서대로 기다린다.
    for (const [stepIndex, step] of quest.steps.entries()) {
      generationSequence = (generationSequence + 1) % 1_000_000;
      const result = await generateFullQuestStep(
        quest,
        step,
        `quest-warmup-${Date.now()}-${generationSequence}`,
        undefined,
        variationTheme,
      );
      generatedSteps.push(result.step);
      sources.push(result.source);
      failures.push(result.failureCode);
      if (__DEV__) {
        // 원문과 프롬프트 없이 단계별 성공·fallback 여부만 남긴다.
        console.info('[QuestGeneration]', {
          questId: quest.id,
          stepOrder: step.stepOrder,
          source: result.source,
          failureCode: result.failureCode,
        });
      }
      // 한 단계라도 원문 fallback이면 뒤 단계의 흐름을 보장할 수 없다.
      // 남은 생성을 중단하고 이미 만든 AI 단계까지 포함해 퀘스트 전체를 원문으로 되돌린다.
      if (result.source === 'original') {
        failedStepIndex = stepIndex;
        break;
      }
    }
    const fallbackUsed = failedStepIndex >= 0;
    const snapshot: QuestGenerationSnapshot = {
      questId: quest.id,
      state: 'ready',
      quest: fallbackUsed ? quest : { ...quest, steps: generatedSteps },
      sources: fallbackUsed ? quest.steps.map(() => 'original') : sources,
      failures: fallbackUsed
        ? quest.steps.map((_, stepIndex) => {
          if (stepIndex < failedStepIndex) return null;
          if (stepIndex === failedStepIndex) return failures[stepIndex];
          return 'SKIPPED_AFTER_FAILURE';
        })
        : failures,
    };
    // 화면은 이 스냅샷 하나만 읽어 AI 단계와 원문 fallback을 동일하게 처리한다.
    snapshots.set(quest.id, snapshot);
    emit();
    return snapshot;
  })().finally(() => pending.delete(quest.id));
  pending.set(quest.id, task);
  return task;
}

export function clearQuestGenerationStore(): void {
  snapshots.clear();
  pending.clear();
  emit();
}
