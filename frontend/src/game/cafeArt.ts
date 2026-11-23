import type { ImageSourcePropType } from 'react-native';
import type { CafeRecipeId } from './cafeSession';

/** Trimmed transparent runtime sprites; original generations live beside them in source/. */
export const cafeArt = {
  counter: require('../../assets/images/game/cafe/v1/counter.png'),
  table: require('../../assets/images/game/cafe/v1/table.png'),
  shelf: require('../../assets/images/game/cafe/v1/shelf.png'),
  coworker: require('../../assets/images/game/cafe/v1/coworker.png'),
  drinks: {
    'iced-latte': require('../../assets/images/game/cafe/v1/iced-latte.png'),
    'iced-americano': require('../../assets/images/game/cafe/v1/iced-americano.png'),
    'iced-peach-tea': require('../../assets/images/game/cafe/v1/iced-peach-tea.png'),
  } satisfies Partial<Record<CafeRecipeId, ImageSourcePropType>>,
} as const;
