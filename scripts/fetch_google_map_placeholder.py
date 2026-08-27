"""Optional: fetch a Static Maps snapshot using your Map ID (dark theme).

Reads GOOGLE_MAPS_API_KEY from .env — run locally only:
    python scripts/fetch_google_map_placeholder.py
"""
from __future__ import annotations

import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "images" / "daxi-map-placeholder.jpg"
MAP_ID = "c4948b020bfc08331f1cb94e"
CENTER = "19.7607,-72.2039"


def _load_key() -> str:
    env_path = ROOT / ".env"
    if not env_path.exists():
        raise SystemExit(".env not found")
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line.startswith("GOOGLE_MAPS_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("GOOGLE_MAPS_API_KEY missing in .env")


def main() -> None:
    key = _load_key()
    url = (
        "https://maps.googleapis.com/maps/api/staticmap?"
        f"center={CENTER}&zoom=14&size=1280x1280&scale=2&map_id={MAP_ID}&key={key}"
    )
    OUT.parent.mkdir(parents=True, exist_ok=True)
    urllib.request.urlretrieve(url, OUT)
    print(f"Saved {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
