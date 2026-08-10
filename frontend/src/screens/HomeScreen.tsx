import { useState } from 'react';
import {
  Image,
  ImageSourcePropType,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { icons, images } from '../assets';
import { PressScale } from '../components/PressScale';
import { StickyBrandHeader } from '../components/ui';
import { colors, fonts } from '../theme';

const todoItems = ['떡볶이 먹기', '레몬즙 구매', '청년미래적금 넣기', '신나게 춤추기', '4시에 친구 만나기', '삼겹살 구매하기'];
const questItems = ['혼자 버스 타기', '마트에서 장보기', '카페에서 주문하기', '도움 요청 연습', '용돈 계획 세우기', '오늘의 대화 연습'];
const practices = [
  { background: '#E8F7FF', category: '대중교통', icon: icons.bus, title: '혼자 버스 타기', xp: '20XP' },
  { background: '#FFF3DC', category: '일상생활', icon: icons.mart, title: '마트에서 장보기', xp: '30XP' },
  { background: '#EAFBEF', category: '경제생활', icon: icons.money, title: '용돈 계획 세우기', xp: '이미 연습함' },
];
const news = [
  { image: images.newsCity, title: '하늘이 보고 싶어\n도심 전경 모음집', source: 'Picstudio' },
  { image: images.newsClassroom, title: '외국어가 배우고 싶은\n당신을 위해', source: '서울교육지원청' },
  { image: images.newsSupport, title: '부담가지지 말고\n지원 신청하자!', source: '발달장애인지원센터' },
  { image: images.newsSeed, title: '한그루의 씨앗 심기\n왜 중요할까요?', source: '라떼는 말이야' },
];

export function HomeScreen({ onQuest }: { onQuest: () => void }) {
  const [listType, setListType] = useState<'todo' | 'quest'>('todo');
  const [todoChecked, setTodoChecked] = useState<boolean[]>(Array(6).fill(false));
  const [questChecked, setQuestChecked] = useState<boolean[]>(Array(6).fill(false));
  const items = listType === 'todo' ? todoItems : questItems;
  const checked = listType === 'todo' ? todoChecked : questChecked;

  const toggle = (index: number) => {
    const update = (current: boolean[]) => current.map((value, i) => (i === index ? !value : value));
    if (listType === 'todo') setTodoChecked(update);
    else setQuestChecked(update);
  };

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} stickyHeaderIndices={[0]}>
      <StickyBrandHeader horizontalPadding={20} />
      <Text style={styles.streak}>연속 학습 117일!</Text>
      <Text style={styles.greeting}>진욱님,{'\n'}오늘도 함께 해 볼까요?</Text>

      <View style={styles.listArea}>
        <View style={styles.listCard}>
          <View style={styles.checkGrid}>
            {items.map((item, index) => (
              <PressScale
                accessibilityRole="checkbox"
                accessibilityState={{ checked: checked[index] }}
                key={item}
                onPress={() => toggle(index)}
                style={styles.checkItem}
              >
                <View style={[styles.checkCircle, checked[index] && styles.checkCircleDone]} />
                <Text numberOfLines={1} style={[styles.checkText, checked[index] && styles.checkTextDone]}>{item}</Text>
              </PressScale>
            ))}
          </View>
        </View>
        <View style={styles.segment}>
          <PressScale onPress={() => setListType('todo')} style={[styles.segmentButton, listType === 'todo' && styles.segmentSelected]}>
            <Text style={[styles.segmentText, listType === 'todo' && styles.segmentSelectedText]}>할 일</Text>
          </PressScale>
          <PressScale onPress={() => setListType('quest')} style={[styles.segmentButton, listType === 'quest' && styles.segmentSelected]}>
            <Text style={[styles.segmentText, listType === 'quest' && styles.segmentSelectedText]}>퀘스트</Text>
          </PressScale>
        </View>
      </View>

      <Text style={styles.sectionTitle}>오늘의 연습</Text>
      <ScrollView contentContainerStyle={styles.horizontalContent} horizontal showsHorizontalScrollIndicator={false} style={styles.edgeScroll}>
        {practices.map((item) => <PracticeCard key={item.title} {...item} onPress={onQuest} />)}
      </ScrollView>

      <Text style={styles.sectionTitle}>새로운 소식</Text>
      <ScrollView contentContainerStyle={styles.horizontalContent} horizontal showsHorizontalScrollIndicator={false} style={styles.edgeScroll}>
        {news.map((item) => (
          <View key={item.title} style={styles.newsCard}>
            <Image resizeMode="cover" source={item.image} style={styles.newsImage} />
            <Text style={styles.newsTitle}>{item.title}</Text>
            <Text style={styles.newsSource}>{item.source}</Text>
          </View>
        ))}
      </ScrollView>
      <View style={styles.bottomSpace} />
    </ScrollView>
  );
}

function PracticeCard({
  background,
  category,
  icon,
  title,
  xp,
  onPress,
}: {
  background: string;
  category: string;
  icon: ImageSourcePropType;
  title: string;
  xp: string;
  onPress: () => void;
}) {
  return (
    <PressScale onPress={onPress} style={[styles.practiceCard, { backgroundColor: background }]}>
      <Image resizeMode="contain" source={icon} style={styles.practiceIcon} />
      <Text style={styles.practiceCategory}>{category}</Text>
      <Text style={styles.practiceTitle}>{title}</Text>
      <Text style={styles.practiceXp}>{xp}</Text>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  content: { alignSelf: 'center', maxWidth: 720, paddingHorizontal: 20, width: '100%' },
  streak: { color: colors.mint, fontFamily: fonts.semibold, fontSize: 12, marginTop: 12 },
  greeting: { color: colors.ink, fontFamily: fonts.laundryBold, fontSize: 24, letterSpacing: -0.8, lineHeight: 32, marginTop: 4 },
  listArea: { marginTop: 27, paddingTop: 20, position: 'relative' },
  listCard: { backgroundColor: colors.white, borderColor: '#EEEEEE', borderRadius: 20, borderWidth: 1.5, minHeight: 166, paddingBottom: 13, paddingHorizontal: 20, paddingTop: 47, shadowColor: '#000', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 2 },
  segment: { alignSelf: 'center', backgroundColor: colors.white, borderColor: '#EEEEEE', borderRadius: 100, borderWidth: 2, flexDirection: 'row', height: 48, overflow: 'hidden', padding: 4, position: 'absolute', top: 0, width: 245, zIndex: 3 },
  segmentButton: { alignItems: 'center', borderRadius: 100, flex: 1, justifyContent: 'center' },
  segmentSelected: { backgroundColor: '#34BFFF' },
  segmentText: { color: '#AAAAAA', fontFamily: fonts.laundry, fontSize: 16 },
  segmentSelectedText: { color: colors.white },
  checkGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 },
  checkItem: { alignItems: 'center', flexBasis: '50%', flexDirection: 'row', height: 22 },
  checkCircle: { backgroundColor: '#EEEEEE', borderRadius: 10, height: 20, marginRight: 8, width: 20 },
  checkCircleDone: { backgroundColor: '#34BFFF' },
  checkText: { color: '#555555', flex: 1, fontFamily: fonts.handwriting, fontSize: 16, lineHeight: 21 },
  checkTextDone: { color: '#AAAAAA', textDecorationLine: 'line-through' },
  sectionTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 18, letterSpacing: -0.45, marginBottom: 8, marginTop: 24 },
  edgeScroll: { marginHorizontal: -20 },
  horizontalContent: { gap: 9, paddingHorizontal: 20 },
  practiceCard: { borderRadius: 20, height: 180, overflow: 'hidden', paddingBottom: 17, paddingHorizontal: 13, paddingTop: 2, width: 140 },
  practiceIcon: { alignSelf: 'center', height: 100, width: 108 },
  practiceCategory: { color: '#77A785', fontFamily: fonts.semibold, fontSize: 13, lineHeight: 17 },
  practiceTitle: { color: '#222222', fontFamily: fonts.bold, fontSize: 17, letterSpacing: -0.4, lineHeight: 21, marginTop: 4 },
  practiceXp: { color: '#555555', fontFamily: fonts.handwriting, fontSize: 14, lineHeight: 17, marginTop: 3 },
  newsCard: { height: 224, width: 140 },
  newsImage: { borderRadius: 20, height: 144, width: 140 },
  newsTitle: { color: '#222222', fontFamily: fonts.bold, fontSize: 16, letterSpacing: -0.4, lineHeight: 20, marginLeft: 4, marginTop: 10 },
  newsSource: { color: '#222222', fontFamily: fonts.handwriting, fontSize: 12, marginLeft: 6, marginTop: 4 },
  bottomSpace: { height: 112 },
});
