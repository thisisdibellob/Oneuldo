import type { MarketCategoryId } from './scenarios';
import type { marketProductImages } from './marketProductImages';

/** Decorative facings identify aisles; purchasable inventory remains the seeded session's 4×3 grid. */
export const MARKET_RETAIL_STOCK: Record<MarketCategoryId, readonly (readonly (keyof typeof marketProductImages)[])[]> = {
  "produce": [
    [
      "apple",
      "green-apple",
      "banana",
      "watermelon",
      "orange",
      "grape"
    ],
    [
      "carrot",
      "onion",
      "broccoli",
      "cucumber",
      "potato",
      "sweet-potato"
    ]
  ],
  "fresh": [
    [
      "milk",
      "low-fat-milk",
      "chocolate-milk",
      "eggs",
      "premium-eggs",
      "tofu"
    ],
    [
      "plain-yogurt",
      "strawberry-yogurt",
      "sliced-cheese",
      "mozzarella-cheese",
      "sausage",
      "butter"
    ]
  ],
  "meal": [
    [
      "curry",
      "brand-curry",
      "spicy-curry",
      "ramen",
      "mild-ramen",
      "cup-ramen"
    ],
    [
      "instant-rice",
      "brown-rice",
      "dumpling",
      "kimchi-dumpling",
      "tuna-can",
      "spaghetti"
    ]
  ],
  "drink": [
    [
      "water",
      "sparkling-water",
      "juice",
      "grape-juice",
      "cola",
      "zero-cola"
    ],
    [
      "barley-tea",
      "corn-tea",
      "soy-milk",
      "black-soy-milk",
      "latte",
      "sports-drink"
    ]
  ],
  "household": [
    [
      "striped-slippers",
      "bathroom-slippers",
      "aa-batteries",
      "aaa-batteries",
      "usb-c-charger",
      "lightning-charger"
    ],
    [
      "dish-soap",
      "dish-sponge",
      "cleaning-brush",
      "sticky-notes",
      "transparent-tape",
      "adhesive-bandages"
    ]
  ]
};

/** Measured alpha bounds keep existing product images consistent without changing source artwork. */
export const MARKET_RETAIL_PRODUCT_BOUNDS: Record<string, {x:number;y:number;width:number;height:number}> = {
  "apple": {
    "x": 0.16905901116427433,
    "y": 0.09409888357256778,
    "width": 0.6866028708133971,
    "height": 0.7886762360446571
  },
  "green-apple": {
    "x": 0.119140625,
    "y": 0.05859375,
    "width": 0.76171875,
    "height": 0.87890625
  },
  "banana": {
    "x": 0.05661881977671451,
    "y": 0.09888357256778309,
    "width": 0.886762360446571,
    "height": 0.7990430622009569
  },
  "watermelon": {
    "x": 0.15311004784688995,
    "y": 0.11004784688995216,
    "width": 0.6905901116427432,
    "height": 0.7416267942583732
  },
  "orange": {
    "x": 0.11328125,
    "y": 0.119140625,
    "width": 0.82421875,
    "height": 0.78125
  },
  "grape": {
    "x": 0.16015625,
    "y": 0.03515625,
    "width": 0.7421875,
    "height": 0.931640625
  },
  "carrot": {
    "x": 0.2671451355661882,
    "y": 0.06618819776714513,
    "width": 0.5382775119617225,
    "height": 0.8492822966507177
  },
  "onion": {
    "x": 0.09330143540669857,
    "y": 0.0861244019138756,
    "width": 0.8309409888357256,
    "height": 0.784688995215311
  },
  "broccoli": {
    "x": 0.033203125,
    "y": 0.041015625,
    "width": 0.93359375,
    "height": 0.91796875
  },
  "cucumber": {
    "x": 0.03515625,
    "y": 0.111328125,
    "width": 0.953125,
    "height": 0.76953125
  },
  "potato": {
    "x": 0.041015625,
    "y": 0.09765625,
    "width": 0.91796875,
    "height": 0.806640625
  },
  "sweet-potato": {
    "x": 0.05078125,
    "y": 0.138671875,
    "width": 0.90625,
    "height": 0.734375
  },
  "milk": {
    "x": 0.2743221690590112,
    "y": 0.046251993620414676,
    "width": 0.45534290271132377,
    "height": 0.8995215311004785
  },
  "low-fat-milk": {
    "x": 0.2890625,
    "y": 0.03515625,
    "width": 0.408203125,
    "height": 0.923828125
  },
  "chocolate-milk": {
    "x": 0.23046875,
    "y": 0.03515625,
    "width": 0.552734375,
    "height": 0.9375
  },
  "eggs": {
    "x": 0.07416267942583732,
    "y": 0.13476874003189793,
    "width": 0.8556618819776715,
    "height": 0.7288676236044657
  },
  "premium-eggs": {
    "x": 0.08373205741626795,
    "y": 0.10526315789473684,
    "width": 0.8325358851674641,
    "height": 0.784688995215311
  },
  "tofu": {
    "x": 0.05502392344497608,
    "y": 0.18181818181818182,
    "width": 0.8907496012759171,
    "height": 0.6539074960127592
  },
  "plain-yogurt": {
    "x": 0.1328125,
    "y": 0.126953125,
    "width": 0.765625,
    "height": 0.76171875
  },
  "strawberry-yogurt": {
    "x": 0.08984375,
    "y": 0.109375,
    "width": 0.8203125,
    "height": 0.787109375
  },
  "sliced-cheese": {
    "x": 0.068359375,
    "y": 0.09375,
    "width": 0.865234375,
    "height": 0.8125
  },
  "mozzarella-cheese": {
    "x": 0.197265625,
    "y": 0.052734375,
    "width": 0.607421875,
    "height": 0.89453125
  },
  "sausage": {
    "x": 0.09250398724082935,
    "y": 0.14274322169059012,
    "width": 0.8405103668261563,
    "height": 0.7145135566188198
  },
  "butter": {
    "x": 0.046875,
    "y": 0.232421875,
    "width": 0.9140625,
    "height": 0.564453125
  },
  "curry": {
    "x": 0.2240829346092504,
    "y": 0.08373205741626795,
    "width": 0.5526315789473685,
    "height": 0.8118022328548644
  },
  "brand-curry": {
    "x": 0.19298245614035087,
    "y": 0.10526315789473684,
    "width": 0.6148325358851675,
    "height": 0.7703349282296651
  },
  "spicy-curry": {
    "x": 0.169921875,
    "y": 0.07421875,
    "width": 0.66015625,
    "height": 0.84765625
  },
  "ramen": {
    "x": 0.1379585326953748,
    "y": 0.07256778309409888,
    "width": 0.7272727272727273,
    "height": 0.8556618819776715
  },
  "mild-ramen": {
    "x": 0.18819776714513556,
    "y": 0.12679425837320574,
    "width": 0.6347687400318979,
    "height": 0.7392344497607656
  },
  "cup-ramen": {
    "x": 0.123046875,
    "y": 0.048828125,
    "width": 0.75390625,
    "height": 0.904296875
  },
  "instant-rice": {
    "x": 0.11802232854864433,
    "y": 0.16586921850079744,
    "width": 0.80622009569378,
    "height": 0.6523125996810207
  },
  "brown-rice": {
    "x": 0.13671875,
    "y": 0.080078125,
    "width": 0.728515625,
    "height": 0.87890625
  },
  "dumpling": {
    "x": 0.15789473684210525,
    "y": 0.06698564593301436,
    "width": 0.7009569377990431,
    "height": 0.8556618819776715
  },
  "kimchi-dumpling": {
    "x": 0.103515625,
    "y": 0.04296875,
    "width": 0.798828125,
    "height": 0.91796875
  },
  "tuna-can": {
    "x": 0.103515625,
    "y": 0.181640625,
    "width": 0.79296875,
    "height": 0.642578125
  },
  "spaghetti": {
    "x": 0.033203125,
    "y": 0.16015625,
    "width": 0.9453125,
    "height": 0.6796875
  },
  "water": {
    "x": 0.3452950558213716,
    "y": 0.07496012759170653,
    "width": 0.310207336523126,
    "height": 0.8437001594896332
  },
  "sparkling-water": {
    "x": 0.35406698564593303,
    "y": 0.03987240829346093,
    "width": 0.2958532695374801,
    "height": 0.9019138755980861
  },
  "juice": {
    "x": 0.26953748006379585,
    "y": 0.10287081339712918,
    "width": 0.5055821371610846,
    "height": 0.7894736842105263
  },
  "grape-juice": {
    "x": 0.2631578947368421,
    "y": 0.11323763955342903,
    "width": 0.49760765550239233,
    "height": 0.777511961722488
  },
  "cola": {
    "x": 0.322265625,
    "y": 0.021484375,
    "width": 0.35546875,
    "height": 0.95703125
  },
  "zero-cola": {
    "x": 0.326171875,
    "y": 0.0234375,
    "width": 0.34375,
    "height": 0.953125
  },
  "barley-tea": {
    "x": 0.3317384370015949,
    "y": 0.043859649122807015,
    "width": 0.3373205741626794,
    "height": 0.8915470494417863
  },
  "corn-tea": {
    "x": 0.32421875,
    "y": 0.025390625,
    "width": 0.3515625,
    "height": 0.94921875
  },
  "soy-milk": {
    "x": 0.2734375,
    "y": 0.052734375,
    "width": 0.486328125,
    "height": 0.888671875
  },
  "black-soy-milk": {
    "x": 0.255859375,
    "y": 0.08984375,
    "width": 0.490234375,
    "height": 0.822265625
  },
  "latte": {
    "x": 0.2421875,
    "y": 0.02734375,
    "width": 0.515625,
    "height": 0.9453125
  },
  "sports-drink": {
    "x": 0.322265625,
    "y": 0.037109375,
    "width": 0.35546875,
    "height": 0.927734375
  },
  "striped-slippers": {
    "x": 0.0546875,
    "y": 0.16796875,
    "width": 0.892578125,
    "height": 0.701171875
  },
  "bathroom-slippers": {
    "x": 0.033203125,
    "y": 0.134765625,
    "width": 0.947265625,
    "height": 0.765625
  },
  "aa-batteries": {
    "x": 0.185546875,
    "y": 0.068359375,
    "width": 0.6484375,
    "height": 0.861328125
  },
  "aaa-batteries": {
    "x": 0.1953125,
    "y": 0.08984375,
    "width": 0.609375,
    "height": 0.826171875
  },
  "usb-c-charger": {
    "x": 0.16015625,
    "y": 0.02734375,
    "width": 0.6875,
    "height": 0.943359375
  },
  "lightning-charger": {
    "x": 0.173828125,
    "y": 0.037109375,
    "width": 0.654296875,
    "height": 0.927734375
  },
  "dish-soap": {
    "x": 0.25390625,
    "y": 0.0078125,
    "width": 0.4921875,
    "height": 0.97265625
  },
  "dish-sponge": {
    "x": 0.0703125,
    "y": 0.16015625,
    "width": 0.896484375,
    "height": 0.720703125
  },
  "cleaning-brush": {
    "x": 0.041015625,
    "y": 0.119140625,
    "width": 0.935546875,
    "height": 0.7890625
  },
  "sticky-notes": {
    "x": 0.078125,
    "y": 0.12109375,
    "width": 0.859375,
    "height": 0.78515625
  },
  "transparent-tape": {
    "x": 0.083984375,
    "y": 0.150390625,
    "width": 0.8359375,
    "height": 0.703125
  },
  "adhesive-bandages": {
    "x": 0.162109375,
    "y": 0.080078125,
    "width": 0.73828125,
    "height": 0.83203125
  }
};
