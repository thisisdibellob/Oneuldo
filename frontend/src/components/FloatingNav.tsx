import { useEffect, useRef, useState } from 'react';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import {
  AccessibilityInfo,
  Animated,
  ImageSourcePropType,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { icons } from '../assets';
import { colors, fonts } from '../theme';

export const navItems = [
  { label: '홈', icon: icons.home },
  { label: '퀘스트', icon: icons.quest },
  { label: '게임', icon: icons.game },
  { label: '분석', icon: icons.ranking },
  { label: '사용자', icon: icons.user },
];

export function FloatingNav({
  current,
  onSelect,
}: {
  current: number;
  onSelect: (index: number) => void;
}) {
  const content = (
    <View style={styles.row}>
      {navItems.map((item, index) => (
        <NavItem
          icon={item.icon}
          key={item.label}
          label={item.label}
          onPress={() => onSelect(index)}
          selected={current === index}
        />
      ))}
    </View>
  );
  const useLiquidGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();

  return (
    <View pointerEvents="box-none" style={styles.outer}>
      <View style={styles.bar}>
        <View pointerEvents="none" style={styles.surfaceClip}>
          {useLiquidGlass ? (
            <GlassView
              colorScheme="light"
              glassEffectStyle="regular"
              style={styles.surface}
              tintColor="rgba(255,255,255,0.56)"
            />
          ) : Platform.OS === 'web' ? (
            <View style={[styles.surface, styles.webGlass]} />
          ) : (
            <BlurView intensity={76} tint="light" style={[styles.surface, styles.fallbackGlass]} />
          )}
          <View style={styles.surfaceBorder} />
        </View>
        {content}
      </View>
    </View>
  );
}

function NavItem({
  icon,
  label,
  onPress,
  selected,
}: {
  icon: ImageSourcePropType;
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  const progress = useRef(new Animated.Value(selected ? 1 : 0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(selected ? 1 : 0);
      return;
    }
    Animated.spring(progress, {
      damping: 16,
      mass: 0.72,
      stiffness: 180,
      toValue: selected ? 1 : 0,
      useNativeDriver: true,
    }).start();
  }, [progress, reduceMotion, selected]);

  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.78, 1],
  });
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -12],
  });
  const opacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.46, 1],
  });

  return (
    <Pressable
      accessibilityLabel={`${label} 탭`}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.item, pressed && styles.pressed]}
    >
      <View style={styles.iconStage}>
        <Animated.Image
          resizeMode="contain"
          source={icon}
          style={[
            styles.icon,
            {
              opacity,
              transform: [{ translateY }, { scale }],
            },
          ]}
        />
      </View>
      <Animated.Text style={[styles.label, { opacity }]}>{label}</Animated.Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outer: { alignItems: 'center', bottom: 16, left: 25, pointerEvents: 'box-none', position: 'absolute', right: 25 },
  bar: {
    backgroundColor: 'rgba(255,255,255,0.01)',
    borderRadius: 31,
    boxShadow: '0 0 8px rgba(0,0,0,0.04), 0 8px 40px rgba(0,0,0,0.08)',
    height: 62,
    maxWidth: 430,
    overflow: 'visible',
    position: 'relative',
    width: '100%',
  },
  surfaceClip: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 31,
    overflow: 'hidden',
  },
  surface: {
    ...StyleSheet.absoluteFillObject,
  },
  fallbackGlass: { backgroundColor: 'rgba(255,255,255,0.72)' },
  webGlass: { backgroundColor: 'rgba(255,255,255,0.88)' },
  surfaceBorder: {
    ...StyleSheet.absoluteFillObject,
    borderColor: 'rgba(255,255,255,0.96)',
    borderRadius: 31,
    borderWidth: 1,
  },
  row: { flexDirection: 'row', height: 62, overflow: 'visible' },
  item: { alignItems: 'center', flex: 1, justifyContent: 'flex-end', paddingBottom: 7 },
  iconStage: { alignItems: 'center', height: 43, justifyContent: 'flex-end', overflow: 'visible', width: 58 },
  icon: { bottom: -5, height: 58, position: 'absolute', width: 58 },
  label: { color: colors.text, fontFamily: fonts.handwriting, fontSize: 12, lineHeight: 13 },
  pressed: { opacity: 0.64 },
});
