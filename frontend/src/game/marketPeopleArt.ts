import type { ImageSourcePropType } from 'react-native';
import type { MarketPersonAppearanceId } from './marketPeople';

/** Each NPC has a separate transparent PNG; static requires work on Expo Go and web. */
export const marketPeopleArt = {
  'employee-male-01': require('../../assets/images/game/market/people/employee-male-01-chibi-v2.png'),
  'employee-male-02': require('../../assets/images/game/market/people/employee-male-02-chibi-v2.png'),
  'employee-female-01': require('../../assets/images/game/market/people/employee-female-01-chibi-v2.png'),
  'employee-female-02': require('../../assets/images/game/market/people/employee-female-02-chibi-v2.png'),
  'customer-adult-male-01': require('../../assets/images/game/market/people/customer-adult-male-01-chibi-v2.png'),
  'customer-adult-male-02': require('../../assets/images/game/market/people/customer-adult-male-02-chibi-v2.png'),
  'customer-adult-female-01': require('../../assets/images/game/market/people/customer-adult-female-01-chibi-v2.png'),
  'customer-adult-female-02': require('../../assets/images/game/market/people/customer-adult-female-02-chibi-v2.png'),
  'customer-senior-male-01': require('../../assets/images/game/market/people/customer-senior-male-01-chibi-v2.png'),
  'customer-senior-male-02': require('../../assets/images/game/market/people/customer-senior-male-02-chibi-v2.png'),
  'customer-senior-female-01': require('../../assets/images/game/market/people/customer-senior-female-01-chibi-v2.png'),
  'customer-senior-female-02': require('../../assets/images/game/market/people/customer-senior-female-02-chibi-v2.png'),
  'customer-child-male-01': require('../../assets/images/game/market/people/customer-child-male-01-chibi-v2.png'),
  'customer-child-male-02': require('../../assets/images/game/market/people/customer-child-male-02-chibi-v2.png'),
  'customer-child-female-01': require('../../assets/images/game/market/people/customer-child-female-01-chibi-v2.png'),
  'customer-child-female-02': require('../../assets/images/game/market/people/customer-child-female-02-chibi-v2.png'),
} satisfies Record<MarketPersonAppearanceId, ImageSourcePropType>;
