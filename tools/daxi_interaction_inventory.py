#!/usr/bin/env python3
"""DAXI interaction inventory — scan HTML/JS for UI and network hooks (stdlib only).

Excludes: venv, node_modules, clients/, legacy/, *.bak, static/vendor/
Outputs: e2e/artifacts/inventory/
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT_DEFAULT = Path(__file__).resolve().parents[1]

SKIP_DIR_NAMES = {
    "venv",
    ".venv",
    "env",
    "node_modules",
    "clients",
    "legacy",
    "__pycache__",
    ".git",
    "staticfiles",
    "media",
    "backups",
    "e2e",
}
SKIP_PATH_PARTS = {
    "static/vendor",
    "static\\vendor",
}

PATTERNS = {
    "button": re.compile(r"<button\b", re.I),
    "a_href": re.compile(r"<a\b[^>]*\bhref\s*=", re.I),
    "onclick": re.compile(r"\bonclick\s*=", re.I),
    "addEventListener_click": re.compile(
        r"""\.addEventListener\s*\(\s*['"]click['"]""", re.I
    ),
    "hx_star": re.compile(r"\bhx-[a-z0-9_-]+\s*=", re.I),
    "fetch": re.compile(r"\bfetch\s*\(", re.I),
    "WebSocket": re.compile(r"\b(?:new\s+)?WebSocket\s*\(|\bReconnectingWebSocket\b", re.I),
    "role_button": re.compile(r"""\brole\s*=\s*['"]button['"]""", re.I),
    "data_testid": re.compile(r"""\bdata-testid\s*=\s*['"]([^'"]+)['"]""", re.I),
}

INTERACTIVE_HINT = re.compile(
    r"""<(?:button|a)\b|onclick\s*=|addEventListener\s*\(\s*['"]click['"]"""
    r"""|role\s*=\s*['"]button['"]|hx-(?:get|post|put|delete|patch)\s*=""",
    re.I,
)


def should_skip(path: Path, root: Path) -> bool:
    try:
        rel = path.relative_to(root)
    except ValueError:
        return True
    parts = set(rel.parts)
    if parts & SKIP_DIR_NAMES:
        return True
    rel_s = str(rel).replace("\\", "/")
    for frag in SKIP_PATH_PARTS:
        if frag.replace("\\", "/") in rel_s:
            return True
    name = path.name.lower()
    if name.endswith(".bak") or ".bak." in name or name.endswith(".bak-pre-perf"):
        return True
    return False


def iter_source_files(root: Path):
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix.lower() not in {".html", ".js", ".mjs"}:
            continue
        if should_skip(path, root):
            continue
        yield path


def scan_file(path: Path) -> dict:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        return {"error": str(exc)}
    counts = {k: len(pat.findall(text)) for k, pat in PATTERNS.items() if k != "data_testid"}
    testids = PATTERNS["data_testid"].findall(text)
    counts["data_testid"] = len(testids)
    interactive = bool(INTERACTIVE_HINT.search(text))
    missing = interactive and counts["data_testid"] == 0
    return {
        "counts": counts,
        "testids": testids,
        "interactive_without_testid": missing,
        "bytes": len(text.encode("utf-8", errors="replace")),
        "lines": text.count("\n") + 1,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="DAXI HTML/JS interaction inventory")
    parser.add_argument(
        "--root",
        type=Path,
        default=ROOT_DEFAULT,
        help="Project root (default: parent of tools/)",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Output directory (default: <root>/e2e/artifacts/inventory)",
    )
    args = parser.parse_args(argv)
    root = args.root.resolve()
    out_dir = (args.out or (root / "e2e" / "artifacts" / "inventory")).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    totals: Counter = Counter()
    by_file = []
    missing_testid = []
    all_testids = []
    errors = []

    for path in sorted(iter_source_files(root), key=lambda p: str(p).lower()):
        rel = str(path.relative_to(root)).replace("\\", "/")
        result = scan_file(path)
        if "error" in result:
            errors.append({"file": rel, "error": result["error"]})
            continue
        counts = result["counts"]
        for k, v in counts.items():
            totals[k] += v
        entry = {"file": rel, **counts, "bytes": result["bytes"], "lines": result["lines"]}
        by_file.append(entry)
        all_testids.extend(result["testids"])
        if result["interactive_without_testid"]:
            missing_testid.append(rel)

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    summary = {
        "generated_at_utc": stamp,
        "root": str(root),
        "files_scanned": len(by_file),
        "totals": dict(totals),
        "unique_data_testid": sorted(set(all_testids)),
        "interactive_files_missing_data_testid_count": len(missing_testid),
        "errors": errors,
    }

    (out_dir / "inventory_summary.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    (out_dir / "inventory_by_file.json").write_text(
        json.dumps(by_file, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    (out_dir / "missing_data_testid.json").write_text(
        json.dumps(missing_testid, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    # Compact sample summary for git (human-readable, no huge dumps)
    lines = [
        "# DAXI interaction inventory (sample summary)",
        "",
        f"Generated (UTC): `{stamp}`",
        f"Root: `{root}`",
        f"Files scanned: **{len(by_file)}**",
        "",
        "## Totals",
        "",
        "| Signal | Count |",
        "|--------|------:|",
    ]
    order = [
        "button",
        "a_href",
        "onclick",
        "addEventListener_click",
        "hx_star",
        "fetch",
        "WebSocket",
        "role_button",
        "data_testid",
    ]
    for key in order:
        lines.append(f"| `{key}` | {totals.get(key, 0)} |")
    lines.extend(
        [
            "",
            f"Unique `data-testid` values: **{len(set(all_testids))}**",
            f"Interactive files missing `data-testid`: **{len(missing_testid)}** "
            f"(full list in `missing_data_testid.json`, gitignored if large)",
            "",
            "## Top files by button count",
            "",
        ]
    )
    top_btn = sorted(by_file, key=lambda r: (-r.get("button", 0), r["file"]))[:15]
    lines.append("| File | button | a_href | onclick | fetch | hx_* |")
    lines.append("|------|-------:|-------:|--------:|------:|-----:|")
    for row in top_btn:
        lines.append(
            f"| `{row['file']}` | {row.get('button', 0)} | {row.get('a_href', 0)} | "
            f"{row.get('onclick', 0)} | {row.get('fetch', 0)} | {row.get('hx_star', 0)} |"
        )
    lines.extend(
        [
            "",
            "## How to regenerate",
            "",
            "```powershell",
            "Set-Location -LiteralPath '<project-root>'",
            "python tools/daxi_interaction_inventory.py",
            "```",
            "",
            "Large dumps (`inventory_by_file.json`, `missing_data_testid.json`) stay under "
            "`e2e/artifacts/inventory/` and are gitignored; keep this summary + README.",
            "",
        ]
    )
    summary_md = "\n".join(lines)
    (out_dir / "INVENTORY_SUMMARY.md").write_text(summary_md, encoding="utf-8")

    readme = """# e2e/artifacts/inventory

Output of `tools/daxi_interaction_inventory.py`.

- `INVENTORY_SUMMARY.md` — committed sample summary
- `inventory_summary.json` — machine-readable totals
- `inventory_by_file.json` — per-file counts (gitignored when large)
- `missing_data_testid.json` — interactive files without data-testid (gitignored)

Regenerate:

```powershell
Set-Location -LiteralPath '<julmin_taxis_django root>'
python tools/daxi_interaction_inventory.py
```
"""
    (out_dir / "README.md").write_text(readme, encoding="utf-8")

    print(f"Scanned {len(by_file)} files -> {out_dir}")
    print(json.dumps(dict(totals), indent=2))
    if errors:
        print(f"Warnings: {len(errors)} read errors", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
