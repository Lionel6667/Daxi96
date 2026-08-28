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

### Architecture recommandée

```
GitHub → Railway
           ├── Django / Daphne ($PORT)
           ├── PostgreSQL (DATABASE_URL)
           └── Redis (REDIS_URL)
                    ↓
              Cloudinary (médias + backups DB)
                    ↓
              Firebase FCM (push)

Apps Android / Capacitor → https://daxipro.com → Django + WebSockets
```

### Procfile vs railway.toml

Les deux fichiers existent et sont **cohérents** :

**`Procfile`** (format Heroku) :
```
web: python manage.py migrate --noinput && python manage.py collectstatic --noinput && daphne -b 0.0.0.0 -p ${PORT:-8000} julmin_taxis.asgi:application
```

**`railway.toml`** (prioritaire sur Railway) :
```
startCommand = python manage.py migrate --noinput && python manage.py collectstatic --noinput && … daphne -b 0.0.0.0 -p $PORT …
```

- Railway utilise en pratique **`railway.toml`** (`startCommand`). Le `Procfile` sert de fallback / doc.
- **Ne jamais hardcoder le port 8000 en prod Railway** — `$PORT` / `${PORT}` est déjà utilisé.
- Heroku séparerait parfois `release:` (migrate) et `web:` (daphne) ; sur Railway tout est dans **une** commande de démarrage, ce qui est normal.

### Dossier `clients/` dans le repo serveur

Non bloquant pour Django, mais **inutile au runtime** et alourdit le build si Railway déploie tout le repo.

- Tu peux garder un **repo autonome** (mobile + serveur) — c’est le choix actuel.
- Pour réduire la taille du build Railway : `.railwayignore` exclut `clients/`, `legacy/`, etc. (voir fichier à la racine).

### Persistance des données à chaque push / redeploy

**Les enregistrements PostgreSQL ne sont pas supprimés** quand tu push ou redeploy.

- La commande de démarrage exécute uniquement `python manage.py migrate --noinput` puis `collectstatic` — **pas** de `flush`, `loaddata` ni reset de base.
- PostgreSQL vit dans le **plugin Railway** (`DATABASE_URL`), indépendant du conteneur Django qui redémarre.
- Ce qui **disparaît** au redeploy : fichiers sur le disque éphémère (`backups/` sans upload Cloudinary). **SQLite** sur Railway serait aussi effacé — d’où l’usage obligatoire de PostgreSQL en prod.

**Médias utilisateurs (photos chauffeur, etc.)** : avec `CLOUDINARY_*` configuré, les uploads vont sur Cloudinary (recommandé / nécessaire sur Railway). Sans Cloudinary, `media/` local serait perdu au redeploy — la **ligne en base** reste, mais les fichiers peuvent être cassés.

Vérifie que `DATABASE_URL` pointe bien vers le plugin PostgreSQL avant chaque mise en prod.

SQLite est **écrasé** à chaque redeploy (disque éphémère). Sur Railway :

1. Créer le service Django + ajouter le plugin **PostgreSQL** (Railway injecte `DATABASE_URL`).
2. Ajouter **Redis** et coller `REDIS_URL` (voir section Redis ci-dessous).
3. Variables importantes :
   - `SECRET_KEY`, `DEBUG=False`
   - `ALLOWED_HOSTS` = ton domaine Railway + custom domain
   - `CSRF_TRUSTED_ORIGINS` = `https://…`
   - `SITE_URL` = URL publique HTTPS (ex. `https://daxipro.com`)
   - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
   - `FCM_PROJECT_ID` + `FCM_SERVICE_ACCOUNT_JSON` = JSON du service account Firebase (**variable Railway**, jamais dans Git)
4. Migration des données (premier déploiement) :
   ```bash
   # Option simple (petite base) — fixtures Django
   python manage.py dumpdata --natural-foreign --natural-primary -e contenttypes -e auth.Permission -o data_export.json
   python manage.py loaddata data_export.json

   # Option recommandée (grosse base prod) — outils PostgreSQL natifs
   pg_dump … > backup.sql   # puis pg_restore sur Railway
   ```
5. Test push (app **fermée**) :
   ```bash
   python manage.py test_push --user ton@email.com
   ```

**Push — bloqueurs connus :**
- Ne mets **jamais** `secrets/firebase-service-account.json` dans Git. Colle le JSON dans `FCM_SERVICE_ACCOUNT_JSON` (le code l’écrit au démarrage si besoin).
- Aligne `FIREBASE_WEB_MESSAGING_SENDER_ID` sur le `project_number` Android (sinon SenderId mismatch).
- Build release Capacitor : `server.url` → `https://daxipro.com` (pas ngrok), puis `npx cap sync`.

Le géo DAXI marche en **PostgreSQL plain** (pas besoin de PostGIS sur Railway) : coords en Float/JSON + Shapely.

### Redis (fortement recommandé — requis pour DAXI prod)

Django **peut** tourner sans Redis, mais **DAXI en prod en a besoin** si tu utilises :

- **Channels / WebSockets** (commandes live, admin, chauffeur) → `CHANNEL_LAYERS` Redis
- **OTP d’inscription** partagé entre workers Railway → `CACHES` Redis (`reg_otp_cache.py`)

Sans `REDIS_URL`, le cache OTP est **LocMem par worker** → l’inscription chauffeur / client / entreprise peut échouer entre l’étape OTP et l’étape finale. **Garde Redis sur Railway.**

### Checklist avant push production

```bash
python manage.py validate_project_paths
python scripts/audit_all_paths.py
python manage.py check --deploy
```

Puis vérifier sur Railway :

| Variable / point | Attendu |
|------------------|---------|
| `DEBUG` | `False` |
| `DATABASE_URL` | Plugin PostgreSQL (pas SQLite) |
| `REDIS_URL` | Plugin Redis présent |
| Daphne | `-p $PORT` |
| `SITE_URL` | `https://daxipro.com` |
| `ALLOWED_HOSTS` / `CSRF_TRUSTED_ORIGINS` | Domaine prod |
| `FCM_SERVICE_ACCOUNT_JSON` | JSON valide (env, pas Git) |
| `FIREBASE_WEB_MESSAGING_SENDER_ID` | = project_number Firebase |
| Capacitor / APK | Pointe vers prod, pas ngrok |
| `CLOUDINARY_*` | Uploads OK |
| WebSockets | WSS sur HTTPS |
| Migrations | `migrate` au boot |
| Données | Conservées (PostgreSQL externe) |

### Inscription chauffeur → panel admin

Flux attendu une fois en prod :

1. Chauffeur : OTP WhatsApp → validation → `POST /htmx/driver/register/` → ligne `Driver` en PostgreSQL avec **`is_verified=False`**
2. Admin : **Chauffeurs → onglet « En attente »** (2e onglet ; « Actifs » est l’onglet par défaut)
3. API staff : `GET /api/admin-panel/drivers/` (tous les chauffeurs, dont pending)
4. Badge menu + WebSocket `driver_pending` rafraîchissent la liste

Test rapide sur Railway (shell) :
```bash
python manage.py seed_admin_test_data --clean --verify
```
Puis Admin → Chauffeurs → **En attente**.

### Liens boutons WhatsApp (Meta Business)

URL de base à configurer dans chaque template Meta (suffixe dynamique ajouté par l’API — **sans** `{{1}}` dans l’URL) :

| Template | URL de base Meta | Suffixe Django |
|----------|------------------|----------------|
| `nouvelle_commande` | `https://daxipro.com/wa/accept/` **ou** `https://daxipro.com/driver/accept/` | `{order_id}/{token_signé}/` |
| `commande_attente_coords` (chauffeur) | `https://daxipro.com/` | `driver/commande_{id}/` |
| `commande_attente_coords` (admin) | `https://daxipro.com/` | `admin-dashboard/#orders` |
| `recu_course` | `https://daxipro.com/` | `recu_{id}.pdf` |
| `course_terminee` | `https://daxipro.com/` | `compte/?order={id}` |

Les anciens liens `/wa/accept/{id}` sans token affichent une page d’aide (plus de 404).

Si le template Meta contient encore `{{1}}` dans l’URL (ex. `…/driver/accept/{{1}}`), Meta peut produire des liens du type `…/driver/accept/{{1}}114/token/` — le serveur les corrige automatiquement via `/driver/accept/<raw>/`.

### Sauvegarde PostgreSQL (Railway)

Le disque Railway est **éphémère** : les fichiers dans `backups/` disparaissent au redeploy.

1. Variables : `CLOUDINARY_*` (déjà utilisées pour les médias), `BACKUP_UPLOAD_CLOUDINARY=True`
2. Backup manuel (shell Railway) :
   ```bash
   python manage.py backup_db --force --upload
   ```
3. **Cron Railway** (service séparé, ex. `0 4 * * *`) :
   ```bash
   python manage.py backup_db --force --upload
   ```
   Les dumps `.pgdump.gz` sont uploadés sur Cloudinary (`daxi/backups/db/`).

4. Données de test admin (vérifie PostgreSQL → dashboard) :
   ```bash
   python manage.py seed_admin_test_data --clean --verify
   ```
   Puis Admin → Chauffeurs → **En attente** (2e onglet).
