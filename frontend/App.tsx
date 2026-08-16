
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  AppState,
  Easing,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { getQuests, QuestSummary } from './src/api/quest';
import {
  cancelNativeGeneration,
  generateNativeText,
  getNativeRuntimeStatus,
  initializeNativeModel,
  NativeRuntimeError,
  prepareNativeModel,
  releaseNativeModel,
} from './src/ai/nativeRuntime';
import { AppShell } from './src/screens/AppShell';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { colors, fonts } from './src/theme';

const summarizeRuntimeError = (error: unknown) =>
  error instanceof NativeRuntimeError
    ? { code: error.code, message: error.message }
    : { code: 'UNKNOWN', message: String(error) };

export default function App() {
  const [entered, setEntered] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  // 퀘스트 정보 받아오기
  const [quests, setQuests] = useState<QuestSummary[]>([]);
  const [questsLoading, setQuestsLoading] = useState(true);
  const [questsError, setQuestsError] = useState<string | null>(null);

  useEffect(() => {
    if (!__DEV__) return;

    let active = true;
    void getNativeRuntimeStatus()
      .then(async (status) => {
        if (active && status.supported) {
          console.info('[OneuldoMnnRuntime]', status);
          const preparation = await prepareNativeModel();
          if (active && preparation.supported) {
            console.info('[OneuldoMnnRuntime] Model assets ready.', preparation);
            const initialization = await initializeNativeModel();
            if (active) {
              console.info('[OneuldoMnnRuntime] Model initialization finished.', initialization);
              // 같은 프로세스에서 두 번째 호출이 모델을 다시 읽지 않는지 확인한다.
              const reusedInitialization = await initializeNativeModel();
              console.info('[OneuldoMnnRuntime] Existing model reused.', reusedInitialization);
              if (reusedInitialization.state === 'ready') {
                // 한국어가 네이티브 왕복 과정에서 깨지지 않는지 확인한다.
                const generation = await generateNativeText({
                  requestId: 'phase2-ko-001',
                  prompt: '한국어로 오늘을 시작할 짧은 응원 문장을 한 문장으로 만들어 줘.',
                  maxTokens: 32,
                  timeoutMs: 30_000,
                });
                console.info('[OneuldoMnnRuntime] Korean generation finished.', generation);

                try {
                  await generateNativeText({
                    requestId: 'phase2-ko-001',
                    prompt: '중복 요청 확인',
                    maxTokens: 8,
                    timeoutMs: 30_000,
                  });
                } catch (duplicateError) {
                  console.info(
                    '[OneuldoMnnRuntime] Duplicate request rejected.',
                    summarizeRuntimeError(duplicateError),
                  );
                }

                try {
                  await generateNativeText({
                    requestId: 'phase2-timeout-001',
                    prompt: '시간 제한 검증을 위한 짧은 문장을 만들어 줘.',
                    maxTokens: 32,
                    timeoutMs: 1,
                  });
                } catch (timeoutError) {
                  console.info(
                    '[OneuldoMnnRuntime] Timeout handled.',
                    summarizeRuntimeError(timeoutError),
                  );
                }

                const cancellableGeneration = generateNativeText({
                  requestId: 'phase2-cancel-001',
                  prompt: '1번부터 100번까지 각 번호마다 긴 응원 문장을 만들어 줘.',
                  maxTokens: 256,
                  timeoutMs: 30_000,
                }).then(
                  (result) => ({ result, error: null }),
                  (error: unknown) => ({ result: null, error }),
                );
                await new Promise((resolve) => setTimeout(resolve, 100));
                const busyGeneration = generateNativeText({
                    requestId: 'phase2-busy-001',
                    prompt: '동시에 실행되는 요청이야.',
                    maxTokens: 16,
                    timeoutMs: 30_000,
                  }).then(
                    (result) => ({ result, error: null }),
                    (error: unknown) => ({ result: null, error }),
                  );
                const cancellation = await cancelNativeGeneration('phase2-cancel-001');
                console.info('[OneuldoMnnRuntime] Cancellation requested.', cancellation);
                const cancelledOutcome = await cancellableGeneration;
                const busyOutcome = await busyGeneration;
                console.info(
                  '[OneuldoMnnRuntime] Concurrent request rejected.',
                  busyOutcome.error ? summarizeRuntimeError(busyOutcome.error) : busyOutcome,
                );
                console.info(
                  '[OneuldoMnnRuntime] Cancelled result discarded.',
                  cancelledOutcome.error
                    ? summarizeRuntimeError(cancelledOutcome.error)
                    : cancelledOutcome,
                );

                const release = await releaseNativeModel();
                console.info('[OneuldoMnnRuntime] Model released.', release);
                for (let cycle = 1; cycle <= 2 && active; cycle += 1) {
                  const cycleInitialization = await initializeNativeModel();
                  const cycleGeneration = await generateNativeText({
                    requestId: `phase2-recovery-${cycle}`,
                    prompt: `재초기화 ${cycle}회차야. 한국어로 짧게 인사해 줘.`,
                    maxTokens: 16,
                    timeoutMs: 30_000,
                  });
                  console.info('[OneuldoMnnRuntime] Recovery cycle finished.', {
                    cycle,
                    initialization: cycleInitialization,
                    generation: cycleGeneration,
                  });
                  if (cycle < 2) {
                    await releaseNativeModel();
                  }
                }
              }
            }
          }
        }
      })
      .catch((runtimeError: unknown) => {
        console.warn('[OneuldoMnnRuntime] Runtime status check failed.', runtimeError);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        // 백그라운드에서는 진행 중 생성을 취소하고 모델 메모리를 비운다.
        void releaseNativeModel().catch((releaseError: unknown) => {
          console.warn('[OneuldoMnnRuntime] Background release failed.', releaseError);
        });
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
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
  const [loaded, error] = useFonts({
    Pretendard: require('./assets/fonts/Pretendard-Regular.otf'),
    'Pretendard-Medium': require('./assets/fonts/Pretendard-Medium.otf'),
    'Pretendard-SemiBold': require('./assets/fonts/Pretendard-SemiBold.otf'),
    'Pretendard-Bold': require('./assets/fonts/Pretendard-Bold.otf'),
    'Pretendard-ExtraBold': require('./assets/fonts/Pretendard-ExtraBold.otf'),
    LaundryGothic: require('./assets/fonts/LaundryGothic-Regular.otf'),
    'LaundryGothic-Bold': require('./assets/fonts/LaundryGothic-Bold.otf'),
    KyoboHandwriting: require('./assets/fonts/KyoboHandwriting2019.otf'),
    'Griun-InaDoongdoong': require('./assets/fonts/Griun_InaDoongdoong-Rg.ttf'),
  });

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  const enterApp = (token?: string) => {
    if (entering.current) return;
    entering.current = true;
    setAccessToken(token ?? null);
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

  if (!loaded && !error) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.mint} size="large" />
        <Text style={styles.loadingText}>오늘도를 준비하고 있어요</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {entered ? (
        <AppShell
          accessToken={accessToken}
          quests={quests}
          questsError={questsError}
          questsLoading={questsLoading}
        />
      ) : (
        <OnboardingScreen onEnter={enterApp} />
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  app: { backgroundColor: colors.white, flex: 1 },
  layer: { ...StyleSheet.absoluteFillObject },
  loading: { alignItems: 'center', backgroundColor: colors.white, flex: 1, justifyContent: 'center' },
  loadingText: { color: colors.sage, fontFamily: fonts.regular, fontSize: 13, marginTop: 14 },
});
