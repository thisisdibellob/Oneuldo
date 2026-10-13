# Village greenery, cozy v2

Generated with the built-in `image_gen` tool. The player turnaround supplies the muted brown ink and matte color style; the front-facing school supplies the shallow orthographic projection. `prompts.json` records every prompt, reference and original generated file.

| Runtime asset | Pixel size | Shape and anchor |
| --- | --- | --- |
| `tree.png` | 287 × 320 | Front-facing rounded crown, short trunk; anchor at bottom center. |
| `flowerbed.png` | 320 × 55 | Low horizontal limestone planter; anchor at bottom center. |
| `shrub.png` | 256 × 82 | Low broad sage cluster; anchor at bottom center. |
| `bench.png` | 320 × 135 | Horizontal wooden seat/backrest and short gray-brown supports; anchor at bottom center. |
| `streetlamp.png` | 72 × 256 | Simple cream-glass head, gray-brown pole and foot; anchor at bottom center. |

`source/` contains the selected raw tool outputs. `*-full.png` preserves their cropped high-resolution RGBA artwork. Runtime images are resized copies; no generated artwork was repainted by scripts.

Tree and shrub came with actual transparency. The first flowerbed generation contained an opaque checkerboard, so its background was replaced with magenta through `image_gen` and mechanically keyed during import. Every final asset has a verified transparent background.

The additional bench also came with actual transparency. Its generation prompt is recorded in `bench-prompt.json` and matches the flowerbed and school material/projection style.

The streetlamp prompt and its shaft-length/background correction are recorded in `streetlamp-prompt.json`. The selected image uses magenta separation, mechanically keyed to alpha. Its full-resolution art is trimmed to the lamp bounds before runtime scaling, avoiding the old lamp's large empty margins.

Rebuild from the frontend directory:

```powershell
node scripts/prepare-village-greenery.cjs
```

Keep sprite aspect ratios. Tree collisions should cover the trunk/base, not the crown. Flowerbed collisions should cover its horizontal front rim; shrubs can use a low footprint over the bottom quarter. Ground shadows belong to world rendering and are deliberately absent from the sprites.
