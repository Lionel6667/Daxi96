# HANDOFF GPS DAXI — pour Claude (suite de Cursor)

**Date :** 7 septembre 2026  
**Auteur du chantier :** agent Cursor (Grok 4.6) sur la machine du développeur  
**But de ce document :** tout le contexte, toutes les mods, toutes les mesures. Tu (Claude) dois dire **quoi faire ensuite**. Ne recode pas ici : produis un plan d’actions numéroté, priorisé, avec ce qu’il est interdit de toucher.

---

## 0. Contexte produit

DAXI est une app VTC Haïti (`com.daxipro.daxi`).

- **Backend / site :** Django + Daphne, prod `https://daxipro.com` (Railway). HTML chauffeur = template Django (`driver_home.html`). HTML client = `vubez2.html` + chunks `static/js/vubez2/vubez2-inline-*.js`.
- **App Android :** Capacitor 6, WebView qui charge `https://daxipro.com`. `DaxiAssetShell` sert les assets **locaux** `www/static/js` quand le fichier existe dans l’APK. Donc : JS GPS peut être local à l’APK **et** déployé sur le site. Le **plugin natif** n’existe que dans l’APK.
- **Branche :** `fix/gps-pipeline`, merge fast-forward dans `main` @ `4512aac` (déployé Railway).
- **Repo :** `https://github.com/Lionel6667/Daxi96.git`
- **Développeur :** Lionel. Il est le propriétaire. Pas de reverse-engineering hostile.

### Bug d’origine (symptôme utilisateur)

DAXI obtenait une position beaucoup moins précise que Google Maps, surtout au cold start. Parfois Maps « réchauffait » le GNSS et DAXI devenait précis ensuite. Ce n’était **pas** Kalman / `rejectJump` / snap qui cassaient la précision : **DAXI ne demandait jamais un flux GNSS temps réel à Android**.

### Règles d’engagement encore en vigueur

1. **Pas de fausse précision.** Ne jamais publier une accuracy meilleure que la mesure brute (`300/√n` Kalman = interdit).
2. **Ne pas toucher** `rejectJump`, `BearingKalman.update`, `applySnap` (innocents d’après l’audit initial).
3. Ne pas marquer « prêt prod / aussi bon que Maps » sans **Test G extérieur** chiffré.
4. Le téléphone (S9+) est parfois le hotspot du PC : **ne pas couper les données mobiles**.
5. Un commit par correction numérotée (historique déjà ainsi).

---

## 1. Cause racine (audit pré-fix, confirmée en logcat)

Le seul GPS natif était `@capacitor/geolocation` 6.1.1. `LocationRequest` :

- interval **10 000 ms**
- minUpdate **5 000 ms**
- JS `timeout` mappé sur `setMaxUpdateDelayMillis` → **30 000 ms de batching**

Samsung (S9+, Android 10) :

```
GnssLocationProvider: setRequest ProviderRequest[ON interval=+10s0ms]
GpsSession_FLP: GlpInterval=10000
GpsSessionManager_FLP: No need to register due to long engine interval
```

Conséquences en cascade (toutes mesurées, pas théoriques) :

| # | Bug | Effet |
|---|---|---|
| 1 | Requête 10 s / batch 30 s | GNSS jamais ouvert ; positions réseau 300–1100 m |
| 2 | `getCurrentPosition({ maximumAge: 5000 })` → `getLastLocation()` | Premier fix = cache cell ~500 m |
| 3 | JS écrasait `ts` avec `Date.now()` | Âge du fix perdu ; tout paraissait frais |
| 4 | Premier fix client `forcePan` | Pin planté sur 500 m cell |
| 5 | Permission coarse acceptée | Downgrade `BALANCED_POWER` |
| 6 | Moteur **poll 800 ms** d’une seule valeur push | Kalman refusionne n fois |
| 7 | Boucle Chromium `navigator.geolocation` en parallèle du natif | 3 systèmes concurrents (A/B/C) |
| 8 | Cliquet affichage `need = committed − 100` | 6000+ `COMMIT SKIPPED` ; carte gelée |
| 9 | Kalman même mesure | publié 300 → **43 m FABRICATED** |
| 10 | Chauffeur `displayMaxAccuracy: 3000`, max 800 m | Accepte n’importe quoi |
| 11 | `uncovered-place` `force: true` | Téléport **824 m** |
| 12 | `console.log` no-op en prod (`vubez2.html`) | Diag muet sans iframe sink |

Hors GPS mais bloquant UI : `BillingNotEnabledMapError` (clé Maps / facturation Google Cloud). Carte noire. Les logs GPS marchent quand même.

---

## 2. Architecture après correction

**Option A retenue : plugin Capacitor custom `DaxiGps`**, pas un fork du plugin stock.

Fichiers natifs (APK seulement) :

- `clients/daxi-capacitor/android/app/src/main/java/com/daxipro/daxi/DaxiGpsEngine.java`
- `DaxiGpsPlugin.java` (`@CapacitorPlugin(name = "DaxiGps")`)
- `DaxiLocationService.java` (FGS type `location`, channel `daxi_gps`, notif id `7101`)
- Enregistré dans `MainActivity` **avant** `super.onCreate()`
- Dépendance `play-services-location:21.1.0`

Requête actuelle :

```
INTERVAL_MS = 1000
MIN_INTERVAL_MS = 500
MAX_DELAY_MS = 0
PRIORITY_HIGH_ACCURACY
GRANULARITY_FINE
waitForAccurateLocation = true
```

Pont JS : `clients/daxi-capacitor/capacitor-src/main.js` → bundle `www/js/daxi-capacitor.js` (gitignore) et copie `static/js/daxi-capacitor.js`.

- `registerPlugin('DaxiGps')` → `window.DaxiGps`
- Android : plugin custom. iOS : encore `@capacitor/geolocation` (non travaillé).
- `getFreshPosition` : attend le prochain callback fused, **jamais** `getLastLocation`.
- `ageMs` depuis `elapsedRealtimeNanos`.
- Push : `window._daxiGpsPushSubs` ; le moteur s’abonne, plus de poll 800 ms.

Moteur JS vivant : **`static/js/gps-precision-engine.js` uniquement**.  
La copie racine `gps-precision-engine.js` (21 Ko, hash différent, 31 Ko le vrai) a été **supprimée**. Les bundleurs ne la recopient plus par-dessus `static/js`.

---

## 3. Inventaire exhaustif des commits

Tous sur `fix/gps-pipeline` → `main` @ `4512aac`.

### Phase 0 — instrumentation seule

| Commit | ID | Quoi |
|---|---|---|
| `a6a67d8` | 0.2 | `static/js/daxi-gps-diag.js` + logs pont `setLastNativeGps` |
| `a801950` | 0.3 | `diagReject()` + compteur doublons (filtres intacts) |
| `3da5ba3` | 0.4 | Sources A/B/C/D sur chaque écriture d’affichage |
| `7f52d80` | 0.5 | Panneau in-app : 7 tapes coin haut-gauche |
| `dd95236` | chore | bundle www Phase 0 |
| `9117cc3` | 0.2b | Sink console via iframe (prod mute `console.log`) |
| `0d4a3bc` | 0.4b | Source inconnue = `?` (ne plus deviner B) |

### Phase 1 — critique (natif)

| Commit | ID | Quoi |
|---|---|---|
| `ec1b419` | 1.1 | Plugin `DaxiGps` 1 Hz, maxDelay=0, FINE |
| `e32fb58` | 1.2 | Pas de `getLastLocation` / `maximumAge>0` live |
| `3f97892` | 1.3 | `ageMs` depuis `elapsedRealtimeNanos` |
| `8de4232` | 1.4 | Plus de `forcePan` sur le **premier** fix natif client (`_daxiOnNativeGpsFix`) |
| `2cd3428` | 1.5 | Fine only ; coarse → UI réglages |
| `0b15d70` | chore | bundle www Phase 1 |

### Phase 2 — pipeline JS

| Commit | ID | Quoi |
|---|---|---|
| `dad9050` | 2.1 | Push bus, plus de poll 800 ms |
| `70384c5` | 2.2 | `_daxiIsNativeGpsHost()` → skip boucle Chromium refine |
| `8b85ba7` | 2.3 | Cliquet : 1er commit si `acc ≤ 300` ; ensuite mieux **ou** déplacement `max(8, 0.45×min(acc))` |
| `a2c882a` | 2.4 | Chauffeur `DRV_MIN_GPS_M=20`, `DRV_MAX_GPS_M=100` ; plus de bypass `displayMaxAccuracy` |
| `0721611` | 2.5 | Kalman skip si lat/lng/acc identiques (`duplicate-skip`) |
| `98aacc8` | chore | bundle www Phase 2 |

### Phase 3 — GNSS / FGS / serveur / mock

| Commit | ID | Quoi |
|---|---|---|
| `d521164` | 3.1 | `GnssStatus.Callback` → `satellitesUsed` / `satellitesInView` |
| `d568843` | 3.2 | FGS `DaxiLocationService` ; start dans `_startDriverGps`, stop logout |
| `8d3f5c9` | maps | **Hors GPS** : ne plus appeler Directions à chaque tick GPS |
| `3b228d6` | 3.3 | `Driver.location_accuracy` + migration `0015` ; POST/WS/API/gps-batch |
| `37a927e` | 3.4 | Suppression `_coarseClientGps` (morte) + copie racine moteur |
| `98bbbe3` | 3.5 | `isMock()` / `isFromMockProvider()` → JS → rejet display/serveur |
| `0e2fe2d` | chore | bundle www Phase 3 |

### Client restant + deploy

| Commit | Quoi |
|---|---|
| `e977e96` | Client max **200 m** ; `force`/`forcePan` ne bypassent plus le plafond ; boot sans `force:true` ; plus de téléport `uncovered-place` |
| `08fd60c` | Cache-bust `?v=20260905c` (WhiteNoise max-age 1 an) |
| `4512aac` | Cache-bust `20260905d` (Cloudflare avait mis en cache `05c` **pendant** le restart Railway avec l’ancien JS 300 m) |

### Pollution d’historique (important)

**`d568843` (3.2)** a embarqué du WIP routes **non GPS** dans `driver_home.html` : script `daxi-routes.js`, `_drvMaybeRefreshRoutes`, `_drvRouteInFlight`, bump `daxi-order-card-map`. Le FGS lui-même est correct. Commit local à l’époque, maintenant dans `main`.

---

## 4. Fichiers clés (carte mentale)

**Natif APK**

- `DaxiGpsEngine.java`, `DaxiGpsPlugin.java`, `DaxiLocationService.java`, `MainActivity.java`, `AndroidManifest.xml` (`FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`)

**Pont**

- `clients/daxi-capacitor/capacitor-src/main.js` : `normalizeFix`, `applyNativeFix`, `watch`, `getFreshPosition`, `startForegroundTracking`

**Moteur / client / chauffeur**

- `static/js/gps-precision-engine.js` — unique source live
- `static/js/daxi-client-gps-core.js` — `VALIDATED_MAX_M = 200`, `EXTREME_REJECT_M = 200`, rejet `MOCK_LOCATION`
- `static/js/vubez2/vubez2-inline-05.js` — `_daxiOnNativeGpsFix` (mock skip, plus de forcePan 1er fix)
- `static/js/vubez2/vubez2-inline-07.js` — seuils client, cliquet, uncovered, boot
- `driver_home.html` — `_onGpsDisplay`, `_sendLocation(lat,lng,speed,heading,acc)`, FGS, seuils 20/100

**Diag**

- `static/js/daxi-gps-diag.js`, `daxi-gps-diag-panel.js`
- Tags logcat : natif `DAXI_GPS` ; JS `[DAXI GPS/…]` via iframe sink

**Backend**

- `drivers/models.py` : `location_accuracy`
- `drivers/migrations/0015_driver_location_accuracy.py`
- `julmin_taxis/driver_gps_utils.py` : `parse_accuracy_m`, payload `accuracy` / `driver_accuracy`
- `julmin_taxis/htmx_views.py` `driver_update_location`
- `orders/consumers.py` `location_update`
- `julmin_taxis/mobile_views.py` `mobile_gps_batch`
- `drivers/views.py` REST location
- `julmin_taxis/gps_antispoof.py` : `is_mock_flag`, `validate_driver_gps(..., mock=)`

**Cache bust prod**

- `vubez2.html` : `window._DAXI_ASSET_V='20260905d'`
- `static/js/daxi-vubez2-chunks.js` charge inline-04/06/07 avec ce `v`
- `driver_home.html` : `gps-precision-engine.js?v=20260905d`

---

## 5. Seuils actuels

| Rôle | Cible | Max accepté | Notes |
|---|---|---|---|
| Chauffeur | 20 m | **100 m** | En dessous de 100 m : pas d’affichage ni d’envoi. 300–500 m indoor = `above_maxAccuracy` |
| Client | 100 m | **200 m** | `force` / `forcePan` / `forceCenter` **ne peuvent plus** planter un pin > 200 m |
| Client « Ma position » | — | 200 m | `force: true` seulement pour le cliquet (jitter), pas pour le plafond |

---

## 6. Résultats mesurés

Appareil unique : **Samsung Galaxy S9+ SM-G965U1, Android 10**. Tous les tests **intérieur** (fenêtre / bureau, Cap-Haïtien ~19.645, -72.044). **Aucun Test G extérieur.** Wi-Fi souvent off, LTE on (hotspot).

### 6.1 Baseline Phase 0 (`0d4a3bc`, intérieur)

| | Client | Chauffeur |
|---|---|---|
| Durée | 250 s | 190 s |
| Fixes natifs réels | 33 | 4 |
| « Fixes » moteur | 52 | 54 |
| Écritures affichage | 3 | **1027** |
| `COMMIT SKIPPED` | **6046** (`ratchet_not_better`, need=committed−100) | 369 |
| Rejets moteur | 198 (`above_displayMaxAccuracy`) | 0 |
| Coords distinctes | 1 | 2 (dont **fausse à 824 m** via `uncovered-place`) |
| Accuracy brute | 300 → **1100 m** (dégradation, jamais de GNSS) | 161–185 m |
| Accuracy publiée | jusqu’à **43 m FABRICATED** (`300/√n`) | idem |
| Intervalle Samsung | **10 s**, `No need to register due to long engine interval` | idem |
| TTFF | 15,1 s | ~15 s |
| Trou max entre fixes | **35,2 s** (batch 30 s) | pire (4 fixes / 190 s) |
| Source C (Chromium) | 0 (parcours refine non déclenché) | 0 |

Preuves : `docs/gps-audit/PHASE-0-BASELINE.md`, `preuves-client.log`, `preuves-chauffeur.log`.

### 6.2 Après Phase 1 (installé, intérieur)

- `setRequest ProviderRequest[ON interval=+1s0ms]`, `GlpInterval=1000`
- **Plus** de `long engine interval`
- Meilleur fused ~**78 m**, `ageMs=36`
- Cadence encore ~6–8 s au début (fused + indoor + `waitForAccurateLocation`), pas un vrai 1 Hz cold start
- Deux watches une fois (reload page / boucle Maps billing)

### 6.3 Après Phase 2 (installé, intérieur)

- `engine start: native push (no poll)`
- 15 fixes natifs → 15 ingestions moteur
- **Zéro `FABRICATED`**
- Indoor 300 m rejeté `above_maxAccuracy` (max chauffeur 100)
- Cliquet `ratchet_not_better` disparu
- ~34 lignes GPS vs des milliers avant
- Cliquet « précision + déplacement » peu testé (aucun fix ≤ 100 m indoor à ce moment)

### 6.4 Après Phase 3 (installé 5 sept 2026 ~05:21, intérieur, mode chauffeur)

Logcat `DAXI_GPS` (extrait réel) :

```
request interval=1000 minInterval=500 maxDelay=0 waitAccurate=true priority=HIGH_ACCURACY granularity=FINE
gnss status registered
watch registered …
foreground service started          ← JS chauffeur a bien démarré le FGS
fix acc=500.0 ageMs=1708 sats=0/19 mock=false   ← rejeté moteur (max 100)
…
fix acc=62.176 ageMs=109 sats=0/19 mock=false
fix acc=56.816 ageMs=37
fix acc=54.672 ageMs=37 sats=6/19 mock=false    ← GNSS lock
fix acc=52.796 … 51.884 … 49.526 … ~1 Hz
```

Dumpsys :

- `Request[ACCURACY_FINE gps requested=+1s0ms]` WorkSource `com.daxipro.daxi`
- `mFixInterval=1000`
- Service `DaxiLocationService` `isForeground=true`, notif channel `daxi_gps` « Suivi GPS », id `7101`

| Indicateur | Baseline | Phase 3 indoor |
|---|---|---|
| Intervalle OS | 10 000 ms | **1 000 ms** |
| Session GNSS Samsung | refusée | ouverte (`sats=6/19`) |
| FABRICATED | 219 | **0** |
| Meilleure acc brute indoor | 300 m (puis 1100) | **~50 m** |
| Cadence une fois locké | 1 / 35 s | **~1 Hz** |
| ageMs | UNKNOWN (`Date.now`) | **~37 ms** |
| Mock | n/a | `mock=false` sur chaque fix |
| FGS | absent | **démarré par le JS chauffeur** |
| Téléport uncovered | 1 × 824 m | corrigé en JS (commit `e977e96`) — **non rejoué sur device depuis** |

Observation restante : la boucle rAF d’affichage chauffeur spamme encore `write source=B` à ~60 fps sur le **même** point (`n=297` → `336` en <1 s). Ce n’est plus une fabrication Kalman, c’est un redraw inutile. Pas corrigé.

### 6.5 Client 200 m (`e977e96`)

Vérifié **sur daxipro.com** après deploy (7 sept, `?v=20260905d`, CF MISS) :

- `DAXI_GPS_VALIDATED_MAX_M = 200` dans `vubez2-inline-07.js`
- `VALIDATED_MAX_M = 200` dans `daxi-client-gps-core.js`
- skip `uncovered-place` (plus de `_daxiCommitGpsMapPoint force`)
- moteur prod : `mock_location` + `duplicate-skip`

**Pas de session logcat client dédiée après ce commit.** Le pont natif est le même ; l’affichage pickup n’a pas été rejoué (pin + adresse + zone) sur S9+ avec cette build.

### 6.6 Ce qui n’a **jamais** été mesuré

C’est le trou principal. À dire clairement à Claude :

1. **Test G — extérieur dégagé**, si possible données Wi-Fi off, comparaison **DAXI vs Google Maps** (même instant, même téléphone) : TTFF, acc à 10 / 30 / 60 s, cadence, jumps.
2. Test en **déplacement** (latence de suivi vs Maps).
3. Cold start **sans** ouvrir Maps avant.
4. Source **C** (refine Chromium) : volontairement coupée en natif ; non réobservée.
5. Mock réel (Fake GPS) : code prêt, pas d’app spoof testée.
6. iOS : zéro travail.
7. APK **Play Store / release** : seulement `assembleDebug` installé USB. Le store n’a pas cette native.

---

## 7. App vs site — qui a quoi

| Couche | Où ça vit | Comment ça arrive en prod |
|---|---|---|
| Plugin Java 1 Hz, FGS, GnssStatus, mock | APK | `assembleDebug` USB OK ; **Play Store NON** |
| Pont Capacitor | APK (`www/js/daxi-capacitor.js`) + éventuellement static | Bundle + `cap copy` |
| Moteur / client JS / chauffeur HTML | Git + Railway `collectstatic` + AssetShell APK | Site **oui** (`20260905d`) ; APK debug **oui** si rebuild après le commit |
| Accuracy persistée, anti-mock serveur, migration 0015 | Railway | **oui** (migrate au boot) |

Les deux doivent être alignés. Un store ancien + site neuf = pont 10 s + règles 200 m. Un store neuf + site ancien = inverse.

---

## 8. État volontairement non touché

- `rejectJump`, `BearingKalman.update`, `applySnap`
- iOS Geolocation
- Facturation Google Maps (`BillingNotEnabledMapError`) — **toujours cassé**, carte noire, Directions refusé
- Publication Play Store
- Nettoyage git du WIP routes dans `d568843`

---

## 9. Bugs / dettes connus (pour décider la suite)

**P0 — pas mesuré**

- Test G extérieur vs Maps. Sans ça on ne peut pas dire « aussi précis que Maps ». Indoor 50 m sur S9+ Android 10 n’est **pas** une preuve GNSS urbain.

**P1 — produit**

- Carte Google Maps billing off → app inutilisable visuellement même si le GPS loggue.
- Play Store n’a pas le plugin `DaxiGps`. Les users store sont encore sur l’ancien pont 10 s.
- `waitForAccurateLocation=true` : peut retarder le premier fix fused. À évaluer outdoor (trade-off TTFF vs qualité).
- Deux `watch` natifs parfois (reload / double start).

**P2 — affichage**

- rAF chauffeur ~60 écritures/s du même point (bruit logs, CPU).
- Client : parcours pickup / uncovered **non rejoué** sur device après `e977e96`.
- Cliquet client 200 m : `force` « Ma position » OK pour jitter, plafond tenu en code.

**P3 — qualité / historique**

- Instrumentation Phase 0 encore en prod (panneau 7 tapes, iframe console). Prévu temporaire.
- Compteur doublons signait `lat|lng|acc|timestamp` (sous-estime) ; 2.5 skippe déjà lat/lng/acc identiques.
- Cache Cloudflare + WhiteNoise 1 an : tout JS GPS **doit** bumper `?v=` / `_DAXI_ASSET_V`. Ne jamais réutiliser un `v=` déjà HIT avec un mauvais contenu.
- Commit 3.2 mélange routes.

**Déjà fermé en code, à confirmer outdoor**

- Téléport uncovered-place
- FABRICATED Kalman
- getLastLocation 500 m
- forcePan premier fix
- Cliquet `need=committed−100`

---

## 10. Comment vérifier (pour le prochain agent)

```
# Logcat
adb logcat -s DAXI_GPS Capacitor/Console | findstr "DAXI"

# Attendu natif
# request interval=1000 … maxDelay=0 … FINE
# sats=used/view
# mock=false
# PAS de "long engine interval"
# PAS de FABRICATED

# FGS chauffeur
adb shell dumpsys activity services com.daxipro.daxi
# DaxiLocationService isForeground=true

# Site
# vubez2.html : _DAXI_ASSET_V='20260905d'
# inline-07 : DAXI_GPS_VALIDATED_MAX_M = 200
```

Panneau : 7 tapes coin haut-gauche.  
JDK build : `JAVA_HOME=C:\Program Files\Android\Android Studio\jbr`  
Bundle : `clients/daxi-capacitor` → `npm run bundle` ; `npx cap copy android` ; `gradlew assembleDebug`  
PowerShell : pas de `&&`, utiliser `;`.

---

## 11. Ce que Claude doit produire

Un **plan d’actions pour Cursor**, pas un résumé. Format souhaité :

1. Verdict honnête : est-ce que le chantier GPS est « fini » ou non, et pourquoi (citer le Test G manquant).
2. Liste **ordonnée** des prochaines mods (une ID par item, style `4.1`, `4.2`…), chacune avec : fichier(s), critère de preuve mesurable, risque.
3. Ce qu’il **ne faut pas** toucher (`rejectJump` / Kalman bearing / snap, sauf si Claude justifie une exception).
4. Décision Maps billing vs GPS (parallèle, pas mélangé).
5. Décision Play Store : faut-il un build release maintenant ou après Test G.
6. Faut-il retirer le diag Phase 0 de la prod.
7. Faut-il recouper `d568843` (WIP routes) ou le laisser.

Contraintes à respecter dans le plan : pas de fausse précision ; un commit par ID ; instrumenter avant de changer un filtre ; ne pas déclarer « aussi bon que Maps » sans chiffres outdoor.

---

## 12. Une phrase pour Claude

La cause racine (requête Fused 10 s / batch 30 s) est **corrigée et prouvée en logcat Samsung**. Indoor, on passe de 300–1100 m + précision fabriquée 43 m à ~50 m brut, 1 Hz une fois locké, zero FABRICATED, FGS chauffeur OK, site client 200 m déployé. **Il manque le seul test qui compte pour l’utilisateur : extérieur vs Google Maps, et un APK store.** Dis à Cursor exactement dans quel ordre attaquer ça.
