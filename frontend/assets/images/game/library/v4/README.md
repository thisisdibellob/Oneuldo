# Library v4 artwork

Created with the built-in `image_gen` tool on 2026-10-01. All images are original game illustrations with transparent backgrounds.

- `counter.png`: two-place service counter; staff terminal on the left, trainee/user catalogue terminal on the right. The game displays this at 356×116, twice the previous counter width.
- `lounge.png`: six-seat communal reading table. The final revision makes the three near-side chairs face toward the tabletop; the viewer sees their backs.
- 26 named PNG files: new catalogue covers, individually extracted from a generated sheet using alpha connected components. Each stable book ID has its own distinct cover. Titles and call numbers are rendered as real interface text.
- `asset-manifest.json`: per-cover crop, dimensions, size and SHA-256.
- `source/`: generated original assets, prompts and a reviewed cover contact sheet.

`scripts/prepare-library-art-v4.cjs` performs only mechanical extraction, transparent padding and resizing. No background repainting, synthesized replacement illustration or dependency installation is used. Run with `sharp` available through the bundled runtime `NODE_PATH`.

The original generator paths in the script record provenance; copied files in `source/` are the portable originals. Game code references only the optimized sibling PNGs.
