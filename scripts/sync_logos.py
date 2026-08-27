"""Copie les logos marque transparents et l'icône app (launcher) vers tous les emplacements."""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC_BRAND_GOLD = ROOT / "assets/images/Daxi_real_gold_txt.png"
SRC_BRAND_DARK = ROOT / "assets/images/Daxi_real_dark_txt.png"
SRC_APP_ICON = ROOT / "logo_app.png"


def export_rgba(src: Path, dst: Path, max_side: int = 1024) -> None:
    im = Image.open(src).convert("RGBA")
    w, h = im.size
    if max(w, h) > max_side:
        r = max_side / max(w, h)
        im = im.resize((int(w * r), int(h * r)), Image.LANCZOS)
    dst.parent.mkdir(parents=True, exist_ok=True)
    im.save(dst, "PNG", optimize=True)


def main() -> int:
    if not SRC_BRAND_GOLD.is_file():
        print("Missing gold brand logo:", SRC_BRAND_GOLD, file=sys.stderr)
        return 1
    if not SRC_BRAND_DARK.is_file():
        print("Missing dark brand logo:", SRC_BRAND_DARK, file=sys.stderr)
        return 1
    if not SRC_APP_ICON.is_file():
        print("Missing app icon source:", SRC_APP_ICON, file=sys.stderr)
        return 1

    android = ROOT / "clients/daxi-android"

    targets_gold = [
        ROOT / "assets/images/daxi-logo-gold.png",
        ROOT / "assets/images/daxi-logo.png",
        ROOT / "static/img/daxi-logo-gold.png",
        ROOT / "static/img/daxi-logo.png",
        ROOT / "static/img/logo.png",
        android / "app/src/main/assets/webcache/assets/images/daxi-logo-gold.png",
        android / "app/src/main/assets/webcache/assets/images/daxi-logo.png",
        android / "app/src/main/res/drawable/daxi_logo_gold.png",
    ]
    targets_dark = [
        ROOT / "assets/images/daxi-logo-dark.png",
        ROOT / "static/img/daxi-logo-dark.png",
        android / "app/src/main/assets/webcache/assets/images/daxi-logo-dark.png",
    ]

    for t in targets_gold:
        export_rgba(SRC_BRAND_GOLD, t)
        print("gold ->", t.relative_to(ROOT))
    for t in targets_dark:
        export_rgba(SRC_BRAND_DARK, t)
        print("dark ->", t.relative_to(ROOT))

    im = Image.open(SRC_APP_ICON).convert("RGBA")
    w, h = im.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    icon = im.crop((left, top, left + side, top + side)).resize((512, 512), Image.LANCZOS)
    for dst in [
        ROOT / "assets/images/daxi-app-icon.png",
        ROOT / "static/img/daxi-app-icon.png",
        android / "app/src/main/assets/webcache/assets/images/daxi-app-icon.png",
        android / "app/src/main/res/drawable/daxi_app_icon.png",
    ]:
        dst.parent.mkdir(parents=True, exist_ok=True)
        icon.save(dst, "PNG", optimize=True)
        print("app-icon (unchanged source) ->", dst.relative_to(ROOT))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
