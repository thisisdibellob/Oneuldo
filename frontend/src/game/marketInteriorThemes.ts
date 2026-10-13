/** Visual finishes are independent of shop layout, stock and collision geometry. */
export type MarketInteriorThemeId = 'classic' | 'cozy';

export const MARKET_INTERIOR_THEME_OPTIONS = [
  { id: 'classic', label: '기본 마트', colors: ['#F2F1E9', '#587565', '#BDCABD'] },
  { id: 'cozy', label: '동네 마트', colors: ['#F6EBD9', '#9EAF91', '#DCA48B'] },
] as const;

export function isMarketInteriorTheme(value: unknown): value is MarketInteriorThemeId {
  return value === 'classic' || value === 'cozy';
}

export const COZY_MARKET_PALETTE = {
  background: '#CBC5AF', floor: '#F2E6D0', floorLight: '#FBF3E4',
  lobby: '#E2E7D4', lobbyLight: '#F0F0DD', grout: '#DDCDAF',
  wall: '#F5EBD7', sage: '#93A589', sageDark: '#65775F', peach: '#DCAE93',
  wood: '#BF9B74', ink: '#655B4F', cream: '#FFF7E8',
} as const;
