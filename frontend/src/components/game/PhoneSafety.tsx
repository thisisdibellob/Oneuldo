import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';
import {
  PHISHING_SCENARIOS, canCompletePhishingSession, getPhishingFacts, getPhishingGoal,
  type PhishingScenarioId, type PhishingSession, type PhishingVerificationMethod,
} from '../../game/phishingSession';
import { dispatchPhishingAction, startPhishingEpisode, usePhishingSession } from '../../game/phishingStore';
import { villageNpcArt } from '../../game/villageNpcArt';
import { fonts } from '../../theme';
import { PressScale } from '../PressScale';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
type Page = 'main' | 'history' | 'help' | 'recovery' | 'episodes' | 'support';
type Exposure = 'information' | 'money';
const METHOD_COPY: Record<PhishingVerificationMethod, { title: string; detail: string; icon: IconName }> = {
  'saved-contact': { title: '저장된 민수에게 전화', detail: '원래 연락처로 확인해요', icon: 'call-outline' },
  'in-person': { title: '마을에서 민수 만나기', detail: '직접 만나 물어봐요', icon: 'walk-outline' },
  'official-contact': { title: '공식 연락처로 확인', detail: '연락받은 번호 대신 직접 찾아요', icon: 'business-outline' },
  'order-history': { title: '주문한 곳에서 확인', detail: '문자 링크 대신 주문 내역을 열어요', icon: 'cube-outline' },
};

/** A local phone episode. Every apparent call, message and report stays inside the game. */
export function PhoneSafety({ reduceMotion, onVisitMinsu, initialHelp = false }: { reduceMotion: boolean; onVisitMinsu?: () => void; initialHelp?: boolean }) {
  const session = usePhishingSession();
  const [page, setPage] = useState<Page>(initialHelp ? 'help' : 'main');
  const previousSessionId = useRef(session?.id);
  const [exposureChoice, setExposureChoice] = useState<Exposure | null>(null);
  const [supportResponse, setSupportResponse] = useState<'report' | 'bank'>('report');
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (previousSessionId.current === session?.id) return;
    previousSessionId.current = session?.id;
    setPage('main'); setExposureChoice(null);
  }, [session?.id]);
  useEffect(() => {
    opacity.stopAnimation();
    if (reduceMotion) { opacity.setValue(1); return; }
    opacity.setValue(0.35);
    const animation = Animated.timing(opacity, { toValue: 1, duration: 170, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [opacity, page, reduceMotion, session?.contactEnded, session?.verification, session?.status]);
  const go = (next: Page) => { setExposureChoice(null); setPage(next); };
  const start = (id: PhishingScenarioId) => { startPhishingEpisode(id); go('main'); };
  const stop = () => { dispatchPhishingAction({ type: 'STOP' }); go('main'); };
  const help = () => { dispatchPhishingAction({ type: 'ASK_HELP' }); go('help'); };
  const contactSupport = (kind: 'report' | 'bank') => {
    setSupportResponse(kind); go('support');
  };
  const verify = (method: PhishingVerificationMethod) => {
    if (method === 'in-person') { dispatchPhishingAction({ type: 'STOP' }); onVisitMinsu?.(); return; }
    dispatchPhishingAction({ type: 'VERIFY', method }); go('main');
  };
  const button = (label: string, onPress: () => void, icon: IconName, primary = false) =>
    <SafetyButton key={label} label={label} onPress={onPress} icon={icon} primary={primary} reduceMotion={reduceMotion} />;

  if (!session) return <View style={s.root} testID="phone-safety">
    <View style={s.welcomeArt}><View style={s.smallBubble}><Ionicons name="chatbubble-ellipses" size={30} color="#62816B" /></View><Image source={villageNpcArt.minsu} style={s.welcomeMinsu} resizeMode="contain" /></View>
    <Text accessibilityRole="header" style={s.welcomeTitle}>민수에게 온 연락</Text>
    <Text style={s.body}>친구의 연락이 도착했어요.{`\n`}어떤 이야기인지 확인해 볼까요?</Text>
    <View style={s.practiceNote}><Ionicons name="game-controller-outline" size={19} color="#7F8C78" /><Text style={s.noteText}>게임 속 연락입니다.{`\n`}실제 전화·송금은 하지 않아요.</Text></View>
    {button('연락 확인하기', () => start('friend-scam'), 'chatbubble-ellipses-outline', true)}
  </View>;

  const scenario = PHISHING_SCENARIOS[session.scenarioId];
  const supportSent = supportResponse === 'report' ? session.reported : session.bankContacted;
  const contactDescription = session.scenarioId.startsWith('friend') ? '민수라고 한 사람에게' : session.scenarioId === 'authority' ? '수사기관이라고 한 사람에게' : '택배 안내를 보낸 사람에게';
  if (page === 'episodes') return <View style={s.root} testID="phone-safety-episodes">
    <Text accessibilityRole="header" style={s.sectionTitle}>다음 연락</Text><Text style={s.body}>살펴볼 연락을 골라 주세요.</Text>
    {(['authority', 'parcel', 'friend-real'] as const).filter(id => id !== session.scenarioId).map(id => <EpisodeCard key={id} id={id} reduceMotion={reduceMotion} onPress={() => start(id)} />)}
    {session.scenarioId !== 'friend-scam' ? <EpisodeCard id="friend-scam" reduceMotion={reduceMotion} onPress={() => start('friend-scam')} /> : null}
    {button('결과로 돌아가기', () => go('main'), 'arrow-back-outline')}
  </View>;

  if (session.status === 'completed') return <Animated.View style={[s.root, { opacity }]} testID="phone-safety-result">
    <View style={s.resultSeal}><Ionicons name="checkmark" size={36} color="#FAFCF3" /></View>
    <Text accessibilityRole="header" style={s.welcomeTitle}>확인하고 결정했어요</Text>
    <Text style={s.resultSubtitle}>{scenario.title}</Text>
    <View style={s.facts}>{getPhishingFacts(session).map(fact => <View key={fact} style={s.fact}><Ionicons name="checkmark-circle" size={20} color="#78916B" /><Text style={s.factText}>{fact}</Text></View>)}</View>
    <Text style={s.resultNote}>도움이 필요할 때 멈추고 물어봐도 괜찮아요.</Text>
    {button('다른 연락 살펴보기', () => go('episodes'), 'chatbubbles-outline', true)}
  </Animated.View>;

  return <Animated.View style={[s.root, { opacity }]} testID="phone-safety">
    <View style={s.episodeHeading}><View style={s.episodeDot} /><Text style={s.episodeTitle}>{scenario.title}</Text><Text style={s.practiceBadge}>연습</Text></View>
    {page !== 'main' ? button('연락으로 돌아가기', () => go('main'), 'chevron-back') : null}
    {page === 'support' ? <>
      <View style={s.supportIcon}><Ionicons name={supportResponse === 'report' ? 'shield-checkmark-outline' : 'business-outline'} size={31} color="#708868" /></View>
      <Text accessibilityRole="header" style={s.welcomeTitle}>{supportResponse === 'report' ? '112에 상황 알리기' : '금융회사에 도움 요청'}</Text>
      <Text style={s.supportLabel}>게임 속 상담</Text>
      {!supportSent ? <Text style={s.noteText}>알릴 내용</Text> : null}
      <View style={s.outgoingBubble}><Text style={s.messageText}>{supportResponse === 'report'
        ? session.exposure === 'money' ? `${contactDescription} 게임 속 돈을 보냈어요. 받은 연락과 상황을 신고하고 싶어요.` : session.exposure === 'information' ? `${contactDescription} 게임 속 개인정보를 알려줬어요. 받은 연락과 상황을 신고하고 싶어요.` : `${contactDescription} 사칭 연락을 받았어요. 연락 내용을 신고하고 싶어요.`
        : session.exposure === 'money' ? '사기로 게임 속 돈을 보냈어요. 지급정지를 요청하고 싶어요.' : '게임 속 개인정보를 알려줬어요. 계좌를 보호하려면 어떻게 해야 하나요?'}</Text></View>
      {supportSent ? <><View style={s.incomingBubble}><Text style={s.messageText}>{supportResponse === 'report'
        ? '상황을 확인했어요. 추가로 돈이나 정보를 보내지 마세요. 받은 문자와 대화 내용은 지우지 말고 남겨 주세요.'
        : session.exposure === 'money' ? '송금 내역을 확인하고 지급정지 가능 여부를 살펴볼게요. 돈을 돌려받을 수 있는지는 상황에 따라 달라요.' : '어떤 정보를 알려줬는지 확인하고, 필요한 계좌 보호 조치를 안내할게요.'}</Text></View>
        {button('연락 확인 계속하기', () => go('main'), 'arrow-forward-outline', true)}</>
        : button(supportResponse === 'report' ? '받은 연락과 상황 알리기' : session.exposure === 'money' ? '지급정지 요청하기' : '정보 노출 알리고 도움 요청', () => dispatchPhishingAction({ type: supportResponse === 'report' ? 'REPORT' : 'CONTACT_BANK' }), 'send-outline', true)}
    </> : page === 'help' ? <>
      <View style={s.helper}><View style={s.helperPortrait}><Image source={villageNpcArt.jiyoung} style={s.helperImage} resizeMode="contain" /></View><Text style={s.helperName}>지영</Text></View>
      <View style={s.incomingBubble}><Text style={s.messageText}>{scenario.helpText}</Text></View>
      {button(session.contactEnded ? '확인 방법 살펴보기' : '연락을 멈추고 확인하기', stop, 'search-outline', true)}
    </> : page === 'recovery' ? <>
      <Text accessibilityRole="header" style={s.sectionTitle}>이미 응했다면</Text>
      {exposureChoice ? <>
        <View style={s.recoveryCard}><Ionicons name="hand-left-outline" size={27} color="#9F805B" /><Text style={s.body}>{exposureChoice === 'money' ? '이미 돈을 보낸 상황으로 연습할까요?' : '이미 개인정보를 알려준 상황으로 연습할까요?'}</Text><Text style={s.noteText}>실제 돈과 개인정보는 사용하지 않아요.</Text></View>
        {button('이 상황으로 연습하기', () => { dispatchPhishingAction({ type: 'SIMULATE_EXPOSURE', exposure: exposureChoice }); go('main'); }, 'arrow-forward-outline', true)}
        {button('돌아가기', () => setExposureChoice(null), 'arrow-back-outline')}
      </> : <>
        <Text style={s.body}>뒤늦게 의심이 들 때도 도움을 받을 수 있어요. 연습할 상황을 골라 주세요.</Text>
        {button('개인정보를 알려준 상황', () => setExposureChoice('information'), 'person-outline')}
        {button('돈을 보낸 상황', () => setExposureChoice('money'), 'card-outline')}
      </>}
    </> : page === 'history' ? <Conversation session={session} /> : <>
      <View style={s.goal}><Ionicons name={session.contactEnded ? 'search-outline' : 'chatbubble-outline'} size={21} color="#6A856C" /><Text style={s.goalText}>{session.contactEnded ? getPhishingGoal(session) : '도착한 연락을 살펴보세요'}</Text></View>
      {!session.contactEnded ? <>
        <Conversation session={session} />
        {session.exposure !== 'none' ? <View style={s.recoveryHint}><Text style={s.body}>이미 {session.exposure === 'money' ? '돈을 보낸' : '정보를 알려준'} 상황이에요. 연락을 멈추고 도움을 요청해요.</Text></View> : null}
        <View style={s.actions}>
          {button(scenario.channel === 'call' ? '전화를 끊고 확인하기' : '답장을 멈추고 확인하기', stop, 'hand-left-outline', true)}
          {!session.replied && session.exposure === 'none' ? button(scenario.channel === 'call' ? '무슨 일인지 더 듣기' : '무슨 일인지 물어보기', () => dispatchPhishingAction({ type: 'REPLY' }), 'chatbubble-ellipses-outline') : null}
          {button('지영에게 물어보기', help, 'people-outline')}
        </View>
        {session.exposure === 'none' && session.scenarioId !== 'friend-real' ? <PressScale accessibilityRole="button" accessibilityLabel="이미 응했다면 연습" scaleTo={reduceMotion ? 1 : 0.98} onPress={() => go('recovery')} style={s.disclosure}><Text style={s.disclosureText}>이미 응했다면</Text><Ionicons name="chevron-forward" size={16} color="#8D9687" /></PressScale> : null}
      </> : <>
        <View style={s.contactEnded}><Ionicons name="pause-circle-outline" size={18} color="#7D8979" /><Text style={s.contactEndedText}>연락을 멈췄어요</Text><PressScale accessibilityRole="button" accessibilityLabel="받은 연락 다시 보기" onPress={() => go('history')} scaleTo={reduceMotion ? 1 : 0.98} style={s.historyButton}><Text style={s.historyButtonText}>내용 보기</Text></PressScale></View>
        {session.exposure !== 'none' && (!session.reported || !session.bankContacted) ? <>
          <Text accessibilityRole="header" style={s.sectionTitle}>지금 도움 요청하기</Text>
          <Text style={s.body}>확인을 기다리지 않고 도움을 요청할 수 있어요.</Text>
          {!session.reported ? button('112에 피해 알리기 · 연습', () => contactSupport('report'), 'shield-checkmark-outline', true) : <Done label="112에 상황을 알렸어요" />}
          {!session.bankContacted ? button('금융회사에 도움 요청 · 연습', () => contactSupport('bank'), 'business-outline') : <Done label="금융회사에 도움을 요청했어요" />}
          <Text style={s.noteText}>{session.exposure === 'money' ? '송금했다면 금융회사에 지급정지를 요청해요. 돈을 돌려받을 수 있는지는 상황에 따라 달라요.' : '정보를 알려줬다면 금융회사에도 알려 계좌 보호 방법을 확인해요.'}</Text>
        </> : session.verification ? <>
          <View style={s.verifiedCard}><View style={s.verifiedHeading}><Ionicons name="checkmark-circle-outline" size={22} color="#66836B" /><Text style={s.verifiedTitle}>따로 확인한 내용</Text></View><Text style={s.body}>{session.verification.text}</Text></View>
          {session.verification.verdict === 'genuine' ? <>
            {!session.genuineDecision ? <>
              {button('약속 잡기', () => dispatchPhishingAction({ type: 'GENUINE_DECISION', decision: 'accept' }), 'checkmark-outline', true)}
              {button('이번에는 어려워요', () => dispatchPhishingAction({ type: 'GENUINE_DECISION', decision: 'decline' }), 'chatbubble-outline')}
            </> : <Done label={session.genuineDecision === 'accept' ? '직접 확인한 뒤 약속을 정했어요' : '직접 확인한 뒤 이번 약속은 사양했어요'} />}
          </> : <>
            {!session.blocked ? button('이 연락 차단하기', () => dispatchPhishingAction({ type: 'BLOCK' }), 'ban-outline', true) : <Done label="의심스러운 연락을 차단했어요" />}
            {!session.reported ? button('연락 내용 신고하기 · 연습', () => contactSupport('report'), 'shield-checkmark-outline') : <Done label="연락 내용을 신고했어요" />}
          </>}
          {canCompletePhishingSession(session) ? button('확인 마치기', () => dispatchPhishingAction({ type: 'FINISH' }), 'checkmark-circle-outline', true) : null}
        </> : <>
          <Text accessibilityRole="header" style={s.sectionTitle}>어디에서 확인할까요?</Text>
          {scenario.verificationMethods.filter(method => method !== 'in-person' || onVisitMinsu).map(method => <PressScale key={method} accessibilityRole="button" accessibilityLabel={METHOD_COPY[method].title} onPress={() => verify(method)} scaleTo={reduceMotion ? 1 : 0.98} style={s.methodCard}>
            <View style={s.methodIcon}><Ionicons name={METHOD_COPY[method].icon} size={23} color="#6F896D" /></View><View style={s.methodCopy}><Text style={s.buttonText}>{METHOD_COPY[method].title}</Text><Text style={s.methodDetail}>{METHOD_COPY[method].detail}</Text></View><Ionicons name="chevron-forward" size={18} color="#8F9C87" />
          </PressScale>)}
          {button('지영에게 물어보기', help, 'people-outline')}
        </>}
      </>}
    </>}
  </Animated.View>;
}

function Conversation({ session }: { session: PhishingSession }) {
  const scenario = PHISHING_SCENARIOS[session.scenarioId];
  return <View style={s.conversation} testID="safety-conversation">
    <View style={s.senderRow}><View style={s.senderIcon}><Ionicons name={scenario.channel === 'call' ? 'call-outline' : 'person-outline'} size={22} color="#89927F" /></View><View style={s.senderCopy}><Text style={s.senderName}>{session.scenarioId.startsWith('friend') ? '민수' : scenario.sender}</Text><Text style={s.senderNote}>{session.scenarioId.startsWith('friend') ? '저장되지 않은 번호' : scenario.channel === 'call' ? '걸려 온 전화' : '받은 연락'}</Text></View></View>
    {scenario.initialMessages.map((message, index) => <View key={index} style={s.incomingBubble}><Text style={s.messageText}>{message}</Text></View>)}
    {session.replied ? <><View style={s.outgoingBubble}><Text style={s.messageText}>{session.scenarioId.startsWith('friend') ? '무슨 일이야?' : '어떤 일인지 알려 주세요.'}</Text></View><View style={s.incomingBubble}><Text style={s.messageText}>{scenario.followUp}</Text></View></> : null}
  </View>;
}
function SafetyButton({ label, onPress, icon, primary, reduceMotion }: { label: string; onPress: () => void; icon: IconName; primary?: boolean; reduceMotion: boolean }) {
  return <PressScale accessibilityRole="button" accessibilityLabel={label} onPress={onPress} scaleTo={reduceMotion ? 1 : 0.98} style={[s.button, primary && s.primaryButton]}>
    <Ionicons name={icon} size={21} color={primary ? '#F8F8EC' : '#71866D'} /><Text style={[s.buttonText, primary && s.primaryButtonText]}>{label}</Text>
  </PressScale>;
}
function Done({ label }: { label: string }) { return <View style={s.done}><Ionicons name="checkmark-circle" size={20} color="#76916E" /><Text style={s.doneText}>{label}</Text></View>; }
function EpisodeCard({ id, onPress, reduceMotion }: { id: PhishingScenarioId; onPress: () => void; reduceMotion: boolean }) {
  const scenario = PHISHING_SCENARIOS[id];
  return <PressScale accessibilityRole="button" accessibilityLabel={`${scenario.title} 시작`} onPress={onPress} scaleTo={reduceMotion ? 1 : 0.98} style={s.methodCard}><View style={s.methodIcon}><Ionicons name={id === 'parcel' ? 'cube-outline' : id === 'authority' ? 'call-outline' : 'chatbubbles-outline'} size={25} color="#6F896D" /></View><View style={s.methodCopy}><Text style={s.buttonText}>{scenario.title}</Text><Text style={s.methodDetail}>{scenario.subtitle}</Text></View><Ionicons name="chevron-forward" size={18} color="#8F9C87" /></PressScale>;
}

const s = StyleSheet.create({
  root: { gap: 12, paddingHorizontal: 14, paddingTop: 5, paddingBottom: 20 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 25, color: '#52604F' },
  sectionTitle: { fontFamily: fonts.laundryBold, fontSize: 21, lineHeight: 29, color: '#405342', marginTop: 4 },
  welcomeArt: { height: 124, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  welcomeMinsu: { height: 120, width: 92 }, smallBubble: { position: 'absolute', left: '62%', top: 6, width: 52, height: 47, borderRadius: 18, borderBottomLeftRadius: 5, backgroundColor: '#E1EAD6', alignItems: 'center', justifyContent: 'center' },
  welcomeTitle: { fontFamily: fonts.laundryBold, fontSize: 25, lineHeight: 34, color: '#415741', textAlign: 'center' },
  practiceNote: { flexDirection: 'row', gap: 10, alignItems: 'center', borderRadius: 15, padding: 14, backgroundColor: '#ECEFDF', marginVertical: 3 },
  noteText: { flex: 1, fontFamily: fonts.regular, fontSize: 15, lineHeight: 23, color: '#76816E' },
  episodeHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 }, episodeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#92A681' },
  episodeTitle: { flex: 1, fontFamily: fonts.semibold, fontSize: 16, lineHeight: 23, color: '#6E7E65' }, practiceBadge: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: '#85917B', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8, backgroundColor: '#E9ECDF' },
  goal: { flexDirection: 'row', gap: 9, alignItems: 'center', backgroundColor: '#E7ECDD', borderRadius: 16, padding: 13 }, goalText: { flex: 1, fontFamily: fonts.semibold, fontSize: 16, lineHeight: 24, color: '#5C7255' },
  conversation: { gap: 9 }, senderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 1, marginBottom: 3 }, senderIcon: { height: 42, width: 42, borderRadius: 21, backgroundColor: '#E9E8DB', alignItems: 'center', justifyContent: 'center' }, senderCopy: { flex: 1 }, senderName: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 23, color: '#4E5C49' }, senderNote: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: '#8A9382' },
  incomingBubble: { alignSelf: 'flex-start', maxWidth: '96%', backgroundColor: '#FFFDF4', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 17, borderTopLeftRadius: 5 }, outgoingBubble: { alignSelf: 'flex-end', maxWidth: '93%', backgroundColor: '#DDE8D0', paddingHorizontal: 14, paddingVertical: 11, borderRadius: 17, borderBottomRightRadius: 5 }, messageText: { fontFamily: fonts.regular, fontSize: 17, lineHeight: 26, color: '#485244' },
  actions: { gap: 9, marginTop: 4 }, button: { flexDirection: 'row', gap: 10, minHeight: 51, paddingHorizontal: 13, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: '#E8ECDD' }, primaryButton: { backgroundColor: '#728E6A' }, buttonText: { flexShrink: 1, fontFamily: fonts.semibold, fontSize: 16, lineHeight: 23, color: '#536B4D' }, primaryButtonText: { color: '#FFFFF3' },
  disclosure: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }, disclosureText: { fontFamily: fonts.medium, fontSize: 15, color: '#87927C' },
  contactEnded: { flexDirection: 'row', alignItems: 'center', gap: 6 }, contactEndedText: { flex: 1, fontFamily: fonts.medium, fontSize: 15, color: '#7D8979' }, historyButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 }, historyButtonText: { fontFamily: fonts.medium, fontSize: 15, color: '#6B8264' },
  methodCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, paddingHorizontal: 12, gap: 9, backgroundColor: '#FBFBF0', borderRadius: 17, minHeight: 78 }, methodIcon: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center' }, methodCopy: { flex: 1, gap: 4 }, methodDetail: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: '#839079' },
  helper: { alignItems: 'center', gap: 7, marginTop: 2 }, helperPortrait: { width: 76, height: 81, borderRadius: 29, overflow: 'hidden', backgroundColor: '#E8E8D8', alignItems: 'center' }, helperImage: { width: 82, height: 121, marginTop: 5 }, helperName: { fontFamily: fonts.laundryBold, fontSize: 20, color: '#5E7156' },
  supportIcon: { alignSelf: 'center', width: 66, height: 62, borderRadius: 23, backgroundColor: '#E4EBD7', alignItems: 'center', justifyContent: 'center', marginTop: 5 }, supportLabel: { alignSelf: 'center', fontFamily: fonts.medium, fontSize: 15, color: '#8A957D' },
  recoveryCard: { padding: 16, gap: 12, alignItems: 'flex-start', borderRadius: 17, backgroundColor: '#F0EADC' }, recoveryHint: { padding: 12, borderRadius: 14, backgroundColor: '#F0EADC' },
  verifiedCard: { backgroundColor: '#F9FBF0', borderRadius: 17, padding: 15, gap: 10 }, verifiedHeading: { flexDirection: 'row', alignItems: 'center', gap: 7 }, verifiedTitle: { fontFamily: fonts.semibold, fontSize: 16, color: '#66836B' }, done: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 8 }, doneText: { flex: 1, fontFamily: fonts.medium, fontSize: 16, lineHeight: 24, color: '#6F8364' },
  resultSeal: { width: 65, height: 65, borderRadius: 25, backgroundColor: '#86A076', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: 9, marginBottom: 3, transform: [{ rotate: '-5deg' }] }, resultSubtitle: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 24, color: '#85927B', textAlign: 'center' }, facts: { gap: 11, borderRadius: 18, backgroundColor: '#FAFBF1', padding: 16, marginVertical: 5 }, fact: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 }, factText: { flex: 1, fontFamily: fonts.regular, fontSize: 16, lineHeight: 24, color: '#5E7056' }, resultNote: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 23, color: '#87927D', textAlign: 'center', marginBottom: 4 },
});
