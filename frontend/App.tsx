import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { getQuests, QuestSummary } from './src/api/quest';
import { AppShell } from './src/screens/AppShell';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { colors, fonts } from './src/theme';

export default function App() {
  const [entered, setEntered] = useState(false);

  // 퀘스트 정보 받아오기
  const [quests, setQuests] = useState<QuestSummary[]>([]);
  const [questsLoading, setQuestsLoading] = useState(true);
  const [questsError, setQuestsError] = useState<string | null>(null);

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

  const [loaded, error] = useFonts({
    Pretendard: require('./assets/fonts/Pretendard-Regular.otf'),
    'Pretendard-Medium': require('./assets/fonts/Pretendard-Medium.otf'),
    'Pretendard-SemiBold': require('./assets/fonts/Pretendard-SemiBold.otf'),
    'Pretendard-Bold': require('./assets/fonts/Pretendard-Bold.otf'),
    'Pretendard-ExtraBold': require('./assets/fonts/Pretendard-ExtraBold.otf'),
    LaundryGothic: require('./assets/fonts/LaundryGothic-Regular.otf'),
    'LaundryGothic-Bold': require('./assets/fonts/LaundryGothic-Bold.otf'),
    KyoboHandwriting: require('./assets/fonts/KyoboHandwriting2019.otf'),
  });

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
  loading: { alignItems: 'center', backgroundColor: colors.white, flex: 1, justifyContent: 'center' },
  loadingText: { color: colors.sage, fontFamily: fonts.regular, fontSize: 13, marginTop: 14 },
});
