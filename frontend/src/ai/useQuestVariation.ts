import { useEffect, useState } from 'react';

import type { QuestDetail, QuestStep } from '../api/quest';
import {
  getQuestGenerationSnapshot,
  subscribeQuestGeneration,
  warmFullQuest,
} from './questGenerationStore';

export const QUEST_VARIATION_TARGET_CATEGORY = 'PUBLIC_TRANSPORT';

export function isQuestVariationTarget(quest: QuestDetail | null): boolean {
  return quest?.categoryCode === QUEST_VARIATION_TARGET_CATEGORY;
}

export function useQuestVariation({
  enabled,
  accessToken,
  quest,
  stepIndex,
}: {
  enabled: boolean;
  accessToken: string | null;
  quest: QuestDetail | null;
  stepIndex: number;
}): {
  isPreparing: boolean;
  source: 'ai' | 'original';
  step: QuestStep | null;
} {
  const [, setRevision] = useState(0);
  const originalStep = quest?.steps[stepIndex] ?? null;
  const applies = enabled && isQuestVariationTarget(quest) && originalStep !== null;

  useEffect(() => {
    return subscribeQuestGeneration(() => setRevision((value) => value + 1));
  }, []);

  useEffect(() => {
    if (applies && quest) void warmFullQuest(quest, accessToken);
  }, [accessToken, applies, quest]);

  if (!originalStep) return { isPreparing: false, source: 'original', step: null };
  if (!applies || !quest) return { isPreparing: false, source: 'original', step: originalStep };
  const snapshot = getQuestGenerationSnapshot(quest.id);
  if (snapshot.state !== 'ready' || !snapshot.quest) {
    return { isPreparing: true, source: 'original', step: originalStep };
  }
  return {
    isPreparing: false,
    source: snapshot.sources[stepIndex] ?? 'original',
    step: snapshot.quest.steps[stepIndex] ?? originalStep,
  };
}
