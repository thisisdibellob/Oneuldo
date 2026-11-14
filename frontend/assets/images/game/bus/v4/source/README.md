# Bus artwork v4 · 2026-10-01

Built-in `image_gen` generated three new transparent PNG assets. The original player turnaround supplied the drawing style only. Each exact production prompt is in `prompts.json`. Existing v1–v3 files remain intact.

- `../interior.png`: 756×2079, roof-open long bus, seated driver at the upper left, front/middle passenger doors on the right, forward-facing seats. The visible body is drawn at 350×963 world pixels without stretching.
- `../bus-right.png`: passenger side, front pointing right; visible front/middle doors.
- `../bus-left.png`: driver side, front pointing left; visible side has no passenger doors. This is a separately generated opposite view, not a mirrored passenger side.

Native alpha is retained around the rounded body and wheels. Road markings, route numbers, stop names, and interaction highlights are code-rendered. The interior uses the actual vehicle proportions to place collisions and interactions; references and Korean/Japanese layout distinctions remain in `docs/bus-reference-research.md`.

Gameplay mapping: canvas 440×1080; image origin (45,45), body 350×963. Standing character scale remains 0.55, matching existing village controls. Seat approach and seated positions are distinct; the rear idle sprite is clipped below the torso and the original seat back is drawn in front.
