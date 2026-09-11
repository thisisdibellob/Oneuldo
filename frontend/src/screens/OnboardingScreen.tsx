import { createContext, ReactNode, RefObject, useContext, useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { BlurTargetView, BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { images } from '../assets';
import { PressScale } from '../components/PressScale';
import { colors, fonts } from '../theme';

type LoginStep = 'welcome' | 'credentials';
type FocusedField = 'id' | 'password' | null;
const BackgroundBlurTarget = createContext<RefObject<View | null> | undefined>(undefined);

export function OnboardingScreen({ active = true, onEnter }: { active?: boolean; onEnter: () => void }) {
  const { height } = useWindowDimensions();
  const [step, setStep] = useState<LoginStep>('welcome');
  const [gradientEnabled, setGradientEnabled] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const screenOpacity = useRef(new Animated.Value(0.78)).current;
  const screenTranslateY = useRef(new Animated.Value(18)).current;
  const screenScale = useRef(new Animated.Value(0.992)).current;
  const transitioning = useRef(false);
  const backgroundBlurTarget = useRef<View | null>(null);
  const compact = height < 720;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      screenOpacity.stopAnimation();
      screenTranslateY.stopAnimation();
      screenScale.stopAnimation();
      screenOpacity.setValue(1);
      screenTranslateY.setValue(0);
      screenScale.setValue(1);
      return;
    }
    const animation = Animated.parallel([
      Animated.timing(screenOpacity, {
        duration: 520,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.timing(screenTranslateY, {
        duration: 560,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
        toValue: 0,
        useNativeDriver: true,
      }),
      Animated.timing(screenScale, {
        duration: 560,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
        toValue: 1,
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [reduceMotion, screenOpacity, screenScale, screenTranslateY]);

  const changeStep = (next: LoginStep, nextDirection: number) => {
    if (step === next || transitioning.current) return;
    if (reduceMotion) {
      setStep(next);
      return;
    }
    transitioning.current = true;
    Animated.parallel([
      Animated.timing(screenOpacity, {
        duration: 190,
        easing: Easing.in(Easing.cubic),
        toValue: 0.14,
        useNativeDriver: true,
      }),
      Animated.timing(screenTranslateY, {
        duration: 210,
        easing: Easing.inOut(Easing.cubic),
        toValue: nextDirection * -10,
        useNativeDriver: true,
      }),
      Animated.timing(screenScale, {
        duration: 210,
        easing: Easing.inOut(Easing.cubic),
        toValue: 0.995,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (!finished) {
        transitioning.current = false;
        return;
      }
      setStep(next);
      screenOpacity.setValue(0.14);
      screenTranslateY.setValue(nextDirection * 20);
      screenScale.setValue(0.992);
      Animated.parallel([
        Animated.timing(screenOpacity, {
          duration: 390,
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(screenTranslateY, {
          duration: 430,
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          toValue: 0,
          useNativeDriver: true,
        }),
        Animated.timing(screenScale, {
          duration: 430,
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          toValue: 1,
          useNativeDriver: true,
        }),
      ]).start(() => {
        transitioning.current = false;
      });
    });
  };

  const animatedScreen = {
    opacity: screenOpacity,
    transform: [
      { translateY: screenTranslateY },
      { scale: screenScale },
    ],
  };

  return (
    <BackgroundBlurTarget.Provider value={backgroundBlurTarget}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
        <BlurTargetView pointerEvents="none" ref={backgroundBlurTarget} style={StyleSheet.absoluteFill}>
          <AnimatedBackground enabled={gradientEnabled} motionEnabled={active} />
        </BlurTargetView>
        <Animated.View style={[styles.screenFrame, animatedScreen]}>
          {step === 'welcome' ? (
            <WelcomeScreen compact={compact} onEnter={onEnter} onOpenCredentials={() => changeStep('credentials', 1)} />
          ) : (
            <CredentialsScreen compact={compact} onBack={() => changeStep('welcome', -1)} onEnter={onEnter} />
          )}
        </Animated.View>
        <PressScale
          accessibilityLabel={gradientEnabled ? '배경 그라데이션 끄기' : '배경 그라데이션 켜기'}
          accessibilityRole="button"
          hitSlop={4}
          onPress={() => setGradientEnabled((enabled) => !enabled)}
          scaleTo={0.94}
          style={styles.gradientToggle}
        >
          <View style={styles.gradientToggleHitArea} />
        </PressScale>
      </SafeAreaView>
    </BackgroundBlurTarget.Provider>
  );
}

function AnimatedBackground({ enabled, motionEnabled }: { enabled: boolean; motionEnabled: boolean }) {
  const drift = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  const visibility = useRef(new Animated.Value(enabled ? 1 : 0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  useEffect(() => {
    Animated.timing(visibility, {
      duration: reduceMotion ? 0 : 380,
      easing: Easing.out(Easing.cubic),
      toValue: enabled ? 1 : 0,
      useNativeDriver: true,
    }).start();
  }, [enabled, reduceMotion, visibility]);

  useEffect(() => {
    if (!motionEnabled) return;
    if (reduceMotion) {
      drift.setValue(0.35);
      breathe.setValue(0.3);
      return;
    }
    const animation = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(drift, { duration: 9200, toValue: 1, useNativeDriver: true }),
          Animated.timing(drift, { duration: 9200, toValue: 0, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(breathe, { duration: 6800, toValue: 1, useNativeDriver: true }),
          Animated.timing(breathe, { duration: 6800, toValue: 0, useNativeDriver: true }),
        ]),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [breathe, drift, motionEnabled, reduceMotion]);

  const upperTransform = {
    transform: [
      { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [-30, 34] }) },
      { translateY: breathe.interpolate({ inputRange: [0, 1], outputRange: [-14, 26] }) },
      { scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.06] }) },
    ],
  };
  const lowerTransform = {
    transform: [
      { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [28, -36] }) },
      { translateY: breathe.interpolate({ inputRange: [0, 1], outputRange: [24, -16] }) },
      { scale: drift.interpolate({ inputRange: [0, 1], outputRange: [1.05, 0.94] }) },
    ],
  };

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.backgroundBase]}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: visibility }]}>
        <LinearGradient colors={['#FFFDF4', '#FFFFFF', '#FBFFF6']} locations={[0, 0.48, 1]} style={StyleSheet.absoluteFill} />
        <Animated.View style={[styles.upperGlow, upperTransform]}>
          <LinearGradient colors={['rgba(255,237,129,0.24)', 'rgba(255,251,218,0.03)']} style={styles.glowFill} />
        </Animated.View>
        <Animated.View style={[styles.mintGlow, lowerTransform]}>
          <LinearGradient colors={['rgba(147,246,181,0.20)', 'rgba(224,255,234,0.02)']} style={styles.glowFill} />
        </Animated.View>
        <Animated.View style={[styles.lowerGlow, upperTransform]}>
          <LinearGradient colors={['rgba(229,246,132,0.14)', 'rgba(255,255,238,0.01)']} style={styles.glowFill} />
        </Animated.View>
        <BlurView intensity={20} pointerEvents="none" style={StyleSheet.absoluteFill} tint="extraLight" />
      </Animated.View>
    </View>
  );
}

function WelcomeScreen({ compact, onEnter, onOpenCredentials }: { compact: boolean; onEnter: () => void; onOpenCredentials: () => void }) {
  return (
    <View style={styles.welcome}>
      <View style={[styles.brandBlock, compact && styles.brandBlockCompact]}>
        <Image accessibilityLabel="오늘도" resizeMode="contain" source={images.logoKr} style={styles.welcomeLogo} />
        <Text style={styles.tagline}>오늘도와 함께{`\n`}성장하는 하루!</Text>
      </View>
      <View style={[styles.welcomeActions, compact && styles.actionsCompact]}>
        <SolidLoginButton backgroundColor={colors.yellow} label="카카오로 시작하기" mark={images.kakao} onPress={onEnter} textColor="#211A18" />
        <SolidLoginButton backgroundColor={colors.blue} label="Google로 시작하기" mark={images.google} onPress={onEnter} textColor={colors.white} />
        <PressScale accessibilityRole="button" onPress={onOpenCredentials}>
          <GlassSurface interactive radius={24} style={styles.actionSurface}>
            <Ionicons color="#7D7D7D" name="person-outline" size={24} />
            <Text style={styles.glassActionLabel}>아이디로 로그인</Text>
          </GlassSurface>
        </PressScale>
      </View>
    </View>
  );
}

function CredentialsScreen({ compact, onBack, onEnter }: { compact: boolean; onBack: () => void; onEnter: () => void }) {
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [focused, setFocused] = useState<FocusedField>(null);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.credentials}>
      <View style={styles.loginHeader}>
        <PressScale accessibilityLabel="로그인 첫 화면으로 돌아가기" accessibilityRole="button" hitSlop={8} onPress={onBack}>
          <GlassSurface contentStyle={styles.backContent} interactive radius={23} style={styles.backSurface}>
            <Ionicons color={colors.ink} name="chevron-back" size={32} />
          </GlassSurface>
        </PressScale>
        <Text style={styles.loginTitle}>로그인</Text>
        <View style={styles.headerBalance} />
      </View>

      <View style={[styles.fieldsArea, compact && styles.fieldsAreaCompact]}>
        <GlassSurface radius={30} style={[styles.inputSurface, focused === 'id' && styles.inputSurfaceFocused]}>
          <Ionicons color={focused === 'id' ? colors.mint : '#929292'} name="person-outline" size={23} />
          <TextInput
            accessibilityLabel="아이디"
            autoCapitalize="none"
            autoCorrect={false}
            onBlur={() => setFocused(null)}
            onChangeText={setId}
            onFocus={() => setFocused('id')}
            placeholder="아이디"
            placeholderTextColor="#9A9A9A"
            returnKeyType="next"
            style={styles.input}
            textContentType="username"
            value={id}
          />
        </GlassSurface>
        <GlassSurface radius={30} style={[styles.inputSurface, focused === 'password' && styles.inputSurfaceFocused]}>
          <Ionicons color={focused === 'password' ? colors.mint : '#929292'} name="mail-outline" size={22} />
          <TextInput
            accessibilityLabel="비밀번호"
            autoCapitalize="none"
            autoCorrect={false}
            onBlur={() => setFocused(null)}
            onChangeText={setPassword}
            onFocus={() => setFocused('password')}
            onSubmitEditing={onEnter}
            placeholder="비밀번호"
            placeholderTextColor="#9A9A9A"
            returnKeyType="done"
            secureTextEntry={!passwordVisible}
            style={styles.input}
            textContentType="password"
            value={password}
          />
          <PressScale
            accessibilityLabel={passwordVisible ? '비밀번호 숨기기' : '비밀번호 표시'}
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => setPasswordVisible((visible) => !visible)}
            scaleTo={0.9}
          >
            <Ionicons color="#888888" name={passwordVisible ? 'eye-outline' : 'eye-off-outline'} size={22} />
          </PressScale>
        </GlassSurface>
      </View>

      <View style={[styles.credentialActions, compact && styles.credentialActionsCompact]}>
        <PressScale accessibilityRole="button" onPress={() => undefined}>
          <GlassSurface interactive muted radius={24} style={styles.secondaryActionSurface}>
            <Text style={styles.secondaryActionLabel}>회원가입</Text>
          </GlassSurface>
        </PressScale>
        <PressScale accessibilityRole="button" onPress={onEnter} style={styles.primaryAction}>
          <LinearGradient colors={['#00C795', '#00B983']} end={{ x: 1, y: 1 }} start={{ x: 0, y: 0 }} style={styles.primaryGradient}>
            <View pointerEvents="none" style={styles.primaryHighlight} />
            <Text style={styles.primaryActionLabel}>시작하기</Text>
          </LinearGradient>
        </PressScale>
      </View>
    </KeyboardAvoidingView>
  );
}

function GlassSurface({
  children,
  contentStyle,
  interactive = false,
  muted = false,
  radius = 30,
  style,
}: {
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  interactive?: boolean;
  muted?: boolean;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const blurTarget = useContext(BackgroundBlurTarget);
  const useLiquidGlass = Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  const curve = { borderCurve: 'continuous' as const, borderRadius: radius };
  const overlayColors = muted
    ? ['rgba(255,255,255,0.34)', 'rgba(255,255,255,0.10)'] as const
    : ['rgba(255,255,255,0.62)', 'rgba(255,255,255,0.20)'] as const;

  return (
    <View style={[styles.glassSurface, curve, muted && styles.glassSurfaceMuted, style]}>
      <View pointerEvents="none" style={[styles.glassClip, curve]}>
        {useLiquidGlass ? (
          <GlassView
            colorScheme="light"
            glassEffectStyle="regular"
            isInteractive={interactive}
            style={StyleSheet.absoluteFill}
            tintColor={muted ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.38)'}
          />
        ) : (
          <BlurView
            blurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : 'none'}
            blurTarget={blurTarget}
            intensity={muted ? 50 : 72}
            style={StyleSheet.absoluteFill}
            tint="extraLight"
          />
        )}
        <View style={styles.glassBaseLayer} />
        <LinearGradient colors={overlayColors} end={{ x: 1, y: 1 }} start={{ x: 0, y: 0 }} style={StyleSheet.absoluteFill} />
        <View style={[styles.glassEffectOutline, curve]} />
        <View style={[styles.glassInnerRefraction, { borderRadius: Math.max(0, radius - 2) }]} />
        <View style={styles.glassShine} />
      </View>
      <View style={[styles.glassContent, contentStyle]}>{children}</View>
    </View>
  );
}

function SolidLoginButton({ backgroundColor, label, mark, onPress, textColor }: { backgroundColor: string; label: string; mark: number; onPress: () => void; textColor: string }) {
  return (
    <PressScale accessibilityRole="button" onPress={onPress} style={[styles.solidAction, { backgroundColor }]}>
      <View pointerEvents="none" style={styles.solidHighlight} />
      <Image resizeMode="contain" source={mark} style={styles.socialMark} />
      <Text style={[styles.solidActionLabel, { color: textColor }]}>{label}</Text>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.white, flex: 1 },
  backgroundBase: { backgroundColor: '#FFFFFF' },
  screenFrame: { alignSelf: 'center', flex: 1, maxWidth: 480, width: '100%' },
  gradientToggle: { height: 46, opacity: 0.01, position: 'absolute', right: 17, top: 18, width: 46, zIndex: 40 },
  gradientToggleHitArea: { flex: 1 },
  welcome: { flex: 1, justifyContent: 'space-between', paddingBottom: 42, paddingHorizontal: 21 },
  brandBlock: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingTop: 66, transform: [{ translateY: 12 }] },
  brandBlockCompact: { paddingTop: 30, transform: [{ translateY: 0 }] },
  welcomeLogo: { height: 55, width: 112 },
  tagline: { color: '#A4A4A4', fontFamily: fonts.laundryBold, fontSize: 28, letterSpacing: -1, lineHeight: 35, marginTop: 20, textAlign: 'center' },
  welcomeActions: { gap: 12 },
  actionsCompact: { gap: 9 },
  solidAction: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.82)',
    borderCurve: 'continuous',
    borderRadius: 24,
    borderWidth: 1.2,
    boxShadow: '0 8px 40px rgba(70,106,96,0.12)',
    flexDirection: 'row',
    height: 62,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  solidHighlight: { backgroundColor: 'rgba(255,255,255,0.18)', height: 1, left: 18, position: 'absolute', right: 18, top: 1 },
  socialMark: { height: 24, marginRight: 10, width: 24 },
  solidActionLabel: { fontFamily: fonts.laundryBold, fontSize: 20, letterSpacing: -0.4 },
  glassSurface: {
    backgroundColor: 'rgba(253,253,253,0.54)',
    boxShadow: '0 8px 40px rgba(70,106,96,0.16)',
    overflow: 'hidden',
    position: 'relative',
  },
  glassSurfaceMuted: { backgroundColor: 'rgba(255,255,255,0.25)', boxShadow: '0 8px 40px rgba(0,0,0,0.08)' },
  glassClip: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  glassBaseLayer: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(253,253,253,0.24)' },
  glassEffectOutline: { ...StyleSheet.absoluteFill, borderColor: 'rgba(255,255,255,0.96)', borderWidth: 2 },
  glassInnerRefraction: { bottom: 2, borderColor: 'rgba(255,255,255,0.42)', borderWidth: 1, left: 2, position: 'absolute', right: 2, top: 2 },
  glassShine: { backgroundColor: 'rgba(255,255,255,0.76)', height: 1, left: 20, position: 'absolute', right: 20, top: 2 },
  glassContent: { alignItems: 'center', flex: 1, flexDirection: 'row', justifyContent: 'center', paddingHorizontal: 22 },
  actionSurface: { height: 62 },
  secondaryActionSurface: { height: 62 },
  glassActionLabel: { color: '#777777', fontFamily: fonts.laundryBold, fontSize: 19, letterSpacing: -0.3, marginLeft: 12 },
  upperGlow: { height: 420, left: -170, position: 'absolute', top: -180, width: 430 },
  mintGlow: { height: 430, position: 'absolute', right: -210, top: -160, width: 430 },
  lowerGlow: { bottom: -230, height: 470, position: 'absolute', right: -180, width: 470 },
  glowFill: { borderRadius: 999, flex: 1 },
  credentials: { flex: 1, paddingBottom: 38, paddingHorizontal: 17 },
  loginHeader: { alignItems: 'center', flexDirection: 'row', height: 82, justifyContent: 'space-between' },
  backSurface: { height: 46, width: 46 },
  backContent: { paddingHorizontal: 0 },
  loginTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 19, letterSpacing: -0.3 },
  headerBalance: { height: 46, width: 46 },
  fieldsArea: { flex: 1, gap: 19, justifyContent: 'center', paddingBottom: 64 },
  fieldsAreaCompact: { gap: 12, paddingBottom: 20 },
  inputSurface: { height: 60 },
  inputSurfaceFocused: { borderColor: colors.mint, borderWidth: 2 },
  input: { color: '#777777', flex: 1, fontFamily: fonts.laundry, fontSize: 18, height: '100%', letterSpacing: -0.3, marginLeft: 12, paddingVertical: 0 },
  credentialActions: { gap: 12 },
  credentialActionsCompact: { gap: 9 },
  secondaryActionLabel: { color: '#999999', fontFamily: fonts.laundryBold, fontSize: 18 },
  primaryAction: {
    borderColor: 'rgba(255,255,255,0.82)',
    borderCurve: 'continuous',
    borderRadius: 24,
    borderWidth: 1.2,
    boxShadow: '0 12px 34px rgba(0,186,133,0.18)',
    height: 62,
    overflow: 'hidden',
  },
  primaryGradient: { alignItems: 'center', flex: 1, justifyContent: 'center', position: 'relative' },
  primaryHighlight: { backgroundColor: 'rgba(255,255,255,0.34)', height: 1, left: 20, position: 'absolute', right: 20, top: 1 },
  primaryActionLabel: { color: colors.white, fontFamily: fonts.laundryBold, fontSize: 21, letterSpacing: -0.5 },
});
