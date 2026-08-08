import { ReactNode, useRef } from 'react';
import {
  Animated,
  Pressable,
  PressableProps,
  StyleProp,
  ViewStyle,
} from 'react-native';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type PressScaleProps = Omit<PressableProps, 'children' | 'onPressIn' | 'onPressOut' | 'style'> & {
  children: ReactNode;
  onPressIn?: PressableProps['onPressIn'];
  onPressOut?: PressableProps['onPressOut'];
  scaleTo?: number;
  style?: StyleProp<ViewStyle>;
};

export function PressScale({
  children,
  disabled,
  onPressIn,
  onPressOut,
  scaleTo = 0.98,
  style,
  ...props
}: PressScaleProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const animate = (toValue: number) => {
    Animated.spring(scale, {
      damping: 18,
      mass: 0.45,
      stiffness: 320,
      toValue,
      useNativeDriver: true,
    }).start();
  };

  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      onPressIn={(event) => {
        if (!disabled) animate(scaleTo);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        animate(1);
        onPressOut?.(event);
      }}
      style={[style, { transform: [{ scale }] }]}
    >
      {children}
    </AnimatedPressable>
  );
}
