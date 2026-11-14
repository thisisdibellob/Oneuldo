import { Ionicons } from '@expo/vector-icons';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PressScale } from '../components/PressScale';
import { StickyBrandHeader } from '../components/ui';
import { villageBuildingArt, villageLandmarkArt } from '../game/gameAssets';
import { cardShadow, colors, fonts } from '../theme';

type GameScreenProps = { onEnter: () => void };

export function GameScreen({ onEnter }: GameScreenProps) {
  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} stickyHeaderIndices={[0]}>
      <StickyBrandHeader horizontalPadding={20} />
      <View style={styles.intro}>
        <View style={styles.dayBadge}>
          <Ionicons color="#6D593F" name="sunny" size={14} />
          <Text style={styles.dayBadgeText}>DAY 1 · 맑음</Text>
        </View>
        <Text style={styles.eyebrow}>오늘도 마을</Text>
        <Text style={styles.title}>마을에서 하루를{`\n`}시작해요</Text>
        <Text style={styles.description}>주민과 인사하고, 장을 보고, 버스로 도서관에 다녀와요.</Text>
      </View>
      <PressScale accessibilityRole="button" accessibilityLabel="오늘도 마을 들어가기"
        accessibilityHint="마을을 걸으며 집, 마트, 버스 정류장으로 이동합니다"
        onPress={onEnter} style={styles.worldCard}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.preview}>
          <View style={styles.path} />
          <Image source={villageBuildingArt['player-home']} resizeMode="contain" style={styles.home} />
          <Image source={villageBuildingArt.market} resizeMode="contain" style={styles.market} />
          <Image source={villageLandmarkArt.busStop} resizeMode="contain" style={styles.stop} />
        </View>
        <View style={styles.cardCopy}>
          <Text style={styles.cardTitle}>오늘도 마을</Text>
          <Text style={styles.cardDescription}>가고 싶은 곳으로 직접 걸어가 보세요.{`\n`}도서관은 마을 정류장에서 버스를 타고 갈 수 있어요.</Text>
          <View style={styles.places}>
            <Text style={styles.place}>우리 집</Text><Text style={styles.place}>하늘마트</Text>
            <Text style={styles.place}>버스 정류장</Text><Text style={styles.place}>하늘도서관</Text>
          </View>
          <View style={styles.action}>
            <Text style={styles.actionText}>마을 들어가기</Text>
            <Ionicons color={colors.white} name="arrow-forward" size={21} />
          </View>
        </View>
      </PressScale>
      <View style={styles.bottomSpace} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { alignSelf: 'center', backgroundColor: '#F5F1E7', maxWidth: 720, paddingHorizontal: 20, width: '100%' },
  intro: { paddingBottom: 8, paddingTop: 18 },
  dayBadge: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: '#E9DFC8', borderColor: '#D5C6A7', borderRadius: 13, borderWidth: 1, flexDirection: 'row', gap: 5, paddingHorizontal: 9, paddingVertical: 5 },
  dayBadgeText: { color: '#6D593F', fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.4 },
  eyebrow: { color: '#4F725E', fontFamily: fonts.bold, fontSize: 13, letterSpacing: 0.2, lineHeight: 18, marginTop: 14 },
  title: { color: '#2B302B', fontFamily: fonts.laundryBold, fontSize: 30, letterSpacing: -1, lineHeight: 38, marginTop: 4 },
  description: { color: '#756E68', fontFamily: fonts.regular, fontSize: 14, lineHeight: 23, marginTop: 10 },
  worldCard: { backgroundColor: '#FFF8E9', borderColor: '#C9B48D', borderRadius: 18, borderWidth: 2, marginTop: 18, overflow: 'hidden', ...cardShadow },
  preview: { backgroundColor: '#DCE5CF', height: 216, overflow: 'hidden' },
  path: { backgroundColor: '#C9C5B5', height: 42, left: 0, right: 0, bottom: 24, position: 'absolute', borderTopColor: '#EDE8D7', borderBottomColor: '#EDE8D7', borderTopWidth: 6, borderBottomWidth: 6 },
  home: { position: 'absolute', left: '2%', top: 23, width: '45%', height: 149 },
  market: { position: 'absolute', right: '2%', top: 28, width: '47%', height: 142 },
  stop: { position: 'absolute', right: '10%', bottom: 4, width: '21%', height: 76 },
  cardCopy: { padding: 20 },
  cardTitle: { color: '#302820', fontFamily: fonts.laundryBold, fontSize: 23 },
  cardDescription: { color: '#756E68', fontFamily: fonts.regular, fontSize: 14, lineHeight: 23, marginTop: 10 },
  places: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 },
  place: { backgroundColor: '#ECECDD', borderRadius: 10, color: '#596D54', fontFamily: fonts.medium, fontSize: 12, paddingHorizontal: 10, paddingVertical: 7 },
  action: { alignItems: 'center', backgroundColor: '#3F785D', borderColor: '#2D5D46', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 9, justifyContent: 'center', marginTop: 22, minHeight: 50 },
  actionText: { color: colors.white, fontFamily: fonts.bold, fontSize: 16 },
  bottomSpace: { height: 128 },
});
