# Déploiement DAXI / Julmin Taxis

Le dossier `julmin_taxis_django/` est **autonome** — tout ce qui est nécessaire au serveur y est inclus.

## Structure

```
julmin_taxis_django/
├── assets/              CSS, JS, images partagés (servis via Django)
├── vubez2.html          Page client principale
├── compte.html, driver_*.html, entreprise*.html
├── manifest.json, sw.js, firebase-messaging-sw.js
├── daxi-*.js            Scripts frontend racine
├── julmin_taxis/        Configuration Django
├── accounts/, orders/, drivers/, …  Apps métier
├── static/              Fichiers statiques Django (/static/)
├── templates/           Templates Django + HTMX
├── media/               Uploads utilisateurs (créé au runtime)
├── secrets/             Credentials (gitignored)
├── data/                Exports Firebase migration
├── clients/             Apps mobiles (Android, Capacitor) — hors serveur
├── legacy/              PHP et HTML historiques
├── services/            Webhook WhatsApp Node (optionnel)
├── scripts/             Utilitaires dev (sync logos, etc.)
└── deploy/              Configs nginx + systemd
```

## Vérifier les chemins avant déploiement

```bash
python manage.py validate_project_paths
python scripts/audit_all_paths.py
```

Les deux commandes doivent afficher **PASSED** / **Validation OK**.


```bash
cd julmin_taxis_django
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# Éditer .env : SECRET_KEY, DEBUG=False, ALLOWED_HOSTS, SITE_URL, etc.

# Placer firebase-service-account.json dans secrets/
mkdir -p secrets media
python manage.py migrate
python manage.py collectstatic --noinput
```

## Lancer en production

DAXI utilise **Daphne** (ASGI) pour les WebSockets :

```bash
daphne -b 0.0.0.0 -p 8000 julmin_taxis.asgi:application
```

Ou avec **Gunicorn + Uvicorn worker** (alternative) :

```bash
gunicorn julmin_taxis.asgi:application -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8000
```

## Nginx (reverse proxy + SSL)

Voir `deploy/nginx.conf.example`. Points clés :
- HTTPS obligatoire (`SECURE_SSL_REDIRECT=True`)
- Proxy vers Daphne sur port 8000
- `client_max_body_size` pour uploads chauffeurs
- Headers `X-Forwarded-Proto` pour Django

## Sécurité production

Dans `.env` :
- `DEBUG=False`
- `SECRET_KEY` unique (50+ caractères aléatoires)
- `ALLOWED_HOSTS=votredomaine.com`
- `CSRF_TRUSTED_ORIGINS=https://votredomaine.com`
- `WHATSAPP_VERIFY_TOKEN` personnalisé
- Toutes les clés API via variables d'environnement (jamais dans le code)

Redis recommandé en production pour les WebSockets :
```
REDIS_URL=redis://127.0.0.1:6379
```

## Apps mobiles

Les projets Android et Capacitor sont dans `clients/` :
- `clients/daxi-android/` — ouvrir ce dossier dans Android Studio
- `clients/mobile/` — wrapper Capacitor

Ils se connectent au serveur Django via `SITE_URL`.

## Railway (PostgreSQL + push)

SQLite est **écrasé** à chaque redeploy (disque éphémère). Sur Railway :

1. Créer le service Django + ajouter le plugin **PostgreSQL** (Railway injecte `DATABASE_URL`).
2. Ajouter **Redis** et coller `REDIS_URL` (WebSockets / Channels).
3. Variables importantes :
   - `SECRET_KEY`, `DEBUG=False`
   - `ALLOWED_HOSTS` = ton domaine Railway + custom domain
   - `CSRF_TRUSTED_ORIGINS` = `https://…`
   - `SITE_URL` = URL publique HTTPS
   - `FCM_PROJECT_ID` + `FCM_SERVICE_ACCOUNT_JSON` = JSON du service account Firebase (collé en une ligne)
4. Le `Procfile` lance migrate + collectstatic puis Daphne.
5. Migrer les données locales une fois :
   ```bash
   # local
   python manage.py dumpdata --natural-foreign --natural-primary -e contenttypes -e auth.Permission -o data_export.json
   # sur Railway (shell) après migrate
   python manage.py loaddata data_export.json
   ```
6. Test push (app **fermée**) :
   ```bash
   python manage.py test_push --user ton@email.com
   ```

**Push — bloqueurs connus avant claim “100%” :**
- Le fichier local `secrets/firebase-service-account.json` était **corrompu** (binaire) → quarantainé en `.CORRUPT.bak`. Re-télécharge un JSON valide depuis Firebase (même projet que Android `392925120550`).
- Aligne `FIREBASE_WEB_MESSAGING_SENDER_ID` sur le `project_number` Android (sinon SenderId mismatch).
- Build release Capacitor : copie `capacitor.config.production.json` → `capacitor.config.json` (ou change `server.url` vers Railway/`daxipro.com`), puis `npx cap sync`. L’APK de dev pointe encore vers ngrok → les tokens n’arrivent pas en prod.

Le géo DAXI marche en **PostgreSQL plain** (pas besoin de PostGIS sur Railway) : coords en Float/JSON + Shapely.
