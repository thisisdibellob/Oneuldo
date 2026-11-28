import type { ImageSourcePropType } from 'react-native';
import type { LaundryItemId } from './laundrySession';

/** Transparent assets are bundled locally, keeping mobile loads small. */
export const laundryArt = {
  washer: require('../../assets/images/game/laundry/v1/washer.png'),
  dryer: require('../../assets/images/game/laundry/v1/dryer.png'),
  foldingTable: require('../../assets/images/game/laundry/v1/folding-table.png'),
  dryingRack: require('../../assets/images/game/laundry/v1/drying-rack.png'),
  basket: require('../../assets/images/game/laundry/v1/basket.png'),
  wardrobe: require('../../assets/images/game/laundry/v1/wardrobe.png'),
  storefront: require('../../assets/images/game/laundry/v1/storefront.png'),
  items: {
    'cream-tee': require('../../assets/images/game/laundry/v1/tee.png'),
    'blue-jeans': require('../../assets/images/game/laundry/v1/jeans.png'),
    'coral-towel': require('../../assets/images/game/laundry/v1/coral-towel.png'),
    'sage-towel': require('../../assets/images/game/laundry/v1/sage-towel.png'),
    'sock-left': require('../../assets/images/game/laundry/v1/sock.png'),
    'sock-right': require('../../assets/images/game/laundry/v1/sock.png'),
  } satisfies Record<LaundryItemId, ImageSourcePropType>,
} as const;
