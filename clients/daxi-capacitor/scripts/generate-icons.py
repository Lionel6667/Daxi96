"""Build Android / iOS launcher + splash from the official DAXI cover logo."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
DJANGO = ROOT.parents[1]
SRC = DJANGO / "logo_app.png"
if not SRC.is_file():
    SRC = DJANGO / "assets" / "images" / "daxi-app-icon.png"
ANDROID_RES = ROOT / "android" / "app" / "src" / "main" / "res"
IOS_ICON = ROOT / "ios" / "App" / "App" / "Assets.xcassets" / "AppIcon.appiconset"
WWW = ROOT / "www" / "assets" / "images"
INTRO = ROOT / "intro"

NAVY = (7, 11, 20, 255)


def load_logo():
    im = Image.open(SRC).convert("RGBA")
    if im.size[0] != im.size[1]:
        side = max(im.size)
        canvas = Image.new("RGBA", (side, side), (255, 255, 255, 255))
        canvas.paste(im, ((side - im.size[0]) // 2, (side - im.size[1]) // 2), im)
        im = canvas
    return im


def fit(im, size, bg=(255, 255, 255, 255), pad=0.0):
    out = Image.new("RGBA", (size, size), bg)
    inner = int(size * (1 - pad * 2))
    scaled = im.resize((inner, inner), Image.Resampling.LANCZOS)
    xy = ((size - inner) // 2, (size - inner) // 2)
    out.paste(scaled, xy, scaled)
    return out


def splash(im, w, h):
    canvas = Image.new("RGBA", (w, h), NAVY)
    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(glow)
    cx, cy = w // 2, int(h * 0.42)
    r = int(min(w, h) * 0.28)
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(245, 158, 11, 55))
    glow = glow.filter(ImageFilter.GaussianBlur(int(r * 0.35)))
    canvas = Image.alpha_composite(canvas, glow)
    side = int(min(w, h) * 0.38)
    badge = fit(im, side, (255, 255, 255, 255), pad=0.04)
    mask = Image.new("L", (side, side), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, side - 1, side - 1), radius=int(side * 0.22), fill=255)
    badge.putalpha(mask)
    canvas.paste(badge, ((w - side) // 2, cy - side // 2), badge)
    return canvas.convert("RGB")


def save_png(im, path, size=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    out = im if size is None else fit(im, size)
    if out.mode != "RGBA":
        out = out.convert("RGBA")
    out.save(path, "PNG", optimize=True)


def main():
    logo = load_logo()
    densities = {
        "mdpi": 48,
        "hdpi": 72,
        "xhdpi": 96,
        "xxhdpi": 144,
        "xxxhdpi": 192,
    }
    fg = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}
    for name, size in densities.items():
        folder = ANDROID_RES / f"mipmap-{name}"
        icon = fit(logo, size)
        icon.save(folder / "ic_launcher.png", "PNG")
        icon.save(folder / "ic_launcher_round.png", "PNG")
        fit(logo, fg[name], (255, 255, 255, 0), pad=0.18).save(folder / "ic_launcher_foreground.png", "PNG")
        print("android", name, size)

    drawable = ANDROID_RES / "drawable"
    drawable.mkdir(parents=True, exist_ok=True)
    
    Image.new("RGB", (1280, 1920), NAVY[:3]).save(drawable / "splash.png", "PNG", optimize=True)
    gold_src = DJANGO / "assets" / "images" / "daxi-logo-gold.png"
    if not gold_src.is_file():
        gold_src = DJANGO / "assets" / "images" / "Daxi_real_gold_txt.png"
    if gold_src.is_file():
        gold = Image.open(gold_src).convert("RGBA")
        icon_side = 576
        canvas = Image.new("RGBA", (icon_side, icon_side), NAVY)
        max_w = int(icon_side * 0.72)
        ratio = min(max_w / gold.size[0], (icon_side * 0.38) / gold.size[1])
        gw, gh = max(1, int(gold.size[0] * ratio)), max(1, int(gold.size[1] * ratio))
        gold = gold.resize((gw, gh), Image.Resampling.LANCZOS)
        canvas.paste(gold, ((icon_side - gw) // 2, (icon_side - gh) // 2), gold)
        canvas.save(drawable / "splash_icon.png", "PNG", optimize=True)
        print("splash_icon", gold_src.name)
    else:
        fit(logo, 576, NAVY, pad=0.18).save(drawable / "splash_icon.png", "PNG")
        print("splash_icon fallback cover")
    land = ANDROID_RES / "drawable-land"
    land.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (1920, 1280), NAVY[:3]).save(land / "splash.png", "PNG", optimize=True)

    if IOS_ICON.exists():
        fit(logo, 1024).convert("RGB").save(IOS_ICON / "AppIcon-512@2x.png", "PNG")
        print("ios 1024")

    for dest in (WWW, INTRO, ROOT / "resources"):
        dest.mkdir(parents=True, exist_ok=True)
        logo.save(dest / ("icon.png" if dest.name == "resources" else "daxi-app-icon.png"), "PNG")
    Image.new("RGB", (2732, 2732), NAVY[:3]).save(ROOT / "resources" / "splash.png", "PNG", optimize=True)
    print("ok", SRC)


if __name__ == "__main__":
    main()
