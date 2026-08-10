import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppShell } from './src/screens/AppShell';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { colors, fonts } from './src/theme';

export default function App() {
  const [entered, setEntered] = useState(false);
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
      <View style={styles.app}>
        {entered ? (
          <View style={styles.layer}>
            <AppShell />
          </View>
        ) : null}
        {showOnboarding ? (
          <Animated.View
            accessibilityElementsHidden={entered}
            importantForAccessibility={entered ? 'no-hide-descendants' : 'auto'}
            needsOffscreenAlphaCompositing={entered}
            pointerEvents={entered ? 'none' : 'auto'}
            renderToHardwareTextureAndroid={entered}
            shouldRasterizeIOS={entered}
            style={[
              styles.layer,
              {
                opacity: entryProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 0],
                }),
                transform: [
                  {
                    translateY: entryProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -14],
                    }),
                  },
                  {
                    scale: entryProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 0.995],
                    }),
                  },
                ],
              },
            ]}
          >
            <OnboardingScreen active={!entered} onEnter={enterApp} />
          </Animated.View>
        ) : null}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  app: { backgroundColor: colors.white, flex: 1 },
  layer: { ...StyleSheet.absoluteFillObject },
  loading: { alignItems: 'center', backgroundColor: colors.white, flex: 1, justifyContent: 'center' },
  loadingText: { color: colors.sage, fontFamily: fonts.regular, fontSize: 13, marginTop: 14 },
});
