import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { images } from '../assets';
import { PressScale } from '../components/PressScale';
import { BrandHeader } from '../components/ui';
import { colors, fonts } from '../theme';

type Friend = '구름이' | '루나';
type Message = { id: number; role: 'user' | 'friend'; text: string };

const friendData = {
  구름이: { image: images.cloudy, description: '부드러운 성격으로 당신과 함께하고 싶어 해요!' },
  루나: { image: images.luna, description: '항상 보듬어주는 친구. 누구나 차분하게 만들어요.' },
};

export function AiScreen() {
  const { width } = useWindowDimensions();
  const [friend, setFriend] = useState<Friend>('구름이');
  const [draftFriend, setDraftFriend] = useState<Friend>('구름이');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingCount, setTypingCount] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [smartnessOpen, setSmartnessOpen] = useState(false);
  const [friendOpen, setFriendOpen] = useState(false);
  const [smartness, setSmartness] = useState(55);
  const [reduceMotion, setReduceMotion] = useState(false);
  const characterProgress = useRef(new Animated.Value(0)).current;
  const characterHeight = useRef(new Animated.Value(286)).current;
  const chatReveal = useRef(new Animated.Value(0)).current;
  const friendSlide = useRef(new Animated.Value(width)).current;
  const messageId = useRef(0);
  const chatScroll = useRef<ScrollView>(null);
  const replyTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    return () => {
      replyTimers.current.forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    if (!friendOpen) friendSlide.setValue(width);
  }, [friendOpen, friendSlide, width]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    if (messages.length > 0 || typingCount > 0) {
      requestAnimationFrame(() => chatScroll.current?.scrollToEnd({ animated: true }));
    }
  }, [messages, typingCount]);

  const animateCharacterHeight = (toValue: number) => {
    if (reduceMotion) {
      characterHeight.setValue(toValue);
      return;
    }
    Animated.timing(characterHeight, {
      duration: 280,
      easing: Easing.out(Easing.cubic),
      toValue,
      useNativeDriver: false,
    }).start();
  };

  const openFriend = () => {
    setDraftFriend(friend);
    friendSlide.setValue(width);
    setFriendOpen(true);
    requestAnimationFrame(() => {
      if (reduceMotion) {
        friendSlide.setValue(0);
        return;
      }
      Animated.timing(friendSlide, {
        duration: 260,
        easing: Easing.out(Easing.cubic),
        toValue: 0,
        useNativeDriver: true,
      }).start();
    });
  };

  const closeFriend = (save = false) => {
    if (save) setFriend(draftFriend);
    if (reduceMotion) {
      setFriendOpen(false);
      return;
    }
    Animated.timing(friendSlide, {
      duration: 220,
      easing: Easing.in(Easing.cubic),
      toValue: width,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setFriendOpen(false);
    });
  };

  const sendMessage = () => {
    const text = input.trim();
    if (!text) return;
    const firstMessage = messages.length === 0 && typingCount === 0;
    const respondingFriend = friend;

    messageId.current += 1;
    const userMessage: Message = { id: messageId.current, role: 'user', text };
    setMessages((current) => [...current, userMessage]);
    setTypingCount((current) => current + 1);
    setInput('');
    chatReveal.setValue(firstMessage ? 0 : 0.72);

    const timer = setTimeout(() => {
      messageId.current += 1;
      const reply: Message = {
        id: messageId.current,
        role: 'friend',
        text: `${respondingFriend}가 듣고 있어요. 우리 같이 천천히 생각해 봐요.`,
      };
      setMessages((current) => [...current, reply]);
      setTypingCount((current) => Math.max(0, current - 1));
    }, 500);
    replyTimers.current.push(timer);

    if (reduceMotion) {
      characterProgress.setValue(1);
      characterHeight.setValue(170);
      chatReveal.setValue(1);
      return;
    }

    Animated.timing(chatReveal, {
      delay: firstMessage ? 80 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: false,
    }).start();

    if (firstMessage) {
      Animated.spring(characterProgress, {
        damping: 18,
        mass: 0.82,
        stiffness: 145,
        toValue: 1,
        useNativeDriver: true,
      }).start();
      Animated.timing(characterHeight, {
        duration: 340,
        easing: Easing.out(Easing.cubic),
        toValue: 170,
        useNativeDriver: false,
      }).start();
    }
  };

  const characterTransform = {
    transform: [
      { translateY: characterProgress.interpolate({ inputRange: [0, 1], outputRange: [0, -10] }) },
      { scale: characterProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.68] }) },
    ],
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0} style={styles.root}>
      <TouchableWithoutFeedback accessible={false} onPress={Keyboard.dismiss}>
        <View style={styles.content}>
          <BrandHeader />
          <View style={styles.characterArea}>
            <Animated.View style={[styles.characterStage, { height: characterHeight }]}>
              <Animated.View style={[styles.characterMotion, characterTransform]}>
                <Image resizeMode="contain" source={friendData[friend].image} style={styles.character} />
              </Animated.View>
            </Animated.View>
            {messages.length === 0 && typingCount === 0 ? (
              <Text style={styles.hint}>궁금한 게 있으면 뭐든 물어봐.</Text>
            ) : (
              <Animated.View style={[styles.chatReveal, { opacity: chatReveal }]}>
                <ScrollView
                  contentContainerStyle={styles.chatContent}
                  keyboardDismissMode="interactive"
                  keyboardShouldPersistTaps="handled"
                  ref={chatScroll}
                  showsVerticalScrollIndicator={false}
                >
                  {messages.map((message) => (
                    <View key={message.id} style={[styles.bubble, message.role === 'user' ? styles.userBubble : styles.friendBubble]}>
                      <Text style={[styles.bubbleText, message.role === 'user' && styles.userBubbleText]}>{message.text}</Text>
                    </View>
                  ))}
                  {typingCount > 0 ? <TypingIndicator /> : null}
                </ScrollView>
              </Animated.View>
            )}
          </View>

          <View style={styles.controls}>
            <PressScale onPress={() => setSmartnessOpen(true)}><Text style={styles.controlText}>똑똑함 정도</Text></PressScale>
            <PressScale onPress={openFriend}><Text style={styles.controlText}>친구 변경</Text></PressScale>
            <PressScale><Text style={styles.controlText}>대화 기록</Text></PressScale>
          </View>
          <View style={styles.inputWrap}>
            <TextInput
              accessibilityLabel="AI 친구에게 메시지 보내기"
              blurOnSubmit={false}
              onBlur={() => {
                if (messages.length === 0) animateCharacterHeight(286);
              }}
              onChangeText={setInput}
              onFocus={() => animateCharacterHeight(messages.length > 0 ? 170 : 200)}
              onSubmitEditing={sendMessage}
              placeholder="하고 싶은 말을 입력해 보세요!"
              placeholderTextColor="#AAAAAA"
              returnKeyType="send"
              style={styles.input}
              value={input}
            />
            <PressScale accessibilityLabel="메시지 전송" disabled={!input.trim()} hitSlop={10} onPress={sendMessage} style={styles.sendButton}>
              <Ionicons color={input.trim() ? colors.mint : '#D7D7D7'} name="arrow-up-circle" size={28} />
            </PressScale>
          </View>
          <View style={keyboardVisible ? styles.keyboardSpace : styles.navSpace} />
        </View>
      </TouchableWithoutFeedback>

      <Modal animationType="fade" onRequestClose={() => setSmartnessOpen(false)} transparent visible={smartnessOpen}>
        <Pressable onPress={() => setSmartnessOpen(false)} style={styles.transparentOverlay}>
          <Pressable style={styles.smartCard}>
            <Text style={styles.smartTitle}>똑똑한 친구</Text>
            <View style={styles.smartMeta}>
              <Text style={styles.smartMetaText}>Claude Sonnet 5</Text>
              <Text style={styles.smartMetaText}>코인 5개 소모</Text>
            </View>
            <View style={styles.smartLine} />
            <View style={styles.sliderRow}>
              <Text style={styles.speedIcon}>🐢</Text>
              <View style={styles.sliderTrack}>
                <View style={[styles.sliderFill, { width: `${smartness}%` }]} />
                <View style={[styles.sliderKnob, { left: `${smartness - 6}%` }]} />
              </View>
              <Text style={styles.speedIcon}>🏎️</Text>
            </View>
            <View style={styles.sliderDots}>
              {[0, 1, 2, 3, 4].map((dot) => <View key={dot} style={styles.sliderDot} />)}
            </View>
            <View style={styles.sliderButtons}>
              <Pressable onPress={() => setSmartness((value) => Math.max(15, value - 20))} style={styles.sliderHit} />
              <Pressable onPress={() => setSmartness((value) => Math.min(90, value + 20))} style={styles.sliderHit} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal animationType="none" onRequestClose={() => closeFriend()} visible={friendOpen}>
        <Animated.View style={[styles.friendModal, { transform: [{ translateX: friendSlide }] }]}>
          <View style={styles.friendScreen}>
            <View style={styles.friendHeader}>
              <PressScale accessibilityLabel="친구 변경 닫기" hitSlop={12} onPress={() => closeFriend()}>
                <Ionicons color={colors.ink} name="chevron-back" size={28} />
              </PressScale>
              <Text style={styles.friendHeaderTitle}>친구 변경</Text>
              <View style={styles.headerBlank} />
            </View>
            <View style={styles.friendCharacterArea}>
              <Image resizeMode="contain" source={friendData[draftFriend].image} style={styles.friendCharacter} />
            </View>
            <View style={styles.friendInfoCard}>
              <Text style={styles.friendName}>{draftFriend}</Text>
              <Text style={styles.friendDescription}>{friendData[draftFriend].description}</Text>
              <View style={styles.friendDivider} />
              <View style={styles.friendArrows}>
                <PressScale onPress={() => setDraftFriend(draftFriend === '구름이' ? '루나' : '구름이')}>
                  <Ionicons color="#777777" name="chevron-back" size={24} />
                </PressScale>
                <Text style={styles.pageDot}>• ·</Text>
                <PressScale onPress={() => setDraftFriend(draftFriend === '구름이' ? '루나' : '구름이')}>
                  <Ionicons color="#777777" name="chevron-forward" size={24} />
                </PressScale>
              </View>
            </View>
            <PressScale onPress={() => closeFriend(true)} style={styles.friendButton}>
              <Text style={styles.friendButtonText}>이 친구로 정하기</Text>
            </PressScale>
          </View>
        </Animated.View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function TypingIndicator() {
  const dots = useRef([new Animated.Value(0.35), new Animated.Value(0.35), new Animated.Value(0.35)]).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.stagger(
        110,
        dots.map((dot) => Animated.sequence([
          Animated.timing(dot, { duration: 180, toValue: 1, useNativeDriver: true }),
          Animated.timing(dot, { duration: 180, toValue: 0.35, useNativeDriver: true }),
        ])),
      ),
    );
    animation.start();
    return () => animation.stop();
  }, [dots]);

  return (
    <View accessibilityLabel="AI가 답변을 입력 중" style={[styles.bubble, styles.friendBubble, styles.typingBubble]}>
      {dots.map((dot, index) => (
        <Animated.View key={index} style={[styles.typingDot, { opacity: dot, transform: [{ translateY: dot.interpolate({ inputRange: [0.35, 1], outputRange: [1, -2] }) }] }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.white, flex: 1 },
  content: { alignSelf: 'center', flex: 1, maxWidth: 720, paddingHorizontal: 20, width: '100%' },
  characterArea: { alignItems: 'center', flex: 1, minHeight: 0 },
  characterStage: { alignItems: 'center', justifyContent: 'flex-end', width: '100%' },
  characterMotion: { alignItems: 'center', justifyContent: 'flex-end' },
  character: { height: 230, width: 285 },
  hint: { color: '#999999', fontFamily: fonts.handwriting, fontSize: 16, marginTop: 20 },
  chatReveal: { flex: 1, maxWidth: 430, minHeight: 0, width: '100%' },
  chatContent: { gap: 9, paddingBottom: 10, paddingTop: 2 },
  bubble: { borderRadius: 18, maxWidth: '82%', paddingHorizontal: 14, paddingVertical: 10 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: colors.mint, borderBottomRightRadius: 5 },
  friendBubble: { alignSelf: 'flex-start', backgroundColor: '#F4F4F4', borderBottomLeftRadius: 5 },
  bubbleText: { color: colors.ink, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  userBubbleText: { color: colors.white },
  typingBubble: { alignItems: 'center', flexDirection: 'row', gap: 5, height: 38, minWidth: 58 },
  typingDot: { backgroundColor: '#999999', borderRadius: 4, height: 7, width: 7 },
  controls: { alignSelf: 'flex-end', flexDirection: 'row', gap: 24, marginBottom: 12 },
  controlText: { color: '#999999', fontFamily: fonts.handwriting, fontSize: 12 },
  inputWrap: { alignItems: 'center', borderColor: '#E5E5E5', borderRadius: 24, borderWidth: 1, flexDirection: 'row', height: 50, paddingLeft: 20, paddingRight: 8 },
  input: { color: colors.ink, flex: 1, fontFamily: fonts.handwriting, fontSize: 14, padding: 0 },
  sendButton: { alignItems: 'center', height: 34, justifyContent: 'center', width: 34 },
  keyboardSpace: { height: 8 },
  navSpace: { height: 92 },
  transparentOverlay: { backgroundColor: 'rgba(255,255,255,0.72)', flex: 1, justifyContent: 'flex-end', paddingBottom: 190, paddingHorizontal: 20 },
  smartCard: { alignSelf: 'center', backgroundColor: colors.white, borderColor: '#E5E5E5', borderRadius: 22, borderWidth: 1, maxWidth: 430, padding: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 14, width: '100%' },
  smartTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 17, textAlign: 'center' },
  smartMeta: { flexDirection: 'row', justifyContent: 'center', marginTop: 12 },
  smartMetaText: { color: '#777777', fontFamily: fonts.medium, fontSize: 12, marginHorizontal: 13 },
  smartLine: { backgroundColor: '#E5E5E5', height: 1, marginTop: 16 },
  sliderRow: { alignItems: 'center', flexDirection: 'row', gap: 12, marginTop: 14 },
  speedIcon: { fontSize: 20 },
  sliderTrack: { backgroundColor: '#E6E6E6', borderRadius: 4, flex: 1, height: 6, position: 'relative' },
  sliderFill: { backgroundColor: '#0088FF', borderRadius: 4, height: 6 },
  sliderKnob: { backgroundColor: colors.white, borderRadius: 16, height: 26, position: 'absolute', top: -10, width: 38, elevation: 3 },
  sliderDots: { flexDirection: 'row', justifyContent: 'space-evenly', marginHorizontal: 45, marginTop: 7 },
  sliderDot: { backgroundColor: '#D7D7D7', borderRadius: 2, height: 3, width: 3 },
  sliderButtons: { bottom: 12, flexDirection: 'row', left: 40, position: 'absolute', right: 40 },
  sliderHit: { flex: 1, height: 48 },
  friendModal: { backgroundColor: colors.white, flex: 1 },
  friendScreen: { alignSelf: 'center', backgroundColor: colors.white, flex: 1, maxWidth: 430, paddingHorizontal: 20, width: '100%' },
  friendHeader: { alignItems: 'center', flexDirection: 'row', height: 74, justifyContent: 'space-between', paddingTop: 16 },
  friendHeaderTitle: { color: colors.ink, fontFamily: fonts.medium, fontSize: 16 },
  headerBlank: { width: 28 },
  friendCharacterArea: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  friendCharacter: { height: 230, width: 280 },
  friendInfoCard: { borderColor: '#E5E5E5', borderRadius: 20, borderWidth: 1, padding: 18 },
  friendName: { color: colors.ink, fontFamily: fonts.bold, fontSize: 17, textAlign: 'center' },
  friendDescription: { color: '#777777', fontFamily: fonts.medium, fontSize: 11, marginTop: 10, textAlign: 'center' },
  friendDivider: { backgroundColor: '#E5E5E5', height: 1, marginTop: 18 },
  friendArrows: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingTop: 12 },
  pageDot: { color: '#777777', fontFamily: fonts.bold, fontSize: 14 },
  friendButton: { alignItems: 'center', backgroundColor: colors.mint, borderRadius: 19, height: 56, justifyContent: 'center', marginBottom: 42, marginTop: 24 },
  friendButtonText: { color: colors.white, fontFamily: fonts.bold, fontSize: 16 },
});
