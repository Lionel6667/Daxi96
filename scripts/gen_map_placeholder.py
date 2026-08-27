"""Generate a dark map-style placeholder (no external API)."""
from __future__ import annotations

import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "images" / "daxi-map-placeholder.jpg"


def main() -> None:
    w, h = 1920, 1920
    img = Image.new("RGB", (w, h), "#070b14")
    draw = ImageDraw.Draw(img)

    for cx, cy, radius, color in (
        (480, 620, 520, (15, 36, 68)),
        (1280, 980, 680, (10, 28, 52)),
        (960, 420, 400, (18, 45, 38)),
        (300, 1400, 360, (12, 30, 55)),
    ):
        for i in range(radius, 0, -10):
            draw.ellipse([cx - i, cy - i, cx + i, cy + i], fill=color)

    random.seed(42)
    for _ in range(22):
        x1 = random.randint(0, w)
        y1 = random.randint(0, h)
        x2 = x1 + random.randint(-520, 520)
        y2 = y1 + random.randint(-520, 520)
        draw.line([x1, y1, x2, y2], fill=(28, 42, 62), width=random.randint(2, 6))

    for _ in range(55):
        x1 = random.randint(0, w)
        y1 = random.randint(0, h)
        x2 = x1 + random.randint(-200, 200)
        y2 = y1 + random.randint(-200, 200)
        draw.line([x1, y1, x2, y2], fill=(20, 32, 48), width=1)

    img = img.filter(ImageFilter.GaussianBlur(1.8))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, "JPEG", quality=90, optimize=True)
    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
