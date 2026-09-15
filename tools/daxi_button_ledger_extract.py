#!/usr/bin/env python3
"""Extract every <button hit as a ledger inventory item (stdlib only).

Fingerprint: file|line|id|onclick|text|class_head
Outputs: e2e/artifacts/inventory/button_ledger_items.json
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "e2e" / "artifacts" / "inventory" / "button_ledger_items.json"

SKIP_DIR_NAMES = {
    "venv", ".venv", "env", "node_modules", "clients", "legacy",
    "__pycache__", ".git", "staticfiles", "media", "backups", "e2e",
}
SKIP_PATH_PARTS = {"static/vendor"}

BUTTON_RE = re.compile(r"<button\b[^>]*>", re.I | re.S)
ATTR = lambda name: re.compile(rf"""\b{name}\s*=\s*(['"])(.*?)\1""", re.I | re.S)

VENDOR_RE = re.compile(
    r"(^assets/js/(aos|htmx\.min|tailwind)|chart\.|leaflet|firebase|vendor/|\.min\.js$)",
    re.I,
)
# Alternate / superseded shells that duplicate live surfaces
DUPLICATE_MAP = {
    "templates/index.html": "vubez2.html",
    "templates/driver_dashboard.html": "driver_home.html",
}


def should_skip(path: Path) -> bool:
    try:
        rel = path.relative_to(ROOT)
    except ValueError:
        return True
    if set(rel.parts) & SKIP_DIR_NAMES:
        return True
    rel_s = str(rel).replace("\\", "/")
    for frag in SKIP_PATH_PARTS:
        if frag in rel_s:
            return True
    name = path.name.lower()
    if name.endswith(".bak") or ".bak." in name:
        return True
    return False


def attr(tag: str, name: str) -> str:
    m = ATTR(name).search(tag)
    return (m.group(2) if m else "").strip()


def text_after(src: str, end: int) -> str:
    # crude: take until </button> or 80 chars
    close = src.find("</button>", end)
    chunk = src[end : close if close != -1 else end + 80]
    chunk = re.sub(r"<[^>]+>", " ", chunk)
    chunk = re.sub(r"\s+", " ", chunk).strip()
    return chunk[:80]


def class_head(cls: str) -> str:
    parts = [c for c in cls.split() if c and not re.match(
        r"^(w-|h-|p-|m-|px-|py-|pt-|pb-|ml-|mr-|mt-|mb-|flex|grid|text-|bg-|border|rounded|gap-|items-|justify-|hidden|opacity-|absolute|relative|fixed|inset-|z-|sm:|md:|lg:|xl:|hover:|focus:|active:)",
        c,
    )]
    return ".".join(parts[:4])


def classify_static(rel: str) -> tuple[str | None, str]:
    if VENDOR_RE.search(rel):
        return "excluded_vendor", "third-party / minified asset"
    if rel in DUPLICATE_MAP:
        return "duplicate_of", DUPLICATE_MAP[rel]
    # orphan standalone shells not wired as primary e2e routes
    if rel in {"compte.html", "entreprise.html"}:
        return None, "secondary_shell"  # still try to cover via route
    return None, ""


def extract() -> list[dict]:
    items = []
    files = []
    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix.lower() not in {".html", ".js", ".mjs"}:
            continue
        if should_skip(path):
            continue
        files.append(path)

    for path in sorted(files, key=lambda p: str(p)):
        rel = str(path.relative_to(ROOT)).replace("\\", "/")
        try:
            src = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        pre_status, pre_note = classify_static(rel)
        for i, m in enumerate(BUTTON_RE.finditer(src)):
            tag = m.group(0)
            # line number
            line = src.count("\n", 0, m.start()) + 1
            bid = attr(tag, "id")
            onclick = attr(tag, "onclick")[:120]
            cls = attr(tag, "class")
            aria = attr(tag, "aria-label")
            title = attr(tag, "title")
            typ = attr(tag, "type") or "submit"  # HTML default
            hx = ""
            for hxk in ("hx-get", "hx-post", "hx-put", "hx-delete", "hx-patch"):
                v = attr(tag, hxk)
                if v:
                    hx = f"{hxk}={v}"
                    break
            txt = aria or title or text_after(src, m.end())
            ch = class_head(cls)
            fp = "||".join([
                "button",
                rel,
                str(line),
                bid,
                onclick[:80],
                hx[:80],
                (txt or "")[:60].replace("\n", " "),
                ch,
            ])
            items.append({
                "inventory_id": f"btn:{rel}:{line}:{i}",
                "fingerprint": fp,
                "kind": "button",
                "file": rel,
                "line": line,
                "id": bid,
                "onclick": onclick,
                "hx": hx,
                "label": (txt or "")[:80],
                "className": cls[:160],
                "type": typ,
                "pre_status": pre_status,
                "pre_note": pre_note,
                "status": pre_status,  # may be filled later
                "evidence": pre_note or "",
                "matched_runtime": None,
            })
    return items


def main():
    items = extract()
    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "root": str(ROOT),
        "count": len(items),
        "by_status_pre": {},
        "items": items,
    }
    from collections import Counter
    c = Counter(i["status"] or "pending" for i in items)
    payload["by_status_pre"] = dict(c)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False))
    print(json.dumps({"ok": True, "count": len(items), "out": str(OUT), "pre": payload["by_status_pre"]}))


if __name__ == "__main__":
    main()
