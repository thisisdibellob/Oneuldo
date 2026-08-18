import type { ImageSourcePropType } from 'react-native';

import type { MarketCategoryId } from './scenarios';

const marketShelves = {
  drink: require('../../assets/images/game/props/mart/prop_shelf_drink_v1.png'),
  fresh: require('../../assets/images/game/props/mart/prop_shelf_fresh_v1.png'),
  meal: require('../../assets/images/game/props/mart/prop_shelf_meal_v1.png'),
  produce: require('../../assets/images/game/props/mart/prop_shelf_produce_v1.png'),
} satisfies Record<MarketCategoryId, ImageSourcePropType>;

export const marketGameArt = {
  base: require('../../assets/images/game/scenes/mart/scene_mart_base_day_v1.png'),
  checkout: require('../../assets/images/game/props/mart/prop_checkout_counter_v1.png'),
  shelves: marketShelves,
};

export const playerGameArt = {
  blueBobFrontIdle: require('../../assets/images/game/characters/player/chr_player_full_blue_bob_front_idle_f00_v1.png'),
} satisfies Record<string, ImageSourcePropType>;
