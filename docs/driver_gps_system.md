# Système GPS chauffeur — Daxi Pro (`driver_home.html`)

Ce document décrit le fonctionnement du GPS côté page chauffeur **après** le retour au géolocalisation native du navigateur (sans moteur Kalman / DaxiGpsEngine sur les coordonnées).

---

## Objectif

Afficher la position du chauffeur sur la carte Google Maps (vue 3D, pitch 65°) avec une **précision utile** (cible **≤ 50 m**) en quelques secondes, sans dégrader la position avec des filtres logiciels agressifs.

---

## Principe : GPS natif uniquement

Les coordonnées affichées et envoyées au serveur proviennent **directement** de l’API navigateur :

```js
navigator.geolocation.watchPosition(callback, error, {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 20000
});
```

Complété au démarrage par des appels `getCurrentPosition` en rafale (toutes les **400 ms**) pour « réveiller » le chip GPS plus vite.

**Aucun** filtre Kalman, snap route, ou lissage artificiel n’est appliqué sur **latitude/longitude**. C’est ce qui avait dégradé la précision (~200 m) dans les versions précédentes.

---

## Pourquoi la précision fonctionne mieux maintenant

### 1. On n’affiche plus les mauvaises positions

Avant : la première lecture (souvent **Wi‑Fi / cellulaire**, 150–500 m) était affichée immédiatement.

Maintenant :

| Règle | Valeur | Effet |
|--------|--------|--------|
| `GPS_TARGET_M` | 50 m | La flèche n’apparaît que si `accuracy ≤ 50` |
| `GPS_REJECT_M` | 200 m | Les lectures > 200 m sont ignorées au boot |
| `GPS_BOOT_MS` | 3 s | À 3 s, si un fix ≤ 50 m existe, il est verrouillé |
| `GPS_MAX_WAIT_MS` | 15 s | Sinon attente continue, puis meilleur fix avec avertissement |

Le splash affiche en direct : `GPS ±XXm — cible ≤50m`, pour voir la précision converger.

### 2. Démarrage GPS le plus tôt possible

`_startDriverGps()` est appelé dès `window.load`, **avant** le chargement de Google Maps. Les fixes sont stockés dans `_gpsBestFix` / `_pendingGpsReveal` puis appliqués dès que la carte et le marqueur sont prêts (`_flushGpsToMap`).

### 3. `enableHighAccuracy: true` + `maximumAge: 0`

Force le navigateur à utiliser le **GPS satellite** (et non une position en cache ou purement réseau).

### 4. Pas de `timeout: Infinity`

Certaines versions de navigateurs bloquaient `watchPosition` avec `Infinity`. Timeouts finis (5 s / 20 s) assurent des callbacks réguliers.

---

## Flux de démarrage

```
window.load
    └── _startDriverGps()
            ├── setInterval(getCurrentPosition, 400ms)  ← rafale boot
            └── watchPosition (continu)

_doAppBoot() → initMap() → onMapLoad
    └── _initCarMarker() (AdvancedMarkerElement 3D)
            └── _flushGpsToMap()  ← applique le fix en attente si ≤ 50m
```

### Fonctions clés

| Fonction | Rôle |
|----------|------|
| `_onDriverGeoPosition` | Callback GPS brut |
| `_tryLockGps` | Décide si on affiche / met à jour |
| `_ingestGpsFix` | Garde la meilleure lecture (`_gpsBestFix`) |
| `_commitGpsFix` | Affiche marqueur, envoie `/htmx/driver/location/` |
| `_showDriverOnMap` | Pose le marqueur + zoom initial |
| `_stopGpsBurstPoll` | Arrête la rafale quand fix ≤ 50 m |

---

## Marqueur sur la carte

- **Préféré** : `google.maps.marker.AdvancedMarkerElement` (carte vectorielle + `mapId`) — le marqueur suit l’inclinaison 3D de la carte.
- **Secours** : `MapOverlay` (OverlayView) si la lib `marker` échoue — overlay 2D écran.

---

## Boucle d’animation (`engine`)

Indépendante du GPS :

- `targetPos` ← mis à jour par le GPS
- `pos` ← interpolation (`lerp`) vers `targetPos` pour un déplacement visuel fluide
- `targetBear` / `sBear` ← cap (heading)
- Caméra en `_followMode` : centre, heading et tilt 65° suivent la voiture

---

## Envoi serveur

`_sendLocation(lat, lng, …)` :

- WebSocket `/ws/driver/{id}/` (toutes les ~1 s)
- HTTP POST `/htmx/driver/location/` (toutes les ~2 s)

---

## Limites matérielles (hors code)

- **Intérieur** : souvent 100–500 m (Wi‑Fi), impossible d’atteindre 50 m sans sortir.
- **Permission « localisation précise »** requise sur mobile.
- **HTTPS** ou `localhost` obligatoire pour `geolocation`.
- Objectif **≤ 50 m en 3 s** réaliste **dehors** avec GPS activé.

---

## Fichier source

Toute la logique GPS vit dans :

`driver_home.html` — section commentée `GPS natif : précision ≤50m avant affichage`.

---

*Dernière mise à jour : juin 2026 — méthode watchPosition native + gate précision 50 m.*
