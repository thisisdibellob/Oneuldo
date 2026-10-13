import { Ionicons } from '@expo/vector-icons';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { PressScale } from '../PressScale';
import { fonts } from '../../theme';
import { getLibraryBookArt } from '../../game/libraryArt';
import { getLibraryBook, getLibraryCategory, getLibraryShelfReferenceBooks, type LibraryBook, type LibraryCategoryId, type LibrarySessionBook, type LibraryShelfSlot } from '../../game/librarySession';
import { useMarketReducedMotion } from './MarketPanelTransition';

export const LIBRARY_COLORS = { ink: '#454F44', muted: '#78816F', green: '#57785F', paper: '#FAF7EE', warm: '#E8DBBF', terra: '#AE7660' };
const DragScrollContext = createContext<(dragging: boolean) => void>(() => {});
export function LibraryPanel({ title, subtitle, onClose, children, footer, testID, fixedHeight, scrollToTopKey }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; footer?: ReactNode; testID?: string; fixedHeight?: number; scrollToTopKey?: string | null }) {
  const { height } = useWindowDimensions(); const reduced = useMarketReducedMotion();
  const [dragging, setDragging] = useState(false);
  const scroll = useRef<ScrollView>(null);
  useEffect(() => { if (scrollToTopKey) scroll.current?.scrollTo({ y: 0, animated: !reduced }); }, [scrollToTopKey, reduced]);
  const motion = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => { if (reduced) { motion.setValue(1); return; } const a = Animated.spring(motion, { toValue: 1, damping: 22, stiffness: 200, mass: 0.8, useNativeDriver: true }); a.start(); return () => a.stop(); }, [motion, reduced]);
  return <View accessibilityViewIsModal style={p.overlay} testID={testID}>
    <Pressable accessibilityRole="button" accessibilityLabel="작업 화면 닫기" style={StyleSheet.absoluteFill} onPress={onClose} />
    <Animated.View testID={testID ? `${testID}-frame` : undefined} style={[p.panel, fixedHeight !== undefined && { height: Math.min(fixedHeight, Math.max(0, height - 64)) }, { maxHeight: height - 64, opacity: motion, transform: [{ translateY: motion.interpolate({ inputRange: [0, 1], outputRange: [26, 0] }) }, { scale: motion.interpolate({ inputRange: [0, 1], outputRange: [0.975, 1] }) }] }]}>
      <View style={p.header}><View style={{ flex: 1 }}><Text accessibilityRole="header" style={p.title}>{title}</Text>{subtitle ? <Text style={p.subtitle}>{subtitle}</Text> : null}</View><PressScale accessibilityRole="button" accessibilityLabel="닫기" onPress={onClose} style={p.close}><Ionicons name="close" size={25} color={LIBRARY_COLORS.ink} /></PressScale></View>
      <DragScrollContext.Provider value={setDragging}><ScrollView ref={scroll} scrollEnabled={!dragging} style={fixedHeight !== undefined ? { flex: 1, minHeight: 0 } : { flexShrink: 1 }} contentContainerStyle={p.body} showsVerticalScrollIndicator={false} bounces={false} keyboardShouldPersistTaps="handled">{children}</ScrollView></DragScrollContext.Provider>
      {footer ? <View style={p.footer}>{footer}</View> : null}
    </Animated.View>
  </View>;
}
export function LibraryButton({ children, onPress, secondary = false, disabled = false, icon, label }: { children: string; onPress: () => void; secondary?: boolean; disabled?: boolean; icon?: keyof typeof Ionicons.glyphMap; label?: string }) {
  return <PressScale accessibilityRole="button" accessibilityLabel={label ?? children} disabled={disabled} accessibilityState={{ disabled }} onPress={onPress} style={[p.button, secondary && p.secondary, disabled && { opacity: 0.38 }]}>
    {icon ? <Ionicons name={icon} size={20} color={secondary ? LIBRARY_COLORS.green : '#FFFDF5'} /> : null}<Text style={[p.buttonText, secondary && { color: LIBRARY_COLORS.green }]}>{children}</Text>
  </PressScale>;
}
export function LibraryBookArt({ book, height = 100 }: { book: LibraryBook; height?: number }) {
  return <Image accessible={false} source={getLibraryBookArt(book.id)} resizeMode="contain" style={{ width: height * 0.8, height }} />;
}
export function LibraryBookLabel({ book, damaged, large = false, showCategory = true }: { book: LibraryBook; damaged: boolean; large?: boolean; showCategory?: boolean }) {
  const category = getLibraryCategory(book.categoryId);
  return <View style={[p.bookLabel, large && p.labelLarge]}>
    {damaged ? <><View style={p.tornMark} /><Text style={[p.callNumber, { color: '#938978' }]}>라벨 훼손</Text></> : <><View style={[p.labelBand, { backgroundColor: showCategory ? category.color : '#A9AF99' }]} />{showCategory ? <Text style={p.labelCategory}>{category.label}</Text> : null}<Text style={[p.callNumber, large && { fontSize: 24 }]}>{book.callNumber}</Text></>}
  </View>;
}
export function LibraryBookGrid({ books, selectedId, onSelect, showStatus = false }: { books: LibrarySessionBook[]; selectedId?: string | null; onSelect: (id: string) => void; showStatus?: boolean }) {
  return <View style={p.bookGrid}>{books.map(item => {
    const book = getLibraryBook(item.bookId)!;
    const status = item.location === 'handoff' ? '확인함' : item.location === 'shelf' ? `${getLibraryCategory(item.shelfId!).label} 서가` : item.location === 'carried' ? '가지고 있음' : '';
    return <PressScale key={book.id} accessibilityRole="button" accessibilityLabel={`${book.title} 확인`} onPress={() => onSelect(book.id)} style={[p.bookCell, selectedId === book.id && p.selectedCell]}>
      <LibraryBookArt book={book} height={95} /><Text style={p.bookTitle} numberOfLines={2}>{book.title}</Text>
      {item.source === 'visitor' ? <Text style={p.bookStatus}>손님 부탁</Text> : null}
      {showStatus && status ? <Text style={p.bookStatus}>{status}</Text> : null}
      {item.inspected && item.damagedLabel && item.location !== 'handoff' ? <Ionicons style={p.warning} name="help-circle" size={24} color="#B08655" /> : null}
    </PressScale>;
  })}</View>;
}

type ShelfProps = { categoryId: LibraryCategoryId; carried: LibrarySessionBook[]; shelved: LibrarySessionBook[]; selectedId: string | null; selectedSlot?: LibraryShelfSlot | null; onSelectSlot?: (slot: LibraryShelfSlot) => void; onSelect: (id: string) => void; onPlace: (id: string, slot?: LibraryShelfSlot) => boolean | void; onTake: (id: string) => void; showOrderHelp?: boolean; selectedControls?: ReactNode };
export function LibraryShelfWork({ categoryId, carried, shelved, selectedId, selectedSlot, onSelectSlot, onSelect, onPlace, onTake, showOrderHelp = true, selectedControls }: ShelfProps) {
  const target = useRef<View>(null); const bounds = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const slotTargets = useRef<(View | null)[]>([]);
  const [dragging, setDragging] = useState(false); const [pulse, setPulse] = useState(false);
  const lockScroll = useContext(DragScrollContext);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (pulseTimer.current) clearTimeout(pulseTimer.current); lockScroll(false); }, [lockScroll]);
  const correctlyShelvedCount = shelved.filter(book => getLibraryBook(book.bookId)?.categoryId === categoryId).length;
  const lastCorrectCount = useRef(correctlyShelvedCount);
  useEffect(() => {
    if (correctlyShelvedCount > lastCorrectCount.current) {
      setPulse(true); if (pulseTimer.current) clearTimeout(pulseTimer.current);
      pulseTimer.current = setTimeout(() => setPulse(false), 600);
    }
    lastCorrectCount.current = correctlyShelvedCount;
  }, [correctlyShelvedCount]);
  const category = getLibraryCategory(categoryId);
  const measure = () => target.current?.measureInWindow((x, y, width, height) => { bounds.current = { x, y, width, height }; });
  const selected = carried.find(b => b.bookId === selectedId);
  const referenceBooks = getLibraryShelfReferenceBooks(categoryId);
  const place = (id: string, slot?: LibraryShelfSlot) => {
    const accepted = onPlace(id, slot);
    if (!accepted) return;
    setPulse(true); if (pulseTimer.current) clearTimeout(pulseTimer.current); pulseTimer.current = setTimeout(() => setPulse(false), 600);
  };
  return <View>
    <View style={[p.shelfPlaque, { backgroundColor: `${category.color}20` }]}><Ionicons name={category.icon} size={23} color={category.color} /><Text style={p.shelfHeading}>{category.callRange}</Text></View>
    {onSelectSlot && showOrderHelp ? <View style={p.orderHelp} testID="library-order-help"><Text style={p.orderHelpTitle}>책을 고르고 → 번호 사이에 꽂아요</Text><Text style={p.orderHelpText}>맨 윗줄 번호만 비교해요. 작은 번호가 왼쪽이에요.</Text></View> : null}
    <View ref={target} collapsable={false} onLayout={measure} style={[p.shelfTarget, dragging && { backgroundColor: '#E0E6CC' }, pulse && { backgroundColor: '#DCE6CA' }]} testID="library-shelf-drop-zone">
      {onSelectSlot ? <View style={p.orderShelf}>
        {([0, 1, 2] as const).map(slot => <View key={slot} style={slot < 2 ? p.orderPair : p.orderLast}>
          <View ref={node => { slotTargets.current[slot] = node; }} collapsable={false} style={p.orderSlotTarget}>
            <PressScale accessibilityRole="button" accessibilityLabel={`책 꽂을 자리 ${slot + 1}`} accessibilityHint={slot === 0 ? '왼쪽 책보다 앞' : slot === 1 ? '두 책 사이' : '오른쪽 책보다 뒤'} accessibilityState={{ selected: selectedSlot === slot, disabled: !selected }} disabled={!selected} onPress={() => onSelectSlot(slot)} style={[p.orderSlot, selectedSlot === slot && p.orderSlotSelected]}>
              <Ionicons name={selectedSlot === slot ? 'book' : 'add'} size={24} color={selectedSlot === slot ? '#4F7455' : '#8E9275'} />
              <Text style={p.orderSlotText}>{selectedSlot === slot && selected ? selected.damagedLabel ? '?' : getLibraryBook(selected.bookId)!.callNumber.split('\n')[0] : `${slot + 1}`}</Text>
            </PressScale>
          </View>
          {slot < 2 ? <View style={[p.referenceSpine, { backgroundColor: referenceBooks[slot as 0 | 1].coverColor }]}><View style={p.spineLines} /><Text style={p.referenceNumber}>{referenceBooks[slot as 0 | 1].callNumber.split('\n')[0]}</Text></View> : null}
        </View>)}
      </View> : <View style={p.shelfBooks}>
        {shelved.map(item => <PressScale key={item.bookId} accessibilityRole="button" accessibilityLabel={`${getLibraryBook(item.bookId)!.title} 다시 꺼내기`} onPress={() => onTake(item.bookId)} style={p.placedBook}>
          <LibraryBookArt book={getLibraryBook(item.bookId)!} height={91} />
          <Text style={{ fontFamily: fonts.bold, fontSize: 16, color: '#565F48', marginBottom: 5 }}>{getLibraryBook(item.bookId)!.callNumber.split('\n')[0]}</Text>
        </PressScale>)}
        {shelved.length < 3 ? <PressScale accessibilityRole="button" accessibilityLabel="선택한 책을 이 서가에 꽂기" disabled={!selected} onPress={() => selected && place(selected.bookId)} style={p.emptySlot}>
          <Ionicons name={pulse ? 'checkmark' : 'add'} color="#8B9072" size={29} /><Text style={p.slotText}>{selected ? '여기에 꽂기' : '책 놓는 곳'}</Text>
        </PressScale> : null}
      </View>}
      <View style={p.woodLip} /><View style={p.shelfShadow} />
    </View>
    {onSelectSlot ? <Text style={p.orderDirection}>작은 번호 ← 책등 번호 → 큰 번호</Text> : null}
    {selectedControls}
    {onSelectSlot && shelved.length > 0 ? <View style={p.shelvedStrip}>{shelved.map(item => <PressScale key={item.bookId} accessibilityRole="button" accessibilityLabel={`${getLibraryBook(item.bookId)!.title} 다시 꺼내기`} onPress={() => onTake(item.bookId)} style={p.shelvedMini}><LibraryBookArt book={getLibraryBook(item.bookId)!} height={60} /><Ionicons name={getLibraryBook(item.bookId)!.categoryId === categoryId ? 'checkmark-circle' : 'alert-circle'} color={getLibraryBook(item.bookId)!.categoryId === categoryId ? '#6F8A62' : '#AD7754'} size={20} /></PressScale>)}</View> : null}
    {shelved.length > 0 ? <Text style={p.smallNote}>꽂힌 책을 누르면 다시 꺼낼 수 있어요.</Text> : null}
    <Text style={p.sectionLabel}>가지고 온 책 · {carried.length}</Text>
    {carried.length ? <View style={p.bookGrid} testID="library-shelf-carried-books">{carried.map(item => <DraggableLibraryBook key={item.bookId} book={getLibraryBook(item.bookId)!} damaged={item.damagedLabel} selected={selectedId === item.bookId} onSelect={() => onSelect(item.bookId)} onDragState={value => { setDragging(value); lockScroll(value); if (value) measure(); }} onDrop={(x, y) => {
      if (onSelectSlot) {
        slotTargets.current.forEach((slotTarget, slot) => slotTarget?.measureInWindow((left, top, width, height) => {
          if (x >= left && x <= left + width && y >= top && y <= top + height) place(item.bookId, slot as LibraryShelfSlot);
        }));
        return;
      }
      target.current?.measureInWindow((left, top, width, height) => {
        if (x >= left && x <= left + width && y >= top && y <= top + height) place(item.bookId);
      });
    }} />)}</View> : <Text style={p.emptyText}>가지고 있는 책이 없어요.</Text>}
  </View>;
}
function DraggableLibraryBook({ book, damaged, selected, onSelect, onDrop, onDragState }: { book: LibraryBook; damaged: boolean; selected: boolean; onSelect: () => void; onDrop: (x: number, y: number) => void; onDragState: (active: boolean) => void }) {
  const motion = useRef(new Animated.ValueXY()).current; const armed = useRef(false); const active = useRef(false); const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlers = useRef({ onSelect, onDrop, onDragState }); handlers.current = { onSelect, onDrop, onDragState };
  const [raised, setRaised] = useState(false);
  const scrolled = useRef(false);
  const card = useRef<View>(null);
  const cleanup = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  useEffect(() => () => { cleanup(); }, []);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const element = card.current as unknown as HTMLElement | null;
    const preventDragScroll = (event: TouchEvent) => { if (armed.current && event.cancelable) event.preventDefault(); };
    element?.addEventListener?.('touchmove', preventDragScroll, { passive: false });
    return () => element?.removeEventListener?.('touchmove', preventDragScroll);
  }, []);
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { armed.current = false; active.current = false; scrolled.current = false; cleanup(); timer.current = setTimeout(() => { armed.current = true; setRaised(true); handlers.current.onDragState(true); }, 260); },
    onPanResponderMove: (_, g) => { if (armed.current) { active.current = true; motion.setValue({ x: g.dx, y: g.dy }); } else if (Math.hypot(g.dx, g.dy) > 14) { scrolled.current = true; cleanup(); } },
    onPanResponderRelease: (_, g) => { cleanup(); if (active.current) handlers.current.onDrop(g.moveX, g.moveY); else if (!scrolled.current) handlers.current.onSelect(); armed.current = false; active.current = false; setRaised(false); handlers.current.onDragState(false); Animated.spring(motion, { toValue: { x: 0, y: 0 }, damping: 20, stiffness: 260, useNativeDriver: true }).start(); },
    onPanResponderTerminate: () => { cleanup(); armed.current = false; active.current = false; setRaised(false); handlers.current.onDragState(false); motion.setValue({ x: 0, y: 0 }); },
    onPanResponderTerminationRequest: () => !armed.current,
  }), [motion]);
  const keyboardProps = Platform.OS === 'web' ? { onKeyUp: (e: { nativeEvent: { key: string } }) => { if (['Enter', ' '].includes(e.nativeEvent.key)) onSelect(); } } : {};
  return <Animated.View ref={card} accessible accessibilityRole="button" accessibilityLabel={`${book.title} 선택`} accessibilityHint={`${damaged ? '라벨이 훼손된 책' : `분류번호 ${book.callNumber.split('\n')[0]}`}. 누르면 선택하고, 길게 누르면 서가로 끌어 옮길 수 있어요`} onAccessibilityTap={onSelect} focusable {...keyboardProps} {...responder.panHandlers} style={[p.bookCell, selected && p.selectedCell, { zIndex: raised ? 99 : 0, transform: [...motion.getTranslateTransform(), { scale: raised ? 1.06 : 1 }] }, Platform.OS === 'web' && ({ touchAction: 'auto', userSelect: 'none', cursor: raised ? 'grabbing' : 'grab' } as never)]}>
    <View><LibraryBookArt book={book} height={87} /><Text style={p.carriedNumber}>{damaged ? '?' : book.callNumber.split('\n')[0]}</Text></View><Text style={p.bookTitle} numberOfLines={2}>{book.title}</Text>
  </Animated.View>;
}
export function LibraryToast({ message, positive = true }: { message: string; positive?: boolean }) {
  const motion = useRef(new Animated.Value(0)).current; const reduced = useMarketReducedMotion();
  useEffect(() => { motion.setValue(reduced ? 1 : 0); if (reduced) return; const a = Animated.timing(motion, { toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }); a.start(); return () => a.stop(); }, [message, motion, reduced]);
  return <Animated.View pointerEvents="none" accessibilityLiveRegion="polite" style={[p.toast, { opacity: motion, transform: [{ translateY: motion.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }] }]}><Ionicons name={positive ? 'checkmark-circle' : 'information-circle'} color={positive ? '#6E8864' : '#B07D54'} size={22} /><Text style={p.toastText}>{message}</Text></Animated.View>;
}
const p = StyleSheet.create({
  carriedNumber: { position: 'absolute', bottom: 0, alignSelf: 'center', minWidth: 50, paddingHorizontal: 5, paddingVertical: 3, textAlign: 'center', backgroundColor: '#FFFDF3', color: '#4D5D45', borderRadius: 4, fontFamily: fonts.bold, fontSize: 14 },
  orderHelp: { backgroundColor: '#EEF0E0', borderRadius: 14, padding: 13, gap: 5, marginBottom: 14 }, orderHelpTitle: { fontFamily: fonts.bold, fontSize: 17, color: '#50634C' }, orderHelpText: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 22, color: '#727C63' },
  orderShelf: { flexDirection: 'row', alignItems: 'flex-end', flex: 1, paddingHorizontal: 7, gap: 4 }, orderPair: { flex: 2, flexDirection: 'row', gap: 4, alignItems: 'flex-end' }, orderLast: { flex: 1 }, orderSlotTarget: { flex: 1 }, orderSlot: { minWidth: 44, minHeight: 105, backgroundColor: '#FFF6E487', borderRadius: 8, alignItems: 'center', justifyContent: 'center', gap: 7 }, orderSlotSelected: { backgroundColor: '#DCE8CF' }, orderSlotText: { fontFamily: fonts.bold, fontSize: 15, color: '#66785A' }, referenceSpine: { flex: 1, minWidth: 44, height: 114, borderRadius: 5, justifyContent: 'space-between', paddingTop: 15, paddingBottom: 12 }, spineLines: { height: 6, backgroundColor: '#FFFFFF55', marginHorizontal: 5, borderRadius: 2 }, referenceNumber: { fontFamily: fonts.bold, fontSize: 14, color: '#454F44', textAlign: 'center', backgroundColor: '#FFFBEF', paddingVertical: 7 }, orderDirection: { fontFamily: fonts.medium, fontSize: 14, textAlign: 'center', color: '#858773', marginTop: 16 }, shelvedStrip: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, paddingTop: 14 }, shelvedMini: { alignItems: 'center', gap: 2, padding: 4 },
  overlay: { ...StyleSheet.absoluteFill, zIndex: 60, backgroundColor: 'rgba(46,52,43,0.29)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 30 },
  panel: { width: '100%', maxWidth: 600, backgroundColor: LIBRARY_COLORS.paper, borderRadius: 28, overflow: 'hidden', ...Platform.select({ web: { boxShadow: '0 16px 70px rgba(45,47,38,0.22)' }, default: { elevation: 15, shadowColor: '#323C2F', shadowOpacity: 0.18, shadowRadius: 25, shadowOffset: { width: 0, height: 12 } } }) },
  header: { paddingHorizontal: 22, paddingTop: 22, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 8 }, title: { fontFamily: fonts.laundryBold, color: LIBRARY_COLORS.ink, fontSize: 25, lineHeight: 32 }, subtitle: { fontFamily: fonts.medium, color: LIBRARY_COLORS.muted, fontSize: 15, lineHeight: 22, marginTop: 4 }, close: { width: 42, height: 42, backgroundColor: '#EEEDDF', borderRadius: 23, alignItems: 'center', justifyContent: 'center' }, body: { paddingHorizontal: 20, paddingBottom: 22 }, footer: { paddingHorizontal: 20, paddingBottom: 20, paddingTop: 8, gap: 10 },
  button: { minHeight: 52, borderRadius: 16, backgroundColor: LIBRARY_COLORS.green, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', paddingHorizontal: 15, paddingVertical: 12, gap: 7 }, secondary: { backgroundColor: '#E9ECDD' }, buttonText: { fontFamily: fonts.bold, color: '#FFFDF5', fontSize: 17, lineHeight: 23, textAlign: 'center', flexShrink: 1 },
  bookGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', gap: 6, overflow: 'visible' }, bookCell: { width: '31.7%', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 3, borderRadius: 16, minHeight: 145 }, selectedCell: { backgroundColor: '#E7EBDA' }, bookTitle: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 21, color: LIBRARY_COLORS.ink, textAlign: 'center', marginTop: 6, minHeight: 42 }, bookStatus: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, color: '#748466', marginTop: 4 }, warning: { position: 'absolute', right: 3, top: 4 },
  bookLabel: { minWidth: 97, paddingHorizontal: 16, paddingVertical: 9, alignItems: 'center', backgroundColor: '#FFFEF7', borderRadius: 6, alignSelf: 'center', overflow: 'hidden', gap: 3 }, labelLarge: { minWidth: 170, paddingVertical: 17, marginVertical: 16 }, labelBand: { height: 5, position: 'absolute', top: 0, left: 0, right: 0 }, labelCategory: { fontFamily: fonts.medium, fontSize: 14, color: '#667057' }, callNumber: { fontFamily: fonts.bold, fontSize: 19, color: '#4D5546' }, tornMark: { width: 54, height: 9, backgroundColor: '#E3D8C1', borderRadius: 5, transform: [{ rotate: '-6deg' }] },
  shelfPlaque: { flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center', borderRadius: 13, padding: 12, marginBottom: 15 }, shelfHeading: { fontFamily: fonts.laundryBold, color: LIBRARY_COLORS.ink, fontSize: 21 }, shelfTarget: { height: 145, backgroundColor: '#E7D4B5', borderTopLeftRadius: 14, borderTopRightRadius: 14, paddingTop: 12 }, shelfBooks: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', gap: 8, flex: 1, paddingHorizontal: 7 }, placedBook: { alignItems: 'center', justifyContent: 'flex-end', flexShrink: 1 }, emptySlot: { minWidth: 94, height: 95, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4E8D080', borderRadius: 10 }, slotText: { fontFamily: fonts.medium, color: '#7E8064', fontSize: 14, marginTop: 4 }, woodLip: { height: 17, backgroundColor: '#B8996E', marginTop: 2, borderBottomLeftRadius: 7, borderBottomRightRadius: 7 }, shelfShadow: { height: 8, backgroundColor: '#A1846420', marginHorizontal: 6, borderBottomLeftRadius: 6, borderBottomRightRadius: 6 }, sectionLabel: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 25, color: LIBRARY_COLORS.ink, marginTop: 25, marginBottom: 8 }, smallNote: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: '#858773', marginTop: 15, textAlign: 'center' }, emptyText: { fontFamily: fonts.medium, fontSize: 17, color: LIBRARY_COLORS.muted, textAlign: 'center', padding: 23 }, selectedInfo: { backgroundColor: '#EEEBDC', borderRadius: 17, padding: 16, gap: 12, marginTop: 10 }, selectedName: { fontFamily: fonts.bold, fontSize: 18, color: LIBRARY_COLORS.ink, textAlign: 'center' },
  toast: { position: 'absolute', zIndex: 100, top: 38, alignSelf: 'center', maxWidth: '90%', backgroundColor: '#FFFDF5', paddingHorizontal: 18, paddingVertical: 13, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 8, ...Platform.select({ web: { boxShadow: '0 4px 18px #3E513321' }, default: { elevation: 10 } }) }, toastText: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 23, color: LIBRARY_COLORS.ink, flexShrink: 1 },
});
