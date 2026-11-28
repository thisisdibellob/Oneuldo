import { act, fireEvent, render, within } from '@testing-library/react-native';
import { AccessibilityInfo, Image, StyleSheet } from 'react-native';

import { MODULAR_CHARACTER_CANVAS, ModularCharacter } from '../src/components/game/ModularCharacter';
import { ExpandedVillageLayer, type ExpandedVillageLayerProps } from '../src/components/game/PrototypeWorldLayers';
import { VILLAGE_NPC_BY_ID } from '../src/game/prototypeWorld';
import { VILLAGE_NPC_ART_SCALE, villageNpcArt } from '../src/game/villageNpcArt';

const { readFileSync } = require('fs');
const { join } = require('path');
declare const __dirname: string;

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));

const props: ExpandedVillageLayerProps = {
  controlMode: 'touch', nearbyNpcId: null, nearbyPortalId: null,
  onNpcPress: jest.fn(), onPortalPress: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
});

afterEach(() => jest.restoreAllMocks());

it('민수·지영·수진 정면 그림은 플레이어와 같은 캔버스와 발 앵커로 원래 상호작용 위치에 선다', async () => {
  const screen = render(<ExpandedVillageLayer {...props} />);
  await act(async () => { await Promise.resolve(); });
  for (const id of ['minsu', 'jiyoung', 'sujin'] as const) {
    const npc = VILLAGE_NPC_BY_ID[id];
    const target = screen.getByTestId(`village-npc-${id}`);
    const targetStyle = StyleSheet.flatten(target.props.style);
    const art = within(target).getByTestId(`village-npc-art-${id}`);
    const artStyle = StyleSheet.flatten(art.props.style);
    expect(targetStyle.left + targetStyle.width / 2).toBe(npc.point.x);
    expect(targetStyle.top + MODULAR_CHARACTER_CANVAS.pivotY * VILLAGE_NPC_ART_SCALE).toBe(npc.point.y);
    expect(artStyle.width).toBe(MODULAR_CHARACTER_CANVAS.width * 0.5);
    expect(artStyle.height).toBe(MODULAR_CHARACTER_CANVAS.height * 0.5);
    const character = within(target).UNSAFE_getByType(ModularCharacter);
    expect(character.props.showShadow).not.toBe(false);
    const image = within(art).UNSAFE_getByType(Image);
    expect(image.props.source).toEqual(villageNpcArt[id]);
    expect(image.props.fadeDuration).toBe(0);
    expect(within(target).getByText(npc.name)).toBeTruthy();
    expect(within(target).getByText(npc.roleLabel)).toBeTruthy();
  }
  screen.unmount();
});

it('교체한 그림을 누르면 기존 NPC와 이벤트를 전달하고 배경 이동 클릭은 막는다', async () => {
  const onNpcPress = jest.fn();
  const screen = render(<ExpandedVillageLayer {...props} onNpcPress={onNpcPress} nearbyNpcId="jiyoung" />);
  await act(async () => { await Promise.resolve(); });
  const event = { stopPropagation: jest.fn() };
  fireEvent.press(screen.getByTestId('village-npc-jiyoung'), event);
  expect(event.stopPropagation).toHaveBeenCalledTimes(1);
  expect(onNpcPress).toHaveBeenCalledWith(event, VILLAGE_NPC_BY_ID.jiyoung);
  expect(screen.getByTestId('npc-proximity-cloud-jiyoung')).toBeTruthy();
  expect(screen.queryByTestId('npc-proximity-cloud-minsu')).toBeNull();
  screen.unmount();
});

it.each([
  { controlMode: 'joystick' as const, controlsLocked: false },
  { controlMode: 'touch' as const, controlsLocked: true },
])('조이스틱 또는 잠긴 조작에서는 NPC 그림을 눌러도 새 대화를 시작하지 않는다 (%o)', async state => {
  const onNpcPress = jest.fn();
  const screen = render(<ExpandedVillageLayer {...props} {...state} onNpcPress={onNpcPress} />);
  await act(async () => { await Promise.resolve(); });
  for (const id of ['minsu', 'jiyoung', 'sujin']) fireEvent.press(screen.getByTestId(`village-npc-${id}`));
  expect(onNpcPress).not.toHaveBeenCalled();
  screen.unmount();
});

it('마을 정류장에는 기사 NPC를 세워두지 않는다', async () => {
  const screen = render(<ExpandedVillageLayer {...props} />);
  await act(async () => { await Promise.resolve(); });
  expect(screen.queryByTestId('village-npc-driver')).toBeNull();
  expect(screen.getByTestId('village-east-bus-stop')).toBeTruthy();
  screen.unmount();
});

it('카페 입구는 터치 이동과 가까운 상호작용 표시를 기존 포털 방식으로 연결한다', async () => {
  const onPortalPress = jest.fn();
  const screen = render(<ExpandedVillageLayer {...props} nearbyPortalId="cafe" onPortalPress={onPortalPress} />);
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByTestId('cafe-proximity-cloud')).toBeTruthy();
  const event = { stopPropagation: jest.fn() };
  fireEvent.press(screen.getByRole('button', { name: '카페 들어가기' }), event);
  expect(event.stopPropagation).toHaveBeenCalledTimes(1);
  expect(onPortalPress).toHaveBeenCalledWith(event, 'cafe');
  screen.rerender(<ExpandedVillageLayer {...props} controlMode="joystick" onPortalPress={onPortalPress} />);
  fireEvent.press(screen.getByTestId('village-cafe-portal'), event);
  expect(onPortalPress).toHaveBeenCalledTimes(1);
  expect(screen.queryByTestId('cafe-proximity-cloud')).toBeNull();
  screen.unmount();
});

it.each(['minsu', 'jiyoung', 'sujin'])('%s 배포 PNG도 플레이어 캔버스 규격을 사용한다', id => {
  const directory = id === 'sujin' ? 'sujin-v1' : 'chibi-v1';
  const png = readFileSync(join(__dirname, `../assets/images/game/characters/village/${directory}/${id}-front.png`));
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  expect(png.readUInt32BE(16)).toBe(MODULAR_CHARACTER_CANVAS.width);
  expect(png.readUInt32BE(20)).toBe(MODULAR_CHARACTER_CANVAS.height);
  const display = readFileSync(join(__dirname, `../assets/images/game/characters/village/${directory}/${id}-front-display.png`));
  expect(display.readUInt32BE(16)).toBe(MODULAR_CHARACTER_CANVAS.width * 3);
  expect(display.readUInt32BE(20)).toBe(MODULAR_CHARACTER_CANVAS.height * 3);
});
