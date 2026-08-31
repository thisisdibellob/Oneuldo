import type { ImageSourcePropType } from 'react-native';

import type { MarketCategoryId } from './scenarios';
import type { VillageDecorationKind } from './prototypeWorld';

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

export const villageBuildingArt: Partial<Record<string, ImageSourcePropType>> = {
  bank: require('../../assets/images/game/buildings/village/runtime/bld_bank_v1.png'),
  burger: require('../../assets/images/game/buildings/village/runtime/bld_burger_v1.png'),
  cafe: require('../../assets/images/game/buildings/village/runtime/bld_cafe_v1.png'),
  community: require('../../assets/images/game/buildings/village/runtime/bld_community_v1.png'),
  convenience: require('../../assets/images/game/buildings/village/runtime/bld_convenience_v1.png'),
  estate: require('../../assets/images/game/buildings/village/runtime/bld_estate_v1.png'),
  karaoke: require('../../assets/images/game/buildings/village/runtime/bld_karaoke_v1.png'),
  library: require('../../assets/images/game/buildings/village/runtime/bld_library_v1.png'),
  market: require('../../assets/images/game/buildings/village/runtime/bld_market_v1.png'),
  'minsu-home': require('../../assets/images/game/buildings/village/runtime/bld_minsu_home_v1.png'),
  'pc-room': require('../../assets/images/game/buildings/village/runtime/bld_pc_room_v1.png'),
  'player-home': require('../../assets/images/game/buildings/village/runtime/bld_player_home_v1.png'),
  restaurant: require('../../assets/images/game/buildings/village/runtime/bld_restaurant_v1.png'),
  school: require('../../assets/images/game/buildings/village/runtime/bld_school_v1.png'),
  subway: require('../../assets/images/game/buildings/village/runtime/bld_subway_v1.png'),
};

export const villageLandmarkArt = {
  busStop: require('../../assets/images/game/buildings/village/runtime/prop_bus_stop_v1.png'),
  park: require('../../assets/images/game/buildings/village/runtime/landmark_park_v1.png'),
};

export const villageDecorationArt = {
  bench: require('../../assets/images/game/environment/village/runtime/env_bench_wood_v1.png'),
  bicycle: require('../../assets/images/game/environment/village/runtime/env_bicycle_v1.png'),
  fence: require('../../assets/images/game/environment/village/runtime/env_fence_wood_v1.png'),
  flowerbed: require('../../assets/images/game/environment/village/runtime/env_flowerbed_v1.png'),
  shrub: require('../../assets/images/game/environment/village/runtime/env_shrub_cluster_v1.png'),
  streetlamp: require('../../assets/images/game/environment/village/runtime/env_streetlamp_v1.png'),
  'trash-bin': require('../../assets/images/game/environment/village/runtime/env_trash_bin_v1.png'),
  tree: require('../../assets/images/game/environment/village/runtime/env_tree_round_v1.png'),
} satisfies Record<VillageDecorationKind, ImageSourcePropType>;

export const villageSurfaceArt = {
  road: require('../../assets/images/game/environment/village/runtime/env_road_surface_warm_v1.png'),
};
