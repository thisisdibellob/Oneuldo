
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAppFonts } from './src/useAppFonts';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { getQuests, QuestSummary } from './src/api/quest';
import { AppShell } from './src/screens/AppShell';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { MarketSimulationScreen } from './src/screens/MarketSimulationScreen';
import { colors, fonts } from './src/theme';

export default function App() {
  const [marketLabVisit, setMarketLabVisit] = useState(0);
  const marketLab = __DEV__ && Platform.OS === 'web' && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('marketLab') === '1';
  const [entered, setEntered] = useState(false);

  // 퀘스트 정보 받아오기
  const [quests, setQuests] = useState<QuestSummary[]>([]);
  const [questsLoading, setQuestsLoading] = useState(true);
  const [questsError, setQuestsError] = useState<string | null>(null);

  useEffect(() => {
    if (marketLab) { setQuestsLoading(false); return; }
    const loadQuests = async () => {
      try {
        const data = await getQuests();
        setQuests(data);
      } catch (error) {
        setQuestsError(error instanceof Error ? error.message : '퀘스트를 불러오지 못했습니다.');
      } finally {
        setQuestsLoading(false);
      }
    };

    void loadQuests();
  }, []);

  const [showOnboarding, setShowOnboarding] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const entryProgress = useRef(new Animated.Value(0)).current;
  const entering = useRef(false);
  const { startupReady, allReady, error, retry } = useAppFonts();

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  const enterApp = () => {
    if (entering.current) return;
    entering.current = true;
    setEntered(true);
    if (reduceMotion) {
      entryProgress.setValue(1);
      setShowOnboarding(false);
      return;
    }
    entryProgress.setValue(0);
    Animated.timing(entryProgress, {
      duration: 620,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      toValue: 1,
      useNativeDriver: true,
    }).start(() => setShowOnboarding(false));
  };

  const fontsReady = entered || marketLab ? allReady : startupReady;
  if (!fontsReady) {
    return (
      <View style={styles.loading}>
        {!error && <ActivityIndicator color={colors.mint} size="large" />}
        <Text accessibilityRole={error ? 'alert' : undefined} style={styles.loadingText}>
          {error ? '글꼴을 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.'
            : entered || marketLab ? '화면을 준비하고 있어요'
            : '오늘도를 준비하고 있어요'}
        </Text>
        {error && (
          <Pressable accessibilityRole="button" onPress={retry} style={styles.retryButton}>
            <Text style={styles.retryText}>다시 시도</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {marketLab ? <MarketSimulationScreen key={marketLabVisit} onExit={() => setMarketLabVisit(visit => visit + 1)} /> :
      entered ? (
        <AppShell
          quests={quests}
          questsError={questsError}
          questsLoading={questsLoading}
        />
      ) : (
        <OnboardingScreen onEnter={() => setEntered(true)} />
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  app: { backgroundColor: colors.white, flex: 1 },
  layer: { ...StyleSheet.absoluteFill },
  loading: { alignItems: 'center', backgroundColor: colors.white, flex: 1, justifyContent: 'center' },
  loadingText: { color: colors.sage, fontFamily: fonts.bold, fontSize: 13, marginTop: 14, paddingHorizontal: 24, textAlign: 'center' },
  retryButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 100, marginTop: 14, borderRadius: 14, backgroundColor: colors.mint, paddingHorizontal: 20 },
  retryText: { color: colors.white, fontFamily: fonts.bold, fontSize: 14 },
});
