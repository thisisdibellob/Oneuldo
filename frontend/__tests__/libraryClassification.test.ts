import { getLibraryClassCode, LIBRARY_KDC_DIRECTORY } from '../src/game/libraryClassification';
import { LIBRARY_BOOKS, LIBRARY_CATEGORIES } from '../src/game/librarySession';

it('가상 도서의 책등 분류번호와 실제 배가 판정이 일치한다', () => {
  for (const book of LIBRARY_BOOKS) {
    expect(getLibraryClassCode(book.callNumber)).toBe(LIBRARY_KDC_DIRECTORY.find(category => category.id === book.categoryId)?.code);
    expect(book.callNumber.split('\n')).toHaveLength(2);
  }
});
it('분류표의 열 분류 모두 실제 배가 분류와 도서를 가진다', () => {
  expect(LIBRARY_CATEGORIES.map(category => category.id)).toEqual(LIBRARY_KDC_DIRECTORY.map(category => category.id));
  for (const entry of LIBRARY_KDC_DIRECTORY) {
    expect(LIBRARY_CATEGORIES.find(category => category.id === entry.id)).toMatchObject({ label: entry.label, callRange: `${entry.code} ${entry.label}` });
    expect(LIBRARY_BOOKS.filter(book => book.categoryId === entry.id).length).toBeGreaterThanOrEqual(2);
  }
});
it('소수점 분류번호를 큰 분류로 찾고 잘못된 라벨은 추측하지 않는다', () => {
  expect(getLibraryClassCode('813.8\n김14ㄷ')).toBe('800');
  expect(getLibraryClassCode('004\n이82ㅇ')).toBe('000');
  expect(getLibraryClassCode('??3')).toBeNull();
  expect(getLibraryClassCode('8138')).toBeNull();
  expect(LIBRARY_KDC_DIRECTORY.map(c => c.code)).toEqual(['000', '100', '200', '300', '400', '500', '600', '700', '800', '900']);
});
