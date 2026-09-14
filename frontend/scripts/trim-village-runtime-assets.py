#!/usr/bin/env python3
"""Trim inconsistent transparent margins from final village runtime PNGs.

Generated building assets intentionally keep transparent backgrounds, but their
canvas margins vary considerably.  The game sizes buildings by their full PNG
canvas, so those margins make otherwise similar buildings appear at unrelated
scales.  This script keeps a small, uniform safety margin around each visible
asset and is idempotent, making later asset replacements easy to normalize.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


DEFAULT_PADDING = 12


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("asset_dir", type=Path)
    parser.add_argument("--padding", type=int, default=DEFAULT_PADDING)
    return parser.parse_args()


def trim_asset(path: Path, padding: int) -> tuple[tuple[int, int], tuple[int, int]]:
    with Image.open(path) as source:
        image = source.convert("RGBA")

    alpha_bounds = image.getchannel("A").getbbox()
    if alpha_bounds is None:
        raise ValueError(f"{path.name} has no visible pixels")

    left, top, right, bottom = alpha_bounds
    crop_bounds = (
        max(0, left - padding),
        max(0, top - padding),
        min(image.width, right + padding),
        min(image.height, bottom + padding),
    )
    trimmed = image.crop(crop_bounds)
    original_size = image.size
    trimmed.save(path, optimize=True)
    return original_size, trimmed.size


def main() -> None:
    args = parse_args()
    if args.padding < 0:
        raise ValueError("padding must be non-negative")

    files = sorted(args.asset_dir.glob("*.png"))
    if not files:
        raise FileNotFoundError(f"No PNG assets found in {args.asset_dir}")

    for path in files:
        original_size, trimmed_size = trim_asset(path, args.padding)
        print(f"{path.name}: {original_size} -> {trimmed_size}")


if __name__ == "__main__":
    main()
