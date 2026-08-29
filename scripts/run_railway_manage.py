"""Run a manage.py command against Railway Postgres via TCP proxy."""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from urllib.parse import quote_plus

ROOT = Path(__file__).resolve().parents[1]


def _load_vars(service: str) -> dict:
    cmd = f'npx --yes @railway/cli variables --service {service} --json'
    raw = subprocess.check_output(
        cmd,
        cwd=ROOT,
        text=True,
        encoding='utf-8',
        errors='replace',
        shell=True,
    )
    start = raw.find('{')
    if start < 0:
        start = raw.find('[')
    return json.loads(raw[start:])


def _database_url(pg: dict) -> str:
    host = pg.get('RAILWAY_TCP_PROXY_DOMAIN')
    port = pg.get('RAILWAY_TCP_PROXY_PORT')
    user = pg.get('PGUSER')
    password = pg.get('PGPASSWORD')
    db = pg.get('PGDATABASE')
    if not all([host, port, user, password, db]):
        raise SystemExit('Missing Postgres TCP proxy variables')
    return f'postgresql://{quote_plus(user)}:{quote_plus(password)}@{host}:{port}/{db}'


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print('Usage: run_railway_manage.py <manage.py args...>', file=sys.stderr)
        return 1

    pg = _load_vars('Postgres')
    app = _load_vars('Daxi96')

    env = os.environ.copy()
    env['DATABASE_URL'] = _database_url(pg)
    env.setdefault('DJANGO_SETTINGS_MODULE', 'julmin_taxis.settings')

    # Toujours aligner la clé de signature sur Railway (évite tokens invalides en prod).
    for key in ('SECRET_KEY',):
        if isinstance(app.get(key), str) and app[key]:
            env[key] = app[key]

    for key, value in app.items():
        if isinstance(value, str) and value and key not in env:
            env[key] = value

    cmd = [sys.executable, str(ROOT / 'manage.py'), *argv[1:]]
    return subprocess.call(cmd, cwd=ROOT, env=env)


if __name__ == '__main__':
    raise SystemExit(main(sys.argv))
