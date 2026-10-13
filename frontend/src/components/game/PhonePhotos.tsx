import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { filterActivityRecords, toggleActivityFavorite, useActivityAlbum, type ActivityKind, type ActivityRecord } from '../../game/activityAlbum';
import { fonts } from '../../theme';
import { PressScale } from '../PressScale';

type PhotoTab = 'library' | 'albums' | 'search';
type Album = 'favorites' | ActivityKind | null;
const ART = {
  library: require('../../../assets/images/game/album/v1/library.runtime.jpg'),
  bus: require('../../../assets/images/game/album/v1/bus.runtime.jpg'),
  shopping: require('../../../assets/images/game/album/v1/shopping.runtime.jpg'),
  delivery: require('../../../assets/images/game/album/v1/shopping.runtime.jpg'),
};
const KINDS: { id: ActivityKind; name: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { id: 'library', name: '도서관', icon: 'book-outline' }, { id: 'bus', name: '버스 타기', icon: 'bus-outline' },
  { id: 'shopping', name: '장보기', icon: 'basket-outline' }, { id: 'delivery', name: '물품 전달', icon: 'gift-outline' },
];
const dateLabel = (time: number) => { const date = new Date(time); return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`; };
const timeLabel = (time: number) => { const date = new Date(time); return `${date.getHours() < 12 ? '오전' : '오후'} ${date.getHours() % 12 || 12}:${String(date.getMinutes()).padStart(2, '0')}`; };

/** Illustrated records of completed activities, never synthetic play results. */
export function PhonePhotos() {
  const records = useActivityAlbum();
  const [tab, setTab] = useState<PhotoTab>('library');
  const [album, setAlbum] = useState<Album>(null);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = records.find(record => record.id === selectedId);
  const favorites = records.filter(record => record.favorite).length;
  const visible = useMemo(() => filterActivityRecords(records, tab === 'search' ? query : '', album === 'favorites')
    .filter(record => !album || album === 'favorites' || record.kind === album), [records, query, tab, album]);
  const groups = useMemo(() => {
    const result: { date: string; records: ActivityRecord[] }[] = [];
    visible.forEach(record => {
      const date = dateLabel(record.completedAt);
      const group = result[result.length - 1];
      if (group?.date === date) group.records.push(record); else result.push({ date, records: [record] });
    });
    return result;
  }, [visible]);
  const title = selected ? '활동 기록' : tab === 'library' ? '보관함' : tab === 'albums' ? album === 'favorites' ? '즐겨찾기' : KINDS.find(kind => kind.id === album)?.name ?? '앨범' : '검색';
  const chooseTab = (next: PhotoTab) => { setTab(next); setAlbum(null); setSelectedId(null); };
  return <View style={s.root} testID="phone-photos">
    <View style={s.content}>
      {selected || album ? <PressScale accessibilityRole="button" accessibilityLabel={selected ? '기록 목록으로' : '앨범 목록으로'} onPress={() => selected ? setSelectedId(null) : setAlbum(null)} style={s.back}>
        <Ionicons name="chevron-back" size={19} color="#658370" /><Text style={s.backText}>{selected ? '목록' : '앨범'}</Text>
      </PressScale> : null}
      <View style={s.heading}><Text accessibilityRole="header" style={s.title}>{title}</Text>{!selected && tab === 'library' && records.length > 0 ? <Text style={s.total}>{records.length}개 기록</Text> : null}</View>
      {selected ? <ScrollView style={s.scroller} contentContainerStyle={s.detail} nestedScrollEnabled showsVerticalScrollIndicator={false} testID="activity-record-detail">
        <Image source={ART[selected.kind]} style={s.detailArt} resizeMode="cover" accessibilityLabel={`${selected.title} 활동 일러스트`} />
        <View style={s.detailTitleRow}><Text style={s.detailTitle}>{selected.title}</Text><FavoriteButton record={selected} /></View>
        <Text style={s.detailPlace}>{selected.place}</Text>
        <Text style={s.detailDate}>{dateLabel(selected.completedAt)} · {timeLabel(selected.completedAt)}</Text>
        <View style={s.metrics}>{selected.metrics.map(metric => <View key={metric.label} style={s.metric}><Text style={s.metricLabel}>{metric.label}</Text><Text style={s.metricValue}>{metric.value.toLocaleString('ko-KR')}<Text style={s.metricUnit}> {metric.unit}</Text></Text></View>)}</View>
        {selected.facts.map((fact, index) => <View key={`${index}:${fact}`} style={s.fact}><View style={s.factDot} /><Text style={s.factText}>{fact}</Text></View>)}
      </ScrollView> : <>
        {tab === 'search' ? <View style={s.search}><Ionicons name="search" color="#7D897A" size={19} /><TextInput accessibilityLabel="사진 검색어" value={query} onChangeText={setQuery} placeholder="활동, 날짜, 장소" placeholderTextColor="#8E9587" style={s.input} returnKeyType="search" />{query ? <PressScale accessibilityRole="button" accessibilityLabel="사진 검색어 지우기" onPress={() => setQuery('')} style={s.clear}><Ionicons name="close-circle" size={21} color="#85927F" /></PressScale> : null}</View> : null}
        {tab === 'albums' && !album ? <ScrollView style={s.scroller} contentContainerStyle={s.albums} nestedScrollEnabled showsVerticalScrollIndicator={false}>
          <AlbumRow title="즐겨찾기" count={favorites} icon="heart" onPress={() => setAlbum('favorites')} />
          {KINDS.map(kind => <AlbumRow key={kind.id} title={kind.name} count={records.filter(record => record.kind === kind.id).length} icon={kind.icon} art={ART[kind.id]} onPress={() => setAlbum(kind.id)} />)}
        </ScrollView> : visible.length ? <ScrollView style={s.scroller} contentContainerStyle={s.recordList} nestedScrollEnabled showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" testID="activity-record-list">
          {groups.map(group => <View key={group.date}><Text style={s.date}>{group.date}</Text><View style={s.grid}>{group.records.map(record => <View key={record.id} style={s.cardWrap}>
            <PressScale accessibilityRole="button" accessibilityLabel={`${record.title} 기록 열기`} onPress={() => setSelectedId(record.id)} style={s.card}>
              <Image source={ART[record.kind]} style={s.cardArt} resizeMode="cover" />
              <View style={s.cardCopy}><Text style={s.cardTitle} numberOfLines={2}>{record.title}</Text><Text style={s.cardSummary} numberOfLines={2}>{record.summary}</Text><Text style={s.cardTime}>{timeLabel(record.completedAt)}</Text></View>
            </PressScale>
            {record.favorite ? <View pointerEvents="none" style={s.savedBadge}><Ionicons name="heart" size={15} color="#A96560" /></View> : null}
          </View>)}</View></View>)}
        </ScrollView> : <View style={s.empty}>
          <Ionicons name={tab === 'search' ? 'search-outline' : album === 'favorites' ? 'heart-outline' : 'images-outline'} size={44} color="#AAB7A1" />
          <Text style={s.emptyTitle}>{tab === 'search' && query.trim() ? '검색 결과가 없어요' : album === 'favorites' ? '즐겨찾는 기록이 없어요' : '아직 기록이 없어요'}</Text>
          <Text style={s.emptyNote}>{album === 'favorites' ? '기록을 열고 하트를 눌러 보세요.' : tab === 'search' && query.trim() ? '다른 활동이나 날짜로 찾아보세요.' : '활동을 마치면 이곳에 모여요.'}</Text>
        </View>}
      </>}
    </View>
    <View accessibilityRole="tablist" style={s.tabs}>
      {([{ id: 'library', name: '보관함', icon: 'images-outline' }, { id: 'albums', name: '앨범', icon: 'albums-outline' }, { id: 'search', name: '검색', icon: 'search-outline' }] as const).map(item => <PressScale key={item.id} accessibilityRole="tab" accessibilityLabel={`사진 ${item.name}`} accessibilityState={{ selected: tab === item.id }} onPress={() => chooseTab(item.id)} style={s.tab}>
        <Ionicons name={item.icon} size={22} color={tab === item.id ? '#547A63' : '#9CA595'} /><Text style={[s.tabText, tab === item.id && { color: '#547A63' }]}>{item.name}</Text>
      </PressScale>)}
    </View>
  </View>;
}

function FavoriteButton({ record }: { record: ActivityRecord }) {
  return <PressScale accessibilityRole="button" accessibilityLabel={record.favorite ? '즐겨찾기 해제' : '즐겨찾기에 추가'} accessibilityState={{ selected: record.favorite }} onPress={() => toggleActivityFavorite(record.id)} style={s.favorite}>
    <Ionicons name={record.favorite ? 'heart' : 'heart-outline'} size={25} color={record.favorite ? '#AC6D68' : '#798C77'} />
  </PressScale>;
}
function AlbumRow({ title, count, icon, art, onPress }: { title: string; count: number; icon: React.ComponentProps<typeof Ionicons>['name']; art?: number; onPress: () => void }) {
  return <PressScale accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={s.album}>
    <View style={s.albumThumbnail}>{art ? <Image source={art} style={s.albumArt} /> : <Ionicons name={icon} size={29} color="#AB7770" />}</View><View style={{ flex: 1 }}><Text style={s.albumTitle}>{title}</Text><Text style={s.count}>{count}개</Text></View><Ionicons name="chevron-forward" size={18} color="#A6AE9F" />
  </PressScale>;
}

const s = StyleSheet.create({
  root: { flex: 1, minHeight: 390, backgroundColor: '#FBFCF7', borderTopLeftRadius: 21, borderTopRightRadius: 21, overflow: 'hidden' },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 15, paddingBottom: 10 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 },
  title: { fontFamily: fonts.bold, fontSize: 25, lineHeight: 34, color: '#374C3C' },
  total: { fontFamily: fonts.medium, fontSize: 13, color: '#819079' },
  scroller: { flexGrow: 0, maxHeight: 345 },
  recordList: { paddingBottom: 12 },
  date: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 21, color: '#758270', marginTop: 5, marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12, marginBottom: 13 },
  cardWrap: { width: '48%' },
  card: { borderRadius: 14, backgroundColor: '#F0EEE5', overflow: 'hidden' },
  cardArt: { width: '100%', aspectRatio: 1.1 },
  cardCopy: { paddingHorizontal: 10, paddingTop: 9, paddingBottom: 11, gap: 5 },
  cardTitle: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 21, color: '#425244' },
  cardSummary: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: '#6D7C67' },
  cardTime: { fontFamily: fonts.regular, fontSize: 12, color: '#8E9788', marginTop: 2 },
  savedBadge: { position: 'absolute', top: 7, right: 7, width: 27, height: 27, borderRadius: 14, backgroundColor: '#FBF9F0', alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: 13, paddingBottom: 24 },
  emptyTitle: { fontFamily: fonts.semibold, fontSize: 18, color: '#7D8A74', textAlign: 'center' },
  emptyNote: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: '#98A08F', textAlign: 'center' },
  tabs: { flexDirection: 'row', backgroundColor: '#F1F4EB', paddingTop: 8, paddingBottom: 7, marginTop: 'auto' },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 49, gap: 4 },
  tabText: { fontFamily: fonts.medium, fontSize: 12, color: '#9CA595' },
  search: { backgroundColor: '#EBF0E5', borderRadius: 13, minHeight: 45, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 12, marginBottom: 13 },
  input: { flex: 1, minWidth: 0, paddingVertical: 10, paddingRight: 5, fontFamily: fonts.regular, fontSize: 15, color: '#435442' },
  clear: { padding: 10, minHeight: 44, justifyContent: 'center' },
  albums: { gap: 10, paddingBottom: 8 },
  album: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 70 },
  albumThumbnail: { width: 62, height: 62, borderRadius: 13, backgroundColor: '#EEE7DC', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  albumArt: { width: '100%', height: '100%' },
  albumTitle: { fontFamily: fonts.semibold, fontSize: 16, color: '#4B614D', lineHeight: 23 },
  count: { fontFamily: fonts.regular, fontSize: 14, color: '#97A18D', marginTop: 4 },
  back: { flexDirection: 'row', alignItems: 'center', minHeight: 36, marginBottom: 6, gap: 3 },
  backText: { fontFamily: fonts.medium, fontSize: 14, color: '#658370' },
  detail: { paddingBottom: 20 },
  detailArt: { width: '100%', aspectRatio: 1.45, borderRadius: 16 },
  detailTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 13 },
  detailTitle: { flex: 1, fontFamily: fonts.bold, fontSize: 21, lineHeight: 29, color: '#3F5444' },
  favorite: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  detailPlace: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 22, color: '#6A806B', marginTop: 6 },
  detailDate: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, color: '#939D89', marginTop: 4 },
  metrics: { backgroundColor: '#EEF0E6', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 7, marginTop: 18, marginBottom: 14, gap: 4 },
  metric: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  metricLabel: { flex: 1, fontFamily: fonts.medium, fontSize: 15, lineHeight: 22, color: '#697962' },
  metricValue: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 28, color: '#45624C' },
  metricUnit: { fontFamily: fonts.medium, fontSize: 14 },
  fact: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, paddingVertical: 5 },
  factDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#A2B196', marginTop: 9 },
  factText: { flex: 1, fontFamily: fonts.regular, fontSize: 15, lineHeight: 23, color: '#77836E' },
});
