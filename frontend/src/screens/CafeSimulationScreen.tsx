import { Ionicons } from '@expo/vector-icons';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, Image, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { PressScale } from '../components/PressScale';
import { GameHud } from '../components/game/GameHud';
import { CafeRoom } from '../components/game/CafeRoom';
import { CafeButton, CafeCleaning, CafeDrinkArt, CafePanel, CafeRecipeNotebook, CafeToast, CafeWorkbench, CAFE_COLORS as C } from '../components/game/CafeWorkPanel';
import { MarketPanelTransition, useMarketReducedMotion } from '../components/game/MarketPanelTransition';
import { MarketStaffDialogue, MarketStaffDialogueChoice } from '../components/game/MarketStaffDialogue';
import { applyCafeAction, canReportCafeShift, CAFE_RECIPES, createCafeSession, getCafeGuest, getCafeObjective, getCafeResult, getCurrentCafeGuest, type CafeAction, type CafeSession } from '../game/cafeSession';
import type { CafeStation } from '../game/cafeWorld';
import { villageNpcArt } from '../game/villageNpcArt';
import { fonts } from '../theme';

type Panel = null | 'coworker' | 'customer' | 'work' | 'tray' | 'clean' | 'orders' | 'recipe' | 'exit' | 'report' | 'next';
export type CafeSimulationScreenProps = {
  onExit: () => void;
  onTravel?: (destination: 'village' | 'library') => void;
  controlMode?: 'joystick' | 'touch';
  onControlModeChange?: (mode: 'joystick' | 'touch') => void;
  initialSession?: CafeSession;
  onSessionChange?: (session: CafeSession) => void;
  onShiftComplete?: (session: CafeSession) => void;
};

export function CafeSimulationScreen({ onExit, onTravel, controlMode: externalMode, onControlModeChange, initialSession, onSessionChange, onShiftComplete }: CafeSimulationScreenProps) {
  const [session, setSession] = useState(() => initialSession ?? createCafeSession());
  const sessionRef = useRef(session); sessionRef.current = session;
  const [panel, setPanel] = useState<Panel>(null);
  const [present, setPresent] = useState(false); const [externalMenu, setExternalMenu] = useState(false);
  const [mode, setMode] = useState<'joystick' | 'touch'>('joystick');
  const [reply, setReply] = useState(''); const [roomVisit, setRoomVisit] = useState(0);
  const [leavingGuestId, setLeavingGuestId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);
  const [navigationRequest, setNavigationRequest] = useState<{ id: number; station: CafeStation }>();
  const recipeReturn = useRef<Panel>('work'); const reported = useRef<string | null>(null);
  const reducedMotion = useMarketReducedMotion(); const insets = useContext(SafeAreaInsetsContext);
  const { width } = useWindowDimensions(); const entrance = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  const controlMode = externalMode ?? mode;
  const guest = getCurrentCafeGuest(session); const profile = guest ? getCafeGuest(guest.guestId) : null;
  const recipe = guest ? CAFE_RECIPES[guest.recipeId] : null;
  const result = getCafeResult(session); const canReport = canReportCafeShift(session);
  const visible = panel !== null || session.phase === 'finished'; const locked = visible || present || externalMenu;
  const objective = getCafeObjective(session);
  const served = session.guests.filter(item => item.stage === 'served' || item.stage === 'cleaned').length;
  const target: CafeStation = session.phase === 'briefing' || canReport ? 'coworker'
    : guest?.stage === 'waiting' || guest?.stage === 'order-change' || guest?.stage === 'carrying' ? 'customer'
      : guest?.stage === 'served' || guest?.stage === 'cleaned' ? 'table' : 'brew';
  const notify = useCallback((message: string, error = false) => setToast({ message, error }), []);
  const dispatch = useCallback((action: CafeAction) => {
    const next = applyCafeAction(sessionRef.current, action);
    sessionRef.current = next; setSession(next);
    return next;
  }, []);
  const close = useCallback(() => { setPanel(null); setReply(''); }, []);
  useEffect(() => { onSessionChange?.(session); }, [session, onSessionChange]);
  useEffect(() => {
    // Keep the thank-you visible during dialogue, then let the guest leave
    // before the player clears their place. A resumed served order also leaves.
    if (guest?.stage === 'served' && panel !== 'customer') setLeavingGuestId(guest.guestId);
  }, [guest?.guestId, guest?.stage, panel]);
  useEffect(() => {
    if (session.phase !== 'finished' || reported.current === session.id) return;
    reported.current = session.id; onShiftComplete?.(session);
  }, [session, onShiftComplete]);
  useEffect(() => { if (visible) setExternalMenu(false); }, [visible]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 3000); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    if (reducedMotion) { entrance.setValue(1); return; }
    const animation = Animated.timing(entrance, { toValue: 1, duration: 360, useNativeDriver: true }); animation.start(); return () => animation.stop();
  }, [entrance, reducedMotion]);
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (externalMenu) return false;
      if (session.phase === 'finished') onExit(); else if (panel) close(); else setPanel('exit');
      return true;
    }); return () => listener.remove();
  }, [close, externalMenu, onExit, panel, session.phase]);
  const switchMode = (value: 'joystick' | 'touch') => { setMode(value); onControlModeChange?.(value); };
  const openRecipe = (from: Panel) => { recipeReturn.current = from; setPanel('recipe'); };
  const open = useCallback((station: CafeStation) => {
    const current = sessionRef.current; const active = getCurrentCafeGuest(current);
    setReply(''); dispatch({ type: 'CLEAR_ERROR' });
    if (station === 'exit') { setPanel('exit'); return; }
    if (station === 'coworker') { setPanel('coworker'); return; }
    if (current.phase === 'briefing') { notify('동료에게 먼저 업무를 받아 주세요.'); return; }
    if (station === 'customer') {
      if (active?.stage === 'cleaned') { setPanel('next'); return; }
      setPanel('customer'); return;
    }
    if (station === 'table') {
      if (active?.stage === 'served') setPanel('clean');
      else if (active?.stage === 'cleaned') setPanel('next');
      else notify('음료를 건넨 뒤 자리를 정리해요.');
      return;
    }
    if (active?.stage === 'preparing') setPanel('work');
    else if (active?.stage === 'ready' || active?.stage === 'carrying') setPanel('tray');
    else notify(active?.stage === 'order-change' ? '손님이 바꾼 주문을 먼저 확인해 주세요.' : '손님에게 먼저 주문을 받아 주세요.');
  }, [dispatch, notify]);
  const reset = () => {
    const fresh = createCafeSession(); dispatch({ type: 'RESET', id: fresh.id, now: fresh.startedAt }); setLeavingGuestId(null); setNavigationRequest(undefined); setRoomVisit(value => value + 1); close();
  };
  const finishDrink = () => {
    const next = dispatch({ type: 'FINISH_DRINK' }); if (!next.lastActionError) setPanel('tray');
  };
  const cleanTable = () => {
    const next = dispatch({ type: 'CLEAN_TABLE' });
    if (!next.lastActionError) { setPanel('next'); notify('자리 정리 완료!'); }
  };
  const nextGuest = () => { const next = dispatch({ type: 'NEXT_GUEST' }); if (!next.lastActionError) { close(); notify(`${getCafeGuest(getCurrentCafeGuest(next)!.guestId).name}이 왔어요.`); } };
  const currentGuestMessage = !guest || !profile ? '' : guest.stage === 'order-change' ? profile.changeLine ?? ''
    : guest.stage === 'served' || guest.stage === 'cleaned' ? profile.thanksLine
      : guest.stage === 'carrying' ? '제 음료가 나왔나요?'
        : guest.stage === 'waiting' ? profile.orderLine : `${recipe!.name} 한 잔 부탁해.`;

  return <Animated.View testID="cafe-simulation" style={[s.root, { opacity: entrance }]}>
    <CafeRoom key={roomVisit} locked={locked} controlMode={controlMode} onInteract={open} reduceMotion={reducedMotion} target={session.phase === 'finished' ? null : target} navigationRequest={navigationRequest} guestId={guest?.guestId} guestPresent={session.phase === 'working' && guest?.stage !== 'cleaned'} guestPhase={guest?.stage === 'served' ? leavingGuestId === guest.guestId ? 'leaving' : 'served' : 'waiting'} carrying={guest?.stage === 'carrying'} tableDirty={guest?.stage === 'served'} />
    {!visible && !present ? <>
      <GameHud onTravel={onTravel} controlMode={controlMode} onControlModeChange={switchMode} dailyQuests={[]} onExit={() => setPanel('exit')} onMenuVisibilityChange={setExternalMenu} onOpenNotebook={() => setPanel('orders')} onOpenInventory={() => setPanel('tray')} onEmergencyExit={() => { setRoomVisit(value => value + 1); setNavigationRequest(undefined); notify('카페 입구로 이동했어요.'); }} />
      {!externalMenu ? <View pointerEvents="box-none" style={[s.taskAnchor, { top: width >= 1000 ? Math.max(26, (insets?.top ?? 0) + 12) : Math.max(106, (insets?.top ?? 0) + 62) }]}><PressScale accessibilityRole="button" accessibilityLabel={controlMode === 'touch' ? `${objective} 장소로 이동` : '카페 주문표 열기'} onPress={() => controlMode === 'touch' ? setNavigationRequest({ id: Date.now(), station: target }) : setPanel('orders')} style={s.taskCard}>
        <View style={s.taskIcon}><Ionicons name={canReport ? 'checkmark' : 'cafe'} size={23} color={C.green} /></View><View style={{ flex: 1, gap: 4 }}><Text style={s.taskTitle}>오늘의 카페</Text><Text style={s.taskText}>{objective}</Text>{session.phase === 'working' ? <View style={s.progress}><View style={[s.progressFill, { width: `${served / session.guests.length * 100}%` }]} /></View> : null}</View>{session.phase === 'working' ? <Text style={s.taskCount}>{served}<Text style={s.taskCountTotal}> / 3</Text></Text> : null}
      </PressScale></View> : null}
    </> : null}

    <MarketPanelTransition visible={visible} transitionKey={session.phase === 'finished' ? 'cafe-result' : `${panel}`} onPresenceChange={setPresent}>
      {panel === 'coworker' && session.phase !== 'finished' ? <MarketStaffDialogue name="카페 동료" message={session.phase === 'briefing' ? '오늘은 음료 만들기를 맡아 주세요.\n주문을 받고, 음료를 건넨 뒤\n손님 자리를 정리하면 돼요.' : '어디까지 했나요?'} response={reply}>
        {reply ? <MarketStaffDialogueChoice text="네, 해 볼게요" onPress={close} /> : session.phase === 'briefing' ? <>
          <MarketStaffDialogueChoice text="시작할게요" onPress={() => { dispatch({ type: 'START' }); close(); notify('민수가 주문을 기다려요.'); }} />
          <MarketStaffDialogueChoice text="만드는 법 먼저 보기" onPress={() => openRecipe('coworker')} />
          <MarketStaffDialogueChoice text="잠시 후에 올게요" onPress={close} />
        </> : <>
          <MarketStaffDialogueChoice text="근무를 마쳤어요" onPress={() => canReport ? setPanel('report') : setReply(`아직 할 일이 있어요.\n주문표에서 남은 일을 확인해 주세요.`)} />
          <MarketStaffDialogueChoice text="음료 만드는 걸 도와주세요" onPress={() => { dispatch({ type: 'ASK_HELP' }); openRecipe('coworker'); }} />
          <MarketStaffDialogueChoice text="계속할게요" onPress={close} />
        </>}
      </MarketStaffDialogue> : null}

      {panel === 'customer' && guest && profile && session.phase === 'working' ? <MarketStaffDialogue name={profile.name} message={currentGuestMessage} response={reply}>
        {reply ? <MarketStaffDialogueChoice text="네, 알겠어요" onPress={close} /> : guest.stage === 'waiting' ? <>
          <MarketStaffDialogueChoice text={`${recipe!.name} 한 잔이요`} onPress={() => { const next = dispatch({ type: 'TAKE_ORDER' }); if (!next.lastActionError && getCurrentCafeGuest(next)?.stage !== 'order-change') { close(); notify('주문을 적었어요. 음료 작업대로 가요.'); } }} />
          <MarketStaffDialogueChoice text="잠시만 기다려 주세요" onPress={close} />
        </> : guest.stage === 'order-change' ? <>
          <MarketStaffDialogueChoice text="네, 차가운 음료로 바꿔 드릴게요" onPress={() => { dispatch({ type: 'ACKNOWLEDGE_CHANGE' }); close(); notify('주문표를 아이스 아메리카노로 바꿨어요.'); }} />
          <MarketStaffDialogueChoice text="주문을 다시 말해 줄래요?" onPress={() => { dispatch({ type: 'ASK_AGAIN' }); setReply('차가운 아메리카노 한 잔으로 부탁해.'); }} />
        </> : guest.stage === 'carrying' ? <>
          <MarketStaffDialogueChoice text={`${recipe!.name} 나왔어요`} onPress={() => { const next = dispatch({ type: 'SERVE', guestId: guest.guestId }); if (next.lastActionError) notify(next.lastActionError, true); }} />
          <MarketStaffDialogueChoice text="주문을 다시 확인할게요" onPress={() => { dispatch({ type: 'ASK_AGAIN' }); setReply(`${recipe!.name} 한 잔 주문했어요.`); }} />
        </> : guest.stage === 'served' ? <MarketStaffDialogueChoice text="맛있게 드세요" onPress={() => { close(); notify('손님이 사용한 테이블을 정리해요.'); }} /> : <>
          <MarketStaffDialogueChoice text="주문을 다시 말해 줄래요?" onPress={() => { dispatch({ type: 'ASK_AGAIN' }); setReply(`${recipe!.name} 한 잔이요. 천천히 만들어 주세요.`); }} />
          <MarketStaffDialogueChoice text="곧 가져다드릴게요" onPress={close} />
        </>}
      </MarketStaffDialogue> : null}

      {panel === 'work' && guest && profile && guest.stage === 'preparing' ? <CafeWorkbench guest={guest} guestName={profile.name} error={session.lastActionError} onChooseCup={cup => dispatch({ type: 'CHOOSE_CUP', cup })} onAddIngredient={ingredient => dispatch({ type: 'ADD_INGREDIENT', ingredient })} onFinish={finishDrink} onRemake={() => dispatch({ type: 'REMAKE' })} onNotebook={() => openRecipe('work')} onClose={close} /> : null}
      {panel === 'recipe' && guest ? <CafeRecipeNotebook recipeId={guest.recipeId} onClose={() => setPanel(recipeReturn.current)} /> : null}

      {panel === 'tray' && session.phase !== 'finished' ? <CafePanel title="나의 쟁반" onClose={close} testID="cafe-tray" footer={guest?.stage === 'ready' ? <CafeButton icon="hand-left-outline" onPress={() => { dispatch({ type: 'PICK_UP_TRAY' }); close(); notify(`${profile!.name}에게 음료를 가져다주세요.`); }}>쟁반 들기</CafeButton> : guest?.stage === 'carrying' ? <CafeButton onPress={close} icon="footsteps-outline">손님에게 가져가기</CafeButton> : undefined}>
        {guest && recipe && ['ready', 'carrying'].includes(guest.stage) ? <><View style={s.trayScene}><View style={s.trayWood} /><CafeDrinkArt recipeId={recipe.id} size={200} /></View><Text style={s.drinkTitle}>{recipe.name}</Text><Text style={s.drinkFor}>{profile!.name}의 주문</Text></> : <View style={s.empty}><Ionicons name="cafe-outline" size={54} color="#B7A88C" /><Text style={s.emptyText}>쟁반이 비어 있어요.</Text><Text style={s.note}>{guest?.stage === 'preparing' ? '작업대에서 음료를 완성해요.' : objective}</Text></View>}
      </CafePanel> : null}

      {panel === 'clean' && guest?.stage === 'served' ? <CafeCleaning onClose={close} onClean={cleanTable} /> : null}
      {panel === 'next' && guest?.stage === 'cleaned' && session.phase === 'working' ? <CafePanel title="자리 정리 완료" onClose={close} footer={<CafeButton icon={canReport ? 'chatbubble-outline' : 'people-outline'} onPress={canReport ? () => { close(); notify('동료에게 근무를 마쳤다고 알려 주세요.'); } : nextGuest}>{canReport ? '동료에게 알려주기' : '다음 손님 맞이하기'}</CafeButton>}><View style={s.doneSeat}><Ionicons name="sparkles" color="#B4975B" size={43} /><Text style={s.drinkTitle}>{canReport ? '세 손님의 주문을 마쳤어요.' : '테이블이 깨끗해졌어요.'}</Text><Text style={s.note}>{canReport ? '마지막으로 근무 내용을 함께 확인해요.' : '다음 손님이 편히 앉을 수 있어요.'}</Text></View></CafePanel> : null}

      {panel === 'orders' && session.phase !== 'finished' ? <CafePanel title="카페 주문표" subtitle={objective} onClose={close} testID="cafe-order-pad" footer={<CafeButton secondary icon="book-outline" onPress={() => openRecipe('orders')}>음료 수첩 보기</CafeButton>}>
        {session.guests.map((item, index) => {
          const person = getCafeGuest(item.guestId); const accepted = item.orderConfirmed; const finished = item.stage === 'cleaned';
          return <View key={item.guestId} style={[s.orderRow, index === session.guestIndex && session.phase === 'working' && s.currentOrder]}><Image source={villageNpcArt[item.guestId]} resizeMode="contain" style={s.guestImage} /><View style={{ flex: 1, gap: 5 }}><Text style={s.personName}>{person.name}</Text><Text style={s.orderName}>{accepted ? CAFE_RECIPES[item.recipeId].name : item.stage === 'order-change' ? '주문 변경 확인 중' : '주문 대기'}</Text></View>{finished ? <Ionicons name="checkmark-circle" color={C.green} size={25} /> : <Text style={s.orderNumber}>{String(index + 1).padStart(2, '0')}</Text>}</View>;
        })}
      </CafePanel> : null}

      {panel === 'report' && session.phase !== 'finished' ? <CafePanel title="근무 완료 보고" onClose={() => setPanel('coworker')} testID="cafe-report" footer={<CafeButton icon="checkmark" onPress={() => { const next = dispatch({ type: 'REPORT', now: Date.now() }); if (next.lastActionError) notify(next.lastActionError, true); }}>음료와 자리 정리를 마쳤어요</CafeButton>}>
        <View style={s.reportCount}><Ionicons name="cafe" color={C.caramel} size={42} /><Text style={s.reportNumber}>{served}<Text style={s.reportUnit}>잔</Text></Text></View><View style={s.reportRows}>{session.guests.map(item => <View key={item.guestId} style={s.reportRow}><Ionicons name={item.stage === 'cleaned' ? 'checkmark-circle' : 'ellipse-outline'} color={C.green} size={24} /><Text style={s.reportText}>{getCafeGuest(item.guestId).name} · {CAFE_RECIPES[item.recipeId].name}</Text></View>)}</View><Text style={s.reportFoot}>테이블 {session.guests.filter(item => item.stage === 'cleaned').length}곳 정리 완료</Text>
      </CafePanel> : null}

      {panel === 'exit' && session.phase !== 'finished' ? <CafePanel title="카페 밖으로 나갈까요?" onClose={close} footer={<><CafeButton onPress={onExit}>마을로 나가기</CafeButton><CafeButton secondary onPress={close}>계속 일하기</CafeButton></>}><Text style={s.exitText}>다시 들어오면 하던 주문부터 이어서 할 수 있어요.</Text></CafePanel> : null}

      {session.phase === 'finished' && result ? <CafePanel title="카페 근무 완료" onClose={onExit} testID="cafe-result" footer={<><CafeButton icon="home-outline" onPress={onExit}>마을로 돌아가기</CafeButton><CafeButton secondary icon="refresh" onPress={reset}>한 번 더 일하기</CafeButton></>}>
        <View style={s.resultDrinks}>{result.drinkIds.map((id, index) => <View key={`${id}-${index}`} style={s.resultDrink}><CafeDrinkArt recipeId={id} size={88} /><Text style={s.resultPerson}>{getCafeGuest(session.guests[index].guestId).name}</Text></View>)}</View>
        <View style={s.resultSummary}><Text style={s.resultBig}>음료 {result.guestsServed}잔</Text><Text style={s.resultSmall}>자리 정리 {result.tablesCleaned}곳</Text></View><View style={s.resultFacts}>{result.facts.map(fact => <View style={s.fact} key={fact}><Ionicons name="checkmark" color={C.green} size={21} /><Text style={s.factText}>{fact}</Text></View>)}</View>
      </CafePanel> : null}
    </MarketPanelTransition>
    {toast && !visible ? <CafeToast message={toast.message} error={toast.error} /> : null}
  </Animated.View>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#E4D2B4', overflow: 'hidden' }, taskAnchor: { position: 'absolute', width: '100%', alignItems: 'center', zIndex: 16, paddingHorizontal: 16 }, taskCard: { width: '100%', maxWidth: 460, padding: 13, borderRadius: 22, backgroundColor: '#FFFAEDEF', gap: 11, flexDirection: 'row', alignItems: 'center' }, taskIcon: { width: 45, height: 45, backgroundColor: '#E4E9D5', borderRadius: 15, justifyContent: 'center', alignItems: 'center' }, taskTitle: { fontFamily: fonts.laundryBold, fontSize: 18, lineHeight: 24, color: C.ink }, taskText: { fontFamily: fonts.medium, color: '#81765F', fontSize: 15, lineHeight: 22 }, taskCount: { fontFamily: fonts.laundryBold, color: C.green, fontSize: 23 }, taskCountTotal: { fontSize: 16, color: '#A49A81' }, progress: { height: 4, backgroundColor: '#E9E5D4', borderRadius: 3, overflow: 'hidden', marginTop: 3 }, progressFill: { height: 4, backgroundColor: '#9AAA7A', borderRadius: 3 },
  trayScene: { height: 225, alignItems: 'center', justifyContent: 'center' }, trayWood: { position: 'absolute', bottom: 13, width: 264, height: 88, backgroundColor: '#BA966D', borderRadius: 40, borderWidth: 7, borderColor: '#DCC09A', transform: [{ scaleY: 0.7 }] }, drinkTitle: { fontFamily: fonts.laundryBold, fontSize: 24, lineHeight: 32, color: C.ink, textAlign: 'center' }, drinkFor: { fontFamily: fonts.semibold, color: C.muted, fontSize: 17, textAlign: 'center', marginTop: 7 }, empty: { paddingVertical: 30, alignItems: 'center', gap: 12 }, emptyText: { fontFamily: fonts.bold, fontSize: 20, color: C.ink }, note: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 24, color: C.muted, textAlign: 'center' }, doneSeat: { paddingVertical: 26, gap: 17, alignItems: 'center' },
  orderRow: { minHeight: 103, flexDirection: 'row', alignItems: 'center', gap: 15, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 18, marginBottom: 8, backgroundColor: '#F0EBDD' }, currentOrder: { backgroundColor: '#E6EAD6' }, guestImage: { width: 44, height: 72 }, personName: { fontFamily: fonts.laundryBold, fontSize: 20, color: C.ink }, orderName: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 23, color: C.muted }, orderNumber: { fontFamily: fonts.laundryBold, fontSize: 22, color: '#AC9D80' }, reportCount: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, paddingVertical: 21 }, reportNumber: { fontFamily: fonts.laundryBold, fontSize: 49, color: C.ink }, reportUnit: { fontSize: 22 }, reportRows: { gap: 11, backgroundColor: '#EFECDE', borderRadius: 20, padding: 17 }, reportRow: { flexDirection: 'row', alignItems: 'center', gap: 9 }, reportText: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 24, color: C.ink, flex: 1 }, reportFoot: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 24, color: C.green, textAlign: 'center', marginTop: 21 }, exitText: { fontFamily: fonts.medium, fontSize: 17, lineHeight: 27, color: C.muted, paddingVertical: 14 },
  resultDrinks: { flexDirection: 'row', justifyContent: 'center', backgroundColor: '#ECE7D5', borderRadius: 20, paddingVertical: 15 }, resultDrink: { flex: 1, alignItems: 'center' }, resultPerson: { fontFamily: fonts.bold, fontSize: 16, color: C.ink }, resultSummary: { alignItems: 'center', paddingVertical: 23, gap: 5 }, resultBig: { fontFamily: fonts.laundryBold, color: C.ink, fontSize: 29 }, resultSmall: { fontFamily: fonts.semibold, color: C.green, fontSize: 17 }, resultFacts: { gap: 12 }, fact: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' }, factText: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 24, color: C.muted, flex: 1 },
});
