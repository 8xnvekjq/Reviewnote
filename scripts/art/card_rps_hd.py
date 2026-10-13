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


def opaque_runs(profile: list[int], min_len: int) -> list[tuple[int, int]]:
    """Return [start, end) runs where the projection profile is non-zero."""
    runs, start = [], None
    for index, value in enumerate(profile + [0]):
        if value and start is None:
            start = index
        elif not value and start is not None:
            if index - start >= min_len:
                runs.append((start, index))
            start = None
    return runs


def find_cards(image: Image.Image) -> list[tuple[int, int, int, int]]:
    """Locate the 8 cards by their solid alpha, ignoring faint generator haze."""
    solid = image.getchannel("A").point(lambda value: 255 if value > 128 else 0)
    width, height = solid.size
    data = solid.load()
    rows = opaque_runs([sum(1 for x in range(0, width, 2) if data[x, y]) for y in range(height)], 40)
    boxes = []
    for top, bottom in rows:
        columns = opaque_runs(
            [sum(1 for y in range(top, bottom, 2) if data[x, y]) for x in range(width)], 40
        )
        for left, right in columns:
            boxes.append((left, top, right, bottom))
    if len(boxes) != 8:
        raise ValueError(f"expected 8 cards, found {len(boxes)}: {boxes}")
    return boxes


CARD_FRAME = (192, 256)
# Every card is scaled to exactly this outline so faces and backs line up.
CARD_SIZE = (180, 248)
CARD_RADIUS = 12


def build_cards() -> Image.Image:
    source = clean_alpha(Image.open(RAW / "cards.png"))
    boxes = find_cards(source)
    # Drop the faint haze around the cards before scaling.
    source.putalpha(source.getchannel("A").point(lambda value: 0 if value < 48 else value))
    # Generated order is scissors, rock, paper, back; runtime order is required below.
    order = (1, 0, 2, 3, 5, 4, 6, 7)
    offset = ((CARD_FRAME[0] - CARD_SIZE[0]) // 2, (CARD_FRAME[1] - CARD_SIZE[1]) // 2)
    cells = []
    for index in order:
        card = source.crop(boxes[index]).resize(CARD_SIZE, LANCZOS)
        cell = Image.new("RGBA", CARD_FRAME)
        cell.alpha_composite(card, offset)
        cells.append(cell)
    # The generator kept gold around both backs; draw the owner colour as a
    # ring hugging the back's own rounded border (just inside its dark outline).
    for index, color in ((3, (47, 133, 211, 255)), (7, (205, 47, 55, 255))):
        x0, y0 = offset
        x1, y1 = x0 + CARD_SIZE[0] - 1, y0 + CARD_SIZE[1] - 1
        draw = ImageDraw.Draw(cells[index])
        draw.rounded_rectangle((x0, y0, x1, y1), radius=CARD_RADIUS, outline=(43, 24, 16, 255), width=4)
        draw.rounded_rectangle(
            (x0 + 4, y0 + 4, x1 - 4, y1 - 4), radius=CARD_RADIUS - 4, outline=color, width=6
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
