import { createContext, ReactNode, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View } from 'react-native';

export const MarketPanelActivityContext = createContext(true);

const MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const browserMotion = () => Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? window.matchMedia(MOTION_QUERY)
  : null;

export function useMarketReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(() => browserMotion()?.matches ?? false);
  useEffect(() => {
    let active = true;
    let nativeReduced = false;
    const media = browserMotion();
    const update = () => { if (active) setReducedMotion(nativeReduced || (media?.matches ?? false)); };
    AccessibilityInfo.isReduceMotionEnabled().then(value => { nativeReduced = value; update(); }).catch(() => {});
    const native = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { nativeReduced = value; update(); });
    media?.addEventListener?.('change', update);
    update();
    return () => {
      active = false;
      native.remove();
      media?.removeEventListener?.('change', update);
    };
  }, []);
  return reducedMotion;
}

/** Keeps the departing panel visible without keeping its buttons interactive. */
export function MarketPanelTransition({ visible, transitionKey, children, onPresenceChange }: {
  visible: boolean;
  transitionKey: string;
  children: ReactNode;
  onPresenceChange?: (present: boolean) => void;
}) {
  const reducedMotion = useMarketReducedMotion();
  const opacity = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  const [present, setPresent] = useState(visible);
  const retained = useRef(children);
  if (visible) retained.current = children;
  useEffect(() => {
    onPresenceChange?.(visible || present);
  }, [onPresenceChange, present, visible]);
  useEffect(() => {
    let active = true;
    opacity.stopAnimation();
    if (visible) {
      setPresent(true);
      opacity.setValue(reducedMotion ? 1 : 0);
    }
    if (reducedMotion) {
      opacity.setValue(visible ? 1 : 0);
      if (!visible) setPresent(false);
      return;
    }
    const animation = Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: 220,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (active && finished && !visible) setPresent(false);
    });
    return () => { active = false; animation.stop(); };
  }, [opacity, reducedMotion, transitionKey, visible]);

  if (!visible && !present) return null;
  return <Animated.View
    testID="market-panel-transition"
    accessibilityElementsHidden={!visible}
    importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
    pointerEvents={visible ? 'box-none' : 'auto'}
    onStartShouldSetResponder={() => !visible}
    style={[styles.fill, { opacity }]}
  >
    <MarketPanelActivityContext.Provider value={visible}>
      <View pointerEvents={visible ? 'box-none' : 'none'} style={StyleSheet.absoluteFill}>
        {visible ? children : retained.current}
      </View>
    </MarketPanelActivityContext.Provider>
  </Animated.View>;
}

const styles = StyleSheet.create({ fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 45 } });
