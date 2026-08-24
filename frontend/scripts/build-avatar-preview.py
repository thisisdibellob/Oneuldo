#!/usr/bin/env python3
"""Build static and animated QA previews for the fresh player avatar."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw


DIRECTIONS = (
    "front",
    "front_right",
    "right",
    "back_right",
    "back",
    "back_left",
    "left",
    "front_left",
)
FRAME_SIZE = (256, 384)
PREVIEW_SCALE = 1
BACKGROUND = (239, 243, 235, 255)
VERSION = "v2"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("frames", type=Path)
    parser.add_argument("output", type=Path)
    return parser.parse_args()


def load_frames(root: Path, direction: str) -> list[Image.Image]:
    names = [
        f"chr_player_fresh_{direction}_idle_f00_{VERSION}@2x.png",
        f"chr_player_fresh_{direction}_idle_f01_{VERSION}@2x.png",
        *(
            f"chr_player_fresh_{direction}_walk_f{index:02d}_{VERSION}@2x.png"
            for index in range(8)
        ),
    ]
    return [Image.open(root / name).convert("RGBA") for name in names]


def build_contact_sheet(root: Path, output: Path) -> None:
    label_width = 88
    cell_width = FRAME_SIZE[0] * PREVIEW_SCALE
    cell_height = FRAME_SIZE[1] * PREVIEW_SCALE
    sheet = Image.new(
        "RGBA",
        (label_width + cell_width * 10, cell_height * len(DIRECTIONS)),
        BACKGROUND,
    )
    draw = ImageDraw.Draw(sheet)

    for row, direction in enumerate(DIRECTIONS):
        y = row * cell_height
        draw.text((12, y + 18), direction.upper(), fill=(48, 58, 52, 255))
        for column, frame in enumerate(load_frames(root, direction)):
            enlarged = frame.resize((cell_width, cell_height), Image.Resampling.LANCZOS)
            x = label_width + column * cell_width
            if column:
                draw.line((x, y, x, y + cell_height), fill=(211, 219, 207, 255), width=1)
            sheet.alpha_composite(enlarged, (x, y))

    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert("RGB").save(output, quality=94)


def build_walk_gif(root: Path, output: Path) -> None:
    rendered: list[Image.Image] = []
    for direction in DIRECTIONS:
        frames = load_frames(root, direction)[2:]
        for frame in frames:
            canvas = Image.new("RGBA", (384, 576), BACKGROUND)
            enlarged = frame.resize((384, 576), Image.Resampling.LANCZOS)
            canvas.alpha_composite(enlarged)
            rendered.append(canvas.convert("P", palette=Image.Palette.ADAPTIVE))

    gif_path = output.with_suffix(".gif")
    rendered[0].save(
        gif_path,
        append_images=rendered[1:],
        disposal=2,
        duration=96,
        loop=0,
        optimize=False,
        save_all=True,
    )


def main() -> None:
    args = parse_args()
    build_contact_sheet(args.frames, args.output)
    build_walk_gif(args.frames, args.output)


if __name__ == "__main__":
    main()
