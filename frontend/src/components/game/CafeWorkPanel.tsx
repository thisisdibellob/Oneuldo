import { Ionicons } from '@expo/vector-icons';
import { type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { PressScale } from '../PressScale';
import { fonts } from '../../theme';
import { CAFE_CUP_LABELS, CAFE_INGREDIENT_LABELS, CAFE_RECIPES, type CafeCup, type CafeIngredient, type CafeRecipeId, type CafeSession } from '../../game/cafeSession';
import { cafeArt } from '../../game/cafeArt';
import { useMarketReducedMotion } from './MarketPanelTransition';

export const CAFE_COLORS = { paper: '#FFF9EC', ink: '#514638', muted: '#8A7C67', green: '#708466', sage: '#EBEEDD', caramel: '#BF855A', rose: '#E9C5AA' };
const INK = CAFE_COLORS.ink;
const INGREDIENT_COLORS: Record<CafeIngredient, string> = { ice: '#CDE8E9', milk: '#F8E9C9', espresso: '#7F5137', water: '#AFD3DB', peach: '#ECA777' };
const INGREDIENT_ICONS: Record<CafeIngredient, keyof typeof Ionicons.glyphMap> = { ice: 'snow', milk: 'water', espresso: 'cafe', water: 'water-outline', peach: 'leaf' };

export function CafePanel({ title, subtitle, onClose, children, footer, testID }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; footer?: ReactNode; testID?: string }) {
  const { height } = useWindowDimensions(); const insets = useContext(SafeAreaInsetsContext);
  const available = height - Math.max(20, insets?.top ?? 0) - Math.max(20, insets?.bottom ?? 0);
  return <View style={s.overlay} accessibilityViewIsModal testID={testID}>
    <Pressable accessibilityRole="button" accessibilityLabel="카페 작업 화면 닫기" onPress={onClose} style={StyleSheet.absoluteFill} />
    <View style={[s.panel, { maxHeight: available }]}>
      <View style={s.header}><View style={{ flex: 1 }}><Text accessibilityRole="header" style={s.title}>{title}</Text>{subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}</View><PressScale accessibilityRole="button" accessibilityLabel="닫기" onPress={onClose} style={s.close}><Ionicons name="close" size={25} color={INK} /></PressScale></View>
      <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={s.body} showsVerticalScrollIndicator={false} bounces={false}>{children}</ScrollView>
      {footer ? <View style={s.footer}>{footer}</View> : null}
    </View>
  </View>;
}

export function CafeButton({ children, onPress, secondary = false, disabled = false, icon, label }: { children: string; onPress: () => void; secondary?: boolean; disabled?: boolean; icon?: keyof typeof Ionicons.glyphMap; label?: string }) {
  return <PressScale accessibilityRole="button" accessibilityLabel={label ?? children} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[s.button, secondary && s.secondary, disabled && { opacity: 0.4 }]}>{icon ? <Ionicons name={icon} color={secondary ? INK : '#FFFCEF'} size={21} /> : null}<Text style={[s.buttonText, secondary && { color: INK }]}>{children}</Text></PressScale>;
}

/** The cup stays readable at game scale; layers show the player's actual ingredients. */
export function CafeCupVisual({ cup = 'glass', ingredients = [], size = 180, animate = false }: { cup?: CafeCup | null; ingredients?: readonly CafeIngredient[]; size?: number; animate?: boolean }) {
  const reduced = useMarketReducedMotion(); const pulse = useRef(new Animated.Value(1)).current;
  const pour = useRef(new Animated.Value(0)).current;
  const lastCount = useRef(ingredients.length);
  useEffect(() => {
    if (lastCount.current === ingredients.length) return;
    const added = ingredients.length > lastCount.current; lastCount.current = ingredients.length;
    if (!animate || reduced || !added) return;
    pulse.setValue(0.97); pour.setValue(1);
    const motion = Animated.parallel([
      Animated.spring(pulse, { toValue: 1, damping: 12, stiffness: 240, useNativeDriver: true }),
      Animated.timing(pour, { toValue: 0, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]); motion.start(); return () => motion.stop();
  }, [animate, ingredients.length, reduced, pulse, pour]);
  const liquids = ingredients.filter(value => value !== 'ice');
  const mug = cup === 'mug';
  return <Animated.View accessible accessibilityLabel={`${CAFE_CUP_LABELS[cup ?? 'glass']}${ingredients.length ? `, ${ingredients.map(value => CAFE_INGREDIENT_LABELS[value]).join(', ')}` : ', 빈 컵'}`} style={{ width: size, height: size, transform: [{ scale: pulse }] }}>
    <View pointerEvents="none" style={{ position: 'absolute', width: 200, height: 200, left: (size - 200) / 2, top: (size - 200) / 2, transform: [{ scale: size / 200 }] }}>
      <View style={s.cupShadow} />
      {mug ? <View style={s.cupHandle} /> : null}
      <View style={[s.drawnCup, mug && s.drawnMug]}>
        {liquids.map((ingredient, index) => <View key={`${ingredient}-${index}`} style={{ position: 'absolute', bottom: index * (liquids.length > 2 ? 29 : 40), height: liquids.length > 2 ? 32 : 44, left: 0, right: 0, backgroundColor: INGREDIENT_COLORS[ingredient] }} />)}
        {ingredients.includes('ice') ? <>{[{ x: 12, y: 31, rotate: '-12deg' }, { x: 52, y: 47, rotate: '11deg' }, { x: 29, y: 78, rotate: '2deg' }].map((ice, index) => <View key={index} style={[s.iceCube, { left: ice.x, top: liquids.length ? ice.y : 80 + index * 5, transform: [{ rotate: ice.rotate }] }]} />)}</> : null}
        {liquids.includes('espresso') && liquids.includes('milk') ? <View style={s.milkSwirl} /> : null}
        <View style={s.cupLip} />{!mug ? <View style={s.cupGleam} /> : null}
      </View>
      {mug && ingredients.length > 0 ? <><View style={s.steam} /><View style={[s.steam, { left: 104, top: 14 }]} /></> : null}
    </View>
    {animate && ingredients.length > 0 ? <Animated.View pointerEvents="none" style={[s.pour, { left: size * 0.46, height: size * 0.37, top: size * 0.06, backgroundColor: INGREDIENT_COLORS[ingredients[ingredients.length - 1]], opacity: pour, transform: [{ scaleY: pour }] }]} /> : null}
  </Animated.View>;
}

function IngredientBottle({ ingredient }: { ingredient: CafeIngredient }) {
  return <View pointerEvents="none" style={s.bottleFrame}><View style={s.bottleShadow} /><View style={[s.bottle, { backgroundColor: INGREDIENT_COLORS[ingredient] }]}><View style={s.bottleLabel}><Ionicons name={INGREDIENT_ICONS[ingredient]} size={15} color="#8D775A" /></View><View style={s.bottleShine} /></View><View style={[s.bottleCap, ingredient === 'espresso' && { backgroundColor: '#71604E' }]} /></View>;
}

export function CafeDrinkArt({ recipeId, size = 170 }: { recipeId: CafeRecipeId; size?: number }) {
  const recipe = CAFE_RECIPES[recipeId];
  const source = recipeId === 'hot-americano' ? null : cafeArt.drinks[recipeId];
  return source ? <Image accessible accessibilityLabel={recipe.name} source={source} resizeMode="contain" style={{ width: size * 0.9, height: size }} /> : <CafeCupVisual cup={recipe.cup} ingredients={recipe.ingredients} size={size} />;
}

type CafeWorkGuest = CafeSession['guests'][number];
export function CafeWorkbench({ guest, guestName, error, onChooseCup, onAddIngredient, onFinish, onRemake, onNotebook, onClose }: { guest: CafeWorkGuest; guestName: string; error?: string | null; onChooseCup: (cup: CafeCup) => void; onAddIngredient: (ingredient: CafeIngredient) => void; onFinish: () => void; onRemake: () => void; onNotebook: () => void; onClose: () => void }) {
  const { height } = useWindowDimensions(); const compact = height < 720;
  const recipe = CAFE_RECIPES[guest.recipeId];
  return <CafePanel title="음료 만들기" subtitle={`${guestName} · ${recipe.name}`} onClose={onClose} testID="cafe-workbench" footer={<>{error ? <View accessibilityLiveRegion="polite" style={s.feedback}><Ionicons name="information-circle-outline" color="#A5784E" size={22} /><Text style={s.feedbackText}>{error}</Text></View> : null}<CafeButton onPress={onFinish} disabled={!guest.cup} icon="checkmark">완성하기</CafeButton></>}>
    <View style={s.workbench}>
      <View style={s.benchTopline}><View style={s.orderSlip}><Ionicons name="receipt-outline" color="#A38C68" size={19} /><Text style={s.orderSlipText}>주문 1잔</Text></View><PressScale accessibilityRole="button" accessibilityLabel="만드는 법 보기" onPress={onNotebook} style={s.recipeButton}><Ionicons name="book-outline" color={INK} size={20} /><Text style={s.recipeButtonText}>만드는 법</Text></PressScale></View>
      <CafeCupVisual cup={guest.cup} ingredients={guest.ingredients} size={compact ? 138 : 172} animate />
      <View style={s.benchSurface} />
      {guest.ingredients.length ? <Text style={s.added} accessibilityLiveRegion="polite">{guest.ingredients.map(value => CAFE_INGREDIENT_LABELS[value]).join(' · ')}</Text> : <Text style={s.added}>{guest.cup ? '재료를 눌러 넣어 주세요' : '먼저 컵을 골라 주세요'}</Text>}
    </View>
    {!guest.cup ? <View style={s.cupChoices}>{(['glass', 'mug'] as const).map(cup => <PressScale key={cup} accessibilityRole="button" accessibilityLabel={`${CAFE_CUP_LABELS[cup]} 고르기`} onPress={() => onChooseCup(cup)} style={s.cupChoice}><CafeCupVisual cup={cup} size={81} /><Text style={s.choiceText}>{CAFE_CUP_LABELS[cup]}</Text></PressScale>)}</View> : <>
      <View style={s.ingredientGrid}>{(Object.keys(CAFE_INGREDIENT_LABELS) as CafeIngredient[]).map(ingredient => <PressScale key={ingredient} accessibilityRole="button" accessibilityLabel={`${CAFE_INGREDIENT_LABELS[ingredient]} 넣기`} disabled={guest.ingredients.includes(ingredient)} accessibilityState={{ disabled: guest.ingredients.includes(ingredient) }} onPress={() => onAddIngredient(ingredient)} style={[s.ingredient, guest.ingredients.includes(ingredient) && s.usedIngredient]}><IngredientBottle ingredient={ingredient} /><Text style={s.ingredientName}>{CAFE_INGREDIENT_LABELS[ingredient]}</Text>{guest.ingredients.includes(ingredient) ? <View style={s.check}><Ionicons name="checkmark" size={14} color="#FFFDF3" /></View> : null}</PressScale>)}</View>
      <PressScale accessibilityRole="button" accessibilityLabel="컵 비우고 다시 만들기" onPress={onRemake} style={s.remake}><Ionicons name="refresh" size={19} color={CAFE_COLORS.muted} /><Text style={s.remakeText}>컵 비우고 다시 만들기</Text></PressScale>
    </>}
  </CafePanel>;
}

export function CafeRecipeNotebook({ recipeId, onClose }: { recipeId: CafeRecipeId; onClose: () => void }) {
  const [selected, setSelected] = useState(recipeId); const recipe = CAFE_RECIPES[selected];
  return <CafePanel title="음료 수첩" onClose={onClose} testID="cafe-recipe-notebook">
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.recipeTabs}>{Object.values(CAFE_RECIPES).map(item => <PressScale key={item.id} accessibilityRole="button" accessibilityLabel={`${item.name} 만드는 법`} accessibilityState={{ selected: item.id === selected }} onPress={() => setSelected(item.id)} style={[s.recipeTab, item.id === selected && s.activeRecipeTab]}><Text style={[s.recipeTabText, item.id === selected && { color: '#FFFCEF' }]}>{item.name}</Text></PressScale>)}</ScrollView>
    <View style={s.recipeHero}><CafeDrinkArt recipeId={recipe.id} size={155} /><Text style={s.recipeTitle}>{recipe.name}</Text><Text style={s.recipeCup}>{CAFE_CUP_LABELS[recipe.cup]}</Text></View>
    <View style={s.recipeSteps}>{recipe.ingredients.map((ingredient, index) => <View key={ingredient} style={s.recipeStep}><Text style={s.stepNumber}>{index + 1}</Text><Ionicons name={INGREDIENT_ICONS[ingredient]} color={CAFE_COLORS.caramel} size={23} /><Text style={s.stepText}>{CAFE_INGREDIENT_LABELS[ingredient]} 넣기</Text></View>)}</View>
    <Text style={s.recipeNote}>컵과 재료를 확인하고, 내 속도로 만들어요.</Text>
  </CafePanel>;
}

export function CafeCleaning({ onClean, onClose }: { onClean: () => void; onClose: () => void }) {
  const [cleared, setCleared] = useState<number[]>([]); const reduced = useMarketReducedMotion();
  const cloth = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const spots = [{ x: 48, y: 62 }, { x: 151, y: 36 }, { x: 204, y: 111 }];
  const wipe = (index: number) => {
    if (cleared.includes(index)) return;
    if (!reduced) Animated.sequence([Animated.timing(cloth, { toValue: { x: spots[index].x - 120, y: spots[index].y - 90 }, duration: 180, useNativeDriver: true }), Animated.timing(cloth, { toValue: { x: spots[index].x - 93, y: spots[index].y - 90 }, duration: 140, useNativeDriver: true })]).start();
    setCleared(current => [...current, index]);
  };
  return <CafePanel title="자리 정리" subtitle="컵 자국을 눌러 닦아 주세요" onClose={onClose} testID="cafe-cleaning" footer={<CafeButton onPress={onClean} disabled={cleared.length < 3} icon="sparkles-outline">자리 정리 마치기</CafeButton>}>
    <View style={s.cleanScene}><View style={s.cleanTable}>
      <View pointerEvents="none" style={s.tableGrain} /><View pointerEvents="none" style={[s.tableGrain, { top: 129 }]} />
      {spots.map((spot, index) => !cleared.includes(index) ? <PressScale key={index} accessibilityRole="button" accessibilityLabel={`컵 자국 ${index + 1} 닦기`} onPress={() => wipe(index)} style={[s.dirtySpot, { left: spot.x, top: spot.y }]}><View style={s.cupRing} /><View style={s.crumb} /><View style={[s.crumb, { left: 8, top: 5 }]} /></PressScale> : <View key={index} pointerEvents="none" style={[s.cleanSparkle, { left: spot.x + 10, top: spot.y + 8 }]}><Ionicons name="sparkles" color="#FFF8D2" size={30} /></View>)}
      <Animated.View pointerEvents="none" style={[s.cloth, { transform: [...cloth.getTranslateTransform(), { rotate: '-15deg' }] }]}><View style={s.clothLine} /><View style={[s.clothLine, { top: 17 }]} /></Animated.View>
    </View></View><Text accessibilityLiveRegion="polite" style={s.cleanProgress}>{cleared.length === 3 ? '다음 손님이 앉을 준비가 됐어요.' : `${cleared.length} / 3`}</Text>
  </CafePanel>;
}

export function CafeToast({ message, error = false }: { message: string; error?: boolean }) {
  return <View pointerEvents="none" accessibilityLiveRegion="polite" style={s.toast}><Ionicons name={error ? 'information-circle' : 'checkmark-circle'} color={error ? '#AF805A' : CAFE_COLORS.green} size={22} /><Text style={s.toastText}>{message}</Text></View>;
}

const s = StyleSheet.create({
  cupShadow: { position: 'absolute', left: 39, top: 177, width: 122, height: 15, backgroundColor: '#624C3420', borderRadius: 60 }, drawnCup: { position: 'absolute', left: 46, top: 48, width: 100, height: 129, borderWidth: 4, borderColor: '#76614E', borderTopLeftRadius: 8, borderTopRightRadius: 8, borderBottomLeftRadius: 25, borderBottomRightRadius: 25, backgroundColor: '#E9F0E3', overflow: 'hidden' }, drawnMug: { top: 57, height: 114, backgroundColor: '#F3E3CA', borderBottomLeftRadius: 26, borderBottomRightRadius: 26 }, cupHandle: { position: 'absolute', left: 135, top: 74, width: 42, height: 57, borderWidth: 11, borderColor: '#AF9270', borderTopRightRadius: 24, borderBottomRightRadius: 26 }, cupLip: { position: 'absolute', left: 7, top: 5, right: 7, height: 4, backgroundColor: '#FFFEF6', borderRadius: 3 }, cupGleam: { position: 'absolute', left: 9, top: 21, width: 5, height: 72, backgroundColor: '#FFFFFF77', borderRadius: 5 }, iceCube: { position: 'absolute', width: 23, height: 24, borderRadius: 5, backgroundColor: '#F4FDFAAA', borderWidth: 2, borderColor: '#B1D4D6' }, milkSwirl: { position: 'absolute', top: 62, left: -5, width: 106, height: 20, borderRadius: 50, backgroundColor: '#B08A6077', transform: [{ rotate: '9deg' }] }, steam: { position: 'absolute', left: 79, top: 19, width: 12, height: 22, borderLeftWidth: 3, borderColor: '#BCA987', borderTopLeftRadius: 8, borderBottomLeftRadius: 8, transform: [{ rotate: '15deg' }] },
  bottleFrame: { width: 52, height: 58, alignItems: 'center' }, bottleShadow: { position: 'absolute', bottom: 1, width: 39, height: 5, borderRadius: 20, backgroundColor: '#80644915' }, bottle: { width: 30, height: 43, top: 10, borderWidth: 2, borderColor: '#846D55', borderRadius: 7, borderTopLeftRadius: 10, borderTopRightRadius: 10 }, bottleCap: { position: 'absolute', top: 4, width: 20, height: 10, borderRadius: 3, backgroundColor: '#A0AC8C' }, bottleLabel: { position: 'absolute', left: 0, right: 0, top: 18, height: 17, backgroundColor: '#FFF8E7', alignItems: 'center', justifyContent: 'center' }, bottleShine: { position: 'absolute', top: 7, left: 4, width: 3, height: 8, backgroundColor: '#FFF9EC', borderRadius: 3 },
  overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: '#40352845' }, panel: { width: '100%', maxWidth: 520, backgroundColor: CAFE_COLORS.paper, borderRadius: 28, overflow: 'hidden', ...Platform.select({ web: { boxShadow: '0 18px 65px #3C2C3528' }, default: { elevation: 14 } }) }, header: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingTop: 19, paddingBottom: 14, paddingHorizontal: 20 }, title: { fontFamily: fonts.laundryBold, fontSize: 25, lineHeight: 32, color: INK }, subtitle: { fontFamily: fonts.medium, color: CAFE_COLORS.muted, fontSize: 16, lineHeight: 24, marginTop: 4 }, close: { width: 48, height: 48, backgroundColor: '#EEE8D9', borderRadius: 24, alignItems: 'center', justifyContent: 'center' }, body: { paddingHorizontal: 18, paddingBottom: 18 }, footer: { paddingHorizontal: 18, paddingBottom: 18, paddingTop: 8, gap: 10 }, button: { minHeight: 54, paddingVertical: 13, paddingHorizontal: 17, flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: CAFE_COLORS.green, borderRadius: 17 }, secondary: { backgroundColor: '#ECE8DA' }, buttonText: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 24, color: '#FFFCEF', textAlign: 'center', flexShrink: 1 },
  workbench: { alignItems: 'center', backgroundColor: '#ECE8D8', borderRadius: 18, paddingTop: 7, paddingBottom: 8, overflow: 'hidden', marginBottom: 12 }, benchTopline: { flexDirection: 'row', width: '100%', paddingHorizontal: 10, alignItems: 'center', justifyContent: 'space-between', zIndex: 2 }, orderSlip: { flexDirection: 'row', gap: 5, alignItems: 'center' }, orderSlipText: { fontFamily: fonts.medium, fontSize: 14, color: '#9A8569' }, recipeButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, minHeight: 48, backgroundColor: '#FFF8E6', borderRadius: 14 }, recipeButtonText: { fontFamily: fonts.bold, fontSize: 15, color: INK }, benchSurface: { position: 'absolute', bottom: 35, height: 9, left: 0, right: 0, backgroundColor: '#B79A71', zIndex: -1 }, added: { fontFamily: fonts.medium, color: '#8A775D', fontSize: 14, lineHeight: 21, minHeight: 22, paddingHorizontal: 8, textAlign: 'center' }, pour: { width: 8, borderRadius: 4, position: 'absolute' },
  cupChoices: { flexDirection: 'row', gap: 12 }, cupChoice: { backgroundColor: '#F0EBDD', flex: 1, borderRadius: 17, alignItems: 'center', paddingBottom: 14 }, choiceText: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 23, color: INK }, ingredientGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 }, ingredient: { width: '30.5%', minHeight: 87, alignItems: 'center', backgroundColor: '#F0EADD', paddingTop: 3, paddingBottom: 9, borderRadius: 16 }, usedIngredient: { backgroundColor: '#E6EACF', opacity: 0.7 }, ingredientName: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 21, color: INK }, check: { backgroundColor: '#8B9B72', position: 'absolute', right: 5, top: 5, width: 19, height: 19, borderRadius: 10, justifyContent: 'center', alignItems: 'center' }, remake: { minHeight: 48, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', marginTop: 6 }, remakeText: { fontFamily: fonts.medium, color: CAFE_COLORS.muted, fontSize: 15 }, feedback: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#F3E2C8', borderRadius: 14, padding: 13 }, feedbackText: { flex: 1, fontFamily: fonts.semibold, fontSize: 16, lineHeight: 24, color: '#876747' },
  recipeTabs: { gap: 7, paddingBottom: 8 }, recipeTab: { minHeight: 48, paddingHorizontal: 15, paddingVertical: 12, justifyContent: 'center', borderRadius: 16, backgroundColor: '#ECE8DA' }, activeRecipeTab: { backgroundColor: CAFE_COLORS.green }, recipeTabText: { fontFamily: fonts.bold, fontSize: 15, color: INK }, recipeHero: { alignItems: 'center', paddingBottom: 18 }, recipeTitle: { fontFamily: fonts.laundryBold, fontSize: 23, color: INK }, recipeCup: { fontFamily: fonts.medium, fontSize: 16, color: CAFE_COLORS.muted, marginTop: 7 }, recipeSteps: { gap: 8 }, recipeStep: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 15, backgroundColor: '#F0EBDD', borderRadius: 14 }, stepNumber: { fontFamily: fonts.laundryBold, color: '#A99474', fontSize: 20, width: 21 }, stepText: { fontFamily: fonts.bold, fontSize: 17, color: INK }, recipeNote: { fontFamily: fonts.medium, color: CAFE_COLORS.muted, fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 20 },
  cleanScene: { alignItems: 'center', paddingTop: 10, paddingBottom: 15 }, cleanTable: { width: 280, height: 215, borderRadius: 23, backgroundColor: '#D3B186', borderBottomWidth: 10, borderBottomColor: '#AA815B', overflow: 'hidden' }, tableGrain: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: '#AD855344', top: 62 }, dirtySpot: { position: 'absolute', width: 58, height: 58, alignItems: 'center', justifyContent: 'center' }, cupRing: { width: 41, height: 41, borderRadius: 25, borderWidth: 5, borderColor: '#9D724F80' }, crumb: { position: 'absolute', backgroundColor: '#A47D51', width: 6, height: 5, borderRadius: 2, top: 42, left: 47 }, cleanSparkle: { position: 'absolute' }, cloth: { position: 'absolute', left: 120, top: 90, width: 54, height: 38, backgroundColor: '#B2C6A7', borderRadius: 7, borderBottomWidth: 4, borderBottomColor: '#789571', opacity: 0.9 }, clothLine: { position: 'absolute', left: 5, right: 5, height: 2, backgroundColor: '#ECF1D7', top: 9 }, cleanProgress: { textAlign: 'center', fontFamily: fonts.bold, fontSize: 17, lineHeight: 25, color: CAFE_COLORS.green },
  toast: { position: 'absolute', zIndex: 100, bottom: 135, alignSelf: 'center', width: '89%', maxWidth: 430, flexDirection: 'row', gap: 9, alignItems: 'center', backgroundColor: '#FFFCF1', borderRadius: 17, padding: 15, ...Platform.select({ web: { boxShadow: '0 5px 23px #43352525' }, default: { elevation: 9 } }) }, toastText: { flex: 1, fontFamily: fonts.semibold, fontSize: 16, lineHeight: 23, color: INK },
});
