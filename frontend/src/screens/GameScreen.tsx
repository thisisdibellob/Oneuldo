import { Ionicons } from '@expo/vector-icons';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';

import { icons, images } from '../assets';
import { PressScale } from '../components/PressScale';
import { StickyBrandHeader } from '../components/ui';
import { cardShadow, colors, fonts } from '../theme';

const places = [
  { icon: icons.home, label: '우리 집', background: '#FFF0EB' },
  { icon: icons.mart, label: '마트', background: '#FFF5D8' },
  { icon: icons.bus, label: '정류장', background: '#EAF6FF' },
];

export function GameScreen({ onEnter }: { onEnter: () => void }) {
  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} stickyHeaderIndices={[0]}>
      <StickyBrandHeader horizontalPadding={20} />

      <Text style={styles.eyebrow}>게임</Text>
      <Text style={styles.title}>오늘도 마을을 걸어볼까요?</Text>

      <PressScale
        accessibilityHint="2D 마을 게임으로 이동합니다"
        accessibilityLabel="오늘도 마을 들어가기"
        accessibilityRole="button"
        onPress={onEnter}
        style={styles.villageCard}
      >
        <View style={styles.cardHeading}>
          <View>
            <Text style={styles.villageName}>오늘도 마을</Text>
          </View>
          <View style={styles.mapBadge}>
            <Image resizeMode="contain" source={icons.map} style={styles.mapIcon} />
          </View>
        </View>

        <View style={styles.villagePreview}>
          <View style={styles.sun} />
          <Image resizeMode="contain" source={images.cloudy} style={styles.cloud} />
          <View style={[styles.hill, styles.hillLeft]} />
          <View style={[styles.hill, styles.hillRight]} />
          <View style={styles.road} />
          <View style={styles.roadLine} />
          <Image resizeMode="contain" source={icons.home} style={styles.home} />
          <Image resizeMode="contain" source={icons.mart} style={styles.mart} />
          <Image resizeMode="contain" source={icons.bus} style={styles.bus} />
        </View>

        <View style={styles.enterButton}>
          <Text style={styles.enterText}>마을 들어가기</Text>
          <Ionicons color={colors.white} name="arrow-forward" size={22} />
        </View>
      </PressScale>

      <Text style={styles.sectionTitle}>둘러볼 곳</Text>
      <View style={styles.places}>
        {places.map((place) => (
          <View key={place.label} style={styles.place}>
            <View style={[styles.placeIconWrap, { backgroundColor: place.background }]}>
              <Image resizeMode="contain" source={place.icon} style={styles.placeIcon} />
            </View>
            <Text style={styles.placeLabel}>{place.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.bottomSpace} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    alignSelf: 'center',
    maxWidth: 720,
    paddingHorizontal: 20,
    width: '100%',
  },
  eyebrow: {
    color: colors.mint,
    fontFamily: fonts.semibold,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 12,
  },
  title: {
    color: colors.ink,
    fontFamily: fonts.laundryBold,
    fontSize: 24,
    letterSpacing: -0.8,
    lineHeight: 32,
    marginTop: 4,
  },
  villageCard: {
    backgroundColor: colors.white,
    borderColor: '#E6F0EE',
    borderRadius: 24,
    borderWidth: 1,
    marginTop: 20,
    overflow: 'hidden',
    padding: 12,
    ...cardShadow,
  },
  cardHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 12,
    paddingHorizontal: 6,
    paddingTop: 4,
  },
  villageName: {
    color: colors.ink,
    fontFamily: fonts.bold,
    fontSize: 20,
    letterSpacing: -0.5,
    lineHeight: 26,
  },
  mapBadge: {
    alignItems: 'center',
    backgroundColor: '#E8FAF2',
    borderRadius: 18,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  mapIcon: { height: 34, width: 34 },
  villagePreview: {
    backgroundColor: '#DFF5FF',
    borderRadius: 18,
    height: 190,
    overflow: 'hidden',
    position: 'relative',
  },
  sun: {
    backgroundColor: '#FFE27B',
    borderRadius: 24,
    height: 48,
    left: 24,
    position: 'absolute',
    top: 20,
    width: 48,
  },
  cloud: {
    height: 48,
    opacity: 0.94,
    position: 'absolute',
    right: 30,
    top: 16,
    width: 62,
  },
  hill: {
    backgroundColor: '#A8E6B1',
    borderRadius: 160,
    bottom: -78,
    height: 190,
    position: 'absolute',
    width: 260,
  },
  hillLeft: { left: -82 },
  hillRight: { backgroundColor: '#82D79A', right: -75 },
  road: {
    backgroundColor: '#F6D9A9',
    borderRadius: 32,
    bottom: 27,
    height: 42,
    left: -18,
    position: 'absolute',
    transform: [{ rotate: '-7deg' }],
    width: 410,
  },
  roadLine: {
    borderColor: '#FFFFFF',
    borderRadius: 30,
    borderStyle: 'dashed',
    borderWidth: 1.5,
    bottom: 46,
    height: 1,
    left: 18,
    opacity: 0.9,
    position: 'absolute',
    transform: [{ rotate: '-7deg' }],
    width: 330,
  },
  home: {
    bottom: 65,
    height: 94,
    left: 28,
    position: 'absolute',
    width: 94,
  },
  mart: {
    bottom: 58,
    height: 100,
    position: 'absolute',
    right: 18,
    width: 100,
  },
  bus: {
    bottom: 18,
    height: 65,
    left: '42%',
    position: 'absolute',
    width: 65,
  },
  enterButton: {
    alignItems: 'center',
    backgroundColor: colors.mint,
    borderRadius: 16,
    flexDirection: 'row',
    height: 56,
    justifyContent: 'center',
    marginTop: 12,
  },
  enterText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 17,
    letterSpacing: -0.4,
    marginRight: 8,
  },
  sectionTitle: {
    color: colors.ink,
    fontFamily: fonts.bold,
    fontSize: 18,
    letterSpacing: -0.45,
    marginTop: 24,
  },
  places: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  place: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: '#EEEEEE',
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    paddingBottom: 12,
    paddingHorizontal: 6,
    paddingTop: 8,
  },
  placeIconWrap: {
    alignItems: 'center',
    borderRadius: 15,
    height: 64,
    justifyContent: 'center',
    width: '100%',
  },
  placeIcon: { height: 54, width: 54 },
  placeLabel: {
    color: '#444444',
    fontFamily: fonts.semibold,
    fontSize: 14,
    lineHeight: 18,
    marginTop: 8,
  },
  bottomSpace: { height: 112 },
});
