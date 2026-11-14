import { render } from '@testing-library/react-native';
import { Animated, Platform } from 'react-native';
import { BusRoadBackdrop } from '../src/components/game/BusRoadBackdrop';

afterEach(() => jest.restoreAllMocks());

it.each(['web', 'ios'] as const)('%s에서 플랫폼에 맞는 무한 반복을 유지하고 정차하면 멈춘다', os => {
  const original = Platform.OS;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
  try {
    const start = jest.fn(), stop = jest.fn();
    const timing = jest.spyOn(Animated, 'timing');
    jest.spyOn(Animated, 'loop').mockReturnValue({ start, stop, reset: jest.fn() });
    const props = { viewport: { width: 390, height: 844 }, travelling: true, reduceMotion: false };
    const screen = render(<BusRoadBackdrop {...props} />);
    expect(timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ useNativeDriver: os !== 'web', isInteraction: false }));
    expect(start).toHaveBeenCalledTimes(1);
    screen.rerender(<BusRoadBackdrop {...props} viewport={{ width: 430, height: 932 }} />);
    expect(start).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();
    screen.rerender(<BusRoadBackdrop {...props} travelling={false} />);
    expect(stop).toHaveBeenCalledTimes(1);
    screen.unmount();
  } finally { Object.defineProperty(Platform, 'OS', { configurable: true, value: original }); }
});
