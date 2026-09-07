# Phase 0 — Baseline mesurée sur appareil réel

Rapport de fin de Phase 0 (instrumentation). Aucune correction n'est appliquée à ce
stade : ce document ne contient que des mesures, destinées à servir de point de
comparaison obligatoire pour valider les Phases 1 à 3.

## Conditions de mesure

| | |
|---|---|
| Appareil | Samsung Galaxy S9+ (SM-G965F), Android 10 |
| Build | APK debug, branche `fix/gps-pipeline` @ `0d4a3bc` |
| Réseau | Wi-Fi désactivé, données mobiles actives (LTE) |
| Position | Cap-Haïtien, Haïti (~19.6452, -72.0444) |
| Permissions | `ACCESS_FINE_LOCATION` + `ACCESS_COARSE_LOCATION` accordées |
| Environnement | **intérieur** (aucun test extérieur dans cette baseline) |

Preuves brutes : `preuves-client.log`, `preuves-chauffeur.log`. Les motifs de lignes
répétés à l'identique y sont conservés 30 fois au maximum, avec le décompte réel.

## Résumé

Les deux modes présentent des symptômes opposés — le client est **gelé**, le chauffeur
**s'agite sur place** — pour une seule et même cause racine : l'application ne reçoit
qu'un fix réel toutes les 6 à 60 secondes, puis refusionne cette unique mesure en
boucle en fabriquant une précision qui n'existe pas.

| | Client | Chauffeur |
|---|---|---|
| Durée observée | 250 s | 190 s |
| Fixes natifs réels | 33 | 4 |
| « Fixes » moteur | 52 | 54 |
| Écritures d'affichage | 3 | 1027 |
| Blocages du cliquet | 6046 | 369 |
| Rejets moteur | 198 | 0 |
| Coordonnées distinctes affichées | **1** | **2** (dont une fausse à 824 m) |
| Accuracy brute | 300 → 1100 m (dégradation) | 161 – 185 m |
| Accuracy publiée | jusqu'à **43 m** | idem, fabriquée |

## Mesure 1 — Le fournisseur natif refuse d'ouvrir une session GNSS

Confirmation de la cause n°1 par le stack de localisation Samsung lui-même, et non
par déduction depuis le code :

```
GnssLocationProvider: setRequest ProviderRequest[ON interval=+10s0ms]
GpsSession_FLP: New GPS Session started, GlpInterval=10000 / OperationMode=1
GpsSessionManager_FLP: No need to register due to long engine interval
GpsSessionManager_FLP: No need to update the interval to GpsSession
```

`No need to register due to long engine interval` : l'intervalle demandé (10 s) est
jugé trop long pour justifier l'enregistrement d'une session de suivi GNSS. La
correction 1.1 n'est donc pas une optimisation de confort, c'est ce qui débloque
l'accès au matériel.

## Mesure 2 — Cadence et absence de convergence

Fixes natifs réellement remis à l'application (mode client) :

```
+15.1s  acc=300m     <- premier fix (TTFF)
+50.3s  acc=500m     <- 35,2 s de trou : batching maxUpdateDelay=30000
+56.9s  acc=300m
 ...     cadence stable ~6,6 s
+203.3s acc=1100m
+243.2s acc=1100m
```

| Indicateur | Valeur mesurée |
|---|---|
| TTFF | 15,1 s |
| Accuracy du premier fix | 300 m |
| Meilleure accuracy brute atteinte | 300 m |
| Temps jusqu'à la meilleure accuracy | **jamais** (dégradation vers 1100 m) |
| Fixes reçus dans les 60 premières secondes | 9 |
| Trou maximal entre deux fixes | 35,2 s |

L'accuracy ne s'améliore jamais : elle se dégrade de 300 m à 1100 m en quatre
minutes. Aucun verrouillage GNSS n'a lieu ; toutes les positions proviennent du
réseau. C'est la conséquence directe de la mesure 1.

## Mesure 3 — Fabrication de précision par refusion du même échantillon

La preuve la plus nette de la baseline. L'accuracy brute est **constante à 300 m** —
une seule mesure, jamais renouvelée — et l'accuracy publiée s'effondre :

```
fix #1   raw=300m  published=300m  dup=x1
fix #2   raw=300m  published=212m  dup=x2  FABRICATED=same measurement fused 2x
fix #3   raw=300m  published=173m  dup=x3  FABRICATED=same measurement fused 3x
fix #4   raw=300m  published=150m  dup=x4  FABRICATED=same measurement fused 4x
fix #5   raw=300m  published=134m  dup=x5  FABRICATED=same measurement fused 5x
fix #6   raw=300m  published=122m  dup=x6  FABRICATED=same measurement fused 6x
fix #7   raw=300m  published=113m  dup=x7  FABRICATED=same measurement fused 7x
fix #8   raw=300m  published=106m  dup=x8  FABRICATED=same measurement fused 8x
 ...
         raw=300m  published=43m
```

Ces valeurs sont exactement `300 / √n` :

| n | 300/√n | publié |
|---|---|---|
| 2 | 212,1 | 212 |
| 3 | 173,2 | 173 |
| 4 | 150,0 | 150 |
| 5 | 134,2 | 134 |
| 6 | 122,5 | 122 |
| 7 | 113,4 | 113 |
| 8 | 106,1 | 106 |

Effondrement de variance en `R/n` caractéristique d'un filtre de Kalman alimenté par
la même mesure répétée. Sur l'ensemble de la session : accuracy brute min = max =
**300 m**, accuracy publiée min = **43 m**. L'application annonce une précision **7
fois meilleure** que sa mesure, sur une position qui n'a pas bougé d'un octet.

C'est ce mécanisme qui rend le défaut invisible à l'usage : l'utilisateur voit un
point bleu confiant et serré, sur la mauvaise rue.

Volumétrie associée : 219 événements de doublon côté client, 50 côté chauffeur,
jusqu'à **9 fusions consécutives** de la même mesure.

## Mesure 4 — Le cliquet d'affichage bloque tout

Une seule raison de blocage, **6046 occurrences**, toutes identiques :

```
COMMIT SKIPPED  source=B  reason=ratchet_not_better  acc=300  committedAcc=300  need=200
```

Le point validé est à 300 m et le cliquet exige un fix à **200 m ou mieux** pour
autoriser un déplacement du marqueur. Le comportement est plus sévère que ce que
décrivait l'audit : il ne suffit pas d'améliorer la précision, il faut gagner 100 m
d'un seul coup. Un fix à 250 m, qui constituerait un progrès réel, est refusé.

Le mode chauffeur montre le cas dégénéré :

```
COMMIT SKIPPED  acc=160.82  committedAcc=160.82  need=60.82
```

L'accuracy proposée est **identique** à celle déjà validée, et elle est rejetée. Une
mesure est donc refusée contre elle-même.

Bilan client : **6046 blocages pour 3 écritures effectives**.

## Mesure 5 — Rejets moteur qui privent le filtre de ses seules données fraîches

198 rejets côté client, tous pour le même motif :

```
REJECTED  reason=above_displayMaxAccuracy
```

Les fixes à 500 m et 1100 m sont écartés. Le moteur reste donc coincé sur l'unique
échantillon à 300 m, qu'il refusionne indéfiniment (mesure 3). Le seuil destiné à
protéger l'affichage a pour effet net de **garantir la stagnation** : il élimine les
seules mesures récentes disponibles.

## Mesure 6 — Téléportation de 824 m par la logique « lieu non couvert »

```
+15.6s  write source=D  acc=161m  lat=19.645183  lng=-72.044404  via=flush
+16.2s  write source=D  acc=161m  lat=19.639019  lng=-72.040044  via=uncovered-place
```

Même fix, même accuracy, mais les coordonnées affichées sont remplacées par un autre
point situé à **824 m** (distance orthodromique). Ce point fabriqué devient ensuite la
référence du cliquet (`committedAcc=161`), qui verrouille l'affichage dessus et rejette
tous les fixes réels suivants.

Combinaison exacte du symptôme rapporté : « DAXI me place ailleurs et ne se corrige
pas ». Observé une fois sur cette session.

## Mesure 7 — Le mode chauffeur redessine un point figé

1027 écritures d'affichage, dont **1024 sur des coordonnées rigoureusement
identiques** (`19.645183, -72.044404`), pour seulement 4 fixes natifs réels.

| source / via | occurrences |
|---|---|
| `source=B via=engine/Android` | 1024 |
| `source=D via=flush` | 1 |
| `source=D via=primeGpsFast` | 1 |
| `source=D via=uncovered-place` | 1 |

Contrairement au client, ces écritures ne passent pas par le cliquet, d'où
l'inversion des volumes (1024 écritures contre 369 blocages). Le marqueur chauffeur se
redessine donc en continu sur une position gelée, tandis que le moteur lui attribue une
précision qui semble s'améliorer. Le premier fix est accepté à 185 m via
`_drvPrimeGpsFast`, cohérent avec `DRV_MAX_GPS_M = 800` (correction 2.4).

## Taxonomie des sources d'écriture

| Source | Client | Chauffeur |
|---|---|---|
| A — watch natif | 0 | 0 |
| B — moteur | 1 | 1024 |
| C — boucle Chromium | **0** | **0** |
| D — amorçage / cache | 2 | 3 |
| ? — non étiquetée | 0 | 0 |

Aucune écriture `?` : la totalité des producteurs d'affichage est identifiée, la
taxonomie est donc fiable. En revanche **C reste à 0** sur les deux modes : la
concurrence des trois systèmes de localisation reste **non démontrée** à ce stade. Il
faudra atteindre le parcours de recherche d'un point de départ client pour la déclencher.

## Défaut connu de l'instrumentation

Le compteur de doublons signe sur `lat|lng|accuracy|timestamp`. Lorsque le cache JS de
8 s réinterroge le pont et renvoie la même valeur avec un `ts` neuf, le compteur repart
à `x1` alors que la mesure est inchangée. La duplication réelle est donc
**sous-estimée** : visible dans les logs, le compteur retombe à `dup=x1` au fix #9 alors
que l'accuracy publiée continue de descendre de 100 m à 43 m. Signature à corriger en
Phase 1 (retirer `timestamp`).

## Constats hors périmètre GPS

Relevés au passage, sans lien avec la chaîne de localisation, mais bloquants :

```
Google Maps JavaScript API error: BillingNotEnabledMapError
MapsRequestError: DIRECTIONS_ROUTE: REQUEST_DENIED
Directions Service: You must enable Billing on the Google Cloud Project
```

La facturation du projet Google Cloud est désactivée : la carte ne s'affiche pas et le
calcul d'itinéraire est refusé, côté client comme côté chauffeur. À traiter séparément.

## Ce qui manque à la baseline

1. **Test G — extérieur dégagé, données mobiles coupées.** Test décisif : il mesure la
   convergence GNSS réelle, impossible à observer ici puisque toutes les positions
   provenaient du réseau. C'est la référence de comparaison pour la Phase 1.
2. **Déclenchement de la source C**, pour prouver ou écarter la concurrence des
   watchers.
3. **Test en déplacement**, pour mesurer la latence de suivi et le comportement du
   cliquet en mouvement.

## Critères de validation de la Phase 1

Mesures à reproduire après correction, dans les mêmes conditions :

| Indicateur | Baseline | Cible Phase 1 |
|---|---|---|
| Intervalle accordé par le fournisseur natif | 10 000 ms | 1 000 ms |
| `No need to register due to long engine interval` | présent | absent |
| Trou maximal entre deux fixes | 35,2 s | < 2 s |
| Fixes reçus dans les 60 premières secondes | 9 | > 45 |
| Écart entre accuracy brute et publiée | 300 m vs 43 m | nul |
| Lignes `FABRICATED` | 219 | 0 |
| Blocages `ratchet_not_better` | 6046 | 0 |
| Coordonnées distinctes affichées (à l'arrêt) | 1 | n/a |
| Téléportations `uncovered-place` | 1 (824 m) | 0 |
