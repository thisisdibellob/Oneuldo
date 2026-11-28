import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PressScale } from '../PressScale';
import { fonts } from '../../theme';
import { MARKET_LAYOUT_OPTIONS } from '../../game/marketEnvironment';
import {
  marketLayoutStore, MAX_MARKET_LAYOUT_NAME_LENGTH, MAX_SAVED_MARKET_LAYOUTS, type SavedMarketLayout,
} from '../../game/marketLayoutStore';
import type { MarketTilemapV1 } from '../../game/marketTilemap';
import { MarketLayoutThumbnail } from './MarketLayoutThumbnail';
import { settingsColors as c } from './MarketSettingsUi';

export type MarketLayoutLibraryStore = Pick<typeof marketLayoutStore, 'list' | 'save' | 'rename' | 'duplicate' | 'remove'>;
type Confirmation = { kind: 'overwrite' | 'delete'; id: string } | null;
const nextName = (items: SavedMarketLayout[]) => {
  let number = 1;
  while (items.some(item => item.name === `내 마트 ${number}`)) number += 1;
  return `내 마트 ${number}`;
};
const modifiedTime = (iso: string) => {
  const date = new Date(iso);
  return `${date.getMonth() + 1}. ${date.getDate()}. ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')} 수정`;
};
const sortItems = (items: SavedMarketLayout[]) => [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
const limitName = (value: string) => Array.from(value).slice(0, MAX_MARKET_LAYOUT_NAME_LENGTH).join('');

/** Saved layouts remain independent of the editor draft and the running game. */
export function MarketLayoutLibrary({ getCurrentLayout, onLoad, store = marketLayoutStore }: {
  getCurrentLayout: () => MarketTilemapV1;
  onLoad: (tilemap: MarketTilemapV1) => void;
  store?: MarketLayoutLibraryStore;
}) {
  const [items, setItems] = useState<SavedMarketLayout[]>([]);
  const [name, setName] = useState('내 마트 1');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [readFailed, setReadFailed] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [manageId, setManageId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const mounted = useRef(true);
  const operation = useRef(false);
  const nameEdited = useRef(false);

  const loadItems = async () => {
    if (operation.current) return;
    operation.current = true;
    setLoading(true); setError('');
    try {
      const saved = await store.list();
      if (!mounted.current) return;
      setItems(sortItems(saved)); setReadFailed(false);
      if (!nameEdited.current) setName(nextName(saved));
    } catch (reason) {
      if (mounted.current) { setReadFailed(true); setError(reason instanceof Error ? reason.message : '저장한 배치를 읽지 못했어요. 다시 시도해 주세요.'); }
    } finally {
      operation.current = false;
      if (mounted.current) setLoading(false);
    }
  };
  useEffect(() => {
    mounted.current = true;
    void loadItems();
    return () => { mounted.current = false; };
  }, [store]);

  const mutate = async (work: () => Promise<void>) => {
    if (operation.current || readFailed || loading) return;
    operation.current = true;
    setBusy(true); setError(''); setNotice('');
    try { await work(); }
    catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : '저장하지 못했어요. 다시 시도해 주세요.'); }
    finally { operation.current = false; if (mounted.current) setBusy(false); }
  };
  const mergeItem = (item: SavedMarketLayout, message: string) => {
    if (!mounted.current) return;
    setItems(previous => sortItems([...previous.filter(saved => saved.id !== item.id), item]));
    setNotice(message); setConfirmation(null); setManageId(null);
  };
  const saveNew = () => void mutate(async () => {
    // The parent flushes focused coordinate inputs and validates the actual draft here.
    const tilemap = getCurrentLayout();
    const saved = await store.save({ name, tilemap });
    if (!mounted.current) return;
    mergeItem(saved, `‘${saved.name}’ 배치를 저장했어요.`);
    setName(nextName([...items, saved])); nameEdited.current = false;
  });
  const load = (item: SavedMarketLayout) => {
    if (operation.current) return;
    setError(''); setNotice('');
    try {
      // Load is only a draft change. Applying the layout to the game is the editor's action.
      onLoad(JSON.parse(JSON.stringify(item.tilemap)) as MarketTilemapV1);
      setNotice(`‘${item.name}’ 배치를 불러왔어요. 지도를 확인한 뒤 적용해 주세요.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '현재 마트 설정에서 사용할 수 없는 배치예요.'); }
  };
  const disabled = loading || busy || readFailed;
  const full = items.length >= MAX_SAVED_MARKET_LAYOUTS;

  return <View style={s.container} testID="market-layout-library">
    <View style={s.saveCard}>
      <View style={s.sectionHeading}><View style={s.sectionCopy}><Text style={s.title}>내 마트 보관함</Text><Text style={s.description}>만든 배치를 이름으로 저장하고 다시 꺼내 쓰세요.</Text></View>
        <View style={s.countBadge}><Text style={s.count}>{items.length} / {MAX_SAVED_MARKET_LAYOUTS}</Text></View></View>
      <Text style={s.label}>지금 편집 중인 배치</Text>
      <View style={s.saveRow}>
        <TextInput accessibilityLabel="새 배치 이름" value={name} onChangeText={text => { nameEdited.current = true; setName(limitName(text)); }} maxLength={MAX_MARKET_LAYOUT_NAME_LENGTH * 2} editable={!disabled} placeholder="배치 이름" placeholderTextColor="#8B9585" autoCorrect={false} returnKeyType="done" onSubmitEditing={() => { if (!disabled && !full) saveNew(); }} style={s.nameInput} />
        <Action label="새로 저장" icon="add" primary disabled={disabled || full || !name.trim()} onPress={saveNew} />
      </View>
      {full ? <Text style={s.hint}>보관함이 가득 찼어요. 기존 배치를 덮어쓰거나 필요 없는 배치를 지워 주세요.</Text> : <Text style={s.hint}>최대 {MAX_MARKET_LAYOUT_NAME_LENGTH}자 · 이 기기·브라우저에 저장돼요.</Text>}
    </View>

    {error ? <View accessible accessibilityRole="alert" accessibilityLabel={error} accessibilityLiveRegion="polite" style={s.error}><Ionicons accessible={false} name="alert-circle-outline" size={20} color="#9A4C3A" /><Text style={s.errorText}>{error}</Text></View> : null}
    {notice ? <Text accessibilityLiveRegion="polite" style={s.notice}>{notice}</Text> : null}
    {loading ? <View style={s.loading}><ActivityIndicator size="small" color="#527665" /><Text style={s.description}>보관함을 열고 있어요</Text></View>
      : readFailed ? <Action label="보관함 다시 읽기" icon="refresh-outline" onPress={() => { void loadItems(); }} />
      : items.length === 0 ? <View style={s.empty}><View style={s.emptyIcon}><Ionicons name="storefront-outline" size={34} color="#739178" /></View><Text style={s.emptyTitle}>첫 마트를 저장해 볼까요?</Text><Text style={s.emptyText}>위에서 이름을 정하고 ‘새로 저장’을 눌러 주세요.</Text></View>
      : <View style={s.cards}>
        {items.map(item => {
          const employeeCount = item.tilemap.people.filter(person => person.kind === 'employee').length;
          const customerCount = item.tilemap.people.length - employeeCount;
          const managing = manageId === item.id;
          const confirming = confirmation?.id === item.id ? confirmation.kind : null;
          return <View key={item.id} style={[s.card, managing && s.cardManaging]}>
            <View style={s.cardTop}><View style={s.thumbnail}><MarketLayoutThumbnail tilemap={item.tilemap} width={100} /></View>
              <View style={s.cardCopy}><Text style={s.layoutType}>{MARKET_LAYOUT_OPTIONS.find(option => option.id === item.tilemap.layoutId)?.label ?? '마트'}</Text><Text style={s.cardName} numberOfLines={2}>{item.name}</Text>
                <Text style={s.meta}>종업원 {employeeCount} · 손님 {customerCount}</Text><Text style={s.timestamp}>{modifiedTime(item.updatedAt)}</Text></View></View>
            <View style={s.cardActions}><Action label="불러오기" accessibilityLabel={`${item.name} 배치 불러오기`} primary disabled={disabled} onPress={() => load(item)} />
              <Action label={managing ? '접기' : '관리'} accessibilityLabel={`${item.name} 배치 ${managing ? '관리 접기' : '관리'}`} icon={managing ? 'chevron-up' : 'ellipsis-horizontal'} disabled={disabled} onPress={() => { setManageId(managing ? null : item.id); setRenameText(item.name); setConfirmation(null); }} /></View>
            {managing ? <View style={s.management}>
              {confirming ? <View style={s.confirmation}>
                <Text style={s.confirmTitle}>{confirming === 'delete' ? '이 배치를 보관함에서 지울까요?' : '현재 편집한 배치로 바꿀까요?'}</Text>
                <Text style={s.hint}>{confirming === 'delete' ? '지금 편집 중인 배치와 게임 진행은 그대로예요.' : '보관함의 기존 배치를 덮어써요. 이름은 유지돼요.'}</Text>
                <View style={s.inlineActions}><Action label="취소" accessibilityLabel={`${item.name} ${confirming === 'delete' ? '삭제' : '덮어쓰기'} 취소`} disabled={disabled} onPress={() => setConfirmation(null)} />
                  <Action label={confirming === 'delete' ? '삭제하기' : '덮어쓰기'} accessibilityLabel={`${item.name} ${confirming === 'delete' ? '삭제 확인' : '덮어쓰기 확인'}`} danger={confirming === 'delete'} primary={confirming === 'overwrite'} disabled={disabled} onPress={() => void mutate(async () => {
                    if (confirming === 'delete') {
                      await store.remove(item.id);
                      if (!mounted.current) return;
                      setItems(previous => previous.filter(saved => saved.id !== item.id)); setManageId(null); setConfirmation(null); setNotice(`‘${item.name}’ 배치를 보관함에서 지웠어요.`);
                    } else {
                      const saved = await store.save({ id: item.id, name: item.name, tilemap: getCurrentLayout() });
                      mergeItem(saved, `‘${saved.name}’ 배치를 업데이트했어요.`);
                    }
                  })} /></View>
              </View> : <>
                <Text style={s.label}>이름 바꾸기</Text>
                <View style={s.renameRow}><TextInput accessibilityLabel={`${item.name} 새 이름`} value={renameText} onChangeText={text => setRenameText(limitName(text))} maxLength={MAX_MARKET_LAYOUT_NAME_LENGTH * 2} editable={!disabled} style={s.renameInput} autoCorrect={false} />
                  <Action label="변경" accessibilityLabel={`${item.name} 이름 변경`} disabled={disabled || !renameText.trim() || renameText.trim() === item.name} onPress={() => void mutate(async () => { const saved = await store.rename(item.id, renameText); mergeItem(saved, '배치 이름을 바꿨어요.'); })} /></View>
                <View style={s.managementActions}><Action label="복제" accessibilityLabel={`${item.name} 배치 복제`} icon="copy-outline" disabled={disabled || full} onPress={() => void mutate(async () => { const saved = await store.duplicate(item.id); mergeItem(saved, `‘${saved.name}’ 배치를 만들었어요.`); })} />
                  <Action label="현재 배치로 덮어쓰기" disabled={disabled} onPress={() => setConfirmation({ kind: 'overwrite', id: item.id })} />
                  <Action label="삭제" accessibilityLabel={`${item.name} 배치 삭제`} icon="trash-outline" danger disabled={disabled} onPress={() => setConfirmation({ kind: 'delete', id: item.id })} /></View>
              </>}
            </View> : null}
          </View>;
        })}
      </View>}
    {busy ? <View accessibilityLiveRegion="polite" style={s.loading}><ActivityIndicator size="small" color="#527665" /><Text style={s.description}>보관함에 반영하고 있어요</Text></View> : null}
    {items.length > 0 && !loading && !readFailed ? <Text style={s.hint}>불러오면 편집 화면에서 확인할 수 있어요. 다른 기기로 옮길 때는 JSON으로 저장하세요.</Text> : null}
  </View>;
}

function Action({ label, accessibilityLabel = label, icon, onPress, primary, danger, disabled }: {
  label: string; accessibilityLabel?: string; icon?: keyof typeof Ionicons.glyphMap; onPress: () => void; primary?: boolean; danger?: boolean; disabled?: boolean;
}) {
  const color = primary ? '#FFFCF3' : danger ? '#99513E' : c.ink;
  return <PressScale accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} style={[s.button, primary && s.buttonPrimary, danger && s.buttonDanger, disabled && s.disabled]}>
    {icon ? <Ionicons name={icon} size={18} color={color} /> : null}<Text style={[s.buttonText, { color }]}>{label}</Text>
  </PressScale>;
}

const s = StyleSheet.create({
  container: { gap: 16 }, saveCard: { backgroundColor: c.card, borderRadius: 18, padding: 16, gap: 10 },
  sectionHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 3 }, sectionCopy: { flex: 1, gap: 6 },
  title: { fontFamily: fonts.cafe24Ssurround, fontSize: 21, color: c.label }, description: { fontFamily: fonts.cafe24Ssurround, fontSize: 14, lineHeight: 21, color: '#687460' },
  countBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: c.field }, count: { fontFamily: fonts.cafe24Ssurround, fontSize: 13, color: '#66755E' },
  label: { fontFamily: fonts.cafe24Ssurround, fontSize: 13, color: c.ink }, saveRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  nameInput: { flex: 1, minWidth: 160, minHeight: 46, borderRadius: 11, backgroundColor: c.field, paddingHorizontal: 13, paddingVertical: 10, fontFamily: fonts.cafe24Ssurround, fontSize: 16, color: c.label },
  hint: { fontFamily: fonts.cafe24Ssurround, fontSize: 13, lineHeight: 20, color: c.muted },
  loading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingVertical: 20 },
  empty: { paddingVertical: 30, alignItems: 'center', gap: 10 }, emptyIcon: { width: 64, height: 64, borderRadius: 22, backgroundColor: '#EAEEDF', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontFamily: fonts.cafe24Ssurround, fontSize: 17, color: c.ink }, emptyText: { fontFamily: fonts.cafe24Ssurround, fontSize: 14, lineHeight: 22, color: c.muted, textAlign: 'center' },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }, card: { flexGrow: 1, flexBasis: 300, maxWidth: 520, padding: 14, borderRadius: 17, backgroundColor: c.card, gap: 12 }, cardManaging: { backgroundColor: c.field },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 13 }, thumbnail: { width: 100, borderRadius: 9, overflow: 'hidden' }, cardCopy: { flex: 1, minWidth: 0, gap: 6 },
  layoutType: { fontFamily: fonts.cafe24Ssurround, fontSize: 12, color: '#7C846F' }, cardName: { fontFamily: fonts.cafe24Ssurround, fontSize: 18, lineHeight: 25, color: c.label },
  meta: { fontFamily: fonts.cafe24Ssurround, fontSize: 13, color: '#64715E' }, timestamp: { fontFamily: fonts.cafe24Ssurround, fontSize: 12, color: '#828A79' },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 7 }, management: { gap: 8, paddingTop: 4 }, renameRow: { flexDirection: 'row', gap: 7, alignItems: 'center' },
  renameInput: { flex: 1, minWidth: 0, minHeight: 44, backgroundColor: c.field, borderRadius: 10, paddingHorizontal: 10, fontFamily: fonts.cafe24Ssurround, fontSize: 15, color: c.label },
  managementActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, confirmation: { padding: 12, backgroundColor: c.panel, borderRadius: 12, gap: 8 },
  confirmTitle: { fontFamily: fonts.cafe24Ssurround, fontSize: 15, lineHeight: 22, color: '#4D6151' }, inlineActions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 7 },
  button: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: c.field, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  buttonPrimary: { backgroundColor: c.selected }, buttonDanger: { backgroundColor: '#F3E7DA' }, buttonText: { fontFamily: fonts.cafe24Ssurround, fontSize: 14 }, disabled: { opacity: 0.4 },
  error: { padding: 13, borderRadius: 13, backgroundColor: '#FAEDE2', flexDirection: 'row', gap: 8, alignItems: 'flex-start' }, errorText: { flex: 1, fontFamily: fonts.cafe24Ssurround, fontSize: 14, lineHeight: 21, color: '#934C3D' },
  notice: { fontFamily: fonts.cafe24Ssurround, fontSize: 14, lineHeight: 21, color: c.selected },
});
