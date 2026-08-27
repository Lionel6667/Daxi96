# Handoff conversation DAXI — fil long (2 → 16 août 2026)

Document de reprise pour un **nouveau chat Cursor**. Couvre **toute** cette conversation (plus d’une semaine), pas seulement le 16 août.

| | |
|--|--|
| **Workspace** | `julmin_taxis_django` |
| **Produit** | DAXI / Julmin Taxis (Django + HTMX + `vubez2.html`) |
| **App mobile** | Capacitor `com.daxipro.daxi` → `clients/daxi-capacitor/` (après migration depuis WebView / `clients/daxi-android/`) |
| **API dev** | Django local + **ngrok** (`clients/daxi-android/scripts/ngrok-url.txt`, `clients/daxi-capacitor/backend.config.json`) |
| **Prod cible** | `daxipro.com` (pas encore le backend unique de l’app en dev) |
| **Transcript** | `agent-transcripts/0fc77118-29da-4841-9bbf-3497a2d5d882` (~1900 events JSONL) |
| **Langue user** | français |

**Prompt de démarrage :**  
`Lis deploy/HANDOFF-CONVERSATION-2026-08-16.md en entier puis continue au point « À FAIRE MAINTENANT ».`

---

## Vision produit (règles stables)

1. **Le site HTML/CSS/JS Django reste la source de l’UI** — ne pas réécrire l’app native from scratch.
2. **Ce n’est PAS « un site encapsulé » pour Play/App Store** — couche native réelle : GPS, push, offline, deep links, réseau, permissions.
3. Architecture cible validée (**Capacitor Option A**, 13 août) :
   ```text
   DAXI UI (HTML/CSS/JS + HTMX)
        ↓
   Capacitor
        ↓
   services natifs (GPS / Push / Network / Preferences / Deep links / …)
        ↓
   Django API (ngrok en dev)
   ```
4. **Ne pas remplacer Google Maps** (validé 14 août : Maps JS marche dans Capacitor). MapLibre = fallback historique, pas la cible.
5. **GPS chauffeur = intouchable** (consigne 4 août) — corrections GPS uniquement **côté client**.
6. Commits / rebuild APK **seulement si l’user le demande**.
7. Travailler **partie par partie** (missions numérotées) ; diagnostiquer avant de patcher au hasard.

---

## Architecture technique actuelle

| Élément | Chemin |
|--------|--------|
| UI client | `vubez2.html` → bundle Capacitor `www/index.html` |
| Bridge Capacitor | `clients/daxi-capacitor/capacitor-src/main.js` → `www/js/daxi-capacitor.js` |
| Config backend unique | `clients/daxi-capacitor/backend.config.json` + `DAXI_API_BASE_URL` |
| Bundle/sync | `npm run bundle` / `build:bridge` / `sync` dans `clients/daxi-capacitor/` |
| Legacy Android WebView | `clients/daxi-android/` (historique ; Capacitor a pris le relais) |
| CSRF HTMX | `static/js/daxi-htmx-csrf.js` |
| Offline / bootstrap | `static/js/daxi-offline.js`, `/api/mobile/bootstrap/` |
| Push | `julmin_taxis/notify.py`, FCM, `deploy/push-notifications-setup.txt` |
| Service account FCM | `secrets/firebase-service-account.json` |
| Cloudinary | clés alignées sur projet `outoubon-main` (3 août) |
| Places post-sélection | `vubez2.html` : `_daxiFetchPlaceDetailsBg`, `_daxiApplyPlaceDetails`, `_setMainMapBookingPoint`, `_updateBookingRoute` |

Flags runtime natifs : `_daxiCapacitorApp`, `_daxiHybridShell`, `_daxiUseNativeGps`, classe `daxi-native-shell`, bridge `window.DaxiAndroid`.

---

## Chronologie complète

### Dimanche 2 août — démarrage du fil

- Audit / correctifs **API 429** (throttling DRF admin login + drivers).
- Suite de bugs admin/client (analyse avant patch).

### Lundi 3 août — Cloudinary, admin live map, forum, UI

- Photos / Cloudinary : stockage images, suppression anciennes photos profil.
- Clés Cloudinary copiées depuis `outoubon-main` ; discussion sécurité `.env`.
- Prompt Gemini **manuel** (pas d’API image) pour voiture chauffeur.
- Logos PNG DAXI (admin / chauffeur / entreprise).
- Serveur + ngrok.
- **Carte live admin** : commandes invisibles, positions chauffeurs manquantes, `focusLiveMapOrder` undefined, textes blancs, avatars base64, double bouton réduire/fermer carte.
- Lieux enregistrés chauffeurs/admin → doivent apparaître dans suggestions commandes.
- **Forum** (ex « blog CSM ») : 10 catégories défaut, CRUD, fix 403 categories.
- UI téléphone (indicatif), placeholders email, logo chauffeur spacing.

### Soir 3 août — Itinéraires fréquents / Découvrir Haïti

- Tracé routes manquant sur Itinéraires fréquents vs Découvrir Haïti.
- Relances ngrok/serveur.

### Mardi 4 août — GPS CLIENT (critique)

- Consigne : **ne toucher AUCUN GPS chauffeur**.
- Pipeline GPS client : position fausse (Okap → PAP), raffinement trop faible, précision &lt;200 m puis **arrêt** sans update/s, cercle accuracy mal centré au zoom.
- Objectif : raffiner en continu côté client.

### Dimanche 9 août — Rebuild mobile Play/App Store (WebView native)

- Grand audit app lancement → fermeture.
- Spec **FINAL MOBILE REBUILD** : offline-first, native shell autour du site (pas « site dans WebView »).
- **PHASE 2** : `guest_id` offline + réconciliation ; session/auth offline (cookies, IndexedDB, bootstrap) ; ne jamais détruire données locales.

### Mardi 11 août — PHASE 3 release Android

- Signature release (`keystore.properties` hors git).
- `assembleRelease` / `bundleRelease` APK+AAB signés.
- Validation téléphone physique.

### Mercredi 12 août — Tests téléphone + Places freeze (v21)

- Backend = **ngrok uniquement** (pas encore daxipro.com).
- Modals localisation / notifications : ne se ferment pas, pas de demande système, timing (notif trop tôt), styles Android.
- Clarification : app ≠ site encapsulé ; permissions natives.
- GPS OK ensuite ; push encore KO ; **freeze à la sélection d’une suggestion Places** ; reload map inutile ; placeholder map dual-theme.
- Diagnostic Places : `importLibrary('places')`, `fetchFields()`, JSON, bridge JS↔Kotlin.
- Spec : Android **zéro** `fetchFields` après sélection ; `fetchPlaceDetailsAsync` → IO → `/api/places/details/` → callback UI.
- Mission diagnostic réseau / UI lente post-v21 ; builds ; images locales dans l’app ; map bloquée sur placeholder ; commandes qui ne partent pas.
- **Refus explicite** du « record / encapsuler le site live » (Play Store).

### Jeudi 13 août — Pivot Capacitor

- Demande d’abord « API + pure Kotlin » → **corrigée** : garder HTML/CSS/JS.
- Choix **Option A Capacitor** (cahier des charges GPS/push/network/offline/iOS plist).
- Premier APK debug Capacitor.
- Messaging : présenter comme UI web + Capacitor + services natifs (pas « WebView site »).

### Vendredi 14 août — Stabilisation Capacitor (parties 1→4.2+)

- Map absente, commandes « connexion lente », logo Capacitor, doute ngrok.
- **PARTIE 1** audit architecture (`daxi-android`, capacitor-src, Maps/MapLibre, builds).
- **PARTIE 2** URL backend unique `DAXI_API_BASE_URL` + logs réseau.
- **PARTIE 3** session / cookies / CSRF / CORS (`https://localhost` → ngrok).
- **PARTIE 4** forcer **Google Maps JS** (comme le site) ; MapLibre non détruit tout de suite.
- Rebuild test téléphone → Maps **fonctionne**.
- **PARTIE 4.1 / 4.2** pipeline splash → placeholder PNG → vraie Maps (zéro écran noir / clignotement).
- Suggestions lieux lentes / mal affichées / liste trop réduite sur APK.
- Assistant IA Gemini : knowledge profond client/chauffeur (pas admin), animations, ton humain.

### Suite 14–15 août (même fil, thèmes récurrents)

- Deep links / App Links / AASA.
- Offline HTMX (Mes Commandes, blog), shell roles (5 taps titre → driver ; secrets → admin).
- Push FCM étendu (pas de système parallèle) — guide `deploy/push-notifications-setup.txt`.
- CSRF / busy buttons (`daxi-htmx-csrf.js`).
- Crash JS `_runHeavyMapOps` (fonction dupliquée dans `vubez2.html`) qui cassait menus/map — fixé + APK rebuildé à l’époque.
- Boutons / commandes / HTMX sur natif.

### Dimanche 16 août — bugs UI app + freeze Places (état actuel)

#### Fixes sources appliqués (APK **NON** rebuild — user l’a interdit)

| # | Symptôme | Fix |
|---|----------|-----|
| 1 | Accepter/Refuser prix → rien | Fallback fetch natif + CSRF ; `client_price_proposal.html` sans `hx-headers` CSRF vide |
| 2 | Message départ ne disparaît pas | Auto-hide `_showBookingValidationErr` ~4,5 s |
| 3 | Permission GPS système au boot sans modal | `initGps()` Capacitor ne fait plus `requestPermissions()` au boot |
| 4 | Modal notifs chaque session | `_daxiMarkNotifAsked` + Preferences ; skip si déjà granted |
| 5 | Photos chauffeurs Cloudinary absentes | `photoURL` dans `_driver_to_firebase` + bootstrap ; pas de rewrite Cloudinary |
| 6 | Avis clients couleur + bouton APK | CSS aligné ; hide APK en `daxi-native-shell` |

Fichiers touchés ce jour : `vubez2.html`, `templates/htmx/client_price_proposal.html`, `static/js/daxi-htmx-csrf.js`, `daxi-action-buttons.js`, `daxi-offline.js`, `firebase_db/views.py`, `julmin_taxis/mobile_views.py`, `capacitor-src/main.js`, `capacitor-src/backend.js`.

**Attention :** `www/index.html` et `www/js/daxi-capacitor.js` peuvent être **stale** (pas de `npm run sync` / `build:bridge` après ces fixes).

#### Ouvert — FREEZE UI Places 5–10 s (PRIORITÉ)

- Web OK ; **Capacitor Android** freeze après clic suggestion (clavier, inputs, carte).
- Consigne : **diagnostiquer seulement**, timestamps `[PLACES]/[MAP]/[ROUTE]/[UI]/[CAPACITOR]`, pas de grosse refonte, **ne pas remplacer Google Maps**.
- Causes à classer : A Places / B Maps / C route / D main thread JS / E bridge Capacitor / F logique WebView.
- Pistes code : `_daxiFetchPlaceDetailsBg` (`fetchFields` / `getDetails` / `/api/places/details/` / `DaxiAndroid.fetchPlaceDetailsAsync`), `_daxiApplyPlaceDetails`, `_setMainMapBookingPoint`, `_updateBookingRoute`, `_fetchSmartRoute`.
- Historique 12 août : même bug ; tentative `fetchPlaceDetailsAsync` + séparer UI sélection / coords — **freeze persiste**.
- Livrable attendu : fichier + fonction + ligne + pourquoi Capacitor + fix **minimal** recommandé — puis STOP.

Dernier APK connu avant « ne rebuild pas » : ~**2026-08-16 17:01** — **sans** les fixes du 16 août.

---

## Décisions importantes (ne pas re-litiger)

| Décision | Date | Notes |
|----------|------|-------|
| Capacitor (pas Kotlin UI from scratch) | 13 août | Option A |
| Backend unique `DAXI_API_BASE_URL` | 14 août | ngrok en dev |
| Google Maps JS dans l’app | 14 août | confirmé sur téléphone |
| Pas d’encapsulation « site live » store | 12–13 août | |
| GPS chauffeur intouchable | 4 août | |
| Pas rebuild APK sans demande | 16 août | en vigueur |
| Freeze Places = diagnostic d’abord | 16 août | en vigueur |

---

## À FAIRE MAINTENANT (prochain agent)

1. **Freeze Places Capacitor** — instrumenter timestamps dans le flux post-sélection ; mesurer Long Task WebView ; identifier A–F ; STOP avec rapport + fix minimal recommandé (sans l’appliquer sauf OK user).
2. Après OK user : appliquer fix minimal → `npm run build:bridge` + `npm run sync` → rebuild APK **si demandé**.
3. Vérifier que les 6 fixes du 16 août sont bien dans le prochain APK.
4. Ne pas rouvrir MapLibre / rewrite native UI / GPS chauffeur.

### Checklist

- [ ] Lire ce handoff entier  
- [ ] Instrumenter Places (`vubez2.html`)  
- [ ] Chrome `chrome://inspect` → Long Tasks  
- [ ] Rapport cause + fix minimal  
- [ ] Attendre OK avant patch / rebuild  

---

## Commandes (quand autorisé)

```powershell
cd "clients\daxi-capacitor"
npm run build:bridge
npm run bundle
npm run sync
```

Debug : `chrome://inspect` → WebView `com.daxipro.daxi`.

Serveur dev typique : Django `runserver` + ngrok ; URL dans `ngrok-url.txt` / `backend.config.json`.

---

## Conversations / sujets connexes (hors ce JSONL mais liés)

- [Admin profile photo issue](a3956fba-bdec-47fd-ac66-809d18dfd749)  
- [Server setup and dependencies](9a378383-dfd1-4471-b271-b04bc557e893)  
- [Map display and loading](1c2f83b7-cf2e-45b0-877d-bf73f62e7030)  
- [Map loading and theme / GPS trace](59c17a9e-7c41-4091-a379-c783a27d69d8)  

Transcript principal de **ce** fil : `0fc77118-29da-4841-9bbf-3497a2d5d882`.
