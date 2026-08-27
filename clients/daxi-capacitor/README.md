# DAXI — app mobile (Capacitor)

```
DAXI
  → UI (HTML / CSS / JS existants) chargée depuis https://daxipro.com
  → Capacitor (server.url production)
  → services natifs iOS / Android
       GPS · Push · stockage · réseau · partage · deep links
```

En production, le WebView charge **https://daxipro.com** (`server.url` conservé). Django reste le backend (commandes, HTMX, API, WebSocket).

## Config active (production)

| Fichier | Rôle |
|---|---|
| `capacitor.config.json` | **Actif** — `server.url: https://daxipro.com` |
| `capacitor.config.production.json` | Miroir production |
| `capacitor.config.development.json` | Backup Live/ngrok |
| `backend.config.json` | `DAXI_API_ENV=production`, API `https://daxipro.com`, debug logs off |

## Backend URL (une seule source)

Fichier : `clients/daxi-capacitor/backend.config.json`

- `DAXI_API_ENV` : `production` (actif) | `development` (Live)
- `DAXI_API_BASE_URL_PRODUCTION` : `https://daxipro.com`
- `DAXI_API_BASE_URL_DEVELOPMENT` : ngrok (uniquement si retour en Live)
- `DAXI_API_DEBUG_LOGS` : `false` en production

Override CI : variable d’environnement `DAXI_API_BASE_URL`.

Injecté dans `www/daxi-capacitor-config.js` puis utilisé par `capacitor-src/main.js` (`backendUrl` / `backendWsUrl`).

### Revenir en Live / ngrok

1. Copier `capacitor.config.development.json` → `capacitor.config.json`
2. Mettre `DAXI_API_ENV` à `development` dans `backend.config.json`
3. `npm run sync`

## Services natifs

| Service | Rôle |
|---|---|
| Géolocalisation | Permission système + position haute précision |
| Push + locales | Alertes course (FCM / APNs) |
| Réseau | État online/offline, blocage des écritures hors-ligne |
| Stockage | Session / cache (Preferences + IndexedDB) |
| Deep links | `daxi://…` et `https://daxipro.com/track/…` |
| Partage | Share sheet natif (course, forfait, position) |
| Splash / status bar / haptics / back | Chrome OS natif |

## Sync web → plateformes

```bash
cd clients/daxi-capacitor
npm run sync
```

Puis `npx cap open android` ou `npx cap open ios` (Mac + `pod install` pour le `.xcworkspace`).

Ne génère pas l’APK/AAB automatiquement — build manuel dans Android Studio / Xcode quand tu es prêt.
