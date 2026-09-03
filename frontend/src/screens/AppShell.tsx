import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Alert,
  Easing,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FloatingNav } from '../components/FloatingNav';
import type { AiVariationSettings } from '../ai/useAiVariationSettings';
import { colors } from '../theme';
import { AiScreen } from './AiScreen';
import { GamePrototypeScreen } from './GamePrototypeScreen';
import { GameScreen } from './GameScreen';
import { HomeScreen } from './HomeScreen';
import { ProfileScreen } from './ProfileScreen';
import { QuestPracticeScreen } from './QuestPracticeScreen';
import { QuestScreen } from './QuestScreen';
import { getQuestDetail, QuestDetail, QuestSummary } from '../api/quest';

type AppShellProps = {
  accessToken: string | null;
  aiVariation: AiVariationSettings;
  quests: QuestSummary[];
  questsLoading: boolean;
  questsError: string | null;
  onRefreshQuests: () => void;
};

export function AppShell({
  accessToken,
  aiVariation,
  quests,
  questsLoading,
  questsError,
  onRefreshQuests,
}: AppShellProps) {
  const [selectedQuest, setSelectedQuest] = useState<QuestDetail | null>(null);

  const [tab, setTab] = useState(0);
  const [practice, setPractice] = useState(false);
  const [gamePlaying, setGamePlaying] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const screenProgress = useRef(new Animated.Value(0)).current;
  const firstAppearance = useRef(true);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (enabled) setReduceMotion(true);
    });
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      screenProgress.setValue(1);
      return;
    }
    const isFirstAppearance = firstAppearance.current;
    Animated.timing(screenProgress, {
      duration: isFirstAppearance ? 520 : 280,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    }).start(() => {
      firstAppearance.current = false;
    });
  }, [gamePlaying, practice, reduceMotion, screenProgress, tab]);

  const beginTransition = () => {
    if (!reduceMotion) screenProgress.setValue(0);
  };

  const selectTab = (next: number) => {
    if (next === tab) return;
    beginTransition();
    setTab(next);
  };

  const openPractice = () => {
    beginTransition();
    setPractice(true);
  };

  const closePractice = () => {
    beginTransition();
    setPractice(false);
    setSelectedQuest(null);
    onRefreshQuests();
  };

  const openQuest = async (uuid: string) => {
    try {
      const quest = await getQuestDetail(uuid);
      setSelectedQuest(quest);
      openPractice();
    } catch (error) {
      Alert.alert(
        '퀘스트를 열 수 없어요',
        error instanceof Error ? error.message : '잠시 후 다시 시도해 주세요.',
      );
    }
  };

  const openGame = () => {
    beginTransition();
    setGamePlaying(true);
  };

  const closeGame = () => {
    beginTransition();
    setGamePlaying(false);
  };

  const animatedStyle = {
    opacity: screenProgress,
    transform: [
      {
        translateY: screenProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [12, 0],
        }),
      },
      {
        scale: screenProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.996, 1],
        }),
      },
    ],
  };

  if (practice) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
        <Animated.View style={[styles.body, animatedStyle]}>
          <QuestPracticeScreen
            accessToken={accessToken}
            aiVariationEnabled={aiVariation.enabled}
            onBack={closePractice}
            quest={selectedQuest}
          />
        </Animated.View>
      </SafeAreaView>
    );
  }

  if (gamePlaying) {
    return (
      <SafeAreaView edges={[]} style={styles.gameSafe}>
        <Animated.View style={[styles.body, animatedStyle]}>
          <GamePrototypeScreen accessToken={accessToken} onExit={closeGame} />
        </Animated.View>
      </SafeAreaView>
    );
  }

  const screens = [
    <HomeScreen
      error={questsError}
      key="home"
      loading={questsLoading}
      onQuest={openQuest}
      practices={quests}
    />,
    <QuestScreen
      error={questsError}
      key="quest"
      loading={questsLoading}
      onQuest={openQuest}
      quests={quests}
      showPersonalDifficulty={accessToken !== null}
    />,
    <GameScreen key="game" onEnter={openGame} />,
    <AiScreen
      aiVariationEnabled={aiVariation.enabled}
      errorMessage={aiVariation.errorMessage}
      key="ai"
      modelSetupState={aiVariation.setupState}
      onToggleAiVariation={aiVariation.toggleEnabled}
    />,
    <ProfileScreen key="profile" />,
  ];

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <Animated.View style={[styles.body, animatedStyle]}>{screens[tab]}</Animated.View>
      <FloatingNav current={tab} onSelect={selectTab} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.white, flex: 1 },
  gameSafe: { backgroundColor: '#CAD3C3', flex: 1 },
  body: { flex: 1 },
});
