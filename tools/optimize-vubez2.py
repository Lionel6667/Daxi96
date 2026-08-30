#!/usr/bin/env python3
"""Extract inline CSS/JS from vubez2.html into cacheable external assets."""
from __future__ import annotations

import re
import shutil
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML_PATH = ROOT / "vubez2.html"
BACKUP_PATH = ROOT / "vubez2.html.bak-pre-perf"
VERSION = date.today().strftime("%Y%m%d") + "c"

CSS_HEAD_OUT = ROOT / "assets" / "css" / "vubez2-core.css"
CSS_BODY_OUT = ROOT / "assets" / "css" / "vubez2-body.css"
JS_DIR = ROOT / "static" / "js" / "vubez2"


KEEP_STYLE_IDS = {"daxi-critical-sheet-lock"}


KEEP_INLINE_PREFIXES = (
    "window._daxiBootT0",
    "document.documentElement.classList.add('daxi-booting')",
    "window._daxiIsNativeApp",
    "window._daxiPreferServerPlaces",
    "DaxiIntro.play",
    "DaxiGuestId.ensure",
)


DEFER_SCRIPTS = {
    "daxi-chat-media.js",
    "daxi-chat-ui.js",
    "daxi-chat-composer.js",
    "daxi-assist-ai.js",
    "daxi-theme.js",
    "daxi-frequent-routes-data.js",
    "daxi-haiti-explorer-data.js",
    "daxi-frequent-routes-map.js",
    "daxi-haiti-explorer-map.js",
    "daxi-phone.js",
    "firebase-shim.js",
    "daxi-auto-i18n.js",
    "daxi-plan-wizard.js",
    "daxi-push-register.js",
    "daxi-countdown.js",
    "daxi-realtime-sync.js",
    "daxi-action-buttons.js",
    "daxi-modal.js",
    "daxi-order-card-map.js",
    "daxi-routes.js",
    "daxi-map-snap.js",
    "daxi-places-catalog.js",
    "aos.js",
}


LAZY_SCRIPTS = {
    "daxi-haiti-explorer-map.js",
    "daxi-frequent-routes-map.js",
    "daxi-frequent-routes-data.js",
    "daxi-haiti-explorer-data.js",
    "firebase-shim.js",
    "daxi-plan-wizard.js",
    "daxi-chat-media.js",
    "daxi-chat-ui.js",
    "daxi-chat-composer.js",
    "daxi-assist-ai.js",
}

CRITICAL_SCRIPTS = {
    "daxi-intro.js",
    "daxi-guest-id.js",
    "daxi-app-api.js",
    "daxi-realtime.js",
    "daxi-notif-policy.js",
    "daxi-notifications.js",
    "daxi-map-markers.js",
    "daxi-map-theme.js",
    "daxi-main-map-dual.js",
    "daxi-network-banner.js",
    "daxi-maplibre.js",
    "daxi-map-provider.js",
    "daxi-deeplink-router.js",
    "daxi-offline.js",
    "daxi-session-store.js",
    "daxi-network-state.js",
    "daxi-htmx-csrf.js",
    "daxi-shell-role.js",
    "daxi-client-gps-core.js",
    "daxi-gps-trace.js",
    "gps-precision-engine.js",
    "daxi-client-map-ui.js",
    "htmx.min.js",
}


DEFER_KEEP = {"daxi-map-placeholder.js"}


def should_keep_inline(content: str) -> bool:
    s = content.strip()
    if len(s) < 200:
        return True
    for p in KEEP_INLINE_PREFIXES:
        if p in s[:500]:
            return True
    return False


def extract_styles(html: str) -> tuple[str, str, str]:
    head_css_parts: list[str] = []
    body_css_parts: list[str] = []
    head_end = html.find("</head>")
    out: list[str] = []
    pos = 0
    for m in re.finditer(r"<style([^>]*)>(.*?)</style>", html, re.S):
        out.append(html[pos : m.start()])
        attrs = m.group(1) or ""
        css = m.group(2)
        id_m = re.search(r'id=["\']([^"\']+)["\']', attrs)
        sid = id_m.group(1) if id_m else ""
        if sid in KEEP_STYLE_IDS or len(css.encode()) < 400:
            out.append(m.group(0))
        else:
            if m.start() < head_end:
                head_css_parts.append(css.strip())
            else:
                body_css_parts.append(css.strip())
            link = f'<link rel="stylesheet" href="assets/css/vubez2-{"core" if m.start() < head_end else "body"}.css?v={VERSION}">'
            if m.start() < head_end:
                
                pass
            out.append("")  
        pos = m.end()
    out.append(html[pos:])
    result = "".join(out)
    
    if head_css_parts:
        link = f'    <link rel="stylesheet" href="assets/css/vubez2-core.css?v={VERSION}">\n'
        result = re.sub(
            r'(<link rel="stylesheet" href="assets/css/tailwind-vubez2\.css\?v=[^"]+">)',
            r"\1\n" + link,
            result,
            count=1,
        )
    if body_css_parts:
        
        blink = f'    <link rel="stylesheet" href="assets/css/vubez2-body.css?v={VERSION}">\n'
        result = result.replace("</body>", blink + "</body>", 1)
    head_css = "\n\n".join(head_css_parts)
    body_css = "\n\n".join(body_css_parts)
    return result, head_css, body_css


def extract_scripts(html: str) -> tuple[str, dict[str, str]]:
    """Extract large inline scripts to files."""
    JS_DIR.mkdir(parents=True, exist_ok=True)
    files: dict[str, str] = {}
    idx = 0
    out: list[str] = []
    pos = 0
    for m in re.finditer(r"<script(?![^>]*\bsrc\b)([^>]*)>(.*?)</script>", html, re.S):
        out.append(html[pos : m.start()])
        content = m.group(2)
        if should_keep_inline(content):
            out.append(m.group(0))
        else:
            idx += 1
            name = f"vubez2-inline-{idx:02d}.js"
            files[name] = content.strip() + "\n"
            out.append(
                f'<script src="/static/js/vubez2/{name}?v={VERSION}" defer></script>'
            )
        pos = m.end()
    out.append(html[pos:])
    return "".join(out), files


def patch_external_scripts(html: str) -> str:
    lazy_list = sorted(LAZY_SCRIPTS)

    def repl(m: re.Match) -> str:
        tag = m.group(0)
        src = m.group(1)
        base = src.split("/")[-1].split("?")[0]
        if base in LAZY_SCRIPTS:
            return f"<!-- lazy:{base} -->"
        if "defer" in tag or "async" in tag:
            return tag
        if base in DEFER_SCRIPTS or base in DEFER_KEEP:
            return tag.replace("<script ", '<script defer ', 1)
        return tag

    html = re.sub(
        r'<script([^>]+src=["\']([^"\']+)["\'][^>]*)></script>',
        repl,
        html,
    )
    
    cfg = (
        f"\n<script>\n"
        f"window._DAXI_LAZY_SCRIPTS={lazy_list!r};\n"
        f"window._DAXI_ASSET_V='{VERSION}';\n"
        f"</script>\n"
        f'<script src="/static/js/daxi-lazy-loader.js?v={VERSION}" defer></script>\n'
    )
    html = html.replace("</head>", cfg + "</head>", 1)
    return html


def patch_loader(html: str) -> str:
    """Decouple initial loader from Google Maps — dismiss when booking UI ready."""
    old = """    var mapUsable = !!(window._clientBgMap && window.google && google.maps);
    var shellReady = !!(boot.mapReady || window._daxiOfflineMapMode || window._daxiExternalMapsBlocked || window._clientBgMap);
    if (!shellReady && !mapUsable) return;"""
    new = """    var mapUsable = !!(window._clientBgMap && window.google && google.maps);
    var shellReady = !!(boot.mapReady || window._daxiOfflineMapMode || window._daxiExternalMapsBlocked || window._clientBgMap);
    var bookingReady = !!(document.getElementById('bookingSection') || document.getElementById('departureField'));
    if (!shellReady && !mapUsable && !bookingReady) return;
    if (!shellReady && !mapUsable && bookingReady) {
      var elapsedBk = Date.now() - (window._daxiLoaderStartedAt || 0);
      var waitBk = Math.max(0, (window._DAXI_LOADER_MIN_MS || 700) - elapsedBk);
      setTimeout(function() {
        if (!window._daxiLoaderDismissed && window._daxiDismissInitialLoader) window._daxiDismissInitialLoader();
      }, waitBk);
      return;
    }"""
    if old in html:
        html = html.replace(old, new, 1)
    
    html = html.replace(
        "  }, 10000);\n\n  document.addEventListener('DOMContentLoaded'",
        "  }, 5000);\n\n  document.addEventListener('DOMContentLoaded'",
        1,
    )
    
    inject = """
  document.addEventListener('DOMContentLoaded', function _daxiEarlyLoaderDismiss() {
    if (window._daxiLoaderDismissed) return;
    var booking = document.getElementById('bookingSection') || document.getElementById('departureField');
    if (!booking) return;
    setTimeout(function() {
      if (window._daxiLoaderDismissed) return;
      if (typeof window._daxiDismissInitialLoader === 'function') window._daxiDismissInitialLoader();
    }, Math.max(0, (window._DAXI_LOADER_MIN_MS || 700)));
  }, { once: true });
"""
    html = html.replace(
        "  document.addEventListener('DOMContentLoaded', function() {\n    if (!window.DaxiAndroid",
        inject + "  document.addEventListener('DOMContentLoaded', function() {\n    if (!window.DaxiAndroid",
        1,
    )
    return html


def patch_fonts(html: str) -> str:
    html = html.replace(
        "family=Poppins:wght@300;400;500;600;700&family=Montserrat:wght@400;500;600;700",
        "family=Poppins:wght@400;500;600;700&family=Montserrat:wght@500;600;700",
    )
    return html


def patch_covered_departments(html: str) -> str:
    
    html = html.replace(
        "    fetch('/api/admin-panel/covered-departments/')\n",
        "    /* covered-departments: single fetch via deptsP */\n",
        1,
    )
    return html


def patch_remix_icon(html: str) -> str:
    if "remixicon-vubez2.css" in html:
        return html
    html = html.replace(
        '<link rel="stylesheet" href="assets/css/remixicon.min.css">',
        f'<link rel="stylesheet" href="assets/css/remixicon-vubez2.css?v={VERSION}">',
    )
    return html


def patch_aos(html: str) -> str:
    
    return html


def bump_cache_busts(html: str) -> str:
    html = html.replace("tailwind-vubez2.css?v=20260830b", f"tailwind-vubez2.css?v={VERSION}")
    return html


def main() -> None:
    if not HTML_PATH.exists():
        raise SystemExit(f"Missing {HTML_PATH}")
    html = HTML_PATH.read_text(encoding="utf-8")
    if not BACKUP_PATH.exists():
        shutil.copy2(HTML_PATH, BACKUP_PATH)
        print(f"Backup: {BACKUP_PATH}")

    html, head_css, body_css = extract_styles(html)
    html, js_files = extract_scripts(html)
    html = patch_external_scripts(html)
    html = patch_loader(html)
    html = patch_fonts(html)
    html = patch_covered_departments(html)
    html = patch_remix_icon(html)
    html = bump_cache_busts(html)

    if head_css:
        CSS_HEAD_OUT.write_text(head_css + "\n", encoding="utf-8")
        print(f"Wrote {CSS_HEAD_OUT} ({len(head_css.encode())} bytes)")
    if body_css:
        CSS_BODY_OUT.write_text(body_css + "\n", encoding="utf-8")
        print(f"Wrote {CSS_BODY_OUT} ({len(body_css.encode())} bytes)")

    for name, content in js_files.items():
        p = JS_DIR / name
        p.write_text(content, encoding="utf-8")
        print(f"Wrote {p} ({len(content.encode())} bytes)")

    HTML_PATH.write_text(html, encoding="utf-8")
    print(f"Updated {HTML_PATH} ({len(html.encode())} bytes)")
    print(f"VERSION={VERSION}")


if __name__ == "__main__":
    main()
