"""Build the Card RPS HD assets from the generated raw PNGs.

Requires Pillow. The generated sources already contain alpha, but chroma-key
cleanup is retained so replacement generations can use #00ff00 as requested.
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
RAW = Path(__file__).with_name("card_rps_hd_raw")
OUT = ROOT / "src/features/pixel-world-phaser/assets/cardRps/hd"
PREVIEW = ROOT / ".test-artifacts/hd-preview.png"
LANCZOS = Image.Resampling.LANCZOS


def clean_alpha(image: Image.Image) -> Image.Image:
    """Remove chroma green and suppress green spill at surviving edges."""
    image = image.convert("RGBA")
    pixels = []
    for r, g, b, a in image.get_flattened_data():
        # Strong green pixels are background, including antialiased variants.
        dominance = g - max(r, b)
        if a == 0 or (g > 150 and dominance > 55):
            pixels.append((0, 0, 0, 0))
            continue
        if a < 255 or dominance > 10:
            g = min(g, max(r, b) + 8)
        pixels.append((r, g, b, a))
    image.putdata(pixels)
    return image


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("empty sprite cell")
    return bbox


def fit_sprite(image: Image.Image, size: tuple[int, int], margin: tuple[int, int]) -> Image.Image:
    image = image.crop(alpha_bbox(image))
    max_w, max_h = size[0] - 2 * margin[0], size[1] - 2 * margin[1]
    scale = min(max_w / image.width, max_h / image.height)
    image = image.resize((round(image.width * scale), round(image.height * scale)), LANCZOS)
    canvas = Image.new("RGBA", size)
    canvas.alpha_composite(image, ((size[0] - image.width) // 2, (size[1] - image.height) // 2))
    return canvas


def split_cells(image: Image.Image, columns: int, rows: int) -> list[Image.Image]:
    cells = []
    for row in range(rows):
        for column in range(columns):
            box = (
                round(column * image.width / columns),
                round(row * image.height / rows),
                round((column + 1) * image.width / columns),
                round((row + 1) * image.height / rows),
            )
            cells.append(image.crop(box))
    return cells


def build_room() -> Image.Image:
    source = Image.open(RAW / "room.png").convert("RGB")
    target_ratio = 1600 / 1000
    if source.width / source.height > target_ratio:
        width = round(source.height * target_ratio)
        left = (source.width - width) // 2
        source = source.crop((left, 0, left + width, source.height))
    else:
        height = round(source.width / target_ratio)
        top = (source.height - height) // 2
        source = source.crop((0, top, source.width, top + height))
    room = source.resize((1600, 1000), LANCZOS)
    room.save(OUT / "room.webp", "WEBP", quality=82, method=6)
    return room


def build_cards() -> Image.Image:
    source = clean_alpha(Image.open(RAW / "cards.png"))
    raw_cells = split_cells(source, 4, 2)
    # Generated order is scissors, rock, paper, back; runtime order is required below.
    order = (1, 0, 2, 3, 5, 4, 6, 7)
    cells = [fit_sprite(raw_cells[index], (192, 256), (5, 5)) for index in order]
    # The generator kept gold around both backs; add the required owner-color
    # outer frame while retaining its brown-and-gold back design.
    for index, color in ((3, (47, 133, 211, 255)), (7, (205, 47, 55, 255))):
        bbox = alpha_bbox(cells[index])
        inset = 1
        ImageDraw.Draw(cells[index]).rounded_rectangle(
            (bbox[0] + inset, bbox[1] + inset, bbox[2] - inset - 1, bbox[3] - inset - 1),
            radius=8,
            outline=color,
            width=4,
        )
    sheet = Image.new("RGBA", (768, 512))
    for index, cell in enumerate(cells):
        sheet.alpha_composite(cell, ((index % 4) * 192, (index // 4) * 256))
    sheet = clean_alpha(sheet)
    sheet.save(OUT / "cards.png", "PNG", optimize=True)
    return sheet


def build_cheese() -> Image.Image:
    source = clean_alpha(Image.open(RAW / "cheese.png"))
    raw_cells = split_cells(source, 5, 1)
    sheet = Image.new("RGBA", (1920, 384))
    for index, raw_cell in enumerate(raw_cells):
        sprite = raw_cell.crop(alpha_bbox(raw_cell))
        scale = min(370 / sprite.width, 360 / sprite.height)
        sprite = sprite.resize((round(sprite.width * scale), round(sprite.height * scale)), LANCZOS)
        frame = Image.new("RGBA", (384, 384))
        # Straight lower cut sits on the frame bottom/table edge.
        frame.alpha_composite(sprite, ((384 - sprite.width) // 2, 384 - sprite.height))
        sheet.alpha_composite(frame, (index * 384, 0))
    sheet = clean_alpha(sheet)
    sheet.save(OUT / "cheese.png", "PNG", optimize=True)
    return sheet


def build_fx() -> Image.Image:
    source = clean_alpha(Image.open(RAW / "fx.png"))
    cells = [fit_sprite(cell, (256, 256), (8, 8)) for cell in split_cells(source, 2, 1)]
    sheet = Image.new("RGBA", (512, 256))
    sheet.alpha_composite(cells[0], (0, 0))
    sheet.alpha_composite(cells[1], (256, 0))
    sheet = clean_alpha(sheet)
    sheet.save(OUT / "fx.png", "PNG", optimize=True)
    return sheet


def build_preview(room: Image.Image, cards: Image.Image, cheese: Image.Image) -> None:
    preview = room.convert("RGBA")
    npc = cheese.crop((0, 0, 384, 384)).resize((300, 300), LANCZOS)
    preview.alpha_composite(npc, (650, 108))

    placements = [(0, 485, 118), (1, 650, 145), (2, 805, 176)]
    for frame_index, y, height in placements:
        card = cards.crop((frame_index * 192, 0, (frame_index + 1) * 192, 256))
        width = round(height * 0.75)
        card = card.resize((width, height), LANCZOS)
        preview.alpha_composite(card, ((1600 - width) // 2, y - height // 2))
    PREVIEW.parent.mkdir(parents=True, exist_ok=True)
    preview.convert("RGB").save(PREVIEW, "PNG", optimize=True)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    room = build_room()
    cards = build_cards()
    cheese = build_cheese()
    build_fx()
    layout = {
        "tableTop": [[300, 410], [1270, 410], [1580, 900], [20, 900]],
        "opponentSeat": {"x": 800, "bottomY": 408},
        "opponentScale": 300,
        "rows": {"opponent": 485, "clash": 650, "mine": 805},
        "cardHeight": {"opponent": 118, "clash": 145, "mine": 176},
    }
    (OUT / "layout.json").write_text(json.dumps(layout, indent=2) + "\n", encoding="utf-8")
    build_preview(room, cards, cheese)


if __name__ == "__main__":
    main()
