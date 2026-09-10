import {
  MINSU_PORTRAIT_FRAMES,
  MINSU_PORTRAIT_SHEET_SIZE,
} from '../src/game/minsuDialoguePortraits';

describe('민수 대화 스탠딩 일러스트', () => {
  it('세 원본 시트를 비파괴 프레임으로 사용한다', () => {
    expect(MINSU_PORTRAIT_SHEET_SIZE).toEqual({ columns: 3, height: 1024, width: 1536 });
    expect(new Set(Object.values(MINSU_PORTRAIT_FRAMES).map(({ sheet }) => sheet))).toEqual(
      new Set(['sheet-01', 'sheet-02', 'sheet-03']),
    );
  });

  it('하트 장식과 머리색이 다른 프레임은 참조하지 않는다', () => {
    const frameKeys = Object.values(MINSU_PORTRAIT_FRAMES).map(
      ({ column, sheet }) => `${sheet}:${column}`,
    );
    const thirdSheetFrames = Object.values(MINSU_PORTRAIT_FRAMES).filter(
      ({ sheet }) => sheet === 'sheet-03',
    );

    expect(frameKeys).not.toContain('sheet-02:2');
    expect(frameKeys).not.toContain('sheet-03:1');
    expect(thirdSheetFrames).toEqual([
      expect.objectContaining({ column: 0, sheet: 'sheet-03' }),
    ]);
  });

  it('대화 상황에 맞출 수 있는 고유 표정 프레임을 제공한다', () => {
    const frameKeys = Object.values(MINSU_PORTRAIT_FRAMES).map(
      ({ column, sheet }) => `${sheet}:${column}`,
    );

    expect(frameKeys).toHaveLength(6);
    expect(new Set(frameKeys).size).toBe(frameKeys.length);
  });
});
