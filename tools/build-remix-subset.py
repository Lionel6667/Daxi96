#!/usr/bin/env python3
"""Build remixicon-vubez2.css subset from icons used on the vubez2 page."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCAN_PATHS = [
    ROOT / "vubez2.html",
    *sorted((ROOT / "static/js").glob("daxi-*.js")),
    *sorted((ROOT / "static/js/vubez2").glob("*.js")),
]
SIZE_TOKENS = {"ri-lg", "ri-sm", "ri-xl", "ri-xs", "ri-xxs", "ri-1x", "ri-2x", "ri-3x", "ri-4x", "ri-5x"}

src = (ROOT / "assets/css/remixicon.min.css").read_text(encoding="utf-8")
icons = set()
for path in SCAN_PATHS:
    if not path.is_file():
        continue
    icons.update(re.findall(r"\bri-[a-z0-9-]+", path.read_text(encoding="utf-8", errors="ignore")))
icons = sorted(i for i in icons if i not in SIZE_TOKENS)


chunks = []
font_block = re.search(r"@font-face\{[^}]+\}", src)
if font_block:
    chunks.append(font_block.group(0))

base_rules = []
combined = re.search(r'\[class\*=" ri-"\],\[class\^=ri-\]\{[^}]+\}', src)
if combined:
    base_rules.append(combined.group(0))
else:
    for sel in [r"\[class\^=ri-\]", r'\[class\*=" ri-"\]']:
        m = re.search(sel + r"\{[^}]+\}", src)
        if m:
            base_rules.append(m.group(0))

chunks.extend(base_rules)

for icon in icons:
    esc = icon.replace("-", r"\-")
    m = re.search(rf"\.{esc}:before\s*\{{[^}}]+\}}", src)
    if m:
        chunks.append(m.group(0))
    else:
        print("MISSING", icon)

out = ROOT / "assets/css/remixicon-vubez2.css"
css = "/* DAXI vubez2 remixicon subset */\n" + "\n".join(chunks) + "\n"
out.write_text(css, encoding="utf-8")
print(f"Wrote {out} icons={len(icons)} bytes={len(css.encode())}")
