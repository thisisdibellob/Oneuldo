/** KDC 6 main classes. See docs/library-classification-research.md for official sources. */
export const LIBRARY_KDC_DIRECTORY = [
  { id: 'general', code: '000', label: '총류', examples: '백과사전 · 컴퓨터 · 도서관' },
  { id: 'philosophy', code: '100', label: '철학', examples: '철학 · 심리 · 윤리' },
  { id: 'religion', code: '200', label: '종교', examples: '불교 · 기독교 · 여러 종교' },
  { id: 'social', code: '300', label: '사회과학', examples: '경제 · 교육 · 법 · 사회' },
  { id: 'nature', code: '400', label: '자연과학', examples: '수학 · 우주 · 식물 · 동물' },
  { id: 'life', code: '500', label: '기술과학', examples: '의학 · 농업 · 기계 · 요리' },
  { id: 'arts', code: '600', label: '예술', examples: '미술 · 음악 · 스포츠' },
  { id: 'language', code: '700', label: '언어', examples: '한국어 · 영어 · 여러 언어' },
  { id: 'story', code: '800', label: '문학', examples: '소설 · 동화 · 시' },
  { id: 'history', code: '900', label: '역사', examples: '역사 · 지리 · 여행 · 전기' },
] as const;

export type LibraryCategoryId = (typeof LIBRARY_KDC_DIRECTORY)[number]['id'];

export function getLibraryClassCode(callNumber: string): string | null {
  const match = /^(\d{3})(?:\.\d+)?(?:\s|$)/.exec(callNumber.trim());
  return match ? `${match[1][0]}00` : null;
}
