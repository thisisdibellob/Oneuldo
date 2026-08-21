import { Platform } from 'react-native';

export const colors = {
  mint: '#00BA85',
  brightMint: '#43DE84',
  mintSoft: '#D3FFE5',
  blue: '#5383EC',
  blueSoft: '#EAF2FF',
  yellow: '#FEE500',
  peach: '#FFBFA6',
  ink: '#111111',
  text: '#252525',
  muted: '#999999',
  sage: '#76957F',
  line: '#EEEEEE',
  soft: '#F7F7F7',
  white: '#FFFFFF',
  danger: '#FF6969',
};

export const fonts = {
  regular: 'Pretendard',
  medium: 'Pretendard-Medium',
  semibold: 'Pretendard-SemiBold',
  bold: 'Pretendard-Bold',
  extraBold: 'Pretendard-ExtraBold',
  laundry: 'LaundryGothic',
  laundryBold: 'LaundryGothic-Bold',
  handwriting: 'KyoboHandwriting',
  gameHud: 'Griun-InaDoongdoong',
  cafe24Ssurround: 'Cafe24-Ssurround',
  cafe24SsurroundAir: 'Cafe24-Ssurround-Air',
};

export const shadow = Platform.select({
  web: { boxShadow: '0 8px 40px rgba(0,0,0,0.08)' },
  default: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
});

export const cardShadow = Platform.select({
  web: { boxShadow: '0 0 12px rgba(0,0,0,0.05)' },
  default: {
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
});
