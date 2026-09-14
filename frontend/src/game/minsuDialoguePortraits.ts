export const MINSU_PORTRAIT_SHEET_SIZE = {
  columns: 3,
  height: 1024,
  width: 1536,
} as const;

export type MinsuPortraitSheetId = 'sheet-01' | 'sheet-02' | 'sheet-03';

export type MinsuPortraitExpression =
  | 'attentive'
  | 'bright'
  | 'curious'
  | 'ready'
  | 'thinking'
  | 'worried';

export type MinsuPortraitFrame = {
  column: 0 | 1 | 2;
  label: string;
  sheet: MinsuPortraitSheetId;
};

/**
 * The source illustrations stay untouched. Each frame is selected from a
 * three-column source sheet and clipped at render time so every expression
 * keeps exactly the same visible canvas.
 *
 * Heart decorations are intentionally excluded (`sheet-02` column 2 and
 * `sheet-03` column 1). `sheet-03` column 2 is also excluded because the
 * supplied figure has a different hair colour.
 */
export const MINSU_PORTRAIT_FRAMES = {
  attentive: { column: 0, label: '차분히 듣는', sheet: 'sheet-02' },
  bright: { column: 1, label: '밝게 말하는', sheet: 'sheet-01' },
  curious: { column: 0, label: '궁금해하는', sheet: 'sheet-01' },
  ready: { column: 0, label: '활기차게 준비한', sheet: 'sheet-03' },
  thinking: { column: 2, label: '생각하는', sheet: 'sheet-01' },
  worried: { column: 1, label: '걱정하는', sheet: 'sheet-02' },
} as const satisfies Record<MinsuPortraitExpression, MinsuPortraitFrame>;
