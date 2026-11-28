import { createContext, useContext } from 'react';
import { useGamePreferences } from '../../game/gamePreferences';
import type { MarketInteriorThemeId } from '../../game/marketInteriorThemes';

/** Preview finishes never overwrite the player's saved game preferences. */
export const MarketThemePreviewContext = createContext<MarketInteriorThemeId | null>(null);

export function useMarketInteriorTheme(): MarketInteriorThemeId {
  const override = useContext(MarketThemePreviewContext);
  const { preferences } = useGamePreferences();
  return override ?? preferences.marketInteriorTheme;
}
