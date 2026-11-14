import { AVATAR_FACINGS, getAvatarAtlasOffset, resolveAvatarAtlas, selectAvatarAtlasSource, type AvatarAtlasSheet } from '../src/game/avatarAnimation';
import { chibiPlayerAvatar } from '../src/game/chibiPlayerAvatar';

const audit = require('../assets/images/game/characters/player/chibi-atlas-v1/atlas-audit.json') as {
  originalFrameCount: number;
  sheets: Record<string, { columns: number; rows: number; frameCount: number; sourceDirectory: string; sourceFrames: string[] }>;
};

describe('original character atlas mapping and physical resolution', () => {
  it('keeps walk and idle frames while using the reviewed sprint2 loops in all eight directions', () => {
    expect(audit.originalFrameCount).toBe(264);
    expect(Object.keys(audit.sheets)).toHaveLength(18);
    expect(audit.sheets.back_walk.frameCount).toBe(16);
    expect(audit.sheets.front_walk.frameCount).toBe(15);
    expect(audit.sheets.back_left_sprint.sourceFrames.every(name => name.includes('_back_left_sprint_'))).toBe(true);
    expect(audit.sheets.back_right_sprint.sourceFrames.every(name => name.includes('_back_right_sprint_'))).toBe(true);
    for (const [id, sheet] of Object.entries(audit.sheets)) {
      expect(sheet.sourceDirectory).toBe(id.endsWith('_sprint') ? 'chibi-sprint2-v1' : 'chibi-user-v3');
    }
    for (const facing of AVATAR_FACINGS) {
      const atlas = chibiPlayerAvatar.atlases![facing];
      expect(atlas.idle).toBe(facing.startsWith('back') ? chibiPlayerAvatar.atlases!.back.idle : chibiPlayerAvatar.atlases!.front.idle);
      expect(atlas.idle.frameCount).toBe(36);
      expect(atlas.sprint).toBeDefined();
      expect(resolveAvatarAtlas(chibiPlayerAvatar, facing, 'walk')).toBe(atlas.walk);
      for (const item of [atlas.idle, atlas.walk, atlas.sprint!]) {
        expect(item.columns * item.frameWidth * 2).toBeLessThanOrEqual(2048);
        expect(item.rows * item.frameHeight * 2).toBeLessThanOrEqual(2048);
      }
    }
  });

  it('selects SD for a 64×96 point sprite on a 2x screen and HD only when physically needed', () => {
    const atlas: AvatarAtlasSheet = { id: 'density', source: 1, highResolutionSource: 2, columns: 4, rows: 4, frameCount: 16, frameWidth: 128, frameHeight: 192 };
    expect(selectAvatarAtlasSource(atlas, 0.5, 2)).toBe(1);
    expect(selectAvatarAtlasSource(atlas, 0.5, 3)).toBe(2);
    expect(selectAvatarAtlasSource(atlas, 0.55, 2)).toBe(2);
    expect(selectAvatarAtlasSource(atlas, 1, 1)).toBe(1);
    expect(selectAvatarAtlasSource({ ...atlas, highResolutionSource: undefined }, 1, 3)).toBe(1);
  });

  it('moves to the correct cell across rows and wraps at the actual frame count, not padded empty cells', () => {
    const atlas = chibiPlayerAvatar.atlases!.front.idle;
    expect(getAvatarAtlasOffset(atlas, 8, 0.5)).toEqual({ x: -0, y: -96 });
    expect(getAvatarAtlasOffset(atlas, 35, 0.5)).toEqual({ x: -192, y: -384 });
    expect(getAvatarAtlasOffset(atlas, 36, 0.5)).toEqual({ x: -0, y: -0 });
    expect(getAvatarAtlasOffset(atlas, -1, 0.5)).toEqual({ x: -192, y: -384 });
  });
});
