#!/usr/bin/env python3
"""Convert a ten-frame AI animation strip into aligned avatar PNG frames.

The image generator can bake a light checkerboard into an RGB output even when
asked for transparency.  This script removes only light, nearly-neutral pixels
that are connected to a cell edge, preserving enclosed ivory clothing and shoe
details. It then normalizes every frame to a shared logical 128x192 character
canvas and writes both 1x and 2x-density assets with the ground pivot at y=186.
"""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps


LOGICAL_CANVAS_WIDTH = 128
LOGICAL_CANVAS_HEIGHT = 192
LOGICAL_PIVOT_X = 64
LOGICAL_PIVOT_Y = 186
ASSET_PIXEL_RATIO = 2
CANVAS_WIDTH = LOGICAL_CANVAS_WIDTH * ASSET_PIXEL_RATIO
CANVAS_HEIGHT = LOGICAL_CANVAS_HEIGHT * ASSET_PIXEL_RATIO
PIVOT_X = LOGICAL_PIVOT_X * ASSET_PIXEL_RATIO
PIVOT_Y = LOGICAL_PIVOT_Y * ASSET_PIXEL_RATIO
FRAME_COUNT = 10
IDLE_FRAME_COUNT = 2
TARGET_BODY_HEIGHT = 174 * ASSET_PIXEL_RATIO
HORIZONTAL_SAFE_MARGIN = 8 * ASSET_PIXEL_RATIO
DIRECTIONS = (
    "front",
    "front_left",
    "left",
    "back_left",
    "back",
    "back_right",
    "right",
    "front_right",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("strip", type=Path)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("direction", choices=DIRECTIONS)
    parser.add_argument("--version", default="v2")
    parser.add_argument("--frame-count", type=int, default=FRAME_COUNT)
    parser.add_argument("--idle-frame-count", type=int, default=IDLE_FRAME_COUNT)
    parser.add_argument("--mirror", action="store_true")
    return parser.parse_args()


def is_background_candidate(rgb: np.ndarray) -> np.ndarray:
    high = rgb.min(axis=2) >= 232
    neutral = (rgb.max(axis=2) - rgb.min(axis=2)) <= 14
    return high & neutral


def edge_connected_background(candidate: np.ndarray) -> np.ndarray:
    height, width = candidate.shape
    visited = np.zeros_like(candidate, dtype=bool)
    queue: deque[tuple[int, int]] = deque()

    for x in range(width):
        if candidate[0, x]:
            queue.append((0, x))
        if candidate[height - 1, x]:
            queue.append((height - 1, x))
    for y in range(height):
        if candidate[y, 0]:
            queue.append((y, 0))
        if candidate[y, width - 1]:
            queue.append((y, width - 1))

    while queue:
        y, x = queue.popleft()
        if visited[y, x] or not candidate[y, x]:
            continue
        visited[y, x] = True
        if y > 0:
            queue.append((y - 1, x))
        if y + 1 < height:
            queue.append((y + 1, x))
        if x > 0:
            queue.append((y, x - 1))
        if x + 1 < width:
            queue.append((y, x + 1))

    return visited


def remove_baked_background(cell: Image.Image) -> Image.Image:
    rgba_source = cell.convert("RGBA")
    existing_alpha = np.asarray(rgba_source.getchannel("A"), dtype=np.uint8)
    if existing_alpha.min() < 255:
        return rgba_source

    rgb = np.asarray(rgba_source.convert("RGB"), dtype=np.uint8)
    background = edge_connected_background(is_background_candidate(rgb))
    alpha = np.where(background, 0, 255).astype(np.uint8)

    # Soften only the immediate outside edge.  Character pixels themselves are
    # never color-keyed globally, which keeps the enclosed ivory shirt intact.
    rgba = np.dstack((rgb, alpha))
    return Image.fromarray(rgba, mode="RGBA")


def split_detected_cells(strip: Image.Image, frame_count: int) -> list[Image.Image]:
    """Split at real transparent gaps instead of assuming perfectly even spacing."""
    alpha = np.asarray(strip.getchannel("A"), dtype=np.uint8)
    occupied = np.any(alpha > 8, axis=0)

    # Close tiny internal gaps caused by a lifted shoe or separated hand while
    # preserving the much wider gap between neighbouring figures.
    maximum_internal_gap = max(2, round(strip.width / (frame_count * 32)))
    index = 0
    while index < strip.width:
        if occupied[index]:
            index += 1
            continue
        gap_start = index
        while index < strip.width and not occupied[index]:
            index += 1
        if (
            gap_start > 0
            and index < strip.width
            and index - gap_start <= maximum_internal_gap
        ):
            occupied[gap_start:index] = True

    runs: list[tuple[int, int]] = []
    index = 0
    while index < strip.width:
        if not occupied[index]:
            index += 1
            continue
        start = index
        while index < strip.width and occupied[index]:
            index += 1
        runs.append((start, index))

    if len(runs) != frame_count:
        return [
            strip.crop(
                (
                    round(strip.width * frame / frame_count),
                    0,
                    round(strip.width * (frame + 1) / frame_count),
                    strip.height,
                )
            )
            for frame in range(frame_count)
        ]

    boundaries = [0]
    for previous, following in zip(runs, runs[1:]):
        boundaries.append(round((previous[1] + following[0]) / 2))
    boundaries.append(strip.width)
    return [
        strip.crop((boundaries[index], 0, boundaries[index + 1], strip.height))
        for index in range(frame_count)
    ]


def keep_significant_foreground_components(frame: Image.Image) -> Image.Image:
    alpha = np.asarray(frame.getchannel("A"), dtype=np.uint8)
    foreground = alpha > 8
    height, width = foreground.shape
    visited = np.zeros_like(foreground, dtype=bool)
    components: list[list[tuple[int, int]]] = []

    for start_y in range(height):
        for start_x in range(width):
            if visited[start_y, start_x] or not foreground[start_y, start_x]:
                continue
            queue: deque[tuple[int, int]] = deque([(start_y, start_x)])
            component: list[tuple[int, int]] = []
            while queue:
                y, x = queue.popleft()
                if visited[y, x] or not foreground[y, x]:
                    continue
                visited[y, x] = True
                component.append((y, x))
                if y > 0:
                    queue.append((y - 1, x))
                if y + 1 < height:
                    queue.append((y + 1, x))
                if x > 0:
                    queue.append((y, x - 1))
                if x + 1 < width:
                    queue.append((y, x + 1))
            components.append(component)

    if not components:
        return frame

    largest_size = max(len(component) for component in components)
    minimum_size = max(20, round(largest_size * 0.002))
    keep = np.zeros_like(foreground, dtype=bool)
    for component in components:
        if len(component) < minimum_size:
            continue
        ys, xs = zip(*component)
        # A generated strip can place a sliver of the neighbouring figure just
        # inside a mathematically equal cell. Those fragments touch the cell
        # edge; real detached hands and shoes remain inside the safe margin.
        if (
            len(component) < largest_size
            and (min(xs) <= 2 or max(xs) >= width - 3)
        ):
            continue
        keep[np.asarray(ys), np.asarray(xs)] = True
    cleaned = np.asarray(frame.convert("RGBA"), dtype=np.uint8).copy()
    cleaned[:, :, 3] = np.where(keep, cleaned[:, :, 3], 0)
    return Image.fromarray(cleaned, mode="RGBA")


def crop_foreground(frame: Image.Image) -> tuple[Image.Image, float]:
    alpha = np.asarray(frame.getchannel("A"))
    ys, xs = np.nonzero(alpha > 0)
    if len(xs) == 0:
        raise ValueError("No foreground pixels remained after background removal")

    padding = 3
    left = max(0, int(xs.min()) - padding)
    top = max(0, int(ys.min()) - padding)
    right = min(frame.width, int(xs.max()) + padding + 1)
    bottom = min(frame.height, int(ys.max()) + padding + 1)
    # Estimate the spine from row centres in the upper body. Centering by the
    # full alpha bounds makes a wide step push the torso backwards; using the
    # mathematical cell centre fails when AI figures are not perfectly spaced.
    body_top = int(ys.min() + (ys.max() - ys.min()) * 0.1)
    body_bottom = int(ys.min() + (ys.max() - ys.min()) * 0.62)
    row_centres: list[float] = []
    for row in range(body_top, body_bottom + 1):
        row_xs = np.nonzero(alpha[row] > 0)[0]
        if len(row_xs):
            row_centres.append((float(row_xs.min()) + float(row_xs.max())) / 2)
    root_x = float(np.median(row_centres)) if row_centres else frame.width / 2
    root_anchor_x = root_x - left
    return frame.crop((left, top, right, bottom)), root_anchor_x


def normalize_frame(frame: Image.Image, root_anchor_x: float, scale: float) -> Image.Image:
    size = (
        max(1, round(frame.width * scale)),
        max(1, round(frame.height * scale)),
    )
    resized = frame.resize(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (0, 0, 0, 0))
    x = PIVOT_X - round(root_anchor_x * scale)
    y = PIVOT_Y - resized.height
    canvas.alpha_composite(resized, (x, y))
    return canvas


def frame_filename(
    direction: str,
    index: int,
    idle_frame_count: int,
    version: str,
) -> str:
    if index < idle_frame_count:
        motion = "idle"
        frame_index = index
    else:
        motion = "walk"
        frame_index = index - idle_frame_count
    return f"chr_player_fresh_{direction}_{motion}_f{frame_index:02d}_{version}.png"


def density_filename(filename: str, density: int) -> str:
    path = Path(filename)
    return f"{path.stem}@{density}x{path.suffix}"


def main() -> None:
    args = parse_args()
    strip = Image.open(args.strip).convert("RGBA")
    args.output_dir.mkdir(parents=True, exist_ok=True)

    if args.frame_count <= args.idle_frame_count:
        raise ValueError("frame-count must be greater than idle-frame-count")

    transparent_strip = remove_baked_background(strip)
    source_cells = split_detected_cells(transparent_strip, args.frame_count)
    cropped_frames: list[tuple[Image.Image, float]] = []
    for cell in source_cells:
        foreground = keep_significant_foreground_components(cell)
        if args.mirror:
            foreground = ImageOps.mirror(foreground)
        cropped_frames.append(crop_foreground(foreground))

    # A single scale across the whole strip prevents the head and body from
    # subtly growing or shrinking between animation frames.
    max_height = max(frame.height for frame, _anchor in cropped_frames)
    max_left_extent = max(anchor for _frame, anchor in cropped_frames)
    max_right_extent = max(frame.width - anchor for frame, anchor in cropped_frames)
    scale = min(
        TARGET_BODY_HEIGHT / max_height,
        (PIVOT_X - HORIZONTAL_SAFE_MARGIN) / max_left_extent,
        (CANVAS_WIDTH - PIVOT_X - HORIZONTAL_SAFE_MARGIN) / max_right_extent,
    )

    for index, (cropped, root_anchor_x) in enumerate(cropped_frames):
        frame_2x = normalize_frame(cropped, root_anchor_x, scale)
        filename = frame_filename(
            args.direction,
            index,
            args.idle_frame_count,
            args.version,
        )
        frame_1x = frame_2x.resize(
            (LOGICAL_CANVAS_WIDTH, LOGICAL_CANVAS_HEIGHT),
            Image.Resampling.LANCZOS,
        )
        frame_1x.save(args.output_dir / filename)
        frame_2x.save(args.output_dir / density_filename(filename, ASSET_PIXEL_RATIO))


if __name__ == "__main__":
    main()
