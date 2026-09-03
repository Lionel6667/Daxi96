"""Pont Capacitor injecté dans toutes les pages HTML de l'app native."""

import os
import re

NATIVE_ENV_HEAD = (
    '<script>'
    'window.DAXI_API_ENV=window.DAXI_API_ENV||"development";'
    'window.DAXI_API_BASE_URL=window.DAXI_API_BASE_URL||"";'
    'window.DAXI_API_ALLOW_HTTP=(location.protocol==="http:");'
    'window.DAXI_API_DEBUG_LOGS=true;'
    'window.DAXI_USE_GOOGLE_MAPS=true;'
    'window.DAXI_USE_MAPLIBRE=false;'
    'window._daxiLiveBaseUrl=window._daxiLiveBaseUrl||"";'
    'window._daxiCapacitorApp=true;'
    '</script>\n'
)
NATIVE_ROUTER_TAG = '<script src="/static/js/daxi-deeplink-router.js?v=20260828d"></script>\n'
NATIVE_CAP_TAG = '<script src="/static/js/daxi-capacitor.js?v=20260903e" data-daxi-cap-early async></script>\n'
NATIVE_BANNER_CSS = '<link rel="stylesheet" href="/static/css/daxi-network-banner.css?v=20260828d">\n'
NATIVE_STATE_TAG = '<script src="/static/js/daxi-network-state.js?v=20260828d"></script>\n'
NATIVE_BANNER_JS = '<script src="/static/js/daxi-network-banner.js?v=20260828d"></script>\n'
NATIVE_OFFLINE_TAG = '<script src="/static/js/daxi-offline.js?v=20260828d"></script>\n'
NATIVE_CAP_HEAD = NATIVE_ENV_HEAD + NATIVE_ROUTER_TAG + NATIVE_CAP_TAG

INTRO_PATH_PREFIXES = (
    '/admin-dashboard',
    '/driver',
    '/entreprise',
)

NATIVE_INTRO_PREHIDE = (
    '<script>document.documentElement.classList.add("daxi-native-shell","daxi-intro-boot");</script>\n'
    '<style id="daxi-intro-prehide">'
    'html.daxi-intro-boot body{visibility:hidden!important}'
    'html.daxi-intro-boot #daxi-cinematic{visibility:visible!important}'
    'html.daxi-intro-playing body,html.daxi-intro-done body{visibility:visible!important}'
    '</style>\n'
)

INTRO_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    'static', 'js', 'daxi-intro.js',
)
INTRO_TAG_RE = re.compile(
    r'<script[^>]+src=["\'][^"\']*daxi-intro\.js[^"\']*["\'][^>]*>\s*</script>',
    re.IGNORECASE,
)

_intro_cache = {'mtime': None, 'source': None}


def _intro_source():
    """Contenu de daxi-intro.js, relu quand le fichier change."""
    try:
        mtime = os.path.getmtime(INTRO_PATH)
    except OSError:
        return None
    if _intro_cache['mtime'] != mtime:
        try:
            with open(INTRO_PATH, 'r', encoding='utf-8') as handle:
                source = handle.read()
        except OSError:
            return None
        _intro_cache['mtime'] = mtime
        _intro_cache['source'] = source.replace('</script', '<\\/script')
    return _intro_cache['source']


def _is_full_document(content):
    head = (content or '')[:2400].lower()
    return '<html' in head or '<!doctype' in head or '<head' in head


def _normalize_path(path):
    p = (path or '/').split('?', 1)[0].split('#', 1)[0].rstrip('/') or '/'
    return p


def _should_play_intro(path):
    p = _normalize_path(path)
    if p == '/':
        return True
    for prefix in INTRO_PATH_PREFIXES:
        base = prefix.rstrip('/') or '/'
        if p == base or p.startswith(base + '/'):
            return True
    return False


def _inject_after_head_open(content, snippet):
    match = re.search(r'(?is)<head\b[^>]*>', content)
    if not match:
        return content
    pos = match.end()
    return content[:pos] + '\n' + snippet + content[pos:]


def _intro_boot_tags():
    source = _intro_source()
    if not source:
        return ''
    return (
        '<script data-daxi-intro="inline">\n' + source + '\n</script>\n'
        '<script data-daxi-intro-boot>'
        'try{if(window.DaxiIntro&&DaxiIntro.play)DaxiIntro.play();}'
        'catch(e){}</script>\n'
    )


def inject_capacitor_after_intro(content):
    """Place le pont Capacitor juste après DaxiIntro.play(), pas à </head>.

    Sinon le WebView télécharge tout le HTML (~1,47 Mo) avant même de
    demander daxi-capacitor.js, et le splash natif recouvre l'intro.
    """
    if not content or 'daxi-capacitor.js' in content:
        return content
    marker = 'DaxiIntro.play();'
    idx = content.find(marker)
    if idx < 0:
        return content
    end = content.find('</script>', idx)
    if end < 0:
        return content
    end += len('</script>')
    return content[:end] + '\n' + NATIVE_CAP_TAG + content[end:]


def inline_intro(content):
    """Remplace la balise <script src> de l'intro par son code.

    Dans l'app, la page vient d'un tunnel lent et l'intro doit démarrer sans
    attendre un aller-retour réseau supplémentaire.
    """
    if 'daxi-intro.js' not in content:
        return content
    source = _intro_source()
    if not source:
        return content
    return INTRO_TAG_RE.sub(
        lambda _: '<script data-daxi-intro="inline">\n' + source + '\n</script>',
        content,
        count=1,
    )


def ensure_intro(content):
    """Inline l'intro si déjà présente, sinon l'injecte sur les pages HTML natives."""
    if not content or not _is_full_document(content):
        return content
    if 'data-daxi-intro=' in content or 'daxi-intro.js' in content:
        return inline_intro(content)
    tags = _intro_boot_tags()
    if not tags:
        return content
    if '</head>' in content:
        return content.replace('</head>', tags + '</head>', 1)
    return content


def is_native_request(request):
    ua = request.META.get('HTTP_USER_AGENT', '') or ''
    return (
        'DaxiAndroid' in ua
        or 'Capacitor' in ua
        or request.GET.get('daxi_native') == '1'
    )


HEAD_RE = re.compile(r'(?is)<head\b.*?</head>')
STYLESHEET_RE = re.compile(
    r'(?is)<link\b(?![^>]*\bmedia\s*=)(?=[^>]*\brel\s*=\s*["\']stylesheet["\'])[^>]*>'
)
REL_RE = re.compile(r'(?i)\brel\s*=\s*["\']stylesheet["\']')


CSS_FLUSH_SCRIPT = (
    '<script>window.__daxiCssFlush=function(){'
    'var l=document.querySelectorAll(\'link[data-daxi-css]\');'
    'for(var i=0;i<l.length;i++){'
    'if(l[i].rel==="stylesheet")continue;'
    'if(!l[i].getAttribute("data-daxi-loaded"))break;'
    'l[i].rel="stylesheet";}};'
    'document.addEventListener("DOMContentLoaded",window.__daxiCssFlush);'
    'setTimeout(function(){var l=document.querySelectorAll(\'link[data-daxi-css]\');'
    'for(var i=0;i<l.length;i++)l[i].rel="stylesheet";},5000);</script>\n'
)


def unblock_stylesheets(content):
    """Rend les feuilles de style du <head> non bloquantes pour le rendu."""
    head_match = HEAD_RE.search(content)
    if not head_match:
        return content
    head = head_match.group(0)
    if 'data-daxi-css' in head:
        return content

    counter = {'n': 0}
    hook = (
        'this.setAttribute(\'data-daxi-loaded\',\'1\');'
        'if(window.__daxiCssFlush)window.__daxiCssFlush()'
    )

    def convert(match):
        tag = match.group(0)
        index = counter['n']
        counter['n'] += 1
        tag = REL_RE.sub('rel="preload" as="style"', tag, count=1)
        extra = (
            ' data-daxi-css="%d" onload="%s" onerror="%s"' % (index, hook, hook)
        )
        return tag[:-1].rstrip('/').rstrip() + extra + '>'

    new_head = STYLESHEET_RE.sub(convert, head)
    if not counter['n']:
        return content
    
    
    anchor = new_head.rfind('<link', 0, new_head.find('data-daxi-css'))
    new_head = new_head[:anchor] + CSS_FLUSH_SCRIPT + new_head[anchor:]
    return content[:head_match.start()] + new_head + content[head_match.end():]


def inject_native_head(content, request=None):
    if not content or not isinstance(content, str):
        return content
    full = _is_full_document(content)
    if full:
        content = inline_intro(content)
    inject = ''
    if '<base ' not in content.lower():
        inject += '<base href="/" />\n'
    if '_daxiCapacitorApp' not in content and 'DAXI_API_ENV' not in content:
        inject += NATIVE_ENV_HEAD
    if 'daxi-deeplink-router.js' not in content:
        inject += NATIVE_ROUTER_TAG
    path = '/'
    if request is not None:
        path = request.path or '/'
    play_intro = full and _should_play_intro(path)
    has_intro = 'data-daxi-intro=' in content or 'daxi-intro.js' in content
    will_inject_intro = play_intro and not has_intro
    if 'daxi-capacitor.js' not in content:
        inject += NATIVE_CAP_TAG
    if 'daxi-network-banner.css' not in content:
        inject += NATIVE_BANNER_CSS
    if 'daxi-network-state.js' not in content:
        inject += NATIVE_STATE_TAG
    if 'daxi-network-banner.js' not in content:
        inject += NATIVE_BANNER_JS
    if 'daxi-offline.js' not in content:
        inject += NATIVE_OFFLINE_TAG
    if (
        play_intro
        and 'daxi-intro-prehide' not in content
        and 'daxi-booting' not in content
    ):
        content = _inject_after_head_open(content, NATIVE_INTRO_PREHIDE)
    if will_inject_intro:
        inject += _intro_boot_tags()
    if inject:
        if '</head>' in content:
            content = content.replace('</head>', inject + '</head>', 1)
        elif full:
            content = inject + content
    if full:
        content = inject_capacitor_after_intro(content)
        if 'daxi-capacitor.js' not in content and '</head>' in content:
            content = content.replace('</head>', NATIVE_CAP_TAG + '</head>', 1)
    path = '/'
    if request is not None:
        path = request.path or '/'
    if (
        request is not None
        and path.startswith('/admin-dashboard')
        and 'daxi-shell-context' not in content
        and '</head>' in content
    ):
        shell_tag = (
            '<script>'
            'window.DAXI_API_ENV=window.DAXI_API_ENV||"production";'
            'window.DAXI_API_BASE_URL=window.DAXI_API_BASE_URL||"https://daxipro.com";'
            'window._daxiLiveBaseUrl=window.DAXI_API_BASE_URL;'
            'window._daxiCapacitorApp=true;'
            'window._daxiShellPage="admin_dashboard";'
            '</script>\n'
            '<script src="/static/js/daxi-shell-context.js"></script>\n'
            '<script src="/static/js/daxi-role-boot.js"></script>\n'
        )
        content = content.replace('</head>', shell_tag + '</head>', 1)
    return content


class DaxiNativeShellMiddleware:
    """Injecte le pont Capacitor + <base href="/"> sur tout HTML native (client, chauffeur, admin…)."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if not is_native_request(request):
            return response
        ctype = (response.get('Content-Type') or '').split(';')[0].strip().lower()
        if ctype not in ('text/html', 'application/xhtml+xml'):
            return response
        try:
            content = response.content.decode(response.charset or 'utf-8')
        except Exception:
            return response
        next_content = inject_native_head(content, request)
        if next_content != content:
            response.content = next_content.encode(response.charset or 'utf-8')
            if response.has_header('Content-Length'):
                response['Content-Length'] = str(len(response.content))
        response['Cache-Control'] = 'private, no-cache, max-age=0, must-revalidate'
        return response
