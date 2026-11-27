import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Alert,
  Easing,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FloatingNav } from '../components/FloatingNav';
import type { AiVariationSettings } from '../ai/useAiVariationSettings';
import { colors, fonts } from '../theme';
import { PressScale } from '../components/PressScale';
import { arePlayerSpritesPreloaded, preloadPlayerSprites, type SpritePreloadProgress } from '../game/playerSpritePreload';
import { AbilityAnalysisScreen } from './AbilityAnalysisScreen';
import { GamePrototypeScreen } from './GamePrototypeScreen';
import { GAME_TAB_BACKGROUND, GameScreen } from './GameScreen';
import { HomeScreen } from './HomeScreen';
import { ProfileScreen } from './ProfileScreen';
import { QuestPracticeScreen } from './QuestPracticeScreen';
import { QuestScreen } from './QuestScreen';
import { SettingsScreen } from './SettingsScreen';
import { getQuestDetail, QuestDetail, QuestSummary } from '../api/quest';
import { useActivityAlbum } from '../game/activityAlbum';
import { syncUserProgress, useUserProgress } from '../progress/userProgress';
import { LevelUpCelebration } from '../components/LevelUpCelebration';

type AppShellProps = {
  accessToken: string | null;
  aiVariation: AiVariationSettings;
  quests: QuestSummary[];
  questsLoading: boolean;
  questsError: string | null;
  onRefreshQuests: () => void;
  onLogout?: () => void;
};

export function AppShell({
  accessToken,
  aiVariation,
  quests,
  questsLoading,
  questsError,
  onRefreshQuests,
  onLogout,
}: AppShellProps) {
  const [selectedQuest, setSelectedQuest] = useState<QuestDetail | null>(null);

  const [tab, setTab] = useState(0);
  const [practice, setPractice] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [gamePlaying, setGamePlaying] = useState(false);
  const [gameActivity, setGameActivity] = useState<'day' | 'bus' | 'market' | 'errand' | 'phishing' | 'cafe' | 'laundry' | undefined>();
  const [reduceMotion, setReduceMotion] = useState(false);
  const screenProgress = useRef(new Animated.Value(0)).current;
  const firstAppearance = useRef(true);
  const activityRecords = useActivityAlbum();
  const [spritesReady, setSpritesReady] = useState(arePlayerSpritesPreloaded);
  // 준비 화면이 끝나고 게임 화면이 새로 붙을 때 페이드인을 다시 시작한다(휴대폰에서 투명하게 남는 문제).
  const gameReady = gamePlaying && spritesReady;
  const [spriteProgress, setSpriteProgress] = useState<SpritePreloadProgress>({ loaded: 0, total: 0 });

  // 처음 게임에 들어갈 때 캐릭터 스프라이트를 모두 받아 둔 뒤 게임 화면을 연다.
  useEffect(() => {
    if (!gamePlaying || spritesReady) return undefined;
    let alive = true;
    void preloadPlayerSprites((progress) => { if (alive) setSpriteProgress(progress); })
      .then(() => { if (alive) { beginTransition(); setSpritesReady(true); } });
    return () => { alive = false; };
  }, [gamePlaying, spritesReady]);

  // 개인 레벨·연속 학습 기록만 갱신한다. 게임·퀘스트·AI 쪽으로는 아무 값도 돌려주지 않는다.
  useEffect(() => {
    syncUserProgress(activityRecords);
  }, [activityRecords]);

  // 레벨이 오르면 화면 위에 축하 효과만 잠깐 보여 준다(앱을 처음 열 때의 저장된 레벨은 축하하지 않음).
  const { level } = useUserProgress();
  const shownLevel = useRef(level);
  const [celebrateLevel, setCelebrateLevel] = useState<number | null>(null);
  useEffect(() => {
    if (level > shownLevel.current) setCelebrateLevel(level);
    shownLevel.current = level;
  }, [level]);

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
  }, [gamePlaying, gameReady, practice, reduceMotion, screenProgress, tab]);

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

  const openGame = (activity?: 'day' | 'bus' | 'market' | 'errand' | 'phishing' | 'cafe' | 'laundry') => {
    beginTransition();
    setGameActivity(activity);
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

  const celebration = celebrateLevel === null ? null
    : <LevelUpCelebration key={celebrateLevel} level={celebrateLevel} reduceMotion={reduceMotion} onDone={() => setCelebrateLevel(null)} />;

  if (settingsOpen) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
        <SettingsScreen accessToken={accessToken} onBack={() => setSettingsOpen(false)}
          onLogout={onLogout ? () => { setSettingsOpen(false); onLogout(); } : undefined} />
        {celebration}
      </SafeAreaView>
    );
  }

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
        {celebration}
      </SafeAreaView>
    );
  }

  if (gamePlaying && !spritesReady) {
    const ratio = spriteProgress.total ? spriteProgress.loaded / spriteProgress.total : 0;
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.gameSafe}>
        <View accessibilityLabel="캐릭터를 준비하고 있어요" style={styles.loading}>
          <View style={styles.loadingCenter}>
            <ActivityIndicator color="#4F725E" size="large" />
          </View>
          {/* PC에서도 휴대폰 너비 정도로만 늘어나는 하단 로딩 묶음 */}
          <View style={styles.loadingBottom}>
            <View style={styles.loadingLabelRow}>
              <Text style={styles.loadingTitle}>로딩 중...</Text>
              <Text style={styles.loadingCount}>{spriteProgress.loaded}/{spriteProgress.total || '-'}</Text>
            </View>
            <View style={styles.loadingTrack}>
              <View style={[styles.loadingFill, { width: `${Math.round(ratio * 100)}%` }]} />
            </View>
            <PressScale accessibilityRole="button" accessibilityLabel="게임 나가기" onPress={closeGame} style={styles.loadingExit}>
              <Text style={styles.loadingExitText}>나가기</Text>
            </PressScale>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (gamePlaying) {
    return (
      <SafeAreaView edges={[]} style={styles.gameSafe}>
        <Animated.View style={[styles.body, animatedStyle]}>
          <GamePrototypeScreen accessToken={accessToken} onExit={closeGame} initialActivity={gameActivity}
            onOpenAnalysis={() => { beginTransition(); setGamePlaying(false); setTab(3); }} />
        </Animated.View>
        {celebration}
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
      onGameQuest={openGame}
      onQuest={openQuest}
      quests={quests}
      showPersonalDifficulty={accessToken !== null}
    />,
    <GameScreen key="game" onEnter={() => openGame()} />,
    <AbilityAnalysisScreen accessToken={accessToken} key="ability-analysis" />,
    <ProfileScreen key="profile" onOpenSettings={() => setSettingsOpen(true)} />,
  ];

  return (
    // 게임 탭은 배경 전체가 연한 녹색이라 위쪽 노치 영역도 같은 색으로 칠한다.
    <SafeAreaView edges={['top']} style={[styles.safe, tab === 2 && { backgroundColor: GAME_TAB_BACKGROUND }]}>
      <Animated.View style={[styles.body, animatedStyle]}>{screens[tab]}</Animated.View>
      <FloatingNav current={tab} onSelect={selectTab} />
      {celebration}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.white, flex: 1 },
  gameSafe: { backgroundColor: '#CAD3C3', flex: 1 },
  body: { flex: 1 },
  loading: { alignItems: 'center', flex: 1, paddingBottom: 32, paddingHorizontal: 40 },
  loadingCenter: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  loadingBottom: { alignItems: 'center', maxWidth: 300, width: '100%' },
  loadingLabelRow: { alignItems: 'flex-end', alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  loadingTitle: { color: '#3E5C4B', fontFamily: fonts.laundryBold, fontSize: 15 },
  loadingTrack: { alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 4, height: 8, overflow: 'hidden' },
  loadingFill: { backgroundColor: '#4F725E', borderRadius: 4, height: 8 },
  loadingCount: { color: '#4F725E', fontFamily: fonts.semibold, fontSize: 13 },
  loadingExit: { marginTop: 16, paddingHorizontal: 18, paddingVertical: 10 },
  loadingExitText: { color: '#4F725E', fontFamily: fonts.semibold, fontSize: 15 },
});
