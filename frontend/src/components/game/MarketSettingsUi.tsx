import { ReactNode, useContext, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  useWindowDimensions,
  View,
  ViewStyle
} from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { PressScale } from '../PressScale';
import { fonts } from '../../theme';
import { useMarketReducedMotion } from './MarketPanelTransition';

/** Sett1–Sett6, qhD1bhkDWesf29T22fWlhP. Sizes are world-independent CSS/dp units. */
export const settingsColors = {
  backdrop: 'rgba(31,42,34,0.65)',
  background: '#56CA9D',
  panel: '#D4D4C0',
  tabTrack: '#E4E4DB',
  accent: '#41B8BA',
  selected: '#439A9C',
  field: '#C9C9B1',
  card: '#C3C3AF',
  ink: '#6D6551',
  label: '#79725D',
  muted: '#9A907C',
  tabText: '#555555',
  white: '#FFFFFF'
};
export const settingsAssets = {
  edit: require('../../../assets/images/game/settings/layout-edit.png'),
  directionPad: require('../../../assets/images/game/settings/direction-pad.png'),
  chevron: require('../../../assets/images/game/settings/chevron-up.png'),
  step: require('../../../assets/images/game/settings/step-up.png')
};

export function SettingsSurface({
  children,
  footer,
  title,
  hidden = false
}: {
  children: ReactNode;
  footer: ReactNode;
  title?: string;
  hidden?: boolean;
}) {
  const insets = useContext(SafeAreaInsetsContext);
  const { height } = useWindowDimensions();
  const reduced = useMarketReducedMotion();
  const entrance = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    entrance.stopAnimation();
    if (reduced) {
      entrance.setValue(1);
      return;
    }
    const animation = Animated.spring(entrance, {
      toValue: 1,
      damping: 21,
      stiffness: 150,
      mass: 0.8,
      useNativeDriver: true
    });
    animation.start();
    return () => animation.stop();
  }, [entrance, reduced]);
  return (
    <KeyboardAvoidingView
      testID="market-settings-backdrop"
      accessibilityViewIsModal
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
      behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}
      style={[
        ui.overlay,
        hidden && ui.hidden
      ]}
    >
      {/* iOS KeyboardAvoidingView replaces its own paddingBottom with the keyboard
          height, including zero. Keep the design's clearance on a separate View. */}
      <View testID="market-settings-insets" style={[ui.insetFrame, {
        paddingTop: Math.max((insets?.top ?? 0) + 8, title ? Math.min(51, height * 0.063) : Math.min(56, height * 0.069)),
        paddingBottom: Math.max(54, (insets?.bottom ?? 0) + 12)
      }]}>
      <Animated.View
        style={[
          ui.surface,
          {
            opacity: entrance,
            transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }]
          }
        ]}
      >
        <View style={ui.panel}>
          {title ? (
            <Text accessibilityRole="header" style={ui.editorTitle}>
              {title}
            </Text>
          ) : null}
          {children}
        </View>
      <View style={[ui.footer, title && { marginTop: 15 }]}>{footer}</View>
      </Animated.View>
      </View>
    </KeyboardAvoidingView>
  );
}

export function SettingsTabs<T extends string>({
  options,
  value,
  onChange,
  compact = false,
  disabled = false
}: {
  options: readonly { id: T; label: string; accessibilityLabel?: string }[];
  value: T;
  onChange: (value: T) => void;
  compact?: boolean;
  disabled?: boolean;
}) {
  const reduced = useMarketReducedMotion();
  const index = Math.max(
    0,
    options.findIndex((option) => option.id === value)
  );
  const [width, setWidth] = useState(0);
  const segment = Math.max(0, (width - 8) / options.length);
  return (
    <View style={[ui.tabs, compact && ui.tabsCompact]} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {width > 0 ? (
        <View pointerEvents="none" style={[ui.tabIndicator, { width: segment, left: 4 + index * segment }]} />
      ) : null}
      {options.map((option) => (
        <PressScale
          key={option.id}
          accessibilityRole="button"
          accessibilityLabel={option.accessibilityLabel ?? option.label}
          accessibilityState={{ selected: option.id === value, disabled }}
          disabled={disabled}
          scaleTo={reduced ? 1 : 0.98}
          onPress={() => {
            Keyboard.dismiss();
            onChange(option.id);
          }}
          style={ui.tab}
        >
          <Text numberOfLines={1} style={[ui.tabText, compact && ui.tabTextCompact, option.id === value && ui.white]}>
            {option.label}
          </Text>
        </PressScale>
      ))}
    </View>
  );
}

/** Tabs replace their contents immediately, without sliding or a delayed entrance. */
export function SettingsPage({ children }: { children: ReactNode }) {
  return <View>{children}</View>;
}

/** Only the edges with more content fade; controls remain touchable below the decorative veil. */
export function SettingsScroll({
  children,
  contentContainerStyle,
  testID,
  ...props
}: React.ComponentProps<typeof ScrollView>) {
  const reduced = useMarketReducedMotion();
  const geometry = useRef({ height: 0, content: 0, offset: 0 });
  const [edges, setEdges] = useState({ top: false, bottom: false });
  const top = useRef(new Animated.Value(0)).current;
  const bottom = useRef(new Animated.Value(0)).current;
  const update = () => {
    const next = {
      top: geometry.current.offset > 3,
      bottom: geometry.current.content - geometry.current.height - geometry.current.offset > 3
    };
    setEdges((previous) => (previous.top === next.top && previous.bottom === next.bottom ? previous : next));
  };
  useEffect(() => {
    top.stopAnimation();
    bottom.stopAnimation();
    if (reduced) {
      top.setValue(edges.top ? 1 : 0);
      bottom.setValue(edges.bottom ? 1 : 0);
      return;
    }
    const animation = Animated.parallel([
      Animated.timing(top, { toValue: edges.top ? 1 : 0, duration: 150, useNativeDriver: true }),
      Animated.timing(bottom, { toValue: edges.bottom ? 1 : 0, duration: 150, useNativeDriver: true })
    ]);
    animation.start();
    return () => animation.stop();
  }, [top, bottom, edges.top, edges.bottom, reduced]);
  const clear = 'rgba(212,212,192,0)';
  return (
    <View style={ui.scrollFrame}>
      <ScrollView
        {...props}
        testID={testID}
        style={[ui.scroll, props.style]}
        contentContainerStyle={[ui.content, contentContainerStyle]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        nestedScrollEnabled
        directionalLockEnabled
        canCancelContentTouches
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onLayout={(event) => {
          geometry.current.height = event.nativeEvent.layout.height;
          update();
          props.onLayout?.(event);
        }}
        onContentSizeChange={(width, height) => {
          geometry.current.content = height;
          update();
          props.onContentSizeChange?.(width, height);
        }}
        onScroll={(event) => {
          geometry.current.offset = event.nativeEvent.contentOffset.y;
          update();
          props.onScroll?.(event);
        }}
      >
        {children}
      </ScrollView>
      <Animated.View
        testID={testID ? `${testID}-fade-top` : undefined}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[ui.scrollFade, { top: 0, opacity: top }]}
      >
        <LinearGradient colors={[settingsColors.panel, clear]} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View
        testID={testID ? `${testID}-fade-bottom` : undefined}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[ui.scrollFade, { bottom: 0, opacity: bottom }]}
      >
        <LinearGradient colors={[clear, settingsColors.panel]} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </View>
  );
}

export function SettingsAccordion({
  label,
  open,
  onToggle,
  children,
  testID
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  testID?: string;
}) {
  const reduced = useMarketReducedMotion();
  const [measured, setMeasured] = useState(0);
  const height = useRef(new Animated.Value(0)).current;
  const turn = useRef(new Animated.Value(open ? 1 : 0)).current;
  useEffect(() => {
    height.stopAnimation();
    turn.stopAnimation();
    if (reduced) {
      height.setValue(open ? measured : 0);
      turn.setValue(open ? 1 : 0);
      return;
    }
    const animation = Animated.parallel([
      Animated.timing(height, {
        toValue: open ? measured : 0,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false
      }),
      Animated.timing(turn, { toValue: open ? 1 : 0, duration: 220, useNativeDriver: true })
    ]);
    animation.start();
    return () => animation.stop();
  }, [height, turn, measured, open, reduced]);
  return (
    <View testID={testID}>
      <PressScale
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open }}
        scaleTo={reduced ? 1 : 0.98}
        onPress={() => {
          Keyboard.dismiss();
          onToggle();
        }}
        style={ui.accordion}
      >
        <Text style={ui.accordionText}>{label}</Text>
        <Animated.Image
          source={settingsAssets.chevron}
          style={{
            width: 12,
            height: 12,
            transform: [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '0deg'] }) }]
          }}
        />
      </PressScale>
      <Animated.View
        style={{ height, overflow: 'hidden' }}
        accessibilityElementsHidden={!open}
        importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
        pointerEvents={open ? 'auto' : 'none'}
      >
        <View style={ui.revealContent} onLayout={(event) => setMeasured(event.nativeEvent.layout.height)}>
          {children}
        </View>
      </Animated.View>
    </View>
  );
}

export function SettingsButton({
  text,
  label,
  selected,
  disabled,
  onPress,
  style,
  footer = false,
  quiet = false
}: {
  text: string;
  label?: string;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  footer?: boolean;
  quiet?: boolean;
}) {
  const reduced = useMarketReducedMotion();
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={label ?? text}
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      disabled={disabled}
      scaleTo={reduced ? 1 : 0.98}
      onPress={onPress}
      hitSlop={footer ? 0 : { top: 5, bottom: 5 }}
      style={[
        ui.button,
        selected && ui.buttonSelected,
        footer && ui.footerButton,
        footer && selected && ui.footerPrimary,
        quiet && ui.quiet,
        disabled && ui.disabled,
        style
      ]}
    >
      <Text style={[ui.buttonText, footer && ui.footerButtonText, selected && ui.white]}>{text}</Text>
    </PressScale>
  );
}

export function SettingsInput(props: TextInputProps) {
  return <TextInput {...props} style={[ui.input, props.style]} placeholderTextColor={settingsColors.ink} />;
}

export function SettingsStepper({
  label,
  value,
  onStep,
  disabled = false
}: {
  label: string;
  value: string;
  onStep: (direction: 1 | -1) => void;
  disabled?: boolean;
}) {
  const reduced = useMarketReducedMotion();
  return (
    <View style={[ui.stepper, disabled && ui.disabled]}>
      <Text style={ui.stepLabel}>{label}</Text>
      <PressScale
        accessibilityRole="button"
        accessibilityLabel={`${label} 늘리기`}
        disabled={disabled}
        accessibilityState={{ disabled }}
        onPress={() => onStep(1)}
        scaleTo={reduced ? 1 : 0.98}
        style={ui.stepHit}
      >
        <Image source={settingsAssets.step} style={ui.stepImage} />
      </PressScale>
      <Text accessibilityLabel={`${label} 수 ${value}`} style={ui.stepValue}>
        {value}
      </Text>
      <PressScale
        accessibilityRole="button"
        accessibilityLabel={`${label} 줄이기`}
        disabled={disabled}
        accessibilityState={{ disabled }}
        onPress={() => onStep(-1)}
        scaleTo={reduced ? 1 : 0.98}
        style={ui.stepHit}
      >
        <Image source={settingsAssets.step} style={[ui.stepImage, { transform: [{ rotate: '180deg' }] }]} />
      </PressScale>
    </View>
  );
}

export const ui = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 110,
    backgroundColor: settingsColors.backdrop,
    paddingHorizontal: 16,
    alignItems: 'center'
  },
  hidden: { display: 'none' },
  insetFrame: { flex: 1, minHeight: 0, width: '100%', alignItems: 'center' },
  surface: { width: '100%', maxWidth: 600, flex: 1, minHeight: 0 },
  panel: {
    flex: 1,
    minHeight: 0,
    backgroundColor: settingsColors.panel,
    borderRadius: 32,
    overflow: 'hidden',
    paddingTop: 18
  },
  editorTitle: {
    fontFamily: fonts.cafe24Ssurround,
    fontSize: 17,
    lineHeight: 22,
    color: settingsColors.label,
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 16
  },
  tabs: {
    flexDirection: 'row',
    height: 48,
    padding: 4,
    borderRadius: 24,
    backgroundColor: settingsColors.tabTrack,
    marginHorizontal: 18,
    flexShrink: 0
  },
  tabsCompact: { height: 44 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabIndicator: {
    position: 'absolute',
    left: 4,
    top: 4,
    bottom: 4,
    borderRadius: 20,
    backgroundColor: settingsColors.accent
  },
  tabText: {
    fontFamily: fonts.cafe24Ssurround,
    fontSize: 14,
    letterSpacing: -0.35,
    lineHeight: 20,
    color: settingsColors.tabText
  },
  tabTextCompact: { fontSize: 13 },
  white: { color: settingsColors.white },
  scroll: { flex: 1, minHeight: 0 },
  content: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 28 },
  scrollFrame: { flex: 1, minHeight: 0, position: 'relative' },
  scrollFade: { position: 'absolute', left: 0, right: 0, height: 28, zIndex: 3 },
  footer: { flexDirection: 'row', gap: 7, width: '100%', maxWidth: 310, alignSelf: 'center', marginTop: 10 },
  button: {
    borderRadius: 8,
    backgroundColor: settingsColors.field,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center'
  },
  buttonSelected: { backgroundColor: settingsColors.selected },
  buttonText: {
    fontFamily: fonts.cafe24Ssurround,
    fontSize: 14,
    lineHeight: 18,
    color: settingsColors.ink,
    textAlign: 'center'
  },
  footerButton: { flex: 1, height: 50, borderRadius: 24, backgroundColor: settingsColors.white, paddingHorizontal: 8 },
  footerPrimary: { backgroundColor: settingsColors.accent },
  footerButtonText: { fontSize: 17, lineHeight: 22 },
  quiet: { backgroundColor: 'transparent' },
  disabled: { opacity: 0.5 },
  label: { fontFamily: fonts.cafe24Ssurround, fontSize: 16, lineHeight: 20, color: settingsColors.label },
  hint: { fontFamily: fonts.cafe24Ssurround, fontSize: 13, lineHeight: 18, color: settingsColors.muted },
  input: {
    height: 34,
    borderWidth: 0,
    borderRadius: 8,
    backgroundColor: settingsColors.field,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontFamily: fonts.cafe24Ssurround,
    fontSize: 14,
    lineHeight: 18,
    color: settingsColors.ink,
    includeFontPadding: false
  },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  grow: { flex: 1, minWidth: 0 },
  section: { gap: 10, marginBottom: 18 },
  accordion: {
    minHeight: 42,
    borderRadius: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: settingsColors.card
  },
  accordionText: { fontFamily: fonts.cafe24Ssurround, fontSize: 15, lineHeight: 20, color: settingsColors.ink },
  revealContent: { position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 18, paddingHorizontal: 4 },
  stepper: { flex: 1, alignItems: 'center' },
  stepLabel: {
    fontFamily: fonts.cafe24Ssurround,
    fontSize: 16,
    lineHeight: 20,
    color: settingsColors.muted,
    marginBottom: 6
  },
  stepHit: { height: 36, width: 44, alignItems: 'center', justifyContent: 'center' },
  stepImage: { width: 24, height: 24 },
  stepValue: { fontFamily: fonts.laundry, fontSize: 28, lineHeight: 38, color: '#7B725A', textAlign: 'center' },
  message: {
    fontFamily: fonts.cafe24Ssurround,
    fontSize: 13,
    lineHeight: 19,
    color: settingsColors.ink,
    paddingVertical: 8
  },
  error: { fontFamily: fonts.cafe24Ssurround, fontSize: 13, lineHeight: 19, color: '#8B493D', paddingVertical: 8 }
});
