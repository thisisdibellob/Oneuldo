import { Animated } from 'react-native';
import { cameraBoundActorTransform } from '../src/game/cameraBoundActor';

const AnimatedProps = require('react-native/Libraries/Animated/nodes/AnimatedProps').default;

it('keeps the actor centred at every native crop update, including between the two camera axes', () => {
  const camera = new Animated.ValueXY({ x: -350, y: -600 });
  const center = new Animated.ValueXY({ x: 187.5, y: 406 });
  const offset = new Animated.ValueXY();
  const transform = cameraBoundActorTransform(camera, center, offset);
  const positions: { x: number; y: number }[] = [];
  const value = (node: Animated.Value) => (node as unknown as { __getValue(): number }).__getValue();
  const props = new AnimatedProps({ style: { transform } }, () => {
    const [x, y] = props.__getAnimatedValue().style.transform;
    positions.push({ x: x.translateX + value(camera.x), y: y.translateY + value(camera.y) });
  });
  props.__attach();
  try {
    for (let i = 0; i < 60; i++) camera.setValue({ x: -350 - i * 2.3, y: -600 + i * 1.7 });
    expect(positions.length).toBeGreaterThanOrEqual(60);
    for (const position of positions) {
      expect(position.x).toBeCloseTo(187.5, 8);
      expect(position.y).toBeCloseTo(406, 8);
    }
    offset.setValue({ x: 12, y: -9 });
    expect(positions.at(-1)!.x).toBeCloseTo(199.5, 8);
    expect(positions.at(-1)!.y).toBeCloseTo(397, 8);
  } finally { props.__detach(); }
});
