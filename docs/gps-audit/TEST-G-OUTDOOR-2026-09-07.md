# Test G — extérieur vs Google Maps (4.1)

**Date :** 7 septembre 2026, 11:47:59 → 11:53:10 (heure téléphone)  
**Code :** aucun. Mesure uniquement.  
**Appareil :** Samsung Galaxy S9+ (SM-G965U1), Android 10, APK debug `1.6.5` avec plugin `DaxiGps`  
**Lieu :** Cap-Haïtien, près de *Kay Mr Eth (Piscine, Bar & Resto)* — ~19.64498, −72.04480  
**Réseau :** Wi-Fi ON (hotspot PC, `wifi_on=1`). `mobile_data` global=0. Localisation mode 3 (haute précision). Wi-Fi **non coupé** volontairement.  
**Session DAXI :** chauffeur, course ouverte (`ARRIVÉ — EN ATTENTE`), badge GPS `EN COURS`, FGS notif 7101. Carte DAXI **noire** (`BillingNotEnabledMapError`) — les logs GPS restent valides.  
**Protocole :** cold start DAXI **avant** Maps. `am force-stop` DAXI + Maps, `logcat -c`, lancement DAXI à t0, ~2 min DAXI seul, puis Maps à 11:50:08.  
**Preuves :** `docs/gps-audit/TEST-G-logcat-excerpt.txt`, `docs/gps-audit/test-g-screens/*.png`

t0 GNSS / 1er `watch` = **11:47:59.717** (process 11289). Le `am start` UI est à 11:48:04.

---

## Verdict

Le pont natif **tient** dehors : `GlpInterval=1000`, zéro `long engine interval`, zéro `FABRICATED`, `ageMs` 18–130 ms, `mock=false`, FGS actif, position DAXI ≈ position Maps à **~3 m**.

Le critère chiffré « ≤ 60 s → ≤ 15–20 m » est **atteint sur l’accuracy fused Wi‑Fi** (9,5 m à 60 s). Il n’est **pas** atteint sur l’accuracy GNSS une fois les satellites utilisés : ~30 m de `hAcc` fused/GPS, identique à `dumpsys` pour le provider `gps`. Maps dessine un point bleu serré alors que l’OS reporte ~28–30 m — l’écart visuel n’est pas un écart de fix.

**Interdit de dire « aussi bon que Maps » / « prêt prod ».** Pipeline OK, GNSS réel ~30 m sur cet appareil/ciel, carte DAXI toujours cassée, store toujours sans plugin.

---

## Tableau comparatif

| Instant | DAXI native `acc` | sats used/view | Cadence | Maps (même téléphone) |
|---|---|---|---|---|
| TTFF fused | **1,6 s** (36,9 m) | 0/23 | — | pas encore lancé |
| +10 s | 65,5 m | 0/23 | ~6,6 s | — |
| +21 s | **18,5 m** | 0/23 | ~6,6 s | — |
| +34 s | **12,9 m** | 0/23 | ~6,6 s | — |
| +60 s | **9,5 m** | 0/23 | ~6,6 s | — |
| +120 s | 7,2 m | 0/23 | ~6,6 s | — |
| +126 s | GNSS lock (8/23) | 8/23 | **~1 Hz** | — (Maps start 3 s plus tard) |
| Maps +20 s (~11:50:28) | 43,6 m fused | 4/23 | 1 Hz | point bleu serré, *Kay Mr Eth*, cône de cap |
| Maps +40 s / DAXI +4 min | 30 m fused ; `dumpsys gps hAcc=28 m`, 7 sats, meanCn0=22 | 5–7/23 | 1 Hz | même lieu, même point |

Distance horizontale DAXI JS (19.644984, −72.044802) vs fused Maps (19.644970, −72.044781) ≈ **2,7 m**.

`dumpsys` pendant la phase DAXI-seul (avant GNSS) : last `gps` provider **âgé de ~14 h**. Le 7–10 m de cette phase est du **fused réseau/Wi‑Fi** (`noGPSLocation` dans le Bundle), pas un fix GPS.

---

## Preuves pipeline (cause racine 1.1)

```
I/DAXI_GPS: request interval=1000 minInterval=500 maxDelay=0 waitAccurate=true priority=HIGH_ACCURACY granularity=FINE
D/GpsSession_FLP: New GPS Session started, GlpInterval=1000 / OperationMode=0
```

- `long engine interval` : **0** occurrence
- `FABRICATED` : **0** occurrence
- `mock=true` : **0**
- FGS : `foreground service started` + notif `id=7101` channel `daxi_gps`
- LocationRequest OS : `ACCURACY_FINE gps requested=+1s0ms` WorkSource `com.daxipro.daxi`

Maps, une fois ouvert : `ACCURACY_FINE gps requested=+997ms fastest=+997ms` **et** `monitoring location: true` en direct sur le provider `gps`. DAXI passe par GMS fused (`monitoring location: false` sur l’enregistrement GMS).

---

## Cadence et `waitForAccurateLocation` (entrée 4.3, pas de changement ici)

| Phase | Cadence native | sats |
|---|---|---|
| 11:48:01 – 11:50:04 (~2 min) | **~6,6–6,7 s** / fix | 0/23 |
| dès 11:50:05 | **~1,0 s** / fix | 2–8/23 |

Le GNSS s’est ouvert **~126 s** après le `watch` DAXI, **3 s avant** `am start` Maps. Ce n’est pas Maps qui a « réchauffé » le chip cette fois ; DAXI a fini par lock tout seul. Maps a ensuite une requête GPS directe à 1 Hz, DAXI aussi via fused.

Hypothèse 4.3 (à A/B plus tard, pas maintenant) : `waitForAccurateLocation=true` colle les updates fused tant que le réseau/Wi‑Fi s’améliore lentement (~6,6 s). Dès qu’un tick GPS 1 Hz existe, la cadence suit.

---

## Kalman JS — observation, pas un fix 4.1

Zéro tag `FABRICATED` (la protection 2.5 anti-doublon tient : `dup=x1`).

Dès que le GNSS dégrade l’accuracy native (7 m Wi‑Fi → 30–40 m GPS), le moteur publie encore **7–11 m** :

```
[DAXI GPS/ENGINE] +290.2s fix #188  raw=29m published=7m provider=native_push path=kalman dup=x1
[DAXI GPS/ENGINE] +300.2s fix #198  raw=35m published=7m provider=native_push path=kalman dup=x1
```

Ça viole l’esprit de la règle « ne pas publier une accuracy meilleure que la mesure brute », **sans** passer par `300/√n`. **Ne pas toucher** `rejectJump` / `BearingKalman.update` / `applySnap` pour ça. Si un item ultérieur s’en occupe, ce sera le Kalman du fichier `gps-precision-engine.js` uniquement, commit séparé, après 4.2–4.4.

Pendant la phase précise (`acc ≤ 20`) : `path=precise-bypass`, `raw=published`. C’est correct.

---

## Bugs déjà connus, reconfirmés dehors

| ID | Constat Test G |
|---|---|
| **4.2** | Deux `watch registered` à 1,1 s d’écart : `id=64721621` puis `id=63375497`. Un seul log JS BRIDGE (le 2e). |
| **4.4** | **4197** lignes `[DAXI GPS/DISPLAY]` en ~5 min (~60 writes/s du même point, ex. `n=3916…3929` en 200 ms). |
| Maps billing | Carte DAXI blanche « Petit problème… Google Maps ne s’est pas chargé ». Hors GPS. |
| Asset `?v=` | Console iframe charge `daxi-gps-diag.js?v=20260905b` (shell local / cache). Native plugin = debug USB. |

Pas de saut de marqueur mesurable : lat/lng stables autour de 19.64498, −72.04480. La carte DAXI étant cassée, le « jump visuel » n’est pas observable ; les coords JS ne sautent pas.

---

## Critère de sortie du plan initial

> Convergence ≤ 60 s à ≤ 15–20 m dehors.

| Lecture | Résultat |
|---|---|
| Accuracy **native fused** à 60 s | **PASS** (9,5 m) |
| Accuracy **GNSS** (`gps` provider / sats>0) à 60 s | **FAIL** — sats encore à 0 ; lock à 126 s, puis ~30 m |
| Position vs Maps | **PASS** (~3 m) |
| Pont 1 Hz / plus de `long engine interval` | **PASS** |
| « Aussi bon que Maps » | **NON** — Maps UI masque un `hAcc` OS ~30 m ; DAXI n’a pas de carte ; GNSS S9+ ici = 30 m |

On **ne revient pas** en Phase 1/2 : la cause racine 10 s / batch 30 s est morte dehors aussi. Suite = 4.2 (double watch) puis 4.3 A/B `waitForAccurateLocation` **au même lieu**.

---

## 4.5 / 4.6 — statut au moment du Test G

- **4.6 mock GPS :** aucune app mock installée (`pm list packages` sans Fake GPS / Lexa / etc.). `settings secure mock_location=0`. Test réel **bloqué** tant qu’une app mock n’est pas installée + autorisée en options développeur.
- **4.5 client pickup/uncovered :** DAXI chauffeur laissé en FGS. Chrome ouvert sur `daxipro.com/#/comm…` (feuille Commander visible, carte billing cassée, icône GPS départ présente). Nord est la seule zone `is_active` (bbox 19.6–19.9, −72.6–−72.1) — la position Test G ~19.645 est **couverte**. Port-au-Prince (Ouest, inactif) serait le déclencheur uncovered. Le téléphone est passé sur WhatsApp pendant le tap GPS : parcours pin + message uncovered **non terminé**. Pas de force-stop DAXI (course toujours ouverte).

---

## Décisions inchangées

- Play Store release : **pas maintenant** (après 4.1 **et** idéalement 4.5 ; GNSS réel ici = 30 m, pas 15).
- Diag Phase 0 (7 tapes, sink iframe) : **garder**.
- Maps billing : parallèle, pas un commit GPS.
- `rejectJump` / `BearingKalman.update` / `applySnap` : **intacts**.
