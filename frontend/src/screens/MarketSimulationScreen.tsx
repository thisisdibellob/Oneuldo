import { Ionicons } from '@expo/vector-icons';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { BackHandler, Image, Platform, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { PressScale } from '../components/PressScale';
import { MarketMap } from '../components/game/MarketMap';
import { MarketPanelTransition } from '../components/game/MarketPanelTransition';
import { MarketShelfScene } from '../components/game/MarketShelfScene';
import { MarketSetupPanel } from '../components/game/MarketSetupPanel';
import { MarketEnvironment, MarketEnvironmentStationId, MarketCashierAvailability } from '../game/marketEnvironment';
import {
  applyMarketAction,
  createMarketSession,
  exportMarketEpisode,
  MarketAction,
  MarketSessionConfig
} from '../game/marketSession';
import { getMarketProductImage } from '../game/marketProductImages';
import { getMarketCartTotal, getMarketProduct, marketCategories, MarketCart } from '../game/scenarios';
import { fonts } from '../theme';
import { listMarketEpisodes, saveMarketEpisode, MarketStoredEpisode } from '../game/marketEpisodeStore';

export type MarketStationId = MarketEnvironmentStationId;
export type MarketInteractionRequest = {
  id: number;
  station: MarketStationId;
};
export type MarketProductDropDecision = {
  accepted: boolean;
  reason?: 'unavailable';
};
export function evaluateMarketProductDrop(_cart: MarketCart, productId: string, _mode?: 'practice' | 'challenge'): MarketProductDropDecision {
  return getMarketProduct(productId) ? { accepted: true } : { accepted: false, reason: 'unavailable' };
}
type Point = {
  x: number;
  y: number;
};
export type MarketSimulationScreenProps = {
  embedded?: boolean;
  interactionRequest?: MarketInteractionRequest | null;
  environment?: MarketEnvironment;
  initialConfig?: Partial<MarketSessionConfig>;
  playerPositionRef?: { current: Point; };
  playerMovementListenerRef?: { current: ((previous: Point, next: Point) => void) | null; };
  onEnvironmentChange?: (environment: MarketEnvironment) => void;
  onCashierCalled?: (availability: MarketCashierAvailability) => void;
  onEpisodeComplete?: (episode: ReturnType<typeof exportMarketEpisode>) => void;
  onExit: () => void;
  onLockChange?: (locked: boolean) => void;
  onMissionComplete?: () => void;
};
const price = (value: number) => value.toLocaleString('ko-KR') + '원';

export function MarketSimulationScreen({
  embedded = false,
  interactionRequest = null,
  environment,
  initialConfig,
  playerPositionRef,
  playerMovementListenerRef,
  onEnvironmentChange,
  onCashierCalled,
  onEpisodeComplete,
  onExit,
  onLockChange,
  onMissionComplete
}: MarketSimulationScreenProps) {
  const insets = useContext(SafeAreaInsetsContext);
  const [session, setSession] = useState(() => createMarketSession({
    seed: environment?.seed ?? 'market-' + Date.now(),
    ...initialConfig,
    startedAt: new Date().toISOString()
  }, environment));
  const live = useRef(session);
  live.current = session;
  const localPosition = useRef(session.environment.spawn);
  const [briefing, setBriefing] = useState(true),
    [briefingStep, setBriefingStep] = useState(0);
  const [settings, setSettings] = useState(false),
    [cartOpen, setCartOpen] = useState(false),
    [helpOpen, setHelpOpen] = useState(false);
  const [nearby, setNearby] = useState<MarketStationId | null>(null);
  const [difficultyRating, setDifficultyRating] = useState(0),
    [interestRating, setInterestRating] = useState(0);
  const [exportMessage, setExportMessage] = useState(''),
    [staffMessage, setStaffMessage] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [staffReturnHelp, setStaffReturnHelp] = useState(false);
  const [staffResponse, setStaffResponse] = useState('');
  const [alarmNotice, setAlarmNotice] = useState<number | null>(null);
  const [panelPresent, setPanelPresent] = useState(true);
  const handled = useRef<number | null>(null),
    completed = useRef(false),
    emitted = useRef(false);
  const position = playerPositionRef ?? localPosition;
  const shelf = marketCategories.find(category => category.id === session.activeStation);
  const panelVisible = briefing || settings || historyOpen || session.phase !== 'shopping' || cartOpen || helpOpen || staffMessage;
  const locked = panelVisible || panelPresent || !!shelf;
  const dispatch = useCallback((action: MarketAction, sync = false) => {
    let current = live.current;
    const at = new Date().toISOString();
    if (sync) current = applyMarketAction(current, { type: 'setPosition', point: { ...position.current }, at });
    const next = applyMarketAction(current, { ...action, at });
    live.current = next;
    setSession(next);
    return next;
  }, [position]);
  const syncMovementSegment = useCallback((previous: Point, next: Point) => {
    if (briefing || live.current.phase !== 'shopping') return;
    const { alarmBoundaryY, rearmY } = live.current.environment.entrance;
    const crossesAlarm = (previous.y < alarmBoundaryY) !== (next.y < alarmBoundaryY);
    const rearmsAlarm = previous.y > rearmY && next.y <= rearmY;
    if (!crossesAlarm && !rearmsAlarm) return;
    // Keep both ends of a gate crossing even when an out-and-back trip falls between log samples.
    dispatch({ type: 'setPosition', point: { ...previous } });
    dispatch({ type: 'setPosition', point: { ...next } });
  }, [briefing, dispatch]);
  useEffect(() => {
    if (!playerMovementListenerRef) return;
    playerMovementListenerRef.current = syncMovementSegment;
    return () => { playerMovementListenerRef.current = null; };
  }, [playerMovementListenerRef, syncMovementSegment]);
  const giveUp = useCallback(() => {
    setBriefing(false);
    setSettings(false);
    setHistoryOpen(false);
    setCartOpen(false);
    setHelpOpen(false);
    setStaffMessage(false);
    setStaffReturnHelp(false);
    setStaffResponse('');
    dispatch({ type: 'giveUp' }, live.current.phase === 'shopping');
  }, [dispatch]);
  const interact = useCallback((station: MarketStationId) => {
    const next = dispatch({ type: 'interact', station }, true);
    if (station.startsWith('staff:') && !next.lastActionError) {
      setStaffMessage(true);
      setStaffReturnHelp(false);
      setStaffResponse('');
    }
    setCartOpen(false);
    setHelpOpen(false);
  }, [dispatch, giveUp]);
  useEffect(() => {
    if (briefing || session.phase !== 'shopping' || !interactionRequest || handled.current === interactionRequest.id) return;
    handled.current = interactionRequest.id;
    interact(interactionRequest.station);
  }, [briefing, interactionRequest, interact, session.phase]);
  useEffect(() => {
    onLockChange?.(locked);
  }, [locked, onLockChange]);
  useEffect(() => () => onLockChange?.(false), [onLockChange]);
  useEffect(() => {
    if (session.environment.checkouts.some(counter => session.cashierAvailability[counter.id] && !counter.cashierPresent)) {
      onCashierCalled?.({ ...session.cashierAvailability });
    }
  }, [session.cashierAvailability.checkout, session.cashierAvailability['checkout-2'], onCashierCalled]);
  useEffect(() => {
    if (!session.alarmCount) return;
    const alarm = [...live.current.events].reverse().find(event => event.type === 'entrance_alarm');
    setAlarmNotice(Math.abs(Number(alarm?.payload.delta ?? 0)));
    const timer = setTimeout(() => setAlarmNotice(null), 4500);
    return () => clearTimeout(timer);
  }, [session.alarmCount]);
  useEffect(() => {
    if (session.outcome === 'success' && !completed.current) {
      completed.current = true;
      onMissionComplete?.();
    }
  }, [session.outcome, onMissionComplete]);
  useEffect(() => {
    if (session.phase !== 'finished') return;
    const saved = saveMarketEpisode(exportMarketEpisode(session));
    setExportMessage(saved.persisted ? '이 브라우저에 기록을 저장했어요. 시작 화면에서 다시 내보낼 수 있어요.' : '앱을 닫기 전에 게임 기록 저장을 눌러 보관해 주세요.');
  }, [session.outcome, session.ratings, session.ratingSkipped]);
  useEffect(() => {
    if (briefing || session.phase === 'finished') return;
    const timer = setInterval(() => {
      const old = live.current.playerPosition,
        point = position.current;
      if (Math.hypot(old.x - point.x, old.y - point.y) >= 3) dispatch({ type: 'setPosition', point: { ...point } });
    }, 500);
    return () => clearInterval(timer);
  }, [briefing, session.phase, dispatch, position]);
  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (panelPresent && !panelVisible) return true;
      if (historyOpen) {
        setHistoryOpen(false);
        return true;
      }
      if (shelf) return false;
      if (settings) setSettings(false);
      else if (cartOpen) {
        dispatch({ type: 'closeView' });
        setCartOpen(false);
      } else if (helpOpen) {
        dispatch({ type: 'closeView' });
        setHelpOpen(false);
      }
      else if (session.phase !== 'finished') giveUp();
      else return false;
      return true;
    });
    return () => back.remove();
  }, [shelf, settings, historyOpen, cartOpen, helpOpen, session.phase, giveUp, dispatch, panelPresent, panelVisible]);
  const configure = (config: Partial<MarketSessionConfig>) => {
    const next = createMarketSession({ ...config, startedAt: new Date().toISOString() });
    live.current = next;
    setSession(next);
    localPosition.current = next.environment.spawn;
    onEnvironmentChange?.(next.environment);
    setSettings(false);
    setBriefingStep(0);
  };
  const selectDifficulty = (difficulty: 'family' | 'exact') => configure({
    ...session.config,
    difficulty,
    objectives: session.config.objectives.map(({ productId, quantity }) => ({ productId, quantity }))
  });
  const start = () => {
    const next = createMarketSession({ ...session.config, startedAt: new Date().toISOString() }, session.environment);
    live.current = next;
    setSession(next);
    setBriefing(false);
  };
  const finishRating = (rate: boolean) => {
    const next = rate
      ? dispatch({ type: 'rate', difficulty: difficultyRating, interest: interestRating })
      : dispatch({ type: 'skipRating' });
    if (next.lastActionError) return;
    if (!emitted.current) {
      emitted.current = true;
      onEpisodeComplete?.(exportMarketEpisode(next));
    }
  };
  const exportData = async (episode: MarketStoredEpisode = exportMarketEpisode(live.current)) => {
    const json = JSON.stringify(episode, null, 2);
    if (Platform.OS === 'web') {
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = episode.sessionId + '.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportMessage('게임 기록을 JSON 파일로 저장했어요.');
    } else {
      await Share.share({ title: '장보기 게임 기록', message: json });
      setExportMessage('공유 창에서 기록을 저장할 수 있어요.');
    }
  };
  const closeStation = () => {
    dispatch({ type: 'closeStation' });
    setStaffMessage(false);
    setStaffReturnHelp(false);
    setStaffResponse('');
  };
  const requestProductReturn = (productId: string, quantity: number) => {
    const next = dispatch({ type: 'requestReturn', productId, quantity }, true);
    if (!next.lastActionError) setStaffResponse(`${getMarketProduct(productId)?.name} ${quantity}개를 제자리에 놓아드렸어요.`);
  };
  const cartCount = Object.values(session.cart).reduce((a, b) => a + b, 0);
  const isFinished = session.phase === 'finished',
    ratingDone = !!session.ratings || session.ratingSkipped;
  const panelKey = settings ? 'settings' : historyOpen ? 'history' : briefing ? 'briefing-' + briefingStep
    : cartOpen ? 'cart' : helpOpen ? 'help' : staffMessage ? 'staff-' + staffReturnHelp
      : isFinished ? 'finished-' + ratingDone : session.phase + '-' + session.attempts;
  const modal = (
    title: string,
    children: React.ReactNode,
    eyebrow?: string,
    onClose?: () => void
  ) =>
    <ModalCard
      title={title}
      eyebrow={eyebrow}
      onClose={onClose}
    >
      {children}
    </ModalCard>;
  const quit = <Button
    text="그만두기"
    label="장보기 포기"
    quiet
    onPress={giveUp}
  />;

  return <View pointerEvents={embedded ? 'box-none' : 'auto'} style={embedded ? s.embeddedRoot : s.root}>
    {!embedded
      ? <MarketMap
        key={JSON.stringify(session.environment.config)}
        environment={session.environment}
        cashierCalled={session.cashierAvailability}
        hintedStation={null}
        interactive={!locked}
        nearbyStation={nearby}
        onNearbyStationChange={setNearby}
        onPositionChange={point => {
          const previous = localPosition.current;
          localPosition.current = point;
          syncMovementSegment(previous, point);
        }}
      />
      : null}
    {!briefing && session.phase === 'shopping' && !shelf && !cartOpen && !helpOpen && !staffMessage
      ? <View
        pointerEvents="box-none"
        style={[s.hud, { top: embedded ? 105 : Math.max(12, insets?.top ?? 0) }]}
      >
        <View style={s.hudTitle}>
          <Text style={s.eyebrow}>하늘마트 · 장보기</Text>
          <Text accessibilityLabel={`현재 점수 ${session.score}점`} style={s.score}>{session.score}점</Text>
          <Button
            text="포기"
            label="장보기 포기"
            quiet
            onPress={giveUp}
          />
        </View>
        <View testID="market-shopping-list" style={s.listCard}>
          <Text style={s.listTitle}>사야 할 물품</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.objectives}
          >
            {session.objectives.map(o => <View key={o.id} style={s.objective}>
              <Text style={s.objectiveName}>
                {o.label}
              </Text>
              <Text style={s.objectiveQuantity}>{o.quantity}개</Text>
            </View>)}
          </ScrollView>
        </View>
        <View style={s.hudActions}>
          <Button
            text="이용 방법"
            quiet
            onPress={() => {
              dispatch({ type: 'viewHelp' });
              setHelpOpen(true);
            }}
          />
          <Button
            text="장바구니"
            label="장바구니 열기"
            onPress={() => {
              dispatch({ type: 'viewCart' });
              setCartOpen(true);
            }}
          />
        </View>
      </View>
      : null}
    {!embedded && !locked && nearby
      ? <View style={s.stationAction}>
        <Button
          text={nearby === 'checkout' || nearby === 'checkout-2'
            ? '계산대 살펴보기'
            : nearby === 'exit' || nearby === 'entrance' ? '나가기' : nearby.startsWith('staff:') ? '직원에게 말 걸기' : '진열대 살펴보기'}
          onPress={() => interact(nearby)}
        />
      </View>
      : null}
    {shelf && !briefing && session.phase === 'shopping'
      ? <MarketShelfScene
        category={shelf}
        cart={session.cart}
        slots={session.shelfSlots[shelf.id]}
        stock={session.initialStock}
        onChangeQuantity={(productId, change) => dispatch({ type: change > 0 ? 'add' : 'remove', productId })}
        onDropProduct={productId => !dispatch({ type: 'add', productId }).lastActionError}
        onClose={closeStation}
        onGiveUp={giveUp}
        onCartVisibilityChange={open => dispatch({ type: open ? 'viewCart' : 'closeView' })}
      />
      : null}
    <MarketPanelTransition visible={panelVisible} transitionKey={panelKey} onPresenceChange={setPanelPresent}>
    {briefing && !settings && !historyOpen
      ? modal('마트에서 장보기', <>
        <Text style={s.body}>
          {briefingStep === 0
            ? '목록을 보고 필요한 물건을 골라 보세요. 물건의 이름과 종류를 천천히 살펴봐요.'
            : `다 골랐다면 출구 옆 계산대로 가요. 계산하지 않은 물건을 담고 빨간 입구 경보기를 지나 나가면 ${session.config.alarmPenaltyPoints}점이 줄어요. 원하면 다시 해보거나 언제든 그만둘 수 있어요.`}
        </Text>
        <View style={s.choices}>
          <Button
            text="연습 모드"
            selected={session.config.difficulty === 'family'}
            quiet
            onPress={() => selectDifficulty('family')}
          />
          <Button
            text="도전 모드"
            selected={session.config.difficulty === 'exact'}
            quiet
            onPress={() => selectDifficulty('exact')}
          />
        </View>
        <Text style={s.small}>
          {session.config.difficulty === 'family'
            ? '종류가 같으면 괜찮아요. 예: 우유는 맛과 지방 함량에 관계없이 골라요.'
            : '목록에 적힌 상품을 정확히 골라요. 예: 저지방 우유는 저지방 우유만 골라요.'}
        </Text>
        <View style={s.requirements}>
          {session.objectives.map(o => <View key={o.id} style={s.row}>
            <Text style={s.body}>
              {o.label}
            </Text>
            <Text style={s.quantity}>{o.quantity}개</Text>
          </View>)}
        </View>
        <Button
          text={briefingStep === 0 ? '다음' : '장보기 시작'}
          onPress={() => briefingStep === 0 ? setBriefingStep(1) : start()}
        />
        <Button
          text="연습 환경 설정"
          quiet
          onPress={() => setSettings(true)}
        />
        <Button
          text="이전 게임 기록"
          quiet
          onPress={() => setHistoryOpen(true)}
        />
        {quit}
      </>, '오늘도 · 생활 연습')
      : null}
    {settings
      ? <MarketSetupPanel
        config={session.config}
        onApply={configure}
        onClose={() => setSettings(false)}
      />
      : null}
    {historyOpen
      ? modal('이전 게임 기록', <>
        <Text style={s.small}>이 브라우저의 최근 20회 기록을 보관합니다. 네이티브 앱에서는 앱을 실행한 동안의 기록이며, JSON 공유로 따로 저장할 수 있어요.</Text>
        {listMarketEpisodes().map(episode => <View key={episode.sessionId} style={s.requirements}>
          <Text style={s.body}>{episode.outcome === 'success' ? '성공' : '실패 (포기)'} · {episode.attempts}회 시도</Text>
          <Text style={s.small}>{episode.config.startedAt} · 시드 {String(episode.seed)}</Text>
          <Button
            text="기록 JSON 저장"
            quiet
            onPress={() => {
              void exportData(episode).catch(() => setExportMessage('저장하지 못했어요. 다시 눌러 주세요.'));
            }}
          />
        </View>)}
        {!listMarketEpisodes().length
          ? <Text style={s.body}>아직 저장된 기록이 없어요.</Text>
          : null}
        {exportMessage
          ? <Text accessibilityLiveRegion="polite" style={s.small}>
            {exportMessage}
          </Text>
          : null}
        <Button text="시작 화면으로" onPress={() => setHistoryOpen(false)} />
      </>, undefined, () => setHistoryOpen(false))
      : null}
    {cartOpen && !isFinished
      ? modal('장바구니', <>
        <CartContents cart={session.cart} showReturnLocation />
        <Text style={s.body}>담은 물건 {cartCount}개 · 합계 {price(getMarketCartTotal(session.cart))}</Text>
        <Text style={s.small}>물건을 내려놓으려면 그 물건의 진열대로 돌아가요. 어렵다면 매장 종업원에게 도움을 청할 수 있어요.</Text>
        <Button text="계속 고르기" onPress={() => {
          dispatch({ type: 'closeView' });
          setCartOpen(false);
        }} />
      </>, '내가 담은 물품', () => {
        dispatch({ type: 'closeView' });
        setCartOpen(false);
      })
      : null}
    {helpOpen
      ? modal('이렇게 이용해요', <>
        <Text style={s.body}>1. 사야 할 물품과 개수를 읽어요.{'\n\n'}2. 진열대 가까이 가서 물건을 살펴봐요.{'\n\n'}3. 장바구니를 눌러 담은 물건을 확인해요.{'\n\n'}4. 내려놓을 물건은 그 물건의 진열대로 돌아가 장바구니를 펼쳐 내려놓아요. 어렵다면 종업원에게 제자리에 놓아 달라고 부탁해요.{'\n\n'}5. 출구 옆 두 계산대 중 하나에서 구매를 확정해요. 계산원이 없으면 매장 직원을 찾아 말을 걸어요.{'\n\n'}6. 계산하지 않은 물건을 담고 빨간 입구 경보기를 나가면 {session.config.alarmPenaltyPoints}점이 줄어요. 입구와 출구 모두 나갈 수 있어요.</Text>
        <Button text="알겠어요" onPress={() => {
          dispatch({ type: 'closeView' });
          setHelpOpen(false);
        }} />
      </>, undefined, () => {
        dispatch({ type: 'closeView' });
        setHelpOpen(false);
      })
      : null}
    {staffMessage
      ? modal(staffReturnHelp ? '물건 내려놓기 도움' : '매장 직원', <>
        <Text style={s.body}>{staffReturnHelp ? '어떤 물건을 제자리에 놓아드릴까요? 내려놓고 싶은 물건과 개수를 골라 주세요.' : '무엇을 도와드릴까요?'}</Text>
        {staffResponse ? <Text accessibilityLiveRegion="polite" style={s.body}>{staffResponse}</Text> : null}
        {staffReturnHelp ? <>
          <CartContents cart={session.cart} onRequestReturn={requestProductReturn} />
          <Button text="직원 대화로 돌아가기" quiet onPress={() => { setStaffReturnHelp(false); setStaffResponse(''); }} />
        </> : <>
          {session.environment.checkouts.filter(counter => !session.cashierAvailability[counter.id]).map(counter =>
            <Button key={counter.id} text={`${counter.id === 'checkout' ? 1 : 2}번 계산대 계산을 부탁드려요`}
              onPress={() => {
                const next = dispatch({ type: 'requestCashier', checkoutId: counter.id }, true);
                if (!next.lastActionError) setStaffResponse(`${counter.id === 'checkout' ? 1 : 2}번 계산대로 와 주세요. 계산을 도와드릴게요.`);
              }} />)}
          {cartCount > 0 ? <Button text="물건 제자리에 놓기 도움 요청" onPress={() => { setStaffReturnHelp(true); setStaffResponse(''); }} /> : null}
        </>}
        <Button text="감사합니다" onPress={closeStation} />
        {quit}
      </>, '종업원에게 부탁하기')
      : null}
    {!briefing && session.phase === 'checkout'
      ? modal(session.cashierAvailable ? '이대로 구매할까요?' : '계산원이 자리를 비웠어요', <>
        <CartContents cart={session.cart} />
        <Text style={s.body}>합계 {price(getMarketCartTotal(session.cart))}</Text>
        {session.cashierAvailable
          ? <>
            <Text style={s.small}>구매를 확정하면 이번 시도가 기록되고 결과가 나와요.</Text>
            <Button text="구매 확정" onPress={() => dispatch({ type: 'submit' })} />
          </>
          : <>
            <Text style={s.body}>매장 안의 직원을 찾아 가까이에서 계산을 요청해 주세요.</Text>
            <Button text="직원 찾아 계산 요청하기" onPress={closeStation} />
          </>}
        <Button
          text="다시 고르기"
          quiet
          onPress={closeStation}
        />
        {quit}
      </>, `${session.selectedCheckoutId === 'checkout-2' ? 2 : 1}번 계산대 · 최종 결정`)
      : null}
    {session.phase === 'feedback'
      ? modal('이번 구매는 맞지 않았어요', <>
        {session.feedback?.details?.length
          ? <View testID="market-detailed-feedback">
            {session.feedback.details.map((detail, i) => <Text key={i} style={s.body}>• {detail}</Text>)}
          </View>
          : <Text testID="market-general-feedback" style={s.body}>목록과 장바구니를 스스로 다시 살펴보세요.</Text>}
        <Button
          text={session.attempts === 1 ? '1차 재시도' : session.attempts + '차 재시도'}
          onPress={() => dispatch({ type: 'retry' })}
        />
        {quit}
      </>, session.attempts + '번째 시도 결과')
      : null}
    {isFinished
      ? modal(session.outcome === 'success' ? '장보기에 성공했어요!' : '장보기를 마쳤어요', <>
        <View style={s.resultBadge}>
          <Ionicons
            name={session.outcome === 'success' ? 'checkmark-circle-outline' : 'flag-outline'}
            size={42}
            color="#517660"
          />
          <Text style={s.resultText}>
            {session.outcome === 'success' ? '성공' : '실패 (포기)'}
          </Text>
          <Text style={s.body}>구매 시도 {session.attempts}회</Text>
          <Text testID="market-final-score" style={s.body}>최종 점수 {session.score}점 · 경보기 감점 {session.penaltyPoints}점 ({session.alarmCount}회)</Text>
        </View>
        {!ratingDone
          ? <>
            <Text style={s.body}>오늘 장보기는 어땠나요? 평가를 건너뛰어도 괜찮아요.</Text>
            <Stars
              title="난이도"
              hint="1 쉬웠어요 · 5 어려웠어요"
              value={difficultyRating}
              onChange={setDifficultyRating}
            />
            <Stars
              title="흥미"
              hint="1 재미없었어요 · 5 재미있었어요"
              value={interestRating}
              onChange={setInterestRating}
            />
            <Button
              text="별점 남기기"
              disabled={!difficultyRating || !interestRating}
              onPress={() => finishRating(true)}
            />
            <Button
              text="평가 건너뛰기"
              quiet
              onPress={() => finishRating(false)}
            />
          </>
          : <>
            <Text style={s.body}>
              {session.ratings
                ? '난이도 ' + session.ratings.difficulty + '점 · 흥미 ' + session.ratings.interest + '점'
                : '평가를 건너뛰었어요.'}
            </Text>
            <Button
              text="게임 기록 저장"
              quiet
              onPress={() => {
                void exportData().catch(() => setExportMessage('저장하지 못했어요. 다시 눌러 주세요.'));
              }}
            />
            {exportMessage
              ? <Text accessibilityLiveRegion="polite" style={s.small}>
                {exportMessage}
              </Text>
              : null}
            <Button text="마트 나가기" onPress={onExit} />
          </>}
      </>, '최종 결과')
      : null}
    </MarketPanelTransition>
    {alarmNotice !== null ? <View pointerEvents="none" style={[s.notice, s.alarmNotice]}>
      <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={s.alarmNoticeText}>
        입구 경보기가 울렸어요. 계산하지 않은 물건이 있어요. −{alarmNotice}점
      </Text>
    </View> : null}
    {session.lastActionError
      ? <View pointerEvents="none" style={s.notice}>
        <Text accessibilityLiveRegion="polite" style={s.noticeText}>
          {session.lastActionError}
        </Text>
      </View>
      : null}
  </View>;
}
function CartContents({ cart, onRequestReturn, showReturnLocation = false }: {
  cart: MarketCart;
  onRequestReturn?: (productId: string, quantity: number) => void;
  showReturnLocation?: boolean;
}) {
  return <View testID="market-cart-contents">
    {Object.entries(cart).filter(([, q]) => q > 0).map(([id, quantity]) => {
      const product = getMarketProduct(id);
      if (!product) return null;
      return <View key={id}>
      <View style={s.cartRow}>
        <Image
          source={getMarketProductImage(id)}
          style={s.productArt}
          resizeMode="contain"
        />
        <View style={s.cartName}>
          <Text style={s.body}>
            {product.name}
          </Text>
          <Text style={s.small}>
            {product.detail}
          </Text>
          {showReturnLocation ? <Text style={s.small}>{marketCategories.find(category => category.id === product.categoryId)?.label} 진열대에서 내려놓기</Text> : null}
        </View>
        <Text style={s.quantity}>{quantity}개</Text>
      </View>
      {onRequestReturn ? <View style={s.returnChoices}>
        <Button text="1개 부탁하기" label={`${product.name} 1개 반납 부탁하기`} quiet onPress={() => onRequestReturn(id, 1)} />
        {quantity > 1 ? <Button text={`${quantity}개 모두 부탁하기`} label={`${product.name} 전부 반납 부탁하기`} quiet onPress={() => onRequestReturn(id, quantity)} /> : null}
      </View> : null}
      </View>;
    })}
    {!Object.values(cart).some(q => q > 0)
      ? <Text style={s.body}>아직 담은 물건이 없어요.</Text>
      : null}
  </View>;
}
export function Button({
  text,
  label,
  onPress,
  quiet = false,
  selected = false,
  disabled = false
}: {
  text: string;
  label?: string;
  onPress: () => void;
  quiet?: boolean;
  selected?: boolean;
  disabled?: boolean;
}) {
  return <PressScale
    accessibilityRole="button"
    accessibilityLabel={label ?? text}
    accessibilityState={{ disabled, selected }}
    disabled={disabled}
    onPress={onPress}
    style={[s.button, quiet && s.quiet, selected && s.selected, disabled && s.disabled]}
  >
    <Text style={[s.buttonText, quiet && s.quietText]}>
      {text}
    </Text>
  </PressScale>;
}
export function ModalCard({ title, eyebrow, children, onClose }: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
  onClose?: () => void;
}) {
  const insets = useContext(SafeAreaInsetsContext);
  return <View
    accessibilityViewIsModal
    style={[s.overlay, { paddingTop: Math.max(16, insets?.top ?? 0), paddingBottom: Math.max(16, insets?.bottom ?? 0) }]}
  >
    <ScrollView
      style={s.modal}
      contentContainerStyle={s.modalContent}
      keyboardShouldPersistTaps="handled"
    >
      <View style={s.row}>
        <View style={{ flex: 1 }}>
          {eyebrow
            ? <Text style={s.eyebrow}>
              {eyebrow}
            </Text>
            : null}
          <Text accessibilityRole="header" style={s.title}>
            {title}
          </Text>
        </View>
        {onClose
          ? <PressScale
            accessibilityRole="button"
            accessibilityLabel={title + ' 닫기'}
            onPress={onClose}
            style={s.remove}
          >
            <Ionicons
              name="close"
              size={24}
              color="#536253"
            />
          </PressScale>
          : null}
      </View>
      {children}
    </ScrollView>
  </View>;
}
function Stars({ title, hint, value, onChange }: {
  title: string;
  hint: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return <View style={s.stars}>
    <Text style={s.body}>
      {title}
    </Text>
    <View style={s.starRow}>
      {[1, 2, 3, 4, 5].map(star => <PressScale
        key={star}
        accessibilityRole="button"
        accessibilityLabel={title + ' ' + star + '점'}
        accessibilityState={{ selected: value === star }}
        onPress={() => onChange(star)}
        style={s.star}
      >
        <Ionicons
          name={star <= value ? 'star' : 'star-outline'}
          color="#B58331"
          size={28}
        />
      </PressScale>)}
    </View>
    <Text style={s.small}>
      {hint}
    </Text>
  </View>;
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#EAE8DF' },
  embeddedRoot: { ...StyleSheet.absoluteFill, zIndex: 28 },
  hud: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 30,
    gap: 6
  },
  hudTitle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingLeft: 8,
    backgroundColor: '#FAF8EF',
    borderRadius: 12
  },
  listCard: {
    backgroundColor: '#FFFBF0',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#DAD2BD'
  },
  listTitle: { fontFamily: fonts.bold, fontSize: 14, color: '#455545' },
  objectives: { gap: 18, paddingTop: 8 },
  objective: { minWidth: 70, maxWidth: 160, gap: 3 },
  objectiveName: { fontFamily: fonts.medium, fontSize: 13, color: '#534E41' },
  objectiveQuantity: { fontFamily: fonts.bold, fontSize: 15, color: '#445D49' },
  hudActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  stationAction: {
    position: 'absolute',
    bottom: 100,
    right: 14,
    zIndex: 40
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(31,42,34,0.58)',
    justifyContent: 'center',
    padding: 16,
    zIndex: 80
  },
  modal: {
    flexGrow: 0,
    maxHeight: '100%',
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    borderRadius: 24,
    backgroundColor: '#FFFDF5'
  },
  modalContent: { padding: 22, gap: 14 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10
  },
  title: {
    fontFamily: fonts.cafe24Ssurround,
    fontSize: 25,
    lineHeight: 34,
    color: '#344D3C'
  },
  eyebrow: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: '#788571',
    marginBottom: 4
  },
  body: {
    fontFamily: fonts.medium,
    fontSize: 15,
    lineHeight: 23,
    color: '#4B5548'
  },
  small: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 19,
    color: '#7C806E'
  },
  quantity: { fontFamily: fonts.bold, fontSize: 16, color: '#49634C' },
  requirements: {
    backgroundColor: '#F0F1E5',
    borderRadius: 12,
    padding: 12,
    gap: 7
  },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: {
    minHeight: 46,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: '#557D61',
    alignItems: 'center',
    justifyContent: 'center'
  },
  buttonText: { fontFamily: fonts.bold, fontSize: 14, color: '#FFFFFF' },
  quiet: { backgroundColor: '#EEF0E4' },
  quietText: { color: '#4F6752' },
  selected: { borderWidth: 2, borderColor: '#5D8966' },
  disabled: { opacity: 0.4 },
  cartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#EBE9DC'
  },
  productArt: { width: 44, height: 52 },
  cartName: { flex: 1 },
  returnChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 12 },
  remove: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center'
  },
  resultBadge: {
    alignItems: 'center',
    padding: 16,
    gap: 8,
    backgroundColor: '#F0F3E7',
    borderRadius: 16
  },
  resultText: { fontFamily: fonts.cafe24Ssurround, fontSize: 24, color: '#50715B' },
  stars: { gap: 4 },
  starRow: { flexDirection: 'row' },
  star: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center'
  },
  notice: {
    position: 'absolute',
    bottom: 18,
    left: 20,
    right: 20,
    zIndex: 100,
    padding: 12,
    backgroundColor: '#4F5E50',
    borderRadius: 12
  },
  noticeText: { fontFamily: fonts.medium, fontSize: 13, color: '#FFFFFF' },
  score: { color: '#526F57', fontFamily: fonts.bold, fontSize: 13, marginLeft: 'auto', marginRight: 12 },
  alarmNotice: { backgroundColor: '#A63E39', bottom: 150, zIndex: 110 },
  alarmNoticeText: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 21, color: '#FFFFFF' },
});
