import { act, fireEvent, render } from '@testing-library/react-native';
import { Animated, Image, StyleSheet } from 'react-native';
import { BusArrivalPreview, BusArrivalVehicle, BUS_ARRIVAL_DURATION, BUS_DEPARTURE_DURATION, BUS_EXTERIOR_DIMENSIONS, busExteriorFrame, busArrivalPreviewLayout } from '../src/components/game/BusArrivalPreview';
import { busArt } from '../src/game/busArt';

const first = { number: '201', destination: '주민센터 방면', id: 'first' };
const second = { number: '305', destination: '체육관 방면', id: 'second' };
jest.mock('../src/components/game/MarketPanelTransition', () => ({ useMarketReducedMotion: () => true }));
let motions: { duration: number; finish: (value: { finished: boolean }) => void }[];
beforeEach(() => {
  motions = [];
  jest.spyOn(Animated, 'timing').mockImplementation((_value, config) => ({
    start: callback => { if (callback) motions.push({ duration: config.duration!, finish: callback }); }, stop: jest.fn(), reset: jest.fn(),
  }));
  jest.spyOn(Animated, 'spring').mockReturnValue({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() });
});
afterEach(() => jest.restoreAllMocks());
function finish(duration: number) {
  const index = motions.findIndex(motion => motion.duration === duration);
  if (index < 0) throw new Error(`No motion: ${duration}`);
  const motion = motions.splice(index, 1)[0]; act(() => motion.finish({ finished: true }));
}

it('locks boarding while arriving, retains the old bus on skip, and only unlocks the next bus after stopping', () => {
  const ready = jest.fn(); const screen = render(<BusArrivalVehicle bus={first} onReadyChange={ready} />);
  expect(ready).toHaveBeenLastCalledWith(false); finish(BUS_ARRIVAL_DURATION);
  expect(ready).toHaveBeenLastCalledWith(true);
  screen.rerender(<BusArrivalVehicle bus={null} onReadyChange={ready} />);
  expect(ready).toHaveBeenLastCalledWith(false); expect(screen.getByText('201')).toBeTruthy();
  finish(BUS_DEPARTURE_DURATION); expect(screen.queryByText('201')).toBeNull();
  screen.rerender(<BusArrivalVehicle bus={second} onReadyChange={ready} />);
  expect(screen.getByText('305')).toBeTruthy(); expect(ready).toHaveBeenLastCalledWith(false);
  finish(BUS_ARRIVAL_DURATION); expect(ready).toHaveBeenLastCalledWith(true); screen.unmount();
});

it('preserves the departing bus direction until it has left, then uses the new direction', () => {
  const screen = render(<BusArrivalVehicle bus={first} direction="outbound" />); finish(BUS_ARRIVAL_DURATION);
  screen.rerender(<BusArrivalVehicle bus={second} direction="inbound" />);
  expect(screen.UNSAFE_getByType(Image).props.source).toEqual(busArt.busRight);
  finish(BUS_DEPARTURE_DURATION);
  expect(screen.UNSAFE_getByType(Image).props.source).toEqual(busArt.busLeft);
  expect(screen.queryByText('201')).toBeNull(); expect(screen.getByText('305')).toBeTruthy(); screen.unmount();
});

it('ignores stale animation callbacks and reduces all travel motion when requested', () => {
  const ready = jest.fn(); const screen = render(<BusArrivalVehicle bus={first} onReadyChange={ready} />);
  const stale = motions.find(m => m.duration === BUS_ARRIVAL_DURATION)!;
  screen.rerender(<BusArrivalVehicle bus={second} onReadyChange={ready} reduceMotion />);
  expect(ready).toHaveBeenLastCalledWith(true); ready.mockClear();
  act(() => stale.finish({ finished: true })); expect(ready).not.toHaveBeenCalled();
  expect(screen.getByText('305')).toBeTruthy();
  screen.rerender(<BusArrivalVehicle bus={null} onReadyChange={ready} reduceMotion />);
  expect(screen.queryByTestId('bus-arrival-vehicle')).toBeNull(); expect(ready).toHaveBeenLastCalledWith(false); screen.unmount();
});

it.each([260, 320, 375, 560, 900, 1440])('keeps both complete asset frames and suspension headroom inside a %ipx preview', width => {
  for (const compact of [true, false]) {
    const layout = busArrivalPreviewLayout(width, compact);
    for (const direction of ['inbound', 'outbound'] as const) {
      const frame = busExteriorFrame(layout.vehicleWidth, direction);
      const asset = BUS_EXTERIOR_DIMENSIONS[direction];
      expect(frame.imageWidth / frame.height).toBeCloseTo(asset.width / asset.height);
      const swing = frame.width * Math.sin(1.2 * Math.PI / 180) / 2 + 3;
      expect(layout.left - swing).toBeGreaterThanOrEqual(0);
      expect(layout.left + frame.width + swing).toBeLessThanOrEqual(width);
      expect(layout.height - layout.bottom - frame.height - swing).toBeGreaterThanOrEqual(0);
      expect(layout.bottom - swing).toBeGreaterThanOrEqual(0);
      expect(layout.height).toBeLessThanOrEqual(compact ? 220 : 270);
    }
  }
});

it('reflows the real compact preview at desktop width without cutting the roof or enlarging the modal indefinitely', () => {
  const screen = render(<BusArrivalPreview bus={first} compact reduceMotion />);
  fireEvent(screen.getByTestId('bus-arrival-preview'), 'layout', { nativeEvent: { layout: { width: 560, height: 142 } } });
  const preview = StyleSheet.flatten(screen.getByTestId('bus-arrival-preview').props.style);
  const vehicle = StyleSheet.flatten(screen.getByTestId('bus-arrival-vehicle').props.style);
  const frame = StyleSheet.flatten(screen.getByTestId('bus-arrival-preview-frame').props.style);
  expect(preview.height - frame.bottom - vehicle.height).toBeGreaterThanOrEqual(17.9);
  expect(preview.height).toBeLessThanOrEqual(220);
  screen.unmount();
});
