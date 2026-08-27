# DAXI — app mobile (Capacitor)

```
DAXI
  → UI (HTML / CSS / JS existants)
  → Capacitor
  → services natifs iOS / Android
       GPS · Push · stockage · réseau · partage · deep links
```

Ce n’est **pas** un site ouvert dans un navigateur. L’interface DAXI tourne dans l’app ; Capacitor expose les APIs système (permissions, notifications, géoloc, hors-ligne, liens, share sheet).

Django reste le backend (commandes, HTMX, API).

## Backend URL (une seule source)

Fichier : `clients/daxi-capacitor/backend.config.json`

- `DAXI_API_ENV` : `development` | `production`
- `DAXI_API_BASE_URL_DEVELOPMENT` : Django/ngrok actuel
- `DAXI_API_BASE_URL_PRODUCTION` : vide jusqu’au backend officiel
- En DEV, `ngrok-url.txt` peut overlay l’URL **uniquement au build** (`useNgrokFileForDev`)

Override CI : variable d’environnement `DAXI_API_BASE_URL`.

Injecté dans `www/daxi-capacitor-config.js` puis utilisé par `capacitor-src/main.js` (`backendUrl` / `backendWsUrl`).

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
npx cap sync
```

Puis `npx cap open android` ou `npx cap open ios` (Mac + `pod install` pour le `.xcworkspace`).
