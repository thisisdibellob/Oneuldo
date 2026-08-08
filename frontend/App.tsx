import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppShell } from './src/screens/AppShell';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { colors, fonts } from './src/theme';

export default function App() {
  const [entered, setEntered] = useState(false);
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
      {entered ? <AppShell /> : <OnboardingScreen onEnter={() => setEntered(true)} />}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { alignItems: 'center', backgroundColor: colors.white, flex: 1, justifyContent: 'center' },
  loadingText: { color: colors.sage, fontFamily: fonts.regular, fontSize: 13, marginTop: 14 },
});
