#!/usr/bin/env python3
"""Syntax-aware comment stripper. Run once; does not change program logic besides comments."""
from __future__ import annotations

import io
import json
import os
import re
import shutil
import sys
import tokenize
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKUP = ROOT / "_comment_backup"

SKIP_DIR_NAMES = {
    "venv", "node_modules", ".git", "__pycache__", ".pytest_cache",
    "backups", "media", "build", ".gradle", "intermediates",
    "PHPMailer", "vendor", "geo_data", "data",
    "_comment_backup",
}
SKIP_DIR_PARTS = (
    "android/app/build",
    "android/capacitor-cordova-android-plugins/build",
    "ios/App/App/public",
    "android/app/src/main/assets/public",
    "android/app/build/intermediates",
    "clients/daxi-capacitor/www",
    "clients/daxi-android",
    "static/vendor",
    "legacy/html",
    "legacy/phpscript/PHPMailer",
)
SKIP_SUFFIXES = (
    ".min.js", ".min.css", ".map", ".png", ".jpg", ".jpeg", ".webp",
    ".gif", ".ico", ".woff", ".woff2", ".ttf", ".eot", ".apk",
    ".sqlite3", ".bak", ".csv", ".json", ".md", ".txt", ".lock",
)
SKIP_FILES = {
    ".env", ".env.example", ".gitignore", "requirements.txt",
    "cerveau.json", "models.json", "manifest.json",
    "_strip_comments.py", "_strip_comments_report.json",
}

PY_EXTS = {".py"}
JS_EXTS = {".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"}
CSS_EXTS = {".css", ".scss", ".less"}
HTML_EXTS = {".html", ".htm"}
XML_EXTS = {".xml"}
SQL_EXTS = {".sql"}
SH_EXTS = {".sh"}
BAT_EXTS = {".bat", ".cmd"}
JAVA_EXTS = {".java", ".kt", ".kts"}
PHP_EXTS = {".php"}

JS_REGEX_OK_PREV = set("([{,;:=!&|?~+-*%^<>")


def should_skip_path(path: Path) -> bool:
    rel = path.relative_to(ROOT).as_posix()
    if path.name in SKIP_FILES:
        return True
    if path.name.startswith("."):
        return True
    for part in path.parts:
        if part in SKIP_DIR_NAMES:
            return True
    for frag in SKIP_DIR_PARTS:
        if frag in rel:
            return True
    name = path.name.lower()
    if any(name.endswith(s) for s in SKIP_SUFFIXES):
        return True
    if name.endswith(".min.js") or ".min." in name:
        return True
    return False


def lang_for(path: Path) -> str | None:
    ext = path.suffix.lower()
    if ext in PY_EXTS:
        return "py"
    if ext in JS_EXTS:
        return "js"
    if ext in CSS_EXTS:
        return "css"
    if ext in HTML_EXTS:
        return "html"
    if ext in XML_EXTS:
        return "xml"
    if ext in SQL_EXTS:
        return "sql"
    if ext in SH_EXTS:
        return "sh"
    if ext in BAT_EXTS:
        return "bat"
    if ext in JAVA_EXTS:
        return "java"
    if ext in PHP_EXTS:
        return "php"
    return None


def _line_col_to_index(src: str, line: int, col: int) -> int:
    idx = 0
    cur = 1
    while cur < line:
        nl = src.find("\n", idx)
        if nl < 0:
            return len(src)
        idx = nl + 1
        cur += 1
    return idx + col


def strip_python(src: str) -> tuple[str, int]:
    """Remove COMMENT tokens only. Keep strings/docstrings/shebang. No reformat."""
    spans = []
    try:
        for tok in tokenize.generate_tokens(io.StringIO(src).readline):
            if tok.type != tokenize.COMMENT:
                continue
            if tok.string.startswith("#!") and tok.start[1] == 0:
                continue
            spans.append((tok.start, tok.end))
    except tokenize.TokenError:
        return src, -1
    if not spans:
        return src, 0
    indices = [
        (_line_col_to_index(src, s[0], s[1]), _line_col_to_index(src, e[0], e[1]))
        for s, e in spans
    ]
    pieces = src
    for a, b in reversed(indices):
        pieces = pieces[:a] + pieces[b:]
    return pieces, len(spans)


def _read_ident_back(s: str, i: int) -> str:
    j = i
    while j > 0 and (s[j - 1].isalnum() or s[j - 1] in "_$"):
        j -= 1
    return s[j:i]


def strip_js_like(src: str, *, allow_hash: bool = False) -> tuple[str, int]:
    """Lexer for JS/TS/Java/Kotlin/PHP (// /* */) plus optional #."""
    n = len(src)
    i = 0
    out = []
    comments = 0
    in_sq = in_dq = in_bt = False
    tmpl_depth = 0
    last_code = " "

    def prev_code_char() -> str:
        return last_code

    def can_regex() -> bool:
        p = prev_code_char()
        if p.isspace():
            return True
        if p in JS_REGEX_OK_PREV:
            return True
        ident = _read_ident_back("".join(out), len(out))
        # crude: look at last word in out
        k = len(out) - 1
        while k >= 0 and out[k].isspace():
            k -= 1
        word = []
        while k >= 0 and (out[k].isalnum() or out[k] in "_$"):
            word.append(out[k])
            k -= 1
        w = "".join(reversed(word))
        return w in {
            "return", "case", "throw", "new", "typeof", "void", "delete",
            "in", "of", "instanceof", "else", "do", "yield", "await",
        }

    while i < n:
        ch = src[i]
        nxt = src[i + 1] if i + 1 < n else ""

        if in_bt:
            out.append(ch)
            if ch == "\\" and i + 1 < n:
                out.append(src[i + 1])
                i += 2
                continue
            if ch == "`":
                in_bt = False
            elif ch == "$" and nxt == "{":
                out.append("{")
                i += 2
                tmpl_depth += 1
                in_bt = False
                last_code = "{"
                continue
            i += 1
            continue

        if in_sq:
            out.append(ch)
            if ch == "\\" and i + 1 < n:
                out.append(src[i + 1])
                i += 2
                continue
            if ch == "'":
                in_sq = False
            i += 1
            continue

        if in_dq:
            out.append(ch)
            if ch == "\\" and i + 1 < n:
                out.append(src[i + 1])
                i += 2
                continue
            if ch == '"':
                in_dq = False
            i += 1
            continue

        if tmpl_depth and ch == "}":
            # may close template expression
            out.append(ch)
            tmpl_depth -= 1
            in_bt = True
            last_code = ch
            i += 1
            continue

        if ch == "'" :
            in_sq = True
            out.append(ch)
            last_code = ch
            i += 1
            continue
        if ch == '"':
            in_dq = True
            out.append(ch)
            last_code = ch
            i += 1
            continue
        if ch == "`":
            in_bt = True
            out.append(ch)
            last_code = ch
            i += 1
            continue

        if ch == "/" and nxt == "/":
            comments += 1
            i += 2
            while i < n and src[i] not in "\r\n":
                i += 1
            continue
        if ch == "/" and nxt == "*":
            comments += 1
            i += 2
            while i < n - 1 and not (src[i] == "*" and src[i + 1] == "/"):
                i += 1
            i = min(n, i + 2)
            continue
        if allow_hash and ch == "#" and not (i > 0 and src[i - 1] not in " \t\n\r;{}()"):
            # PHP # comments at start of statement-ish; skip if uncertain: only if line-start or after whitespace/semicolon
            prev = src[i - 1] if i else "\n"
            if prev in "\n\r \t;{}":
                comments += 1
                while i < n and src[i] not in "\r\n":
                    i += 1
                continue

        if ch == "/" and can_regex():
            # regex literal
            out.append(ch)
            last_code = ch
            i += 1
            in_class = False
            while i < n:
                c = src[i]
                out.append(c)
                if c == "\\" and i + 1 < n:
                    out.append(src[i + 1])
                    i += 2
                    continue
                if c == "[" and not in_class:
                    in_class = True
                elif c == "]" and in_class:
                    in_class = False
                elif c == "/" and not in_class:
                    i += 1
                    while i < n and src[i].isalpha():
                        out.append(src[i])
                        i += 1
                    last_code = "/"
                    break
                i += 1
            continue

        out.append(ch)
        if not ch.isspace():
            last_code = ch
        i += 1
    return "".join(out), comments


def strip_css(src: str) -> tuple[str, int]:
    n = len(src)
    i = 0
    out = []
    comments = 0
    in_sq = in_dq = False
    while i < n:
        ch = src[i]
        nxt = src[i + 1] if i + 1 < n else ""
        if in_sq:
            out.append(ch)
            if ch == "\\" and i + 1 < n:
                out.append(src[i + 1]); i += 2; continue
            if ch == "'":
                in_sq = False
            i += 1
            continue
        if in_dq:
            out.append(ch)
            if ch == "\\" and i + 1 < n:
                out.append(src[i + 1]); i += 2; continue
            if ch == '"':
                in_dq = False
            i += 1
            continue
        if ch == "'":
            in_sq = True
            out.append(ch); i += 1; continue
        if ch == '"':
            in_dq = True
            out.append(ch); i += 1; continue
        if ch == "/" and nxt == "*":
            comments += 1
            i += 2
            while i < n - 1 and not (src[i] == "*" and src[i + 1] == "/"):
                i += 1
            i = min(n, i + 2)
            continue
        out.append(ch)
        i += 1
    return "".join(out), comments


def strip_xml_comments(src: str) -> tuple[str, int]:
    comments = 0
    out = []
    i = 0
    n = len(src)
    in_cdata = False
    while i < n:
        if in_cdata:
            if src.startswith("]]>", i):
                out.append("]]>")
                i += 3
                in_cdata = False
                continue
            out.append(src[i]); i += 1
            continue
        if src.startswith("<![CDATA[", i):
            out.append("<![CDATA[")
            i += 9
            in_cdata = True
            continue
        if src.startswith("<!--", i):
            comments += 1
            j = src.find("-->", i + 4)
            if j < 0:
                return src, -1
            i = j + 3
            continue
        out.append(src[i]); i += 1
    return "".join(out), comments


def strip_django_comments(src: str) -> tuple[str, int]:
    comments = 0
    def repl_hash(m):
        nonlocal comments
        comments += 1
        return ""
    def repl_block(m):
        nonlocal comments
        comments += 1
        return ""
    # {# ... #} not inside strings is hard; django comments rarely inside strings of python.
    # Skip if inside {{ }} ? Unlikely.
    out = re.sub(r"\{#.*?#\}", repl_hash, src, flags=re.S)
    out = re.sub(
        r"\{%\s*comment\s*%\}.*?\{%\s*endcomment\s*%\}",
        repl_block,
        out,
        flags=re.S | re.I,
    )
    return out, comments


def strip_html(src: str) -> tuple[str, int]:
    comments = 0
    out = []
    i = 0
    n = len(src)
    while i < n:
        low = src[i:i + 10].lower()
        if src.startswith("<!--", i):
            j = src.find("-->", i + 4)
            if j < 0:
                return src, -1
            comments += 1
            i = j + 3
            continue
        if low.startswith("<script"):
            end_tag = src.lower().find("</script>", i)
            gt = src.find(">", i)
            if gt < 0:
                out.append(src[i]); i += 1; continue
            out.append(src[i:gt + 1])
            if end_tag < 0:
                rest, c = strip_js_like(src[gt + 1:])
                comments += c
                out.append(rest)
                break
            inner = src[gt + 1:end_tag]
            inner2, c = strip_js_like(inner)
            comments += c
            out.append(inner2)
            close_end = end_tag + len("</script>")
            out.append(src[end_tag:close_end])
            i = close_end
            continue
        if low.startswith("<style"):
            end_tag = src.lower().find("</style>", i)
            gt = src.find(">", i)
            if gt < 0:
                out.append(src[i]); i += 1; continue
            out.append(src[i:gt + 1])
            if end_tag < 0:
                rest, c = strip_css(src[gt + 1:])
                comments += c
                out.append(rest)
                break
            inner = src[gt + 1:end_tag]
            inner2, c = strip_css(inner)
            comments += c
            out.append(inner2)
            close_end = end_tag + len("</style>")
            out.append(src[end_tag:close_end])
            i = close_end
            continue
        out.append(src[i]); i += 1
    text = "".join(out)
    text, c2 = strip_django_comments(text)
    comments += c2
    return text, comments


def strip_sql(src: str) -> tuple[str, int]:
    n = len(src)
    i = 0
    out = []
    comments = 0
    in_sq = in_dq = False
    while i < n:
        ch = src[i]
        nxt = src[i + 1] if i + 1 < n else ""
        if in_sq:
            out.append(ch)
            if ch == "'" and nxt == "'":
                out.append(nxt); i += 2; continue
            if ch == "'":
                in_sq = False
            i += 1; continue
        if in_dq:
            out.append(ch)
            if ch == '"':
                in_dq = False
            i += 1; continue
        if ch == "'":
            in_sq = True; out.append(ch); i += 1; continue
        if ch == '"':
            in_dq = True; out.append(ch); i += 1; continue
        if ch == "-" and nxt == "-":
            comments += 1
            i += 2
            while i < n and src[i] not in "\r\n":
                i += 1
            continue
        if ch == "/" and nxt == "*":
            comments += 1
            i += 2
            while i < n - 1 and not (src[i] == "*" and src[i + 1] == "/"):
                i += 1
            i = min(n, i + 2)
            continue
        out.append(ch); i += 1
    return "".join(out), comments


def strip_sh(src: str) -> tuple[str, int]:
    lines = src.splitlines(keepends=True)
    comments = 0
    out = []
    for line in lines:
        if line.startswith("#!"):
            out.append(line)
            continue
        i = 0
        n = len(line)
        buf = []
        in_sq = in_dq = False
        while i < n:
            ch = line[i]
            if in_sq:
                buf.append(ch)
                if ch == "'":
                    in_sq = False
                i += 1; continue
            if in_dq:
                buf.append(ch)
                if ch == "\\" and i + 1 < n:
                    buf.append(line[i + 1]); i += 2; continue
                if ch == '"':
                    in_dq = False
                i += 1; continue
            if ch == "'":
                in_sq = True; buf.append(ch); i += 1; continue
            if ch == '"':
                in_dq = True; buf.append(ch); i += 1; continue
            if ch == "#":
                comments += 1
                # keep newline
                if line.endswith("\n"):
                    buf.append("\n")
                elif line.endswith("\r\n"):
                    buf.append("\r\n")
                break
            buf.append(ch); i += 1
        out.append("".join(buf))
    return "".join(out), comments


def strip_bat(src: str) -> tuple[str, int]:
    comments = 0
    out_lines = []
    for line in src.splitlines(keepends=True):
        stripped = line.lstrip()
        if stripped.upper().startswith("REM ") or stripped.upper().startswith("REM\t") or stripped.upper() == "REM\n" or stripped.upper() == "REM\r\n":
            comments += 1
            continue
        if stripped.startswith("::"):
            comments += 1
            continue
        out_lines.append(line)
    return "".join(out_lines), comments


def strip_file(src: str, lang: str) -> tuple[str, int]:
    if lang == "py":
        return strip_python(src)
    if lang == "js":
        return strip_js_like(src)
    if lang == "java":
        return strip_js_like(src)
    if lang == "php":
        return strip_js_like(src, allow_hash=True)
    if lang == "css":
        return strip_css(src)
    if lang == "html":
        return strip_html(src)
    if lang == "xml":
        return strip_xml_comments(src)
    if lang == "sql":
        return strip_sql(src)
    if lang == "sh":
        return strip_sh(src)
    if lang == "bat":
        return strip_bat(src)
    return src, -1


def tidy_blank_runs(text: str) -> str:
    # collapse 3+ blank lines to 2 — slight whitespace, not logic
    return re.sub(r"\n{4,}", "\n\n\n", text)


def collect_files() -> list[Path]:
    files = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIR_NAMES]
        pdir = Path(dirpath)
        rel = pdir.relative_to(ROOT).as_posix()
        if any(frag in rel for frag in SKIP_DIR_PARTS):
            dirnames[:] = []
            continue
        for fn in filenames:
            path = pdir / fn
            if should_skip_path(path):
                continue
            if lang_for(path):
                files.append(path)
    return files


def main() -> int:
    files = collect_files()
    analyzed = len(files)
    modified = 0
    skipped_risky = []
    total_comments = 0
    report = []

    for path in files:
        lang = lang_for(path)
        try:
            raw = path.read_bytes()
        except Exception as exc:
            skipped_risky.append((str(path), "read", str(exc)))
            continue
        # skip binary-ish
        if b"\x00" in raw[:4096]:
            skipped_risky.append((str(path), "binary", "null bytes"))
            continue
        for enc in ("utf-8", "utf-8-sig", "cp1252"):
            try:
                src = raw.decode(enc)
                used_enc = enc
                break
            except UnicodeDecodeError:
                src = None
                used_enc = None
        else:
            skipped_risky.append((str(path), "encoding", "decode failed"))
            continue

        new, ncom = strip_file(src, lang)
        if ncom < 0:
            skipped_risky.append((str(path), lang, "parser uncertain / failed"))
            continue
        if ncom == 0 or new == src:
            continue
        new = tidy_blank_runs(new)
        # sanity: don't empty a previously non-empty file
        if src.strip() and not new.strip():
            skipped_risky.append((str(path), lang, "would empty file"))
            continue
        rel = path.relative_to(ROOT)
        bak = BACKUP / rel
        bak.parent.mkdir(parents=True, exist_ok=True)
        if not bak.exists():
            shutil.copy2(path, bak)
        path.write_text(new, encoding=used_enc if used_enc != "utf-8-sig" else "utf-8", newline="")
        modified += 1
        total_comments += ncom
        report.append({"file": rel.as_posix(), "lang": lang, "comments": ncom})

    summary = {
        "analyzed": analyzed,
        "modified": modified,
        "comments_removed": total_comments,
        "skipped_risky": skipped_risky,
        "files": report,
    }
    (ROOT / "tools" / "_strip_comments_report.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(json.dumps({
        "analyzed": analyzed,
        "modified": modified,
        "comments_removed": total_comments,
        "skipped_risky": len(skipped_risky),
    }, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
