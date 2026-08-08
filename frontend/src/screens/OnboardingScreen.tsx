import { Image, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { images } from '../assets';
import { PressScale } from '../components/PressScale';
import { colors, fonts } from '../theme';

export function OnboardingScreen({ onEnter }: { onEnter: () => void }) {
  const { height } = useWindowDimensions();
  const compact = height < 760;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.frame}>
        <ScrollView contentContainerStyle={[styles.content, { minHeight: height - 20 }, compact && styles.contentCompact]} showsVerticalScrollIndicator={false}>
          <Image accessibilityLabel="오늘도 캐릭터와 함께 성장하는 모습" resizeMode="contain" source={images.onboardingHero} style={[styles.hero, compact && styles.heroCompact]} />
          <Image accessibilityLabel="오늘도" resizeMode="contain" source={images.logoKr} style={styles.logoKr} />
          <Text style={styles.headline}>오늘도와 함께{'\n'}성장하는 하루</Text>
          <Text style={styles.subline}>당신과 함께해요.</Text>
          <View style={[styles.buttons, compact && styles.buttonsCompact]}>
            <SocialButton background={colors.yellow} foreground="#191919" label="카카오로 시작하기" mark={images.kakao} onPress={onEnter} />
            <SocialButton background={colors.blue} foreground={colors.white} label="Google로 시작하기" mark={images.google} onPress={onEnter} />
          </View>
        </ScrollView>
        <View style={styles.topLogo}><Image source={images.logo} resizeMode="contain" style={styles.logo} /></View>
      </View>
    </SafeAreaView>
  );
}

function SocialButton({ background, foreground, mark, label, onPress }: { background: string; foreground: string; mark: number; label: string; onPress: () => void }) {
  return (
    <PressScale accessibilityRole="button" onPress={onPress} style={[styles.socialButton, { backgroundColor: background }]}>
      <Image source={mark} style={styles.mark} />
      <Text style={[styles.socialLabel, { color: foreground }]}>{label}</Text>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.white, flex: 1 },
  frame: { alignSelf: 'center', flex: 1, maxWidth: 430, width: '100%' },
  content: { paddingBottom: 28, paddingHorizontal: 20, paddingTop: 62 },
  contentCompact: { paddingTop: 52 },
  hero: { alignSelf: 'center', height: 270, marginTop: 4, width: 300 },
  heroCompact: { height: 220, width: 255 },
  logoKr: { height: 42, marginTop: 4, width: 82 },
  headline: { color: colors.ink, fontFamily: fonts.laundryBold, fontSize: 27, letterSpacing: -0.8, lineHeight: 31, marginTop: 12 },
  subline: { color: colors.sage, fontFamily: fonts.laundryBold, fontSize: 25, letterSpacing: -0.7, marginTop: 8 },
  buttons: { gap: 14, marginTop: 78 },
  buttonsCompact: { marginTop: 34 },
  socialButton: { alignItems: 'center', borderRadius: 20, flexDirection: 'row', height: 62, justifyContent: 'center' },
  mark: { height: 22, marginRight: 9, resizeMode: 'contain', width: 22 },
  socialLabel: { fontFamily: fonts.medium, fontSize: 16 },
  topLogo: { backgroundColor: colors.white, height: 58, left: 0, paddingLeft: 20, paddingTop: 5, position: 'absolute', right: 0, top: 0 },
  logo: { height: 40, width: 96 },
});
