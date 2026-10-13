import type { ImageSourcePropType } from 'react-native';

import type { VillageNpcId } from './prototypeWorld';

// 3x source pixels retain the player's 128×192 logical canvas and (64,186) pivot.
// Explicit display images stay sharp when the world is zoomed on the web as well.
export const VILLAGE_NPC_ART_SCALE = 0.5;

export const villageNpcArt: Partial<Record<VillageNpcId, ImageSourcePropType>> = {
  minsu: require('../../assets/images/game/characters/village/chibi-v1/minsu-front-display.png'),
  jiyoung: require('../../assets/images/game/characters/village/chibi-v1/jiyoung-front-display.png'),
  sujin: require('../../assets/images/game/characters/village/sujin-v1/sujin-front-display.png'),
};
