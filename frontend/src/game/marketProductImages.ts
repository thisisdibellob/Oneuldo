import { ImageSourcePropType } from 'react-native';

export const marketProductImages = {
  apple: require('../../assets/images/game/market/products/product_apple.png'),
  banana: require('../../assets/images/game/market/products/product_banana.png'),
  'barley-tea': require('../../assets/images/game/market/products/product_barley-tea.png'),
  'brand-curry': require('../../assets/images/game/market/products/product_brand-curry.png'),
  'brand-sausage': require('../../assets/images/game/market/products/product_brand-sausage.png'),
  carrot: require('../../assets/images/game/market/products/product_carrot.png'),
  curry: require('../../assets/images/game/market/products/product_curry.png'),
  dumpling: require('../../assets/images/game/market/products/product_dumpling.png'),
  eggs: require('../../assets/images/game/market/products/product_eggs.png'),
  'grape-juice': require('../../assets/images/game/market/products/product_grape-juice.png'),
  'instant-rice': require('../../assets/images/game/market/products/product_instant-rice.png'),
  juice: require('../../assets/images/game/market/products/product_juice.png'),
  'mild-ramen': require('../../assets/images/game/market/products/product_mild-ramen.png'),
  milk: require('../../assets/images/game/market/products/product_milk.png'),
  onion: require('../../assets/images/game/market/products/product_onion.png'),
  'premium-eggs': require('../../assets/images/game/market/products/product_premium-eggs.png'),
  ramen: require('../../assets/images/game/market/products/product_ramen.png'),
  sausage: require('../../assets/images/game/market/products/product_sausage.png'),
  soda: require('../../assets/images/game/market/products/product_soda.png'),
  'sparkling-water': require('../../assets/images/game/market/products/product_sparkling-water.png'),
  tofu: require('../../assets/images/game/market/products/product_tofu.png'),
  tomato: require('../../assets/images/game/market/products/product_tomato.png'),
  water: require('../../assets/images/game/market/products/product_water.png'),
  watermelon: require('../../assets/images/game/market/products/product_watermelon.png'),
} satisfies Record<string, ImageSourcePropType>;

export type MarketProductImageId = keyof typeof marketProductImages;

export function getMarketProductImage(productId: string): ImageSourcePropType | undefined {
  return marketProductImages[productId as MarketProductImageId];
}
