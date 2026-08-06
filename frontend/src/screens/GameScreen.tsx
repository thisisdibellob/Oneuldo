import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { PressScale } from '../components/PressScale';
import { BrandHeader, ProfileBar } from '../components/ui';
import { colors, fonts } from '../theme';

export function GameScreen() {
  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <BrandHeader />
      <Text style={styles.title}>오늘도 마을</Text>
      <PressScale style={styles.preview}>
        <Text style={styles.previewText}>
          캐릭터 미리보기를 할 수 있으며{'\n'}
          다음을 누르면 메타버스 형태의{'\n'}
          #D게임으로 진입 가능
        </Text>
      </PressScale>
      <View style={styles.spacer} />
      <ProfileBar />
      <View style={styles.bottomSpace} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { alignSelf: 'center', flexGrow: 1, maxWidth: 720, paddingHorizontal: 20, width: '100%' },
  title: { color: colors.ink, fontFamily: fonts.laundryBold, fontSize: 24, letterSpacing: -0.8, marginTop: 12 },
  preview: { alignItems: 'center', backgroundColor: '#D9D9D9', borderRadius: 16, height: 188, justifyContent: 'center', marginTop: 14 },
  previewText: { color: colors.ink, fontFamily: fonts.bold, fontSize: 16, lineHeight: 20, textAlign: 'center' },
  spacer: { flex: 1, minHeight: 320 },
  bottomSpace: { height: 112 },
});
