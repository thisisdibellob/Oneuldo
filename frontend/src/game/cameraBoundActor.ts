import { Animated } from 'react-native';

/** The actor cancels the *same* camera node used by the world. Separate native
 * position writes can reach different display frames and make a centred actor bob.
 * On iOS/Android the camera is native-driven, so this cancellation runs on the UI thread. */
export function cameraBoundActorTransform(camera: Animated.ValueXY, viewportCenter: Animated.ValueXY, offset: Animated.ValueXY) {
  return [
    { translateX: Animated.add(Animated.subtract(viewportCenter.x, camera.x), offset.x) },
    { translateY: Animated.add(Animated.subtract(viewportCenter.y, camera.y), offset.y) },
  ];
}
