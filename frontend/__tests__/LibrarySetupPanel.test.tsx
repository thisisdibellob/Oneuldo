import { useState } from 'react';
import { fireEvent, render, within } from '@testing-library/react-native';
import { ScrollView } from 'react-native';

import { LibrarySetupPanel } from '../src/components/game/LibrarySetupPanel';
import type { LibrarySessionConfig } from '../src/game/librarySession';

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));
jest.mock('../src/components/game/MarketPanelTransition', () => ({ useMarketReducedMotion: () => true }));

function setup(initial: LibrarySessionConfig = {}) {
  const onChange = jest.fn(), onClose = jest.fn(), onStart = jest.fn();
  function Harness() {
    const [config, setConfig] = useState(initial);
    return <LibrarySetupPanel config={config} onChange={next => { onChange(next); setConfig(next); }}
      onClose={onClose} onStart={() => onStart(config)} />;
  }
  return { ...render(<Harness />), onChange, onClose, onStart };
}

it('기본 설정을 표시하고 시작 버튼은 스크롤 영역 밖에 고정한다', () => {
  const screen = setup();
  expect(screen.getByRole('header', { name: '근무 설정' })).toBeTruthy();
  for (const name of ['손님 1명', '섞어서', '정리할 책 12권', '라벨 훼손 1권', '안내와 함께']) {
    expect(screen.getByRole('radio', { name }).props.accessibilityState.checked).toBe(true);
  }
  expect(screen.getAllByRole('radio')).toHaveLength(14);
  const body = screen.UNSAFE_getByType(ScrollView);
  expect(within(body).getByText('진행 방식')).toBeTruthy();
  expect(within(body).queryByRole('button', { name: '이 설정으로 시작' })).toBeNull();
  expect(screen.getByRole('button', { name: '이 설정으로 시작' })).toBeTruthy();
  expect(screen.onChange).not.toHaveBeenCalled();
  expect(screen.onStart).not.toHaveBeenCalled();
});

it('각 설정을 즉시 반영하면서 시드와 세션 식별자를 보존하고 선택한 설정으로 시작한다', () => {
  const initial: LibrarySessionConfig = { seed: 'library-setup-stable', sessionId: 'existing-session', startedAt: 1234 };
  const screen = setup(initial);
  for (const name of ['손님 2명', '책 꽂기', '정리할 책 18권', '라벨 훼손 2권', '혼자 해보기']) {
    fireEvent.press(screen.getByRole('radio', { name }));
    expect(screen.getByRole('radio', { name }).props.accessibilityState.checked).toBe(true);
  }
  const expected = { ...initial, visitorCount: 2, requestMode: 'shelve', bookCount: 18, damagedBookCount: 2, supportMode: 'independent' };
  expect(screen.onChange).toHaveBeenCalledTimes(5);
  expect(screen.onChange).toHaveBeenLastCalledWith(expected);
  expect(initial).toEqual({ seed: 'library-setup-stable', sessionId: 'existing-session', startedAt: 1234 });
  expect(screen.onStart).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: '이 설정으로 시작' }));
  expect(screen.onStart).toHaveBeenCalledWith(expected);
  expect(screen.onClose).not.toHaveBeenCalled();
});

it('손님이 없으면 부탁 종류를 바꿀 수 없고 손님을 다시 선택하면 이전 종류를 유지한다', () => {
  const screen = setup({ requestMode: 'find', visitorCount: 1 });
  fireEvent.press(screen.getByRole('radio', { name: '손님 0명' }));
  expect(screen.onChange).toHaveBeenLastCalledWith({ requestMode: 'find', visitorCount: 0 });
  for (const name of ['섞어서', '위치 안내', '책 꽂기']) {
    expect(screen.getByRole('radio', { name }).props.accessibilityState.disabled).toBe(true);
    fireEvent.press(screen.getByRole('radio', { name }));
  }
  expect(screen.onChange).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('radio', { name: '위치 안내' }).props.accessibilityState.checked).toBe(true);
  fireEvent.press(screen.getByRole('radio', { name: '손님 2명' }));
  expect(screen.getByRole('radio', { name: '위치 안내' }).props.accessibilityState).toMatchObject({ checked: true, disabled: false });
  expect(screen.onChange).toHaveBeenLastCalledWith({ requestMode: 'find', visitorCount: 2 });
});

it('닫기는 반영한 설정을 되돌리거나 근무를 시작하지 않는다', () => {
  const screen = setup({ seed: 42 });
  fireEvent.press(screen.getByRole('radio', { name: '정리할 책 6권' }));
  fireEvent.press(screen.getByRole('radio', { name: '라벨 훼손 0권' }));
  fireEvent.press(screen.getByRole('button', { name: '닫기' }));
  expect(screen.onClose).toHaveBeenCalledTimes(1);
  expect(screen.onStart).not.toHaveBeenCalled();
  expect(screen.onChange).toHaveBeenLastCalledWith({ seed: 42, bookCount: 6, damagedBookCount: 0 });
});
