import io
import re
import tokenize
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKIP_PARTS = {
    'venv', '.git', 'node_modules', 'staticfiles', '__pycache__',
    'clients', 'legacy', 'migrations', 'secrets',
}


def should_skip(path: Path) -> bool:
    parts = set(path.parts)
    return bool(parts & SKIP_PARTS)


def strip_python(path: Path) -> bool:
    try:
        source = path.read_text(encoding='utf-8')
    except Exception:
        return False
    try:
        tokens = []
        for tok in tokenize.generate_tokens(io.StringIO(source).readline):
            if tok.type == tokenize.COMMENT:
                continue
            tokens.append(tok)
        new_source = tokenize.untokenize(tokens)
    except tokenize.TokenError:
        return False
    if new_source != source:
        path.write_text(new_source, encoding='utf-8')
        return True
    return False


def strip_html_comments(path: Path) -> bool:
    try:
        source = path.read_text(encoding='utf-8')
    except Exception:
        return False
    new_source = re.sub(r'<!--[\s\S]*?-->', '', source)
    if new_source != source:
        path.write_text(new_source, encoding='utf-8')
        return True
    return False


def strip_js_comments(path: Path) -> bool:
    try:
        source = path.read_text(encoding='utf-8')
    except Exception:
        return False
    new_source = re.sub(r'/\*[\s\S]*?\*/', '', source)
    new_source = re.sub(r'(?m)^[ \t]*//.*$', '', new_source)
    new_source = re.sub(r'(?m)[ \t]+//.*$', '', new_source)
    if new_source != source:
        path.write_text(new_source, encoding='utf-8')
        return True
    return False


def remove_csrf_exempt(path: Path) -> bool:
    try:
        source = path.read_text(encoding='utf-8')
    except Exception:
        return False
    lines = source.splitlines(keepends=True)
    out = []
    changed = False
    for line in lines:
        if line.strip() == '@csrf_exempt':
            changed = True
            continue
        out.append(line)
    new_source = ''.join(out)
    if 'csrf_exempt' not in new_source:
        new_source = re.sub(
            r'^from django\.views\.decorators\.csrf import csrf_exempt\n',
            '',
            new_source,
            flags=re.M,
        )
        new_source = re.sub(
            r'^from django\.views\.decorators\.csrf import csrf_exempt, ',
            'from django.views.decorators.csrf import ',
            new_source,
            flags=re.M,
        )
    if new_source != source:
        path.write_text(new_source, encoding='utf-8')
        return True
    return False


def main():
    targets_py = []
    targets_html = []
    targets_js = []
    for base in (ROOT / 'julmin_taxis', ROOT / 'orders', ROOT / 'drivers', ROOT / 'accounts',
                 ROOT / 'chat', ROOT / 'notifications', ROOT / 'enterprises', ROOT / 'pricing',
                 ROOT / 'admin_panel', ROOT / 'firebase_db', ROOT / 'forum', ROOT / 'blog',
                 ROOT / 'chatbot'):
        if not base.exists():
            continue
        for p in base.rglob('*'):
            if should_skip(p):
                continue
            if p.suffix == '.py':
                targets_py.append(p)
    for p in (ROOT / 'static' / 'js').rglob('*.js'):
        if should_skip(p):
            continue
        targets_js.append(p)
    for base in (ROOT / 'templates', ROOT):
        if base == ROOT:
            for p in ROOT.glob('*.html'):
                targets_html.append(p)
        else:
            for p in base.rglob('*.html'):
                if should_skip(p):
                    continue
                targets_html.append(p)

    csrf_files = [
        ROOT / 'julmin_taxis' / 'htmx_views.py',
        ROOT / 'julmin_taxis' / 'htmx_views_tracking.py',
        ROOT / 'julmin_taxis' / 'mobile_views.py',
        ROOT / 'pricing' / 'views.py',
    ]
    for p in csrf_files:
        if p.exists():
            remove_csrf_exempt(p)

    for p in targets_py:
        strip_python(p)
    for p in targets_html:
        strip_html_comments(p)
    for p in targets_js:
        if '.test.' in p.name:
            continue
        strip_js_comments(p)

    print('cleanup done')


if __name__ == '__main__':
    main()
