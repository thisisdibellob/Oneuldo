import { Ionicons } from '@expo/vector-icons';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, Image, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { PressScale } from '../components/PressScale';
import { GameHud } from '../components/game/GameHud';
import { LibraryRoom } from '../components/game/LibraryRoom';
import { LibrarySetupPanel } from '../components/game/LibrarySetupPanel';
import { LibraryCatalogPanel, LibraryGuidebookPanel } from '../components/game/LibraryReferencePanels';
import { LibraryBookArt, LibraryBookGrid, LibraryBookLabel, LibraryButton, LibraryPanel, LibraryShelfWork, LibraryToast, LIBRARY_COLORS as C } from '../components/game/LibraryWorkPanel';
import { MarketPanelTransition, useMarketReducedMotion } from '../components/game/MarketPanelTransition';
import { MarketStaffDialogue, MarketStaffDialogueChoice } from '../components/game/MarketStaffDialogue';
import { applyLibraryAction, createLibrarySession, getLibraryBook, getLibraryCartBatch, getLibraryCategory, getLibraryProgress, getLibraryResult, LIBRARY_CATEGORIES, type LibraryAction, type LibrarySessionConfig, type LibraryShelfSlot, type LibraryVisitorId } from '../game/librarySession';
import { rateLibraryEpisode, saveLibraryEpisode } from '../game/libraryEpisodeStore';
import { libraryArt } from '../game/libraryArt';
import { LIBRARY_KDC_DIRECTORY } from '../game/libraryClassification';
import type { LibraryStation } from '../game/libraryWorld';
import { fonts } from '../theme';
import type { LibrarySession } from '../game/librarySession';

type Panel = null | LibraryStation | 'bag' | 'notebook' | 'guidebook' | 'report' | 'visitor-search' | 'visitor-arrival' | 'classification' | 'setup' | 'visitor-book';
export type LibrarySimulationScreenProps = { onExit: () => void; onTravel?: (destination: 'village' | 'library') => void; controlMode?: 'joystick' | 'touch'; onControlModeChange?: (mode: 'joystick' | 'touch') => void; initialConfig?: LibrarySessionConfig; initialSession?: LibrarySession; onSessionChange?: (session: LibrarySession) => void; onShiftComplete?: (session: LibrarySession) => void; onOpenJourney?: () => void; journeyOpen?: boolean; resumeOnReturn?: boolean };
export function LibrarySimulationScreen({ onExit, onTravel, controlMode: externalMode, onControlModeChange, initialConfig, initialSession, onSessionChange, onShiftComplete, onOpenJourney, journeyOpen = false, resumeOnReturn = false }: LibrarySimulationScreenProps) {
  const [session, setSession] = useState(() => initialSession ?? createLibrarySession(initialConfig));
  const sessionRef = useRef(session); sessionRef.current = session;
  const [panel, setPanel] = useState<Panel>(null); const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<LibraryShelfSlot | null>(null);
  const [reply, setReply] = useState(''); const [mode, setMode] = useState<'joystick' | 'touch'>('joystick');
  const [externalMenu, setExternalMenu] = useState(false); const [present, setPresent] = useState(false);
  const [toast, setToast] = useState<{ message: string; positive: boolean } | null>(null);
  const [shelvedReport, setShelvedReport] = useState<number | null>(null); const [handoffReport, setHandoffReport] = useState<number | null>(null);
  const [setupConfig, setSetupConfig] = useState<LibrarySessionConfig>(() => ({ ...initialConfig, ...session.config, supportMode: session.supportMode, seed: session.seed, startedAt: session.startedAt, sessionId: session.sessionId }));
  const [activeVisitorId, setActiveVisitorId] = useState<LibraryVisitorId>('visitor');
  const [roomVisit, setRoomVisit] = useState(0); const saved = useRef<string | null>(null);
  const [rating, setRating] = useState(0);
  const [navigationRequest, setNavigationRequest] = useState<{ id: number; station: LibraryStation } | undefined>();
  const notebookReturn = useRef<Panel>(null);
  const classificationReturn = useRef<Panel>('notebook');
  const [guidePage, setGuidePage] = useState(0);
  const reduceMotion = useMarketReducedMotion(); const insets = useContext(SafeAreaInsetsContext);
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const compactResult = viewportHeight < 740;
  const entrance = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const progress = getLibraryProgress(session); const result = getLibraryResult(session);
  const carried = session.books.filter(b => b.location === 'carried');
  const cartBatch = getLibraryCartBatch(session);
  const selected = session.books.find(b => b.bookId === selectedId);
  const damagedBooks = session.books.filter(b => b.damagedLabel);
  const labelsToAsk = damagedBooks.filter(b => b.inspected && !b.librarianAsked && b.location !== 'handoff');
  const handoffBooks = damagedBooks.filter(b => b.location === 'carried' && b.inspected);
  const readyForHandoff = handoffBooks.filter(b => b.librarianAsked);
  const controlMode = externalMode ?? mode;
  const visible = panel !== null || session.phase === 'finished';
  useEffect(() => { if (visible) setExternalMenu(false); }, [visible]);
  const locked = visible || present || externalMenu || journeyOpen;
  useEffect(() => { onSessionChange?.(session); }, [session, onSessionChange]);
  const notify = useCallback((message: string, positive = true) => setToast({ message, positive }), []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 3200); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { if (reduceMotion) { entrance.setValue(1); return; } const a = Animated.timing(entrance, { toValue: 1, duration: 420, useNativeDriver: true }); a.start(); return () => a.stop(); }, [entrance, reduceMotion]);
  const dispatch = useCallback((action: LibraryAction) => {
    const previous = sessionRef.current;
    const next = applyLibraryAction(previous, action); sessionRef.current = next; setSession(next);
    if (next.lastActionError) notify(next.lastActionError, false);
    return next;
  }, [notify]);
  useEffect(() => {
    if (session.phase !== 'finished' || saved.current === session.sessionId) return;
    saved.current = session.sessionId; saveLibraryEpisode(session);
    onShiftComplete?.(session);
  }, [session, onShiftComplete]);
  const close = useCallback(() => { setPanel(null); setSelectedId(null); setSelectedSlot(null); setReply(''); }, []);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (externalMenu) return false;
      if (session.phase === 'finished') onExit(); else if (panel) close(); else setPanel('exit');
      return true;
    }); return () => sub.remove();
  }, [close, externalMenu, onExit, panel, session.phase]);
  const open = useCallback((station: LibraryStation) => {
    const current = sessionRef.current;
    setReply(''); setSelectedId(null); setSelectedSlot(null);
    if (station !== 'librarian' && station !== 'exit' && station !== 'catalog' && current.phase === 'briefing') { notify('사서에게 먼저 업무를 받아 주세요.', false); return; }
    if (station === 'visitor' || station === 'visitor-2') {
      const visitor = current.visitors.find(item => item.id === station);
      if (!visitor) return;
      if (visitor.status === 'resolved') { notify('손님의 부탁을 마쳤어요.'); return; }
      setActiveVisitorId(visitor.id);
      if (visitor.status === 'waiting' || visitor.status === 'active') dispatch({ type: 'talkVisitor', visitorId: visitor.id });
      setPanel('visitor');
      return;
    }
    const follower = current.visitors.find(item => item.status === 'escorting');
    if (follower && station === getLibraryBook(follower.bookId)!.categoryId) {
      setActiveVisitorId(follower.id);
      setPanel('visitor-arrival');
      return;
    }
    setPanel(station);
  }, [dispatch, notify]);
  const inspect = (bookId: string) => { dispatch({ type: 'inspectBook', bookId }); setSelectedId(bookId); setSelectedSlot(null); };
  const reset = () => {
    const next = createLibrarySession({ ...setupConfig, seed: Date.now(), startedAt: Date.now(), sessionId: undefined });
    setSetupConfig({ ...next.config, supportMode: next.supportMode, seed: next.seed, startedAt: next.startedAt, sessionId: next.sessionId });
    sessionRef.current = next; setSession(next); setActiveVisitorId('visitor'); setRating(0); setShelvedReport(null); setHandoffReport(null); setNavigationRequest(undefined); close(); setRoomVisit(v => v + 1);
  };
  const changeSetup = (config: LibrarySessionConfig) => {
    if (sessionRef.current.phase !== 'briefing') return;
    const next = createLibrarySession(config);
    setSetupConfig(config); sessionRef.current = next; setSession(next); setActiveVisitorId('visitor');
  };
  const startShift = () => { dispatch({ type: 'acceptTask' }); close(); notify(session.visitors.length ? '근무 시작! 기다리는 손님의 부탁을 들어봐요.' : '근무 시작! 반납 카트에서 책을 가져와요.'); };
  const switchMode = (next: 'joystick' | 'touch') => { setMode(next); onControlModeChange?.(next); };
  const openNotebook = () => { notebookReturn.current = panel === 'report' ? 'report' : null; dispatch({ type: 'useSupport', support: 'notebook' }); setSelectedId(null); setPanel('notebook'); };
  const visitor = session.visitors.find(item => item.id === activeVisitorId);
  const visitorBook = visitor ? getLibraryBook(visitor.bookId)! : null;
  const visitorName = session.visitors.length > 1 ? `손님 ${activeVisitorId === 'visitor' ? 1 : 2}` : '이용자';
  const follower = session.visitors.find(item => item.status === 'escorting');
  const reportVisitor = session.visitors.find(item => item.status === 'awaiting-report');
  const waitingVisitor = session.visitors.find(item => item.status === 'waiting' || item.status === 'active');
  const shelvingVisitor = session.visitors.find(item => item.status === 'awaiting-shelve');
  let target: LibraryStation | null = null;
  if (follower) target = getLibraryBook(follower.bookId)!.categoryId;
  else if (session.supportMode === 'guided') {
    if (session.phase === 'briefing') target = 'librarian';
    else if (progress.canReport) target = 'librarian';
    else if (labelsToAsk.length) target = 'librarian';
    else if (readyForHandoff.length) target = 'handoff';
    else if (reportVisitor) target = reportVisitor.id;
    else if (waitingVisitor) target = waitingVisitor.id;
    else if (progress.onCart && carried.length === 0) target = 'cart';
  }
  const objective = session.phase === 'briefing' ? '사서에게 업무 받기'
    : follower ? `손님과 ${getLibraryCategory(getLibraryBook(follower.bookId)!.categoryId).callRange} 서가로 가기`
      : progress.canReport ? '사서에게 완료 보고하기'
      : labelsToAsk.length ? '라벨이 없는 책 물어보기'
        : readyForHandoff.length ? '확인함에 책 놓기'
          : reportVisitor ? '손님에게 책 정리를 마쳤다고 알리기'
            : waitingVisitor ? '이용자의 부탁 확인하기'
              : shelvingVisitor ? '손님이 맡긴 책 정리하기'
                : progress.onCart && carried.length === 0 ? '반납된 책 확인하기' : progress.misplaced ? '책의 라벨과 서가 확인하기' : '책을 제자리에 꽂기';
  const shelfId = LIBRARY_CATEGORIES.find(category => category.id === panel)?.id ?? null;
  const askAboutLabel = () => {
    for (const book of labelsToAsk) dispatch({ type: 'askLibrarian', bookId: book.bookId });
    if (labelsToAsk.length) setReply('라벨이 없는 책은 옆의 확인함에 놓아 주세요.\n라벨은 제가 다시 붙일게요.');
  };
  const placeBook = (bookId: string, slot?: LibraryShelfSlot) => {
    if (!shelfId) return false;
    const before = sessionRef.current.books.find(book => book.bookId === bookId);
    const next = dispatch({ type: 'placeBook', bookId, shelfId, slot });
    if (!next.lastActionError) {
      setSelectedId(null); setSelectedSlot(null);
      const correct = getLibraryBook(bookId)!.categoryId === shelfId;
      const owner = next.visitors.find(item => item.bookId === bookId && item.status === 'awaiting-report');
      const nextProgress = getLibraryProgress(next);
      notify(correct ? owner ? '부탁받은 책 정리 완료! 손님에게 알려 주세요.'
        : nextProgress.remaining === 0 ? nextProgress.canReport ? '책 정리 완료! 사서에게 보고하러 가요.' : '책 정리 완료! 손님의 부탁도 마무리해요.'
          : before?.needsCorrection ? '제자리를 찾았어요! 다시 확인해서 고쳤어요.'
            : nextProgress.carried === 0 && nextProgress.onCart > 0 ? '한 묶음 정리 완료! 카트에서 다음 책을 가져와요.'
              : `번호 순서에 맞게 꽂았어요 · ${nextProgress.correctlyShelved + nextProgress.handedOff}/${nextProgress.total}권`
        : '다른 분류의 서가예요. 방금 꽂은 책을 다시 꺼내 확인해요.', correct);
      return correct;
    }
    return false;
  };
  const sayThanks = (action: LibraryAction) => { const next = dispatch(action); if (!next.lastActionError) setReply('알려 주셔서 고마워요.'); };

  return <Animated.View testID="library-simulation" style={[s.root, { opacity: entrance }]}>
    <LibraryRoom key={roomVisit} locked={locked} controlMode={controlMode} visitors={session.visitors} visitorInteractionEnabled={session.phase === 'working'} target={target} navigationRequest={navigationRequest} onInteract={open} reduceMotion={reduceMotion} />
    {!visible && !present && <>
      <GameHud onTravel={onTravel} busRouteContext={{ currentStop: 'library', direction: 'inbound' }} controlMode={controlMode} dailyQuests={[]} onControlModeChange={switchMode} onEmergencyExit={() => { setNavigationRequest(undefined); setRoomVisit(v => v + 1); notify('출입문 앞으로 이동했어요.'); }} onExit={() => setPanel('exit')} onMenuVisibilityChange={setExternalMenu} onOpenInventory={() => { setSelectedId(null); setPanel('bag'); }} onOpenNotebook={openNotebook} />
      {!externalMenu && <View pointerEvents="box-none" style={[s.taskAnchor, { top: viewportWidth >= 1000 ? Math.max(26, (insets?.top ?? 0) + 12) : Math.max(106, (insets?.top ?? 0) + 62) }]}>
        <PressScale accessibilityRole="button" accessibilityLabel={target && controlMode === 'touch' ? `${objective} 장소로 이동` : '도서관 업무 수첩 열기'} onPress={() => target && controlMode === 'touch' ? setNavigationRequest({ id: Date.now(), station: target }) : openNotebook()} style={s.taskCard}>
          <View style={s.taskIcon}><Ionicons name={progress.canReport ? 'checkmark' : 'book'} color="#698166" size={24} /></View><View style={{ flex: 1, gap: 3 }}><Text style={s.taskTitle}>하늘도서관</Text><Text style={s.taskText}>{objective}</Text>
            {session.phase === 'working' ? <View style={s.shiftProgress} accessible accessibilityLabel={`책 정리 ${progress.correctlyShelved + progress.handedOff}권 중 전체 ${progress.total}권${progress.visitorsTotal ? `, 손님 부탁 ${progress.visitorsResolved}명 중 전체 ${progress.visitorsTotal}명` : ''}`}><View style={s.progressTrack}><View style={[s.progressFill, { width: `${100 * (progress.correctlyShelved + progress.handedOff) / progress.total}%` }]} /></View>{progress.visitorsTotal ? <Text style={s.guestProgress}>손님 {progress.visitorsResolved}/{progress.visitorsTotal}</Text> : null}</View> : null}
          </View>
          {session.phase === 'working' ? <Text style={s.taskCount}>{progress.correctlyShelved + progress.handedOff}<Text style={s.taskCountTotal}> / {progress.total}</Text></Text> : null}<Ionicons name={target && controlMode === 'touch' ? 'navigate' : 'journal-outline'} color="#85917B" size={20} />
        </PressScale>
      </View>}
    </>}

    <MarketPanelTransition visible={visible} transitionKey={session.phase === 'finished' ? 'library-result' : `${panel}`} onPresenceChange={setPresent}>
      {panel === 'setup' && session.phase === 'briefing' ? <LibrarySetupPanel config={setupConfig} onChange={changeSetup} onClose={() => setPanel('librarian')} onStart={startShift} /> : null}
      {panel === 'librarian' && session.phase !== 'finished' ? <MarketStaffDialogue name="사서" message={session.phase === 'briefing' ? `반납 처리된 책 ${progress.total}권을 정리해 주세요.\n책등의 번호를 보고 서가를 찾아요.\n라벨이 안 보이면 저에게 물어보세요.` : '어떤 도움이 필요한가요?'} response={reply}>
        {reply ? <MarketStaffDialogueChoice text="네, 알겠습니다" onPress={close} /> : session.phase === 'briefing' ? <>
          <View style={s.modeRow}>{(['guided', 'independent'] as const).map(value => <PressScale key={value} accessibilityRole="button" accessibilityLabel={value === 'guided' ? '안내와 함께' : '혼자 해보기'} accessibilityState={{ selected: session.supportMode === value }} onPress={() => changeSetup({ ...setupConfig, supportMode: value })} style={[s.modeButton, session.supportMode === value && s.modeSelected]}><Text style={[s.modeText, session.supportMode === value && { color: '#FFFDF4' }]}>{value === 'guided' ? '안내와 함께' : '혼자 해보기'}</Text></PressScale>)}</View>
          <MarketStaffDialogueChoice text="시작할게요" onPress={startShift} />
          <MarketStaffDialogueChoice text="근무 설정 바꾸기" onPress={() => setPanel('setup')} />
          <MarketStaffDialogueChoice text="잠시 후에 올게요" onPress={close} />
        </> : <>
          {labelsToAsk.length ? <MarketStaffDialogueChoice text="이 책의 라벨이 안 보여요" onPress={askAboutLabel} /> : null}
          <MarketStaffDialogueChoice text="정리를 마쳤어요" onPress={() => { setShelvedReport(null); setHandoffReport(null); setPanel('report'); }} />
          <MarketStaffDialogueChoice text="할 일을 다시 알려 주세요" onPress={() => { dispatch({ type: 'useSupport', support: 'repeat-instructions' }); setReply('카트의 책을 서가 표시와 맞춰 꽂아 주세요.\n라벨이 없는 책은 저에게 확인하고,\n끝나면 정리한 권수를 알려 주세요.'); }} />
          <MarketStaffDialogueChoice text="계속 정리할게요" onPress={close} />
        </>}
      </MarketStaffDialogue> : null}

      {panel === 'visitor' && visitor && visitorBook && session.phase === 'working' ? <MarketStaffDialogue name={visitorName} message={visitor.status === 'escorting' ? `「${visitorBook.title}」이 있는\n서가까지 같이 가 주시겠어요?` : visitor.status === 'awaiting-report' ? '맡긴 책은 제자리에 꽂아 주셨나요?' : visitor.status === 'awaiting-shelve' ? `맡긴 「${visitorBook.title}」은\n다 정리되었나요?` : visitor.requestType === 'shelve' ? `여기서 읽던 「${visitorBook.title}」이에요.\n이 책 대신 꽂아주실 수 있나요?` : `저기요, 「${visitorBook.title}」을\n찾고 있어요. 어디에 있나요?`} response={reply}>
        {reply ? <MarketStaffDialogueChoice text="네, 편하게 둘러보세요" onPress={close} /> : visitor.status === 'escorting' ? <MarketStaffDialogueChoice text="같이 가요" onPress={close} /> : visitor.status === 'awaiting-report' ? <MarketStaffDialogueChoice text="책을 제자리에 꽂았어요" onPress={() => { const next = dispatch({ type: 'finishVisitorShelving', visitorId: visitor.id }); if (!next.lastActionError) setReply('고맙습니다. 덕분에 편하게 이용했어요!'); }} /> : visitor.status === 'awaiting-shelve' ? <MarketStaffDialogueChoice text="정리하고 다시 알려드릴게요" onPress={close} /> : <>
          {visitor.requestType === 'find' ? <MarketStaffDialogueChoice text="책 위치를 확인해 볼게요" onPress={() => { const next = dispatch({ type: 'lookupVisitor', visitorId: visitor.id }); if (!next.lastActionError) setPanel('visitor-search'); }} /> : <MarketStaffDialogueChoice text="네, 책을 확인해 볼게요" onPress={() => setPanel('visitor-book')} />}
          <MarketStaffDialogueChoice text="사서 선생님께 안내해 드릴게요" onPress={() => sayThanks({ type: 'referVisitor', visitorId: visitor.id })} />
          <MarketStaffDialogueChoice text="잠시만 기다려 주세요" onPress={close} />
        </>}
      </MarketStaffDialogue> : null}

      {panel === 'visitor-book' && visitor && visitorBook && session.phase === 'working' ? <LibraryPanel title="손님이 맡기는 책" onClose={() => setPanel('visitor')} testID="library-visitor-book" footer={<LibraryButton icon="hand-left-outline" onPress={() => {
        const next = dispatch({ type: 'acceptVisitorBook', visitorId: visitor.id });
        if (!next.lastActionError) { notify('책을 받았어요. 정리한 뒤 손님에게 알려 주세요.'); close(); }
      }}>책 받아서 꽂아드리기</LibraryButton>}>
        <View style={s.searchBook}><LibraryBookArt book={visitorBook} height={128} /><View style={{ flex: 1, gap: 10 }}><Text style={s.bookHeading}>{visitorBook.title}</Text><Text style={s.description}>청구기호</Text><Text style={s.callText}>{visitorBook.callNumber}</Text></View></View>
      </LibraryPanel> : null}

      {panel === 'visitor-search' && visitor && visitorBook && session.phase === 'working' ? <LibraryPanel title="책 위치 확인" onClose={() => setPanel('visitor')} testID="library-visitor-search">
        <View style={s.searchBook} testID="library-visitor-book-details"><LibraryBookArt book={visitorBook} height={128} /><View style={{ flex: 1, gap: 10 }}><Text style={s.bookHeading}>{visitorBook.title}</Text><Text style={s.description}>청구기호</Text><Text style={s.callText}>{visitorBook.callNumber}</Text></View></View>
        <Text style={s.sectionTitle}>어느 서가로 안내할까요?</Text>
        <View style={{ gap: 9 }}>{LIBRARY_CATEGORIES.map(category => <LibraryButton key={category.id} secondary icon={category.icon} onPress={() => { const next = dispatch({ type: 'guideVisitor', visitorId: visitor.id, shelfId: category.id }); if (!next.lastActionError) { setReply(''); setPanel('visitor'); } }}>{`${category.callRange} 서가에 있어요`}</LibraryButton>)}</View>
      </LibraryPanel> : null}

      {panel === 'visitor-arrival' && visitor && visitorBook && session.phase === 'working' ? <MarketStaffDialogue name={visitorName} message={`「${visitorBook.title}」,\n이 서가에서 찾으면 될까요?`} response={reply}>
        {reply ? <MarketStaffDialogueChoice text="네, 편하게 둘러보세요" onPress={close} /> : <>
          <MarketStaffDialogueChoice text="여기에서 찾으실 수 있어요" onPress={() => {
            const next = dispatch({ type: 'finishVisitorGuide', visitorId: visitor.id, shelfId: visitorBook.categoryId });
            if (!next.lastActionError) setReply('고맙습니다. 덕분에 찾았어요!');
          }} />
          <MarketStaffDialogueChoice text="잠시만요" onPress={close} />
        </>}
      </MarketStaffDialogue> : null}

      {(panel === 'cart' || panel === 'bag') && session.phase !== 'finished' ? <LibraryPanel title={panel === 'cart' ? '반납 도서' : '가지고 있는 책'} subtitle={panel === 'cart' ? '반납 처리 완료' : `${carried.length}권`} onClose={close} footer={panel === 'cart' && cartBatch.length > 0 ? <LibraryButton icon="bag-handle-outline" onPress={() => {
        const next = dispatch({ type: 'collectAll' }); setSelectedId(null);
        if (!next.lastActionError) notify(`${cartBatch.length}권을 가져왔어요.`);
        close();
      }}>책 가져오기</LibraryButton> : undefined} testID="library-book-panel">
        <LibraryBookGrid books={panel === 'cart' ? cartBatch : carried} onSelect={inspect} selectedId={selectedId} />
        {(panel === 'cart' ? cartBatch.length : carried.length) === 0 ? <View style={s.empty}><Ionicons name="checkmark-circle-outline" size={43} color="#89977C" /><Text style={s.description}>{panel === 'cart' ? (progress.onCart ? '가지고 있는 책을 정리하고 다음 책을 가져와요.' : '카트의 책을 모두 가져왔어요.') : '가지고 있는 책이 없어요.'}</Text></View> : null}
        {selected && (selected.location === 'carried' || selected.location === 'return-cart') ? <View style={s.detail}>
          <Text style={s.bookHeading}>{getLibraryBook(selected.bookId)!.title}</Text>
          <PressScale accessibilityRole="button" accessibilityLabel="책등 라벨 확대" onPress={() => { dispatch({ type: 'useSupport', support: 'label-zoom', bookId: selected.bookId }); notify(selected.damagedLabel ? '라벨이 벗겨져 있어요. 사서에게 물어보세요.' : getLibraryBook(selected.bookId)!.callNumber, !selected.damagedLabel); }}>
            <LibraryBookLabel book={getLibraryBook(selected.bookId)!} damaged={selected.damagedLabel} showCategory={selected.source !== 'visitor'} large />
          </PressScale>
          {selected.damagedLabel ? <Text style={s.detailHelp}>{selected.librarianAsked ? '사서가 확인함에 놓아 달라고 했어요.' : '라벨이 벗겨져 있어요. 사서에게 물어보세요.'}</Text> : null}
        </View> : null}
      </LibraryPanel> : null}

      {shelfId && session.phase !== 'finished' ? <LibraryPanel title={`${getLibraryCategory(shelfId).label} 서가`} onClose={close} testID="library-shelf-panel" scrollToTopKey={selectedId}>
        <LibraryShelfWork categoryId={shelfId} carried={carried} shelved={session.books.filter(b => b.location === 'shelf' && b.shelfId === shelfId)} selectedId={selectedId} selectedSlot={selectedSlot} onSelectSlot={setSelectedSlot} onSelect={inspect} onPlace={placeBook} showOrderHelp={!session.events.some(event => event.type === 'shelf_order_checked' && event.payload.correct)} onTake={id => { const next = dispatch({ type: 'takeBook', bookId: id }); if (!next.lastActionError) { setSelectedId(id); setSelectedSlot(null); notify('책을 다시 꺼냈어요.'); } }} selectedControls={selected?.location === 'carried' ? <View testID="library-shelf-selection" style={s.shelfSelection}>
          <View style={s.selectedBookPreview}><LibraryBookArt book={getLibraryBook(selected.bookId)!} height={52} /><Text style={s.selectedBookTitle}>{getLibraryBook(selected.bookId)!.title}</Text><Text style={s.selectedBookNumber}>{selected.damagedLabel ? '?' : getLibraryBook(selected.bookId)!.callNumber.split('\n')[0]}</Text></View>
          {selected.damagedLabel ? <Text style={s.detailHelp}>{selected.librarianAsked ? '이 책은 사서 옆 확인함에 놓아요.' : '라벨이 안 보여요. 사서에게 물어보세요.'}</Text> : null}
          {session.lastActionError ? <Text testID="library-shelf-feedback" accessibilityLiveRegion="polite" style={s.detailHelp}>양옆 책의 번호를 다시 비교해요.</Text> : null}
          <LibraryButton disabled={selectedSlot === null || selected.damagedLabel} onPress={() => selectedSlot !== null && placeBook(selected.bookId, selectedSlot)} icon="arrow-up">이 서가에 꽂기</LibraryButton>
        </View> : undefined} />
      </LibraryPanel> : null}

      {panel === 'handoff' && session.phase !== 'finished' ? <LibraryPanel title="담당자 확인함" onClose={close} footer={handoffBooks.length ? <LibraryButton disabled={readyForHandoff.length === 0} onPress={() => {
        for (const book of readyForHandoff) dispatch({ type: 'handoffBook', bookId: book.bookId });
        if (readyForHandoff.length) { notify('확인할 책을 전달했어요.'); close(); }
      }}>확인함에 놓기</LibraryButton> : undefined}>
        <Image source={libraryArt.returnBox} resizeMode="contain" style={s.boxArt} />
        {progress.handedOff > 0 ? <View style={s.successLine}><Ionicons name="checkmark-circle" size={23} color="#718B63" /><Text style={s.description}>사서에게 확인할 책 {progress.handedOff}권</Text></View> : null}
        <Text style={s.centerText}>{readyForHandoff.length ? '라벨을 확인할 책을 놓아 주세요.' : '사서에게 확인한 책을 놓는 곳이에요.'}</Text>
        {handoffBooks.map(book => <View key={book.bookId} style={s.handoffBook}><LibraryBookArt book={getLibraryBook(book.bookId)!} height={108} /><Text style={s.bookHeading}>{getLibraryBook(book.bookId)!.title}</Text></View>)}
      </LibraryPanel> : null}

      {panel === 'notebook' && session.phase !== 'finished' ? <LibraryPanel title="업무 수첩" onClose={() => { setSelectedId(null); setPanel(notebookReturn.current); notebookReturn.current = null; }} testID="library-notebook">
        {onOpenJourney ? <LibraryButton secondary onPress={onOpenJourney}>도서관 다녀오기 · 전체 일정</LibraryButton> : null}
        <View style={{ gap: 10, marginBottom: 18 }}><LibraryButton secondary icon="book-outline" onPress={() => setPanel('guidebook')}>도서 알바 가이드북</LibraryButton><LibraryButton secondary icon="library-outline" onPress={() => { classificationReturn.current = 'notebook'; setPanel('classification'); }}>서가 번호 확인하기</LibraryButton></View>
        {session.phase === 'briefing' ? <View style={{ marginBottom: 18 }}><LibraryButton secondary icon="options-outline" onPress={() => setPanel('setup')}>근무 설정 바꾸기</LibraryButton></View> : null}
        <View style={s.notebookSteps}>
          <TaskRow text="사서에게 업무 받기" done={session.phase !== 'briefing'} />
          <TaskRow text={`책 정리  ${progress.correctlyShelved + progress.handedOff} / ${progress.total}`} done={progress.remaining === 0} />
          {session.visitors.length ? <TaskRow text={`손님 부탁  ${session.visitors.filter(item => item.status === 'resolved').length} / ${session.visitors.length}`} done={progress.visitorResolved} /> : null}
          <TaskRow text="완료 보고" done={false} />
        </View>
        {session.visitors.filter(item => item.status !== 'waiting').map((item) => {
          const book = getLibraryBook(item.bookId)!;
          const accepted = item.status === 'awaiting-shelve' || item.status === 'awaiting-report';
          return <View key={item.id} style={s.visitorNote} testID={item.id === 'visitor' ? 'library-visitor-note' : 'library-visitor-note-2'}>
            <LibraryBookArt book={book} height={78} />
            <View style={{ flex: 1, gap: 5 }}><Text style={s.visitorNoteTitle}>{session.visitors.length > 1 ? `손님 ${item.id === 'visitor' ? 1 : 2} · ` : ''}{item.requestType === 'find' ? '손님이 찾는 책' : '대신 꽂아드릴 책'}</Text><Text style={s.visitorNoteBook}>{book.title}</Text>
              {item.lookupUsed || accepted ? <Text style={s.visitorNoteLocation}>{`청구기호 ${book.callNumber.replace('\n', ' ')}`}</Text> : null}
              {item.status === 'escorting' ? <><Text style={s.visitorNoteLocation}>{`${getLibraryCategory(book.categoryId).callRange} 서가로 안내 중`}</Text><Text style={s.visitorNoteLocation}>서가 앞에서 이용하기를 눌러 안내해요.</Text></> : null}
              {item.status === 'awaiting-shelve' ? <Text style={s.visitorNoteLocation}>책을 정리한 뒤 손님에게 알려 주세요.</Text> : null}
              {item.status === 'awaiting-report' ? <Text style={s.visitorNoteLocation}>정리 완료 · 손님에게 알려 주세요.</Text> : null}
              {item.status === 'resolved' ? <Text style={s.visitorNoteLocation}>부탁 완료</Text> : null}
            </View>
          </View>;
        })}
        {session.phase === 'working' ? <><Text style={s.sectionTitle}>맡은 책</Text><LibraryBookGrid books={session.books} showStatus onSelect={inspect} selectedId={selectedId} />
          {selected ? <View style={s.detail}><Text style={s.bookHeading}>{getLibraryBook(selected.bookId)!.title}</Text><LibraryBookLabel book={getLibraryBook(selected.bookId)!} damaged={selected.damagedLabel} showCategory={selected.source !== 'visitor'} large />
            <Text style={s.centerText}>{selected.location === 'handoff' ? '확인함에 전달했어요.' : selected.damagedLabel ? selected.librarianAsked ? '확인함에 놓아 주세요.' : '사서에게 라벨을 물어보세요.' : selected.source === 'visitor' || (selected.location === 'shelf' && selected.shelfId !== getLibraryBook(selected.bookId)!.categoryId) ? '책의 청구기호와 서가 번호를 비교해 보세요.' : `${getLibraryCategory(getLibraryBook(selected.bookId)!.categoryId).label} 서가에서 정리해요.`}</Text></View> : null}</> : null}
      </LibraryPanel> : null}

      {panel === 'catalog' && session.phase !== 'finished' ? <LibraryCatalogPanel session={session} onClose={close} /> : null}
      {panel === 'guidebook' && session.phase !== 'finished' ? <LibraryGuidebookPanel page={guidePage} onPageChange={setGuidePage} onClose={() => setPanel('notebook')} onClassification={() => { classificationReturn.current = 'guidebook'; setPanel('classification'); }} /> : null}
      {panel === 'classification' && session.phase !== 'finished' ? <LibraryPanel title="서가 번호" subtitle="한국십진분류법 · KDC" onClose={() => setPanel(classificationReturn.current)}>
        <View style={s.classExample}><Text style={s.classExampleNumber}>480 → 400 자연과학</Text><Text style={s.description}>책등의 분류번호와 서가 번호를 맞춰요.</Text></View>
        <View style={{ gap: 13 }}>{LIBRARY_KDC_DIRECTORY.map(category => <View key={category.code} style={s.classRow}>
          <Text style={s.classCode}>{category.code}</Text><View style={{ flex: 1 }}><Text style={s.className}>{category.label}</Text><Text style={s.classExamples}>{category.examples}</Text></View>
        </View>)}</View>
        <Text style={s.classFootnote}>000부터 900까지 모든 서가를 이용할 수 있어요. 맡은 책의 분류번호와 서가 번호를 맞춰요. 세부 순서는 분류번호, 도서기호 순으로 확인해요.</Text>
      </LibraryPanel> : null}

      {panel === 'report' && session.phase !== 'finished' ? <LibraryPanel title="근무 보고" onClose={close} footer={<LibraryButton disabled={shelvedReport === null || handoffReport === null} onPress={() => {
        const next = dispatch({ type: 'report', shelvedCount: shelvedReport!, handedOffCount: handoffReport! });
        if (next.phase === 'finished') { setPanel(null); setToast(null); }
      }}>이렇게 보고하기</LibraryButton>} testID="library-report">
        <Text style={s.reportIntro}>어떻게 정리했나요?</Text>
        <CountChoice label="서가에 꽂은 책" values={[Math.max(0, progress.total - 2), Math.max(0, progress.total - 1), progress.total]} selected={shelvedReport} onChange={setShelvedReport} />
        <CountChoice label="확인함에 놓은 책" values={[0, 1, 2]} selected={handoffReport} onChange={setHandoffReport} />
        <PressScale accessibilityRole="button" onPress={openNotebook} style={s.noteLink}><Ionicons name="journal-outline" color={C.green} size={21} /><Text style={s.noteLinkText}>업무 수첩 확인</Text></PressScale>
      </LibraryPanel> : null}

      {panel === 'exit' && session.phase !== 'finished' ? <LibraryPanel title="도서관에서 나갈까요?" onClose={close} footer={<><LibraryButton onPress={close}>계속 근무하기</LibraryButton><LibraryButton secondary onPress={onExit}>밖으로 나가기</LibraryButton></>}>
        {session.phase === 'working' ? <Text style={s.centerText}>{resumeOnReturn ? '잠시 나갔다 와도 지금 정리하던 책부터 이어서 할 수 있어요.' : '지금 나가면 이번 근무를 마쳐요.\n다음에는 새 책으로 시작해요.'}</Text> : <Image source={libraryArt.cart} resizeMode="contain" style={{ height: 135, width: 125, alignSelf: 'center' }} />}
      </LibraryPanel> : null}

      {session.phase === 'finished' && result ? <LibraryPanel title="근무 완료" onClose={onExit} testID="library-result" footer={<>
        <View style={s.ratingDock} testID="library-result-rating"><Text style={s.ratingTitle}>이번 근무는 어땠나요?</Text><View style={s.stars}>{[1, 2, 3, 4, 5].map(value => <PressScale key={value} accessibilityRole="button" accessibilityLabel={`만족도 ${value}점`} accessibilityState={{ selected: value === rating }} onPress={() => { setRating(value); rateLibraryEpisode(session.sessionId, value); }} style={s.star}><Ionicons name="star" size={33} color={value <= rating ? '#D5AF58' : '#DFDACA'} /></PressScale>)}</View></View>
        <LibraryButton onPress={onExit}>밖으로 나가기</LibraryButton><LibraryButton secondary onPress={reset}>한 번 더 근무하기</LibraryButton>
      </>}>
        <View style={[s.resultHero, compactResult && s.resultHeroCompact]}><View style={[s.resultStamp, compactResult && s.resultStampCompact]}><Ionicons name="checkmark" size={compactResult ? 38 : 51} color="#5F805F" /></View><Text style={[s.resultHeadline, compactResult && s.resultHeadlineCompact]}>맡은 책 {result.total}권, 정리 끝!</Text></View>
        <View style={[s.stampRow, compactResult && s.stampRowCompact]} testID="library-shift-stamps"><ShiftStamp compact={compactResult} icon="library" label="책 정리 완료" />{result.visitorsResolved > 0 ? <ShiftStamp compact={compactResult} icon="happy" label="손님 부탁 완료" /> : null}<ShiftStamp compact={compactResult} icon="ribbon" label="보고 완료" /></View>
        <View style={[s.resultColumns, compactResult && s.resultColumnsCompact]}><View style={s.resultStat}><Text style={s.statNumber}>{result.correctlyShelved}<Text style={s.statUnit}>권</Text></Text><Text style={s.statLabel}>서가에 정리</Text></View><View style={s.resultStat}><Text style={s.statNumber}>{result.handedOff}<Text style={s.statUnit}>권</Text></Text><Text style={s.statLabel}>담당자에게 전달</Text></View></View>
        <View style={s.resultLines}>
          {result.visitorsGuided > 0 ? <ResultLine icon="chatbubble-ellipses-outline" text={result.visitorsGuided === 1 ? '이용자에게 책 위치를 안내했어요.' : `손님 ${result.visitorsGuided}명에게 책 위치를 안내했어요.`} /> : null}
          {result.visitorsShelved > 0 ? <ResultLine icon="book-outline" text={`손님이 맡긴 책 ${result.visitorsShelved}권을 정리하고 알려드렸어요.`} /> : null}
          {result.visitorsReferred > 0 ? <ResultLine icon="person-outline" text={result.visitorsReferred === 1 ? '이용자를 사서에게 안내했어요.' : `손님 ${result.visitorsReferred}명을 사서에게 안내했어요.`} /> : null}
          {result.corrections > 0 ? <ResultLine icon="refresh" text={`잘못 꽂은 책을 ${result.corrections}번 고쳤어요.`} /> : <ResultLine icon="checkmark-circle-outline" text="책의 라벨과 서가를 맞췄어요." />}
          {result.handedOff > 0 ? <ResultLine icon="person-outline" text={`라벨이 없는 책 ${result.handedOff}권을 사서에게 확인했어요.`} /> : null}
        </View>
      </LibraryPanel> : null}
    </MarketPanelTransition>
    {toast ? <LibraryToast message={toast.message} positive={toast.positive} /> : null}
  </Animated.View>;
}
function TaskRow({ text, done }: { text: string; done: boolean }) { return <View style={s.taskRow}><Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={25} color={done ? '#6D8763' : '#B8BBAA'} /><Text style={s.taskRowText}>{text}</Text></View>; }
function CountChoice({ label, values, selected, onChange }: { label: string; values: number[]; selected: number | null; onChange: (n: number) => void }) { return <View style={s.countChoice}><Text style={s.sectionTitle}>{label}</Text><View style={s.countRow}>{values.map(value => <PressScale key={value} accessibilityRole="button" accessibilityLabel={`${label} ${value}권`} accessibilityState={{ selected: selected === value }} onPress={() => onChange(value)} style={[s.countButton, selected === value && s.countSelected]}><Text style={[s.countText, selected === value && { color: '#FCF8EA' }]}>{value}권</Text></PressScale>)}</View></View>; }
function ResultLine({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) { return <View style={s.resultLine}><Ionicons name={icon} size={22} color="#7C8C6C" /><Text style={s.resultLineText}>{text}</Text></View>; }
function ShiftStamp({ icon, label, compact = false }: { icon: keyof typeof Ionicons.glyphMap; label: string; compact?: boolean }) { return <View style={s.shiftStamp}><View style={[s.shiftStampCircle, compact && s.shiftStampCircleCompact]}><Ionicons name={icon} size={compact ? 23 : 27} color="#6B8159" /></View><Text style={s.shiftStampText}>{label}</Text></View>; }
const s = StyleSheet.create({
  resultHeroCompact: { gap: 8, paddingBottom: 14 }, resultStampCompact: { width: 60, height: 60, borderRadius: 30 }, resultHeadlineCompact: { fontSize: 22, lineHeight: 30 }, stampRowCompact: { paddingBottom: 16 }, shiftStampCircleCompact: { width: 42, height: 42, borderRadius: 21 }, resultColumnsCompact: { paddingVertical: 12 },
  ratingDock: { paddingTop: 2, paddingBottom: 2, flexShrink: 0 },
  shelfSelection: { marginTop: 13, gap: 8, padding: 11, backgroundColor: '#ECEFDF', borderRadius: 15 }, selectedBookPreview: { flexDirection: 'row', alignItems: 'center', gap: 10 }, selectedBookTitle: { flex: 1, fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, color: C.ink }, selectedBookNumber: { fontFamily: fonts.bold, fontSize: 23, color: '#526744', backgroundColor: '#FFFDF3', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 7 },
  shiftProgress: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }, progressTrack: { flex: 1, height: 6, borderRadius: 4, backgroundColor: '#E0E5D4', overflow: 'hidden' }, progressFill: { height: '100%', borderRadius: 4, backgroundColor: '#829A6E' }, guestProgress: { fontFamily: fonts.semibold, fontSize: 12, color: '#738063' }, slotPrompt: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 22, color: '#758069', textAlign: 'center' }, stampRow: { flexDirection: 'row', gap: 9, justifyContent: 'center', paddingBottom: 21 }, shiftStamp: { flex: 1, alignItems: 'center', gap: 8 }, shiftStampCircle: { height: 52, width: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E6EBD7' }, shiftStampText: { fontFamily: fonts.bold, fontSize: 14, color: '#6B785D', textAlign: 'center' },
  visitorNote: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 15, marginTop: 16, backgroundColor: '#E9EDDF', borderRadius: 18 }, visitorNoteTitle: { fontFamily: fonts.bold, fontSize: 16, color: C.green }, visitorNoteBook: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 25, color: C.ink }, visitorNoteLocation: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 23, color: C.muted },
  classExample: { backgroundColor: '#E9EDDD', borderRadius: 16, padding: 16, gap: 7, marginBottom: 20 }, classExampleNumber: { fontFamily: fonts.bold, fontSize: 22, color: C.green }, classRow: { flexDirection: 'row', gap: 18, alignItems: 'center', minHeight: 48 }, classCode: { fontFamily: fonts.laundryBold, fontSize: 23, color: '#697D60', width: 52 }, className: { fontFamily: fonts.bold, fontSize: 18, color: C.ink }, classExamples: { fontFamily: fonts.regular, fontSize: 15, color: C.muted, marginTop: 3 }, classFootnote: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 23, color: C.muted, marginTop: 22 },
  root: { flex: 1, backgroundColor: '#E9DFCA' }, taskAnchor: { position: 'absolute', left: 16, right: 16, alignItems: 'center', zIndex: 25 }, taskCard: { width: '100%', maxWidth: 440, backgroundColor: '#FCF9F0F5', borderRadius: 19, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 11 }, taskIcon: { backgroundColor: '#E6EBD9', borderRadius: 14, height: 44, width: 44, alignItems: 'center', justifyContent: 'center' }, taskTitle: { fontFamily: fonts.laundryBold, color: C.ink, fontSize: 19, lineHeight: 25 }, taskText: { fontFamily: fonts.medium, color: '#74816D', fontSize: 14, lineHeight: 20 }, taskCount: { fontFamily: fonts.bold, color: C.green, fontSize: 25 }, taskCountTotal: { fontSize: 17, color: '#9CA58D' },
  modeRow: { flexDirection: 'row', gap: 8 }, modeButton: { flex: 1, backgroundColor: '#F5F1E3', paddingVertical: 14, alignItems: 'center', justifyContent: 'center', borderRadius: 21 }, modeSelected: { backgroundColor: '#667D5F' }, modeText: { fontFamily: fonts.cafe24Ssurround, color: '#5C6752', fontSize: 15 },
  detail: { backgroundColor: '#EEEDDF', borderRadius: 18, padding: 17, marginTop: 12, alignItems: 'center' }, bookHeading: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 28, color: C.ink, textAlign: 'center' }, detailHelp: { fontFamily: fonts.medium, color: '#8A7257', fontSize: 16, lineHeight: 24, textAlign: 'center' }, empty: { paddingVertical: 30, alignItems: 'center', gap: 15 }, description: { fontFamily: fonts.medium, color: C.muted, fontSize: 17, lineHeight: 25 }, centerText: { fontFamily: fonts.medium, color: C.ink, fontSize: 17, lineHeight: 28, textAlign: 'center', marginVertical: 12 }, boxArt: { width: '100%', height: 150, marginBottom: 12 }, successLine: { alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, paddingVertical: 20 }, handoffBook: { flexDirection: 'row', alignItems: 'center', gap: 16, justifyContent: 'center', flexWrap: 'wrap' },
  notebookSteps: { backgroundColor: '#EFEDDF', borderRadius: 19, padding: 18, gap: 17 }, taskRow: { flexDirection: 'row', alignItems: 'center', gap: 11 }, taskRowText: { fontFamily: fonts.semibold, color: C.ink, fontSize: 18, lineHeight: 25 }, sectionTitle: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 26, color: C.ink, marginTop: 20, marginBottom: 10 }, searchBook: { flexDirection: 'row', backgroundColor: '#EFECDD', padding: 16, borderRadius: 20, alignItems: 'center', gap: 15 }, callText: { fontFamily: fonts.bold, fontSize: 21, color: '#697C5C' },
  reportIntro: { fontFamily: fonts.medium, color: C.muted, fontSize: 18, lineHeight: 28 }, countChoice: { marginBottom: 10 }, countRow: { flexDirection: 'row', gap: 10 }, countButton: { flex: 1, minHeight: 65, borderRadius: 17, backgroundColor: '#EAE9D9', justifyContent: 'center', alignItems: 'center' }, countSelected: { backgroundColor: '#667E5C' }, countText: { fontFamily: fonts.laundryBold, fontSize: 23, color: '#69725D' }, noteLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, marginTop: 8 }, noteLinkText: { fontFamily: fonts.semibold, color: C.green, fontSize: 16 },
  resultHero: { alignItems: 'center', gap: 15, paddingBottom: 22 }, resultStamp: { width: 83, height: 83, borderRadius: 45, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E2E9D3' }, resultHeadline: { fontFamily: fonts.laundryBold, color: '#55694E', fontSize: 25, lineHeight: 34, textAlign: 'center' }, resultColumns: { flexDirection: 'row', backgroundColor: '#EEECDC', borderRadius: 19, paddingVertical: 21 }, resultStat: { flex: 1, alignItems: 'center', gap: 7 }, statNumber: { fontFamily: fonts.laundryBold, color: '#56744E', fontSize: 37 }, statUnit: { fontSize: 18 }, statLabel: { fontFamily: fonts.semibold, color: '#78826A', fontSize: 15 }, resultLines: { gap: 15, paddingVertical: 23 }, resultLine: { flexDirection: 'row', gap: 10, alignItems: 'center' }, resultLineText: { flex: 1, fontFamily: fonts.medium, color: C.ink, fontSize: 16, lineHeight: 24 }, ratingTitle: { textAlign: 'center', fontFamily: fonts.semibold, color: '#7F846D', fontSize: 16 }, stars: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 9, gap: 4 }, star: { padding: 5, minHeight: 44 },
});
