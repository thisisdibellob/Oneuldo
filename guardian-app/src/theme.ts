import { Platform } from 'react-native';
export const c = {
  bg: '#F6F7F2', paper: '#FFFFFF', ink: '#233E35', sub: '#67786F', muted: '#8C9790',
  green: '#386D54', pale: '#EAF0E5', line: '#E5E9DF', peach: '#F5EADD', amber: '#906D3F', blue: '#597E98', red: '#A75148',
};
export const f = { regular: 'Pretendard', medium: 'Pretendard-Medium', bold: 'Pretendard-Bold' };
export const softShadow = Platform.select({ web: { boxShadow: '0 8px 28px rgba(35,62,53,0.04)' }, default: { shadowColor: '#233E35', shadowOpacity: .04, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 1 } });
