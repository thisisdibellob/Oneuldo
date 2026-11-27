import type { PropsWithChildren, ReactNode } from 'react';
import {
  Image,
  ImageSourcePropType,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';

import { images } from '../assets';
import { colors, fonts } from '../theme';

export function BrandHeader({ right }: { right?: ReactNode }) {
  return (
    <View style={styles.header}>
      <Image accessibilityLabel="오늘도" resizeMode="contain" source={images.logo} style={styles.logo} />
      {right ?? (
        <View style={styles.headerRight}>
          <Image accessibilityLabel="알림" resizeMode="contain" source={images.bell} style={styles.bell} />
          <View style={styles.profileCircle} />
        </View>
      )}
    </View>
  );
}

export function StickyBrandHeader({
  horizontalPadding = 20,
  right,
  backgroundColor,
}: {
  horizontalPadding?: number;
  right?: ReactNode;
  /** 화면 배경이 흰색이 아닐 때 헤더 바탕을 맞춘다(없으면 기존 흰색). */
  backgroundColor?: string;
}) {
  return (
    <View
      collapsable={false}
      style={[
        styles.stickyHeader,
        { marginHorizontal: -horizontalPadding, paddingHorizontal: horizontalPadding },
        backgroundColor ? { backgroundColor } : null,
      ]}
    >
      <BrandHeader right={right} />
    </View>
  );
}

export function Card({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function IconTile({
  source,
  size = 54,
  color = colors.mintSoft,
}: {
  source: ImageSourcePropType;
  size?: number;
  color?: string;
}) {
  return (
    <View style={[styles.iconTile, { width: size, height: size, backgroundColor: color }]}>
      <Image source={source} resizeMode="contain" style={{ width: size * 0.76, height: size * 0.76 }} />
    </View>
  );
}

export function ProfileBar() {
  return (
    <View style={styles.profileBar}>
      <View style={styles.profileDot} />
      <Text style={styles.profileText}>내 프로필과 레벨</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 54,
    justifyContent: 'space-between',
  },
  logo: { height: 32, width: 88 },
  headerRight: { alignItems: 'center', flexDirection: 'row', gap: 13 },
  bell: { height: 28, width: 28 },
  profileCircle: { backgroundColor: '#D9D9D9', borderRadius: 18, height: 36, width: 36 },
  stickyHeader: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderBottomColor: 'rgba(0,0,0,0.045)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 20,
  },
  card: { backgroundColor: colors.white, borderRadius: 20 },
  iconTile: { alignItems: 'center', borderRadius: 18, justifyContent: 'center' },
  profileBar: {
    alignItems: 'center',
    backgroundColor: '#D9D9D9',
    borderRadius: 16,
    flexDirection: 'row',
    height: 72,
    paddingHorizontal: 12,
  },
  profileDot: { backgroundColor: '#666', borderRadius: 24, height: 48, width: 48 },
  profileText: {
    color: colors.ink,
    flex: 1,
    fontFamily: fonts.laundryBold,
    fontSize: 18,
    textAlign: 'center',
  },
});
