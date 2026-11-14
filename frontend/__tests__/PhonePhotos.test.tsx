import { fireEvent, render } from '@testing-library/react-native';
import { PhonePhotos } from '../src/components/game/PhonePhotos';
import { getActivityAlbum, recordCompletedDeliveryActivity, recordCompletedShoppingActivity, resetActivityAlbumForTests } from '../src/game/activityAlbum';

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));
beforeEach(() => resetActivityAlbumForTests());

it('빈 보관함에서 앨범을 열고 돌아오며 검색하고 지울 수 있다', () => {
  const screen = render(<PhonePhotos />);
  expect(screen.getByText('아직 기록이 없어요')).toBeTruthy();
  fireEvent.press(screen.getByRole('tab', { name: '사진 앨범' }));
  fireEvent.press(screen.getByRole('button', { name: '즐겨찾기' }));
  expect(screen.getByText('즐겨찾는 기록이 없어요')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '앨범 목록으로' }));
  fireEvent.press(screen.getByRole('button', { name: '도서관' }));
  expect(screen.getByText('아직 기록이 없어요')).toBeTruthy();
  fireEvent.press(screen.getByRole('tab', { name: '사진 검색' }));
  fireEvent.changeText(screen.getByLabelText('사진 검색어'), '도서관');
  expect(screen.getByText('검색 결과가 없어요')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '사진 검색어 지우기' }));
  expect(screen.getByLabelText('사진 검색어').props.value).toBe('');
  fireEvent.press(screen.getByRole('tab', { name: '사진 보관함' }));
  expect(screen.getByText('아직 기록이 없어요')).toBeTruthy();
});

it('완료한 실제 수치를 열어 보고 즐겨찾기에 추가하고 해제한다', () => {
  recordCompletedShoppingActivity({ sessionId: 'paid', completedAt: new Date(2026, 9, 3, 14, 7).getTime(), itemCount: 3, totalAmount: 7800, checkoutKind: 'kiosk' });
  const screen = render(<PhonePhotos />);
  expect(screen.getByText('1개 기록')).toBeTruthy();
  expect(screen.getByText('2026년 10월 3일')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '장보기 완료 기록 열기' }));
  expect(screen.getByText('구매한 물품')).toBeTruthy();
  expect(screen.getByText('결제한 금액')).toBeTruthy();
  expect(screen.getByText('무인 계산대에서 물품 3개의 결제를 마쳤어요.')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '즐겨찾기에 추가' }));
  expect(getActivityAlbum()[0].favorite).toBe(true);
  fireEvent.press(screen.getByRole('tab', { name: '사진 앨범' }));
  fireEvent.press(screen.getByRole('button', { name: '즐겨찾기' }));
  fireEvent.press(screen.getByRole('button', { name: '장보기 완료 기록 열기' }));
  fireEvent.press(screen.getByRole('button', { name: '즐겨찾기 해제' }));
  fireEvent.press(screen.getByRole('button', { name: '기록 목록으로' }));
  expect(screen.getByText('즐겨찾는 기록이 없어요')).toBeTruthy();
});

it('활동 이름·날짜·물품명으로 실제 기록을 검색하고 앨범별로 구분한다', () => {
  recordCompletedShoppingActivity({ sessionId: 'paid', completedAt: new Date(2026, 9, 2, 13).getTime(), itemCount: 3, totalAmount: 7800 });
  recordCompletedDeliveryActivity({ sessionId: 'errand', completedAt: new Date(2026, 9, 3, 14).getTime(), recipient: '민수', itemCount: 2, items: ['사과', '우유'] });
  const screen = render(<PhonePhotos />);
  fireEvent.press(screen.getByRole('tab', { name: '사진 검색' }));
  fireEvent.changeText(screen.getByLabelText('사진 검색어'), '민수 우유');
  expect(screen.getByRole('button', { name: '민수에게 물품 전달 기록 열기' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: '장보기 완료 기록 열기' })).toBeNull();
  fireEvent.changeText(screen.getByLabelText('사진 검색어'), '2026-10-02');
  expect(screen.getByRole('button', { name: '장보기 완료 기록 열기' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: '민수에게 물품 전달 기록 열기' })).toBeNull();
  fireEvent.press(screen.getByRole('tab', { name: '사진 앨범' }));
  fireEvent.press(screen.getByRole('button', { name: '물품 전달' }));
  expect(screen.getByRole('button', { name: '민수에게 물품 전달 기록 열기' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: '장보기 완료 기록 열기' })).toBeNull();
});
