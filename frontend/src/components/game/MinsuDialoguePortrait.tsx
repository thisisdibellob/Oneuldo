import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { minsuDialoguePortraitSheets } from '../../game/gameAssets';
import {
  MINSU_PORTRAIT_FRAMES,
  MINSU_PORTRAIT_SHEET_SIZE,
  type MinsuPortraitExpression,
} from '../../game/minsuDialoguePortraits';

const FRAME_WIDTH = 174;
const FRAME_HEIGHT = 238;
const SHEET_RENDER_WIDTH = FRAME_WIDTH * MINSU_PORTRAIT_SHEET_SIZE.columns;
const SHEET_RENDER_HEIGHT =
  (SHEET_RENDER_WIDTH * MINSU_PORTRAIT_SHEET_SIZE.height) /
  MINSU_PORTRAIT_SHEET_SIZE.width;
const SHEET_TOP = -35;

type MinsuDialoguePortraitProps = {
  expression: MinsuPortraitExpression;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function MinsuDialoguePortrait({
  expression,
  style,
  testID = 'minsu-dialogue-portrait',
}: MinsuDialoguePortraitProps) {
  const frame = MINSU_PORTRAIT_FRAMES[expression];

  return (
    <View
      accessibilityLabel={`${frame.label} 민수의 모습`}
      accessibilityRole="image"
      pointerEvents="none"
      style={[styles.root, style]}
      testID={testID}
    >
      <View style={styles.cropWindow}>
        <Image
          accessibilityIgnoresInvertColors
          fadeDuration={0}
          resizeMode="stretch"
          source={minsuDialoguePortraitSheets[frame.sheet]}
          style={[
            styles.sheet,
            {
              height: SHEET_RENDER_HEIGHT,
              left: -frame.column * FRAME_WIDTH,
              top: SHEET_TOP,
              width: SHEET_RENDER_WIDTH,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    height: FRAME_HEIGHT,
    width: FRAME_WIDTH,
  },
  cropWindow: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  sheet: {
    position: 'absolute',
  },
});
