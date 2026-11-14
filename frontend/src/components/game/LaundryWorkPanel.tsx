import { Ionicons } from '@expo/vector-icons';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { PressScale } from '../PressScale';
import { fonts } from '../../theme';
import { getLaundryItem, LAUNDRY_BATCHES, type LaundryBatchId, type LaundryItemId, type LaundrySession } from '../../game/laundrySession';
import { useMarketReducedMotion } from './MarketPanelTransition';
import { laundryArt } from '../../game/laundryArt';

export const LAUNDRY_COLORS = { ink: '#465652', muted: '#7D8980', paper: '#FAF8EE', blue: '#739C9E', green: '#7F956E', soft: '#E7EEE5' };
const DragScroll = createContext<(dragging: boolean) => void>(() => {});
export function LaundryPanel({ title, subtitle, onClose, children, footer, testID }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; footer?: ReactNode; testID?: string }) {
  const { height } = useWindowDimensions(); const inset = useContext(SafeAreaInsetsContext); const [dragging, setDragging] = useState(false);
  return <View style={s.overlay} accessibilityViewIsModal testID={testID}>
    <Pressable accessibilityRole="button" accessibilityLabel="세탁 작업 화면 닫기" onPress={onClose} style={StyleSheet.absoluteFill} />
    <View style={[s.panel, { maxHeight: height - Math.max(18, inset?.top ?? 0) - Math.max(18, inset?.bottom ?? 0) }]}>
      <View style={s.header}><View style={{ flex: 1 }}><Text accessibilityRole="header" style={s.title}>{title}</Text>{subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}</View><PressScale accessibilityRole="button" accessibilityLabel="닫기" onPress={onClose} style={s.close}><Ionicons name="close" size={24} color={LAUNDRY_COLORS.ink} /></PressScale></View>
      <DragScroll.Provider value={setDragging}><ScrollView scrollEnabled={!dragging} showsVerticalScrollIndicator={false} bounces={false} style={{ flexShrink: 1 }} contentContainerStyle={s.body}>{children}</ScrollView></DragScroll.Provider>
      {footer ? <View style={s.footer}>{footer}</View> : null}
    </View>
  </View>;
}
export function LaundryButton({ children, onPress, secondary = false, disabled = false, icon }: { children: string; onPress: () => void; secondary?: boolean; disabled?: boolean; icon?: keyof typeof Ionicons.glyphMap }) {
  return <PressScale accessibilityRole="button" accessibilityLabel={children} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[s.button, secondary && s.secondary, disabled && { opacity: 0.4 }]}>{icon ? <Ionicons name={icon} size={22} color={secondary ? LAUNDRY_COLORS.ink : '#FFFEF2'} /> : null}<Text style={[s.buttonText, secondary && { color: LAUNDRY_COLORS.ink }]}>{children}</Text></PressScale>;
}
export function LaundryFeedback({ children }: { children: string }) {
  return <View accessibilityLiveRegion="polite" style={s.feedback}><Ionicons name="information-circle-outline" size={22} color="#9B805B" /><Text style={s.feedbackText}>{children}</Text></View>;
}

/** Local cutouts stay legible on the table and in small draggable cards. */
export function LaundryItemArt({ itemId, size = 76, folded = false }: { itemId: LaundryItemId; size?: number; folded?: boolean }) {
  const item = getLaundryItem(itemId); const sock = itemId.startsWith('sock'); const towel = itemId.includes('towel');
  if (!folded) return <Image accessible={false} source={laundryArt.items[itemId]} resizeMode="contain" style={{ width: size, height: size }} />;
  return <View accessible={false} style={{ width: size, height: size }}><View style={{ position: 'absolute', width: 100, height: 100, left: (size - 100) / 2, top: (size - 100) / 2, transform: [{ scale: size / 100 }] }}>
    <View style={s.garmentShadow} />
    {folded || towel ? <View style={[s.foldedTowel, { backgroundColor: item.color }]}><View style={s.towelStripe} /><View style={[s.towelStripe, { bottom: 12 }]} /><View style={s.foldLine} /></View>
      : sock ? <><View style={[s.sockLeg, { backgroundColor: item.color }]} /><View style={[s.sockFoot, { backgroundColor: item.color }]} /><View style={s.sockStripe} /><View style={[s.sockStripe, { top: 28 }]} /><View style={s.sockToe} /></>
        : itemId === 'blue-jeans' ? <><View style={s.pantsWaist} /><View style={[s.pantsLeg, { left: 26, transform: [{ rotate: '3deg' }] }]} /><View style={[s.pantsLeg, { left: 51, transform: [{ rotate: '-3deg' }] }]} /><View style={s.pantsSeam} /><View style={s.pantsPocket} /></>
          : <><View style={[s.shirtSleeve, { left: 8, transform: [{ rotate: '34deg' }], backgroundColor: item.color }]} /><View style={[s.shirtSleeve, { right: 8, transform: [{ rotate: '-34deg' }], backgroundColor: item.color }]} /><View style={[s.shirtBody, { backgroundColor: item.color }]} /><View style={s.shirtNeck} /><View style={s.shirtHem} /></>}
  </View></View>;
}

export function LaundrySorting({ items, selectedId, onSelect, onSort }: { items: LaundrySession['items']; selectedId: LaundryItemId | null; onSelect: (id: LaundryItemId) => void; onSort: (id: LaundryItemId, batch: LaundryBatchId) => void }) {
  const targets = useRef<Partial<Record<LaundryBatchId, View | null>>>({});
  const measureDrop = (id: LaundryItemId, x: number, y: number) => {
    for (const batchId of ['lights', 'colors'] as const) targets.current[batchId]?.measureInWindow((left, top, width, height) => { if (x >= left && x <= left + width && y >= top && y <= top + height) onSort(id, batchId); });
  };
  return <View>
    <View style={s.sortBaskets}>{(['lights', 'colors'] as const).map(batchId => <View key={batchId} ref={node => { targets.current[batchId] = node; }} collapsable={false} style={{ flex: 1 }}><PressScale accessibilityRole="button" accessibilityLabel={`${LAUNDRY_BATCHES[batchId].name} 바구니에 담기`} accessibilityState={{ disabled: !selectedId }} disabled={!selectedId} onPress={() => selectedId && onSort(selectedId, batchId)} style={[s.sortBasket, batchId === 'colors' && { backgroundColor: '#E5DED1' }]}><View style={s.basketHandle} /><Text style={s.basketName}>{LAUNDRY_BATCHES[batchId].name}</Text><View style={s.basketPieces}>{items.filter(item => item.batchId === batchId).map(item => <LaundryItemArt key={item.itemId} itemId={item.itemId} size={34} folded />)}</View><Text style={s.basketCount}>{items.filter(item => item.batchId === batchId).length}개</Text></PressScale></View>)}</View>
    <Text style={s.hint}>옷을 눌러 확인해요. 길게 누르면 옮길 수 있어요.</Text>
    <View style={s.garmentGrid}>{items.map(item => <DraggableLaundry key={item.itemId} itemId={item.itemId} selected={item.itemId === selectedId} checked={item.careChecked && item.pocketChecked && (getLaundryItem(item.itemId).pocketItem !== 'receipt' || item.receiptRemoved)} sorted={!!item.batchId} onSelect={() => onSelect(item.itemId)} onDrop={(x, y) => measureDrop(item.itemId, x, y)} />)}</View>
  </View>;
}
function DraggableLaundry({ itemId, selected, checked, sorted, onSelect, onDrop }: { itemId: LaundryItemId; selected: boolean; checked: boolean; sorted: boolean; onSelect: () => void; onDrop: (x: number, y: number) => void }) {
  const lockScroll = useContext(DragScroll); const offset = useRef(new Animated.ValueXY()).current;
  const ref = useRef<View>(null); const hold = useRef<ReturnType<typeof setTimeout> | null>(null); const armed = useRef(false); const moved = useRef(false); const skipped = useRef(false); const [dragging, setDragging] = useState(false);
  const callbacks = useRef({ onSelect, onDrop, lockScroll }); callbacks.current = { onSelect, onDrop, lockScroll };
  const cleanup = () => { if (hold.current) clearTimeout(hold.current); hold.current = null; };
  const release = () => { cleanup(); armed.current = false; moved.current = false; setDragging(false); callbacks.current.lockScroll(false); Animated.spring(offset, { toValue: { x: 0, y: 0 }, damping: 22, stiffness: 280, useNativeDriver: true }).start(); };
  useEffect(() => () => { cleanup(); callbacks.current.lockScroll(false); }, []);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = ref.current as unknown as HTMLElement | null;
    const prevent = (event: TouchEvent) => { if (armed.current && event.cancelable) event.preventDefault(); };
    node?.addEventListener?.('touchmove', prevent, { passive: false }); return () => node?.removeEventListener?.('touchmove', prevent);
  }, []);
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => armed.current,
    onPanResponderGrant: () => { cleanup(); skipped.current = false; moved.current = false; armed.current = false; hold.current = setTimeout(() => { armed.current = true; setDragging(true); callbacks.current.lockScroll(true); }, 180); },
    onPanResponderMove: (_, gesture) => { if (armed.current) { moved.current = true; offset.setValue({ x: gesture.dx, y: gesture.dy }); } else if (Math.hypot(gesture.dx, gesture.dy) > 12) { skipped.current = true; cleanup(); } },
    onPanResponderRelease: (_, gesture) => { if (armed.current && moved.current) callbacks.current.onDrop(gesture.moveX, gesture.moveY); else if (!skipped.current) callbacks.current.onSelect(); release(); },
    onPanResponderTerminate: release,
    onPanResponderTerminationRequest: () => !armed.current,
  }), [offset]);
  const keyProps = Platform.OS === 'web' ? { onKeyUp: (event: { nativeEvent: { key: string } }) => { if (['Enter', ' '].includes(event.nativeEvent.key)) onSelect(); } } : {};
  return <Animated.View ref={ref} accessible focusable accessibilityRole="button" accessibilityLabel={`${getLaundryItem(itemId).name} 확인`} accessibilityHint="누르면 확인하고, 길게 누르면 바구니로 옮길 수 있어요" accessibilityState={{ selected }} onAccessibilityTap={onSelect} {...keyProps} {...responder.panHandlers} style={[s.garmentCard, selected && s.selectedGarment, { zIndex: dragging ? 99 : 1, transform: [...offset.getTranslateTransform(), { scale: dragging ? 1.06 : 1 }] }, Platform.OS === 'web' && ({ touchAction: 'auto', userSelect: 'none', cursor: dragging ? 'grabbing' : 'grab' } as never)]}><LaundryItemArt itemId={itemId} size={65} /><Text style={s.garmentName}>{getLaundryItem(itemId).name}</Text>{checked ? <Ionicons name="checkmark-circle" color={LAUNDRY_COLORS.green} size={19} style={s.checkedIcon} /> : null}{sorted ? <Text style={s.sortedLabel}>분류함</Text> : null}</Animated.View>;
}

export function LaundryTimerCard({ title, remaining, total = 6000, onDone, doneLabel }: { title: string; remaining: number; total?: number; onDone: () => void; doneLabel: string }) {
  const running = remaining > 0;
  return <View style={s.timerCard}><View style={s.timerTop}><Ionicons name={running ? 'sync' : 'checkmark-circle'} color={LAUNDRY_COLORS.blue} size={28} /><Text style={s.timerTitle}>{title}</Text><Text accessibilityLiveRegion="polite" style={s.timerTime}>{running ? `${Math.ceil(remaining / 1000)}초` : '완료'}</Text></View><View style={s.timerTrack}><View style={[s.timerFill, { width: `${Math.min(100, Math.max(0, 100 * (1 - remaining / total)))}%` }]} /></View><LaundryButton onPress={onDone} disabled={running}>{doneLabel}</LaundryButton></View>;
}

export function LaundryFolding({ itemId, onFold, onClose }: { itemId: LaundryItemId; onFold: () => void; onClose: () => void }) {
  const [step, setStep] = useState(0); const reduced = useMarketReducedMotion(); const foldX = useRef(new Animated.Value(1)).current; const foldY = useRef(new Animated.Value(1)).current;
  const fold = () => {
    const next = Math.min(2, step + 1); setStep(next); const value = next === 1 ? foldX : foldY;
    if (reduced) value.setValue(0.55); else Animated.spring(value, { toValue: 0.55, damping: 17, stiffness: 200, useNativeDriver: true }).start();
  };
  return <LaundryPanel title={getLaundryItem(itemId).name} subtitle="반듯하게 접어 바구니에 담아요" onClose={onClose} testID="laundry-folding" footer={<LaundryButton onPress={step === 2 ? onFold : fold} icon={step === 2 ? 'basket-outline' : 'arrow-forward-outline'}>{step === 0 ? '옆으로 접기' : step === 1 ? '반으로 접기' : '접은 옷 담기'}</LaundryButton>}><View style={s.foldTable}><View style={s.foldGuide} /><Animated.View style={{ transform: [{ scaleX: foldX }, { scaleY: foldY }] }}><LaundryItemArt itemId={itemId} size={230} /></Animated.View>{step === 2 ? <View style={s.foldSparkle}><Ionicons name="sparkles" color="#A8B67D" size={33} /></View> : null}</View><Text accessibilityLiveRegion="polite" style={s.foldProgress}>{step === 2 ? '반듯하게 접었어요.' : `${step} / 2`}</Text></LaundryPanel>;
}

export function LaundrySockPair({ onPair, onClose }: { onPair: () => void; onClose: () => void }) {
  const [picked, setPicked] = useState<LaundryItemId[]>([]); const paired = picked.length === 2;
  return <LaundryPanel title="양말 짝 맞추기" subtitle="같은 양말 두 장을 함께 골라요" onClose={onClose} testID="laundry-sock-pair" footer={<LaundryButton disabled={!paired} onPress={onPair} icon="basket-outline">짝 맞춰 담기</LaundryButton>}><View style={s.sockPairArea}>{(['sock-left', 'sock-right'] as const).map(id => <PressScale key={id} accessibilityRole="button" accessibilityLabel={`${getLaundryItem(id).name} 짝 고르기`} accessibilityState={{ selected: picked.includes(id) }} onPress={() => setPicked(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])} style={[s.sockOption, picked.includes(id) && s.pickedSock]}><LaundryItemArt itemId={id} size={100} />{picked.includes(id) ? <Ionicons name="checkmark-circle" color={LAUNDRY_COLORS.green} size={25} /> : <View style={{ height: 25 }} />}</PressScale>)}</View><Text accessibilityLiveRegion="polite" style={s.foldProgress}>{paired ? '두 장이 한 켤레가 됐어요.' : `${picked.length} / 2`}</Text></LaundryPanel>;
}

const s = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: '#35473E42', alignItems: 'center', justifyContent: 'center', padding: 15 }, panel: { width: '100%', maxWidth: 540, backgroundColor: LAUNDRY_COLORS.paper, borderRadius: 28, overflow: 'hidden', ...Platform.select({ web: { boxShadow: '0 18px 70px #34473D26' }, default: { elevation: 14 } }) }, header: { flexDirection: 'row', paddingHorizontal: 20, paddingTop: 19, paddingBottom: 14, gap: 9, alignItems: 'center' }, title: { fontFamily: fonts.laundryBold, fontSize: 25, lineHeight: 32, color: LAUNDRY_COLORS.ink }, subtitle: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 23, color: LAUNDRY_COLORS.muted, marginTop: 5 }, close: { width: 46, height: 46, borderRadius: 24, backgroundColor: '#EAEDE1', alignItems: 'center', justifyContent: 'center' }, body: { paddingHorizontal: 17, paddingBottom: 17 }, footer: { paddingHorizontal: 17, paddingBottom: 17, paddingTop: 7, gap: 10 }, button: { minHeight: 53, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 17, backgroundColor: LAUNDRY_COLORS.blue, paddingHorizontal: 15, paddingVertical: 12 }, secondary: { backgroundColor: '#E7ECDF' }, buttonText: { color: '#FFFEF2', fontFamily: fonts.bold, fontSize: 17, lineHeight: 25, textAlign: 'center', flexShrink: 1 }, feedback: { padding: 13, backgroundColor: '#F0E7D2', borderRadius: 14, flexDirection: 'row', gap: 9, alignItems: 'flex-start' }, feedbackText: { flex: 1, color: '#8A7354', fontFamily: fonts.semibold, fontSize: 16, lineHeight: 24 },
  garmentShadow: { position: 'absolute', left: 20, top: 85, width: 61, height: 8, borderRadius: 30, backgroundColor: '#596B4E17' }, shirtBody: { position: 'absolute', left: 27, top: 22, width: 46, height: 63, borderRadius: 7, borderWidth: 2.4, borderColor: '#A8997E' }, shirtSleeve: { position: 'absolute', top: 22, width: 25, height: 32, borderRadius: 6, borderWidth: 2.4, borderColor: '#A8997E' }, shirtNeck: { position: 'absolute', top: 20, left: 40, width: 21, height: 14, borderBottomWidth: 3, borderColor: '#C7B79A', borderBottomLeftRadius: 12, borderBottomRightRadius: 12, backgroundColor: '#E4D9BB' }, shirtHem: { position: 'absolute', bottom: 21, left: 32, width: 36, height: 2, backgroundColor: '#CEBFA1' }, pantsWaist: { position: 'absolute', top: 15, left: 27, width: 47, height: 21, backgroundColor: '#8AAFC1', borderWidth: 2, borderColor: '#637E8D', borderRadius: 5 }, pantsLeg: { position: 'absolute', top: 31, width: 23, height: 54, borderWidth: 2, borderColor: '#637E8D', borderRadius: 4, backgroundColor: '#8AAFC1' }, pantsSeam: { position: 'absolute', left: 49, top: 19, width: 2, height: 21, backgroundColor: '#637E8D' }, pantsPocket: { position: 'absolute', left: 31, top: 18, width: 10, height: 12, borderBottomWidth: 2, borderRightWidth: 2, borderColor: '#D2D9CA', borderBottomRightRadius: 6 }, foldedTowel: { position: 'absolute', left: 19, top: 28, width: 64, height: 52, borderRadius: 8, borderWidth: 2.2, borderColor: '#8F8A75', borderBottomWidth: 5 }, towelStripe: { position: 'absolute', bottom: 7, left: 4, right: 4, height: 3, backgroundColor: '#FFF6DD80' }, foldLine: { position: 'absolute', top: 6, left: 6, right: 6, height: 2, backgroundColor: '#FFF9E77A' }, sockLeg: { position: 'absolute', top: 15, left: 36, width: 28, height: 51, borderWidth: 2.2, borderColor: '#A1967C', borderRadius: 5 }, sockFoot: { position: 'absolute', left: 34, top: 58, width: 47, height: 24, borderRadius: 14, borderWidth: 2.2, borderColor: '#A1967C' }, sockStripe: { position: 'absolute', left: 39, top: 22, width: 22, height: 3, backgroundColor: '#91A6A4' }, sockToe: { position: 'absolute', right: 21, top: 61, width: 11, height: 18, backgroundColor: '#A3BAB3', borderTopRightRadius: 9, borderBottomRightRadius: 9 },
  sortBaskets: { flexDirection: 'row', gap: 11, marginTop: 8 }, sortBasket: { minHeight: 133, borderRadius: 17, backgroundColor: '#DEE8DB', alignItems: 'center', paddingTop: 20, paddingBottom: 8, borderBottomWidth: 6, borderBottomColor: '#A7B89E' }, basketHandle: { position: 'absolute', top: 6, width: 57, height: 9, borderRadius: 5, backgroundColor: '#F8F9EE' }, basketName: { fontFamily: fonts.bold, fontSize: 17, color: LAUNDRY_COLORS.ink }, basketPieces: { height: 45, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', flexWrap: 'wrap' }, basketCount: { fontFamily: fonts.bold, fontSize: 17, color: '#77896B' }, hint: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 22, color: LAUNDRY_COLORS.muted, textAlign: 'center', marginVertical: 13 }, garmentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, overflow: 'visible' }, garmentCard: { width: '31.6%', minHeight: 103, borderRadius: 16, backgroundColor: '#EDECE1', paddingTop: 6, paddingBottom: 8, paddingHorizontal: 3, alignItems: 'center' }, selectedGarment: { backgroundColor: '#D8E6DD' }, garmentName: { textAlign: 'center', color: LAUNDRY_COLORS.ink, fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 }, checkedIcon: { position: 'absolute', right: 3, top: 3 }, sortedLabel: { fontFamily: fonts.medium, color: '#7E8F77', fontSize: 12, marginTop: 3 },
  timerCard: { padding: 16, borderRadius: 18, backgroundColor: '#E8EDE3', gap: 16, marginVertical: 8 }, timerTop: { flexDirection: 'row', alignItems: 'center', gap: 10 }, timerTitle: { flex: 1, fontFamily: fonts.bold, fontSize: 18, color: LAUNDRY_COLORS.ink }, timerTime: { fontFamily: fonts.laundryBold, fontSize: 22, color: LAUNDRY_COLORS.blue }, timerTrack: { height: 7, backgroundColor: '#D3DECD', borderRadius: 4, overflow: 'hidden' }, timerFill: { height: 7, borderRadius: 4, backgroundColor: '#8AAE9C' }, foldTable: { minHeight: 265, borderRadius: 21, backgroundColor: '#E8D6B9', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, foldGuide: { position: 'absolute', top: 16, bottom: 16, width: 2, backgroundColor: '#C0A78250' }, foldSparkle: { position: 'absolute', top: 64, right: 60 }, foldProgress: { textAlign: 'center', marginTop: 18, fontFamily: fonts.bold, fontSize: 17, lineHeight: 25, color: LAUNDRY_COLORS.green }, sockPairArea: { paddingVertical: 25, flexDirection: 'row', gap: 16, justifyContent: 'center' }, sockOption: { minWidth: 117, alignItems: 'center', padding: 7, borderRadius: 20, backgroundColor: '#EEEBDD' }, pickedSock: { backgroundColor: '#DBE7D6' },
});
