import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { PressScale } from '../PressScale';
import { fonts } from '../../theme';
import { getLibraryCatalogEntries, LIBRARY_WORK_GUIDE } from '../../game/libraryCatalog';
import { getLibraryCategory, LIBRARY_CATEGORIES, type LibraryCategoryId, type LibrarySession } from '../../game/librarySession';
import { LibraryBookArt, LibraryButton, LibraryPanel, LIBRARY_COLORS as C } from './LibraryWorkPanel';

export function LibraryCatalogPanel({ session, onClose }: { session: LibrarySession; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<LibraryCategoryId | null>(null);
  const results = useMemo(() => getLibraryCatalogEntries(session, query, category), [session, query, category]);
  return <LibraryPanel title="도서 검색" onClose={onClose} testID="library-catalog">
    <View style={s.search}><Ionicons name="search" size={23} color={C.green} /><TextInput accessibilityLabel="도서 제목 또는 분류번호 검색" placeholder="책 제목 또는 번호" placeholderTextColor="#8C9283" value={query} onChangeText={setQuery} style={s.input} autoCorrect={false} returnKeyType="search" />{query ? <PressScale accessibilityRole="button" accessibilityLabel="검색어 지우기" onPress={() => setQuery('')} style={s.clear}><Ionicons name="close-circle" size={24} color={C.muted} /></PressScale> : null}</View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>
      {[{ id: null, label: '전체', callRange: '' }, ...LIBRARY_CATEGORIES].map(item => <PressScale key={item.id ?? 'all'} accessibilityRole="button" accessibilityLabel={`${item.label} 도서만 보기`} accessibilityState={{ selected: category === item.id }} onPress={() => setCategory(item.id)} style={[s.filter, category === item.id && s.filterSelected]}><Text style={[s.filterText, category === item.id && s.selectedText]}>{item.id ? `${item.callRange.slice(0, 3)} ${item.label}` : item.label}</Text></PressScale>)}
    </ScrollView>
    <Text accessibilityLiveRegion="polite" style={s.count}>{results.length}권</Text>
    {results.map(({ book, location, available }) => <View key={book.id} style={s.bookRow} testID={`catalog-${book.id}`}>
      <LibraryBookArt book={book} height={92} /><View style={s.bookInfo}><Text style={s.bookTitle}>{book.title}</Text><Text style={s.className}>{getLibraryCategory(book.categoryId).callRange}</Text><Text style={s.callNumber}>{book.callNumber.replace('\n', '  ')}</Text><View style={s.location}><Ionicons name={available ? 'location-outline' : 'time-outline'} size={17} color={available ? C.green : '#9A7859'} /><Text style={[s.locationText, !available && { color: '#9A7859' }]}>{location}</Text></View></View>
    </View>)}
    {!results.length ? <View style={s.empty}><Ionicons name="book-outline" size={43} color="#9CA68F" /><Text style={s.body}>찾는 책이 없어요.</Text><Text style={s.small}>제목이나 번호를 다시 확인해 주세요.</Text></View> : null}
  </LibraryPanel>;
}

export function LibraryGuidebookPanel({ onClose, onClassification, page, onPageChange: setPage }: { onClose: () => void; onClassification: () => void; page: number; onPageChange: (page: number) => void }) {
  const chapter = LIBRARY_WORK_GUIDE[page];
  return <LibraryPanel title="도서 알바 가이드북" onClose={onClose} testID="library-guidebook" footer={<View style={s.navigation}>
    <PressScale accessibilityRole="button" accessibilityLabel="이전 안내" disabled={page === 0} onPress={() => setPage(page - 1)} style={[s.arrow, page === 0 && { opacity: 0.3 }]}><Ionicons name="chevron-back" size={24} color={C.green} /></PressScale><Text style={s.page}>{page + 1} / {LIBRARY_WORK_GUIDE.length}</Text><PressScale accessibilityRole="button" accessibilityLabel="다음 안내" disabled={page === LIBRARY_WORK_GUIDE.length - 1} onPress={() => setPage(page + 1)} style={[s.arrow, page === LIBRARY_WORK_GUIDE.length - 1 && { opacity: 0.3 }]}><Ionicons name="chevron-forward" size={24} color={C.green} /></PressScale>
  </View>}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>{LIBRARY_WORK_GUIDE.map((item, index) => <PressScale key={item.title} accessibilityRole="button" accessibilityLabel={item.title.endsWith('안내') ? item.title : `${item.title} 안내`} accessibilityState={{ selected: page === index }} onPress={() => setPage(index)} style={[s.filter, page === index && s.filterSelected]}><Text style={[s.filterText, page === index && s.selectedText]}>{item.title}</Text></PressScale>)}</ScrollView>
    <View style={s.chapterIcon}><Ionicons name={chapter.icon} size={43} color={C.green} /></View><Text style={s.chapterTitle}>{chapter.title}</Text>
    {chapter.steps.map((step, index) => <View key={step} style={s.step}><Text style={s.stepNumber}>{index + 1}</Text><Text style={s.body}>{step}</Text></View>)}
    {(page === 1 || page === 2) ? <View style={{ marginTop: 18 }}><LibraryButton secondary icon="library-outline" onPress={onClassification}>000–900 서가 번호 보기</LibraryButton></View> : null}
    {page === 2 ? <Text style={s.note}>이 게임에서는 서가를 찾은 뒤, 이미 꽂힌 두 책의 맨 윗줄 번호를 비교해 자리를 골라요. 같은 번호는 나란히 놓을 수 있어요. 실제 도서기호 순서와 근무지의 배열 규칙은 사서에게 확인해요.</Text> : null}
  </LibraryPanel>;
}
const s = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#EAEDE1', borderRadius: 17, paddingLeft: 15, minHeight: 54 }, input: { flex: 1, minWidth: 0, fontFamily: fonts.medium, fontSize: 18, color: C.ink, paddingVertical: 14, paddingRight: 12 }, clear: { padding: 10 },
  filters: { gap: 8, paddingVertical: 14 }, filter: { paddingHorizontal: 15, minHeight: 44, borderRadius: 22, backgroundColor: '#ECECDD', alignItems: 'center', justifyContent: 'center' }, filterSelected: { backgroundColor: C.green }, filterText: { fontFamily: fonts.semibold, color: C.green, fontSize: 16 }, selectedText: { color: '#FFFDF3' }, count: { fontFamily: fonts.bold, color: C.muted, fontSize: 17, marginBottom: 5 },
  bookRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 15 }, bookInfo: { flex: 1, gap: 5 }, bookTitle: { fontFamily: fonts.bold, color: C.ink, fontSize: 18, lineHeight: 25 }, className: { fontFamily: fonts.medium, color: C.green, fontSize: 16 }, callNumber: { fontFamily: fonts.medium, color: C.muted, fontSize: 16 }, location: { flexDirection: 'row', gap: 5, alignItems: 'center', marginTop: 3 }, locationText: { flexShrink: 1, fontFamily: fonts.medium, color: C.green, fontSize: 16 },
  empty: { alignItems: 'center', paddingVertical: 30, gap: 14 }, small: { fontFamily: fonts.medium, fontSize: 16, color: C.muted }, chapterIcon: { alignSelf: 'center', backgroundColor: '#E7ECD9', width: 88, height: 88, alignItems: 'center', justifyContent: 'center', borderRadius: 28, marginTop: 10 }, chapterTitle: { fontFamily: fonts.laundryBold, color: C.ink, fontSize: 24, textAlign: 'center', marginVertical: 21 }, step: { flexDirection: 'row', alignItems: 'flex-start', gap: 13, marginBottom: 20 }, stepNumber: { fontFamily: fonts.bold, fontSize: 18, color: C.green, backgroundColor: '#E9EDDF', width: 30, height: 30, textAlign: 'center', lineHeight: 30, borderRadius: 15 }, body: { flexShrink: 1, fontFamily: fonts.medium, color: C.ink, fontSize: 18, lineHeight: 28 }, note: { fontFamily: fonts.regular, color: C.muted, fontSize: 16, lineHeight: 24, marginTop: 18 }, navigation: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, arrow: { width: 52, height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E9EDDE', borderRadius: 15 }, page: { fontFamily: fonts.bold, fontSize: 18, color: C.green },
});
