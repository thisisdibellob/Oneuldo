"""Create complete web fonts without subsetting or altering their glyph data.

One-time tooling: python -m pip install "fonttools[woff]==4.65.0"
Then: python scripts/generate-web-fonts.py
The native OTF/TTF files remain unchanged.
"""
from hashlib import sha256
import json
from pathlib import Path

import fontTools
from fontTools.ttLib import TTFont
from fontTools.ttLib.woff2 import compress

FONT_DIR = Path(__file__).resolve().parents[1] / "assets" / "fonts"
WEB_DIR = FONT_DIR / "web"


def rendering_table(tag, data):
    if tag == "head":
        data = bytearray(data)
        # WOFF2 changes the container checksum and sets lossless conversion bit 11.
        data[8:12] = b"\0" * 4
        data[16:18] = (int.from_bytes(data[16:18], "big") & ~0x0800).to_bytes(2, "big")
        return bytes(data)
    return data


def main():
    WEB_DIR.mkdir(exist_ok=True)
    files = []
    sources = sorted([*FONT_DIR.glob("*.otf"), *FONT_DIR.glob("*.ttf")])
    for source in sources:
        original = source.read_bytes()
        destination = WEB_DIR / (source.stem + ".woff2")
        # Avoid even the optional glyf/loca preprocessing: preserve raw outline tables.
        compress(source, destination, transform_tables=set())
        with TTFont(source, recalcTimestamp=False) as native, TTFont(destination, recalcTimestamp=False) as web:
            # A source-font digital signature cannot sign a new WOFF2 container.
            assert set(native.reader.keys()) - {"DSIG"} == set(web.reader.keys()) - {"DSIG"}
            for tag in set(native.reader.keys()) - {"DSIG"}:
                assert rendering_table(tag, native.reader[tag]) == rendering_table(tag, web.reader[tag]), (source.name, tag)
            assert native.getGlyphOrder() == web.getGlyphOrder(), source.name
            assert native.getBestCmap() == web.getBestCmap(), source.name
            cmap = native.getBestCmap()
            glyph_count = len(native.getGlyphOrder())
        assert source.read_bytes() == original, "Native source changed"
        files.append({
            "source": source.name,
            "web": destination.name,
            "sourceBytes": len(original),
            "webBytes": destination.stat().st_size,
            "sourceSha256": sha256(original).hexdigest(),
            "webSha256": sha256(destination.read_bytes()).hexdigest(),
            "glyphs": glyph_count,
            "unicodeCodepoints": len(cmap),
            "hangulSyllables": sum(0xAC00 <= code <= 0xD7A3 for code in cmap),
            "verified": "All original Unicode mappings, glyph order, and rendering tables identical; no subsetting",
        })
        print(f"{source.name}: {len(original):,} -> {destination.stat().st_size:,} bytes; {glyph_count:,} glyphs", flush=True)
    total_original = sum(row["sourceBytes"] for row in files)
    total_web = sum(row["webBytes"] for row in files)
    manifest = {
        "format": "WOFF2",
        "generator": "fontTools " + fontTools.__version__,
        "subset": False,
        "transformedTables": [],
        "containerOnlyChanges": ["head.checkSumAdjustment", "head.flags bit 11 (lossless font conversion)", "DSIG removed when present"],
        "sourceBytes": total_original,
        "webBytes": total_web,
        "reductionPercent": round((1 - total_web / total_original) * 100, 2),
        "files": files,
    }
    (WEB_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf8")
    print(f"TOTAL: {total_original:,} -> {total_web:,} bytes ({manifest['reductionPercent']}% smaller)", flush=True)


if __name__ == "__main__":
    main()
