# DAXI — Journal complet des modifications (conversation)

> Document généré à partir de l’ensemble de la conversation entre le **20 et 23 juillet 2026**.  
> Projet : `julmin_taxis_django` — Application taxi Haïti (client, chauffeur, admin, entreprise).

---

## Table des matières

1. [Client — Parcours commande & GPS](#1-client--parcours-commande--gps)
2. [Client — Interface sheet / formulaire](#2-client--interface-sheet--formulaire)
3. [Client — Plans & forfaits](#3-client--plans--forfaits)
4. [Client — Carte & itinéraires](#4-client--carte--itinéraires)
5. [Client — Traductions & i18n](#5-client--traductions--i18n)
6. [Client — Compte, inscription & connexion](#6-client--compte-inscription--connexion)
7. [Client — Thème clair / sombre](#7-client--thème-clair--sombre)
8. [Client — Performance & images](#8-client--performance--images)
9. [Client — Entreprise](#9-client--entreprise)
10. [Client — Notifications & paiement](#10-client--notifications--paiement)
11. [Cartes commande (tous rôles)](#11-cartes-commande-tous-rôles)
12. [Chat WhatsApp-like](#12-chat-whatsapp-like)
13. [Chauffeur](#13-chauffeur)
14. [Admin — Erreurs & performance](#14-admin--erreurs--performance)
15. [Admin — UI & thème](#15-admin--ui--thème)
16. [Admin — Carte live](#16-admin--carte-live)
17. [Admin — Cartes entreprise (emplacement)](#17-admin--cartes-entreprise-emplacement)
18. [Thème global (toutes pages)](#18-thème-global-toutes-pages)
19. [Backend & données](#19-backend--données)
20. [APK Android](#20-apk-android)
21. [Fichiers clés modifiés (index)](#21-fichiers-clés-modifiés-index)

---

## 1. Client — Parcours commande & GPS

### Numéro invité : ordre du flux corrigé
- **Problème** : le numéro WhatsApp était demandé **avant** le prix/paiement même quand la commande avait déjà des coordonnées GPS.
- **Correction** : le numéro n’est demandé **que si** la commande n’a pas de coordonnées GPS complètes.
- **Fichiers** : `julmin_taxis/htmx_views.py`, `templates/htmx/guest_phone_prompt.html`, `vubez2.html`

### Modal téléphone qui se ferme brutalement (~1 s)
- **Problème** : le rechargement HTMX des commandes effaçait le modal téléphone.
- **Correction** : garde-fou `_daxiSheetSlotHasCheckoutFlow()` — ne pas écraser le slot sheet si un flux checkout (téléphone, prix, paiement) est actif.
- **Fichiers** : `vubez2.html`, `clients/daxi-android/.../webcache/index.html`

### Modal « Écart de position détecté »
- **Problème** : faux positifs (écart de ~19 km) dus à une précision GPS insuffisante.
- **Corrections** :
  - Seuil de dérive porté à **200 m** (`RELOCATE_DRIFT_METUTES`)
  - Prise en compte de l’**incertitude GPS** (`RELOCATE_MAX_ACCURACY_M = 80`)
  - Logique de relocalisation affinée
- **Fichiers** : `julmin_taxis/meeting_point_utils.py`, `julmin_taxis/htmx_views_tracking.py`
- **Migrations** : `orders/migrations/0016_order_meeting_point.py`, `0018`, `0019`

### Point de rendez-vous (meeting point)
- Ajout champs `meeting_lat`, `meeting_lng`, `meeting_relocate_prompted_at`, `meeting_prompt_acknowledged`, `meeting_relocate_dismissed`
- WebSocket `relocate_prompt` quand le client s’éloigne du RDV
- **Fichiers** : `meeting_point_utils.py`, `htmx_views_tracking.py`, `static/js/daxi-realtime.js`

### Après échec GPS : vider « Ma position actuelle »
- **Problème** : après le message « Nou pa t kapab jwenn pozisyon ou… », l’input gardait « Pozisyon mwen kounye a ».
- **Correction** : reset automatique du champ pickup.
- **Fichiers** : `vubez2.html`

### Verrouillage des marqueurs après paiement
- Une fois le prix accepté et le paiement (cash ou en ligne) confirmé, le client **ne peut plus glisser** les icônes de position sur la carte.
- **Fichiers** : `vubez2.html`, logique carte client

### Point client = bleu (style Google Maps)
- Remplacement du point vert par un **point bleu** pour le client (cohérence Google Maps).
- Même traitement pour le chauffeur sur sa propre page.
- **Fichiers** : `vubez2.html`, `driver_home.html`, scripts carte

---

## 2. Client — Interface sheet / formulaire

### Labels départ / arrivée corrigés
- Le champ `#destinationAddress` était mal nommé (« Ma position actuelle ») — renommé en **adresse de départ** avec bons attributs `name` / `autocomplete`.
- **Fichiers** : `vubez2.html`, webcache Android

### Bouton d’aide `?` — guide commande
- Ajout d’un bouton **?** expliquant en détail :
  - Rôle de chaque zone du formulaire
  - Commandes pour plus tard
  - Glisser le point sur la carte pour précision
  - Frais supplémentaires au-delà du point d’arrivée
  - Position actuelle (bouton GPS)
- Plusieurs itérations de design pour éviter que le sheet chrome soit trop haut
- Position finale : intégré dans la **poignée du sheet** avec le bouton **×**
- **Fichiers** : `vubez2.html` (CSS `.daxi-sheet-chrome`, `.daxi-booking-help-*`)

### Bouton fermer `×` sur Nouveau trajet ET Ma course
- Le `×` n’était que sur « Ma course » — ajouté aussi sur « Nouveau trajet ».

### Sheet tabs (Nouveau trajet / Ma course)
- Refonte du design du toolbar (`.daxi-sheet-tabs-toolbar`)
- Hauteur réduite, responsive, élégant
- Boutons `?` et `×` intégrés dans la poignée sans agrandir la barre

### Poignée sheet style TikTok
- `daxiSheetHandleBar` : drag pour descendre/monter le sheet (comportement type commentaires TikTok)

### Pills commandes (Ma course)
- **Problème** : les onglets de commandes se superposaient avec 5+ commandes.
- **Correction** : rail horizontal scrollable, design repensé.
- **Fichiers** : `vubez2.html` (`#daxi-order-pills`, `_daxiRenderOrderPills()`)

### Modal au-dessus du bouton menu
- **Problème** : le bouton menu passait au-dessus du modal et masquait des boutons.
- **Correction** : z-index du modal > menu ; le menu reste visible mais **sous** le modal (ne disparaît plus).

### Barres de scroll personnalisées
- Remplacement du scrollbar blanc par des couleurs assorties au thème DAXI.
- Appliqué **partout** sur le site (global `::-webkit-scrollbar` + utilitaires).
- **Fichiers** : `vubez2.html`, `static/css/daxi-theme*.css`

### Bouton Connexion arrondi
- Coins du bouton « Koneksyon » en haut à droite légèrement arrondis.

### Page Mon compte intégrée
- « Mon compte » n’est plus une page externe lente — intégrée dans le sheet avec **préchargement** au boot.
- **Fichiers** : `vubez2.html` (`_daxiPreloadAccountOnce`, `_daxiSeedAccountSlot`), `templates/htmx/client_account.html`

### Assistance intégrée
- Page assistance intégrée en overlay dans `vubez2.html` (plus de navigation externe).

---

## 3. Client — Plans & forfaits

### Assistant forfaits premium (wizard 3 étapes)
- Nouveau wizard modal pour commander un forfait.
- **Fichiers** : `static/css/daxi-plan-wizard.css`, `static/js/daxi-plan-wizard.js`

### 6 plans (pas seulement 3)
- Tous les forfaits couverts : Ville à Ville, Demi-Journée, Journée Complète, Élégance Night, Accueil Aéroport, etc.
- **Fichiers** : `julmin_taxis/service_plans.py`, templates plan cards, `vubez2.html`

### Traductions plans (créole)
- Corrections textes créole : « ak yon pano ki gen non ou », « kote ou ap ale » au lieu de « kote ale »
- Champ panneau : **saisie libre** (plus d’autocomplete lieu sur le nom)
- Textes longs non tronqués en traduction
- **Fichiers** : `julmin_taxis/service_plans_i18n.py`, `static/js/daxi-auto-i18n.js`, formulaires plans

### Suppression « Indiquez un autre point de départ »
- Retiré de **tous** les formulaires plans et du formulaire principal.
- Départ = saisie manuelle OU bouton position actuelle.

### Bouton GPS animé (saut)
- Animation `@keyframes daxiGpsBounce` permanente sur `.daxi-row-action`
- Au clic : animation de localisation (scan)
- **Fichiers** : `vubez2.html`

### Scroll cartes plans
- **Problème** : scroll horizontal des cartes plans ne fonctionnait pas côté client.
- **Correction** : CSS overflow/touch corrigé.

### Page Tarifs — icônes services à bord
- Cartes Wifi/Eau centrées en flex.

### Cartes plans — bouton « En savoir plus » aligné
- Hauteur uniforme (500px), bloc WhatsApp masqué dans le carousel.

---

## 4. Client — Carte & itinéraires

### Carte plein écran (Ma course)
- **Problème** : bouton agrandir ne faisait rien.
- **Correction** : fermeture du modal + affichage course sur la carte principale.
- Classes : `.client-live-map-fullscreen-btn`, `body.jt-map-fullscreen-open`
- **Fichiers** : `vubez2.html`, `templates/htmx/_client_order_map.html`

### Zoom carte sur Haïti entière
- **Problème** : parfois dézoom sur tout le pays au lieu des 2 points.
- **Correction** : bounds calculés correctement, padding minimal.
- **Fichiers** : `vubez2.html`, `daxi-haiti-explorer-map.js`

### Itinéraire non tracé entre les 2 points
- **Correction** : DirectionsRenderer / OSRM fallback renforcé après zoom.

### Préchargement itinéraires au boot
- Pendant l’animation de chargement : warmup OSRM + images + bandeau itinéraires.
- `DaxiRoutesMap.warmup()` — le loader ne disparaît qu’après carte **et** itinéraires prêts.
- **Fichiers** : `daxi-frequent-routes-map.js`, `vubez2.html`

### Itinéraires fréquents — bouton « Commander un taxi » retiré
- Supprimé de la section itinéraires fréquents (hors contexte).

### Fond blanc au-dessus de la carte (zone menu)
- Bande blanche en haut de la carte supprimée.

### Contrat / modal — fond flou uniforme
- Arrière-plan du modal contrat : tout flouté uniformément (plus de textes/carte clairs visibles derrière).

---

## 5. Client — Traductions & i18n

### Moteur i18n site-wide
- `static/js/daxi-auto-i18n.js` : `data-translate`, cache phrases, traduction batch API.
- **Fichiers** : `julmin_taxis/service_plans_i18n.py`, traductions locales `_localTranslations` dans `vubez2.html`

### HTG → $ partout en frontend
- Le HTG reste en **backend** pour les paiements ; tout l’affichage client est en **$**.
- **Fichiers** : templates, `julmin_taxis/currency_utils.py`, `vubez2.html`

### Guide commande traduit
- Le contenu du modal `?` est maintenant traduit dans toutes les langues.

### Plans non traduits (ex. « Course Ville à Ville » en créole)
- Ajout des clés manquantes pour tous les plans et descriptions.

---

## 6. Client — Compte, inscription & connexion

### Refonte inscription (multi-étapes)
- Suppression des champs ID/mot de passe de l’inscription (inscription pure)
- Design premium : étapes animées 1/3, 2/3, 3/3
- Couleurs alignées sur le site
- **Fichiers** : `vubez2.html` (`#daxiSignupModal`)

### Refonte connexion (même style)
- La partie connexion a reçu le même traitement visuel que l’inscription.

### Préchargement compte
- Données compte chargées au boot — zéro latence à l’ouverture.

---

## 7. Client — Thème clair / sombre

### Double thème (sombre = actuel, clair = nouveau)
- Thème sombre conservé par défaut ; thème clair ajouté sur **toutes** les pages (client, chauffeur, admin, entreprise).
- **Fichiers** : `static/js/daxi-theme.js`, `static/css/daxi-theme.css`, `daxi-theme-light.css`, `daxi-theme-light-extended.css`, `daxi-theme-light-pages.css`, `daxi-theme-subpages.css`

### Bouton thème dans la navbar
- Toggle thème ajouté dans la barre de navigation de chaque page.
- Visible aussi sur **mobile** (correction : manquait sur téléphone).

### Passes multiples de correction couleurs mode clair
- ~70% des éléments restaient noirs ou mal contrastés — audit élément par élément.
- Pages corrigées : client, chauffeur, admin, entreprise, sous-pages.
- **Fichiers** : tous les `daxi-theme-*.css`, `admin-pro.css`, `daxi-theme-admin-sections.css`, `entreprise-dashboard.css`

### Carte Google Maps thème clair/sombre
- Synchronisation via `ColorScheme.LIGHT` / `DARK` (pas besoin de nouveau Map ID Google — géré côté code).
- **Fichiers** : `static/js/daxi-map-theme.js`, `static/css/daxi-map-theme.css`

### Transition carte fluide au changement de thème
- **Problème** : double rechargement saccadé.
- **Correction** : crossfade `DaxiMapTheme.crossfade()` — transition fluide, état carte préservé (commandes en cours non perdues).
- Appliqué client + chauffeur + admin.
- **Fichiers** : `daxi-map-theme.js`, `driver_home.html`, `admin-maps.js`

### Néons verts sous boutons (mode clair)
- Glow vert désactivé/atténué en mode clair.

### Suggestions lieux (autocomplete) — thème
- Dropdown suggestions adapté au thème actif.

### WhatsApp — couleurs préservées
- Le bouton WhatsApp n’a **pas** été recoloré (demande explicite utilisateur).

### Menu & fond WhatsApp au changement de thème
- Correction : menu sidebar et fond bouton WhatsApp suivent le thème.

### Modal commander un taxi après switch thème
- **Problème** : plusieurs clics nécessaires, bouton ne change pas de couleur.
- **Correction** : re-application styles au `daxi-theme-change`.

---

## 8. Client — Performance & images

### Lenteur générale du site
- Réduction scripts bloquants, lazy loading, cache traductions, warmup parallèle.

### Images optimisées pour le web
- Compression / `loading="lazy"` / `decoding="async"` sur images non-logo.
- **Exception logos DAXI** : compression annulée — logos PNG originaux conservés pour la transparence.

### Préchargement images itinéraires
- `preloadImages()` dans `daxi-frequent-routes-map.js`.

---

## 9. Client — Entreprise

### Lien sidebar vers son entreprise
- Si l’utilisateur a une entreprise : bouton dans le sidebar menant directement au dashboard entreprise.
- **Fichiers** : `vubez2.html` (`#sidebarEnterpriseBtn`), `templates/htmx/client_account.html`

### Découverte inscription entreprise
- Ajout d’un encart / lien promotionnel pour informer qu’on peut enregistrer son entreprise.
- **Fichiers** : `vubez2.html` (`#sidebarEnterprisePromo`)

---

## 10. Client — Notifications & paiement

### Modal notifications style DAXI
- Refonte visuelle (fond verre sombre, bordure dorée).

### Vraies notifications navigateur
- `Notification.requestPermission()` + FCM + service worker + notification test.

### Contrat — style + bouton désactivé
- Style du contrat corrigé.
- Bouton final **non cliquable** tant que la case contrat n’est pas cochée.

### Lien paiement client + QR
- **Problème** : lien et QR jamais générés dans le modal « Finaliser ».
- **Correction** : génération effective du lien de paiement et affichage QR.

### Annulation commande (avant acceptation chauffeur)
- Bouton annuler tant qu’aucun chauffeur n’a accepté.

### Bouton retour dans le flux paiement
- Retour à l’étape précédente dans le processus de paiement.

### Affichage prix ($ avant le montant)
- Format `$3.00` au lieu de `3.00$` dans la proposition de prix.

---

## 11. Cartes commande (tous rôles)

### Système de cartes unifié
- Extraction CSS partagé : `static/css/daxi-order-cards.css` (classes `.daxi-oc-*`).
- Cartes sur mesure par type : standard, plan, entreprise, aller-retour, programmée, etc.
- **Templates** : `templates/htmx/plan_cards/` (client `cli/`, chauffeur `drv/`, admin `adm/`, entreprise `ent/`)

### Voir plus / Voir moins
- Bouton déplacé **en bas** de chaque carte.
- **Fichiers** : `static/js/daxi-order-expand.js`, tous les shells de cartes

### Chips economy / Standard retirés (client & admin)
- Suppression des badges « economy », « Standard » sur cartes client et admin.
- **Fichiers** : `templates/htmx/plan_cards/adm/_shell.html`, `adm/_one_way.html`, `_client_order_compact.html`

### Infos chauffeur / client / les deux selon le rôle
- **Client/entreprise** : photo voiture + infos chauffeur dès acceptation.
- **Chauffeur** : infos client.
- **Admin** : les deux.
- **Fichiers** : tous les templates `plan_cards/` et `_admin_order_details.html`

### Pipeline statuts (bug affichage)
- **Problème** : tous les statuts affichés en même temps (« Demande Devis Confirmé Assigné… »).
- **Correction** : pipeline n’affiche que le statut actif + précédents complétés.
- **Fichiers** : `templates/htmx/_order_status_pipeline.html`

### Tous les types de commande — toutes les étapes
- Audit complet : chaque type (plan précis, entreprise, standard, etc.) a sa carte à chaque étape du cycle de vie, sur client, chauffeur, admin, entreprise.

---

## 12. Chat WhatsApp-like

### Menu ⋮ (action sheet)
- Répondre, modifier, supprimer via menu contextuel.
- Long-press sur mobile.
- **Fichiers** : `static/js/daxi-chat-ui.js`, `static/css/daxi-chat.css`

### Images dans le chat
- Bouton image (caméra/galerie), upload Cloudinary/local.
- **Fichiers** : `static/js/daxi-chat-media.js`, `julmin_taxis/media_utils.py`

### Messages vocaux
- Enregistrement avec waveform + timer.
- **Fichiers** : `static/js/daxi-chat-media.js`, `static/js/daxi-chat-composer.js`

### Composer partagé
- Shell chat unifié avec boutons image + voix.
- **Fichiers** : `templates/htmx/_chat_composer.html`, `chat_messages.html`

### Intégration toutes pages
- Client, chauffeur (`driver_home.html`), admin, entreprise.
- Classes `daxi-chat-img-btn` / `daxi-chat-voice-btn` sur chauffeur.
- `DaxiChatUI.initMessagesRoot` au chargement messages.

### Migrations chat
- `image_url`, `message_type`, `reply_to`, `audio_url` sur `OrderMessage`.

---

## 13. Chauffeur

### Carte taille incorrecte au chargement
- **Problème** : carte étroite au premier affichage.
- **Correction** : `_resizeDriverMap()` appelé au hide splash (0/200/600 ms) + listener `resize`.
- **Fichiers** : `driver_home.html`

### Logo en haut à droite retiré
- Suppression du logo superflu sur la page chauffeur.

### Thème sur sous-pages chauffeur
- Thème clair/sombre appliqué aussi aux sous-pages (pas seulement l’accueil).

### Point chauffeur = bleu
- Représentation GPS chauffeur en point bleu (comme client).

### Transition carte au changement de thème
- Crossfade identique au client.

---

## 14. Admin — Erreurs & performance

### Erreur 500 sur commandes / stats / badges
- **Cause racine** : `_order_to_dict()` appelait **OSRM** pour chaque commande (~80 s pour 50 commandes), provoquant timeout et crash serveur en cascade (`ERR_CONNECTION_REFUSED`).
- **Correction** : paramètre `light=True` avec durée haversine (`_light_trip_duration_min`) — **0,4 s** vs 80+ s.
- **Fichiers** : `julmin_taxis/htmx_views.py` (`admin_orders` utilise `light=True`)

### Préchargement commandes au login
- `prefetchAdminOrders('all')` lancé en parallèle avec stats/badges dès la connexion admin.
- Cache `_adminOrdersCache` pour affichage instantané à l’ouverture de la section Commandes.
- **Fichiers** : `templates/admin_dashboard.html`

### Overlay boot admin
- `#admin-boot-overlay` : animation de chargement jusqu’à ce que **toutes** les données soient prêtes (stats, badges, commandes).
- Les commandes sont disponibles dès la fin de l’animation, pas au clic sur « Commandes ».
- **Fichiers** : `templates/admin_dashboard.html`, `static/css/admin-pro.css`

### Firebase 400 (installations)
- **Problème** : `POST firebaseinstallations.googleapis.com/.../installations 400`
- **Correction** : validation config Firebase dans `daxi-push-register.js` ; pas de demande auto permission sur admin si config invalide.
- **Fichiers** : `static/js/daxi-push-register.js`, `admin_panel/views.py` (injection config)

### Session admin badge guard
- `getattr(request, 'session', None)` ajouté pour éviter crash si pas de session.
- **Fichiers** : `admin_panel/views.py`

---

## 15. Admin — UI & thème

### KPI bar + navigation segmentée
- Nouvelle barre KPI (`.adm-kpi-bar`) et onglets segmentés (`.adm-seg-nav`) pour stats/filtres.
- **Fichiers** : `static/css/admin-pro.css`, `templates/htmx/admin_enterprises.html`, `admin_withdrawals.html`

### Tableaux → cartes mobile
- Sur mobile : commandes et utilisateurs en cartes (`.admin-mobile-cards`, `.admin-mcard`) au lieu de tableaux.
- **Fichiers** : `admin_dashboard.html`, `admin-pro.css`

### Redesign entreprises
- Page entreprises admin modernisée.

### Thème clair admin — sections restantes
- Corrections entreprises, retraits, SOS, blog, carte live en mode clair.
- **Fichiers** : `daxi-theme-admin-sections.css`, `admin-pro.css`

### Logos dans les titres de page
- Ajout du logo DAXI dans le titre de **toutes** les pages (cohérence).

### Icônes pipeline mode clair
- Couleurs pipeline lisibles en thème clair.

---

## 16. Admin — Carte live

### Simplification radicale (dernière session)
- **Affichage** : uniquement courses `on_way`, `arrived`, `in_progress` (pas avant départ chauffeur).
- **Clic sur puce** : détail **sur la carte** (pas de modal InfoWindow) :
  - Départ (pin vert A)
  - Arrivée (pin rouge B)
  - Position chauffeur (cercle couleur statut)
  - Client GPS si actif (cercle cyan)
  - Trajet pointillé pickup→dest + segment actif selon statut
- **Clic carte vide** : désélectionne.
- **Plans** : étapes intermédiaires numérotées + itinéraire complet via `plan_stops`.
- **Plein écran** : carte occupe tout l’espace sous le header (comme page client).
- **Supprimé** : texte d’aide, bouton Actualiser, stats (14 courses actives…), liste puces (#45, #44…), légende bas de carte, chauffeurs GPS libres.

### Backend live map
- `AdminLiveMapView` : filtre `active_statuses = ['on_way', 'arrived', 'in_progress']`
- Ajout payload : `service_plan`, `is_plan_order`, `trip_type`, `meeting_lat/lng`, `plan_stops`
- Chauffeurs hors course : `Driver.objects.none()` (non affichés)
- **Fichiers** : `admin_panel/views.py`, `admin_panel/urls.py`

### Frontend live map
- Réécriture `static/js/admin-maps.js` :
  - `liveOrdersOnly()`, `drawFocusedOrder()`, `focusLiveMapOrder()`
  - `pinIcon()` / `circleIcon()` / `addLine()`
  - `disableDefaultUI: true`, zoom control seul
  - Polling 10 s + refresh WebSocket temps réel
  - `resizeLiveMap()` exposé via `AdminMaps`
  - Thème carte synchronisé (`reinitLiveMapForTheme`)
- **Fichiers** : `static/js/admin-maps.js`, `static/css/admin-maps.css`, `templates/admin_dashboard.html`

### Section HTML simplifiée
```html
<section id="admin-section-live-map" class="hidden admin-live-map-section">
  <div id="admin-live-map-wrap" class="admin-live-map-fullscreen">
    <div id="admin-live-map"></div>
  </div>
</section>
```

### CSS plein écran
- `.admin-live-map-section` : flex 1, padding 0
- `#admin-live-map` : `min-height: calc(100dvh - 73px)`
- Classe `admin-live-map-active` sur `<main>` au switch section

---

## 17. Admin — Cartes entreprise (emplacement)

### Carte au lieu de lat/lng manuels
- Configuration emplacement entreprise via **carte interactive** (pin central, déplacement carte).
- Thème carte synchronisé avec le site.
- **Fichiers** : `static/js/admin-maps.js` (`initEntLocationMaps`), `templates/htmx/admin_enterprises.html`, `static/css/admin-maps.css`

---

## 18. Thème global (toutes pages)

| Zone | Fichiers principaux |
|------|---------------------|
| Toggle thème | `static/js/daxi-theme.js` |
| Variables CSS | `static/css/daxi-theme.css` |
| Mode clair base | `daxi-theme-light.css` |
| Mode clair étendu | `daxi-theme-light-extended.css` |
| Sous-pages clair | `daxi-theme-light-pages.css` |
| Admin sections | `daxi-theme-admin-sections.css` |
| Sous-pages général | `daxi-theme-subpages.css` |
| Carte | `daxi-map-theme.css` + `daxi-map-theme.js` |
| Entreprise | `entreprise-dashboard.css` |

Événement global : `daxi-theme-change` — écouté par cartes, admin, chauffeur.

---

## 19. Backend & données

### `_order_to_dict(light=True)`
- Mode léger sans OSRM pour listes admin/chauffeur.
- Haversine pour durée estimée.

### `_parse_plan_stops(o)`
- Extraction étapes forfait depuis notes (`PLAN_STOPS_JSON_TAG`).
- Utilisé dans live map admin et cartes client.

### `live_map_utils.py`
- `should_show_client_on_map()`, `client_map_coords()`, `client_tracking_status()`, `driver_tracking_status()`.

### Chat backend
- Endpoints send/edit/delete avec support `image_url` / `audio_url`.
- Upload via `media_utils.py`.

### Migrations ajoutées (session)
- `0012` : chat enhancements (image, reply)
- `0015` : audio_url
- `0016` : meeting point
- `0018` : meeting_prompt_acknowledged
- `0019` : meeting_relocate_dismissed

---

## 20. APK Android

### Rebuild APK
- Rebuild effectué pour intégrer les changements `webcache/index.html` (miroir de `vubez2.html`).
- **Chemin** : `clients/daxi-android/`

### Webcache synchronisé
- `clients/daxi-android/app/src/main/assets/webcache/index.html` = copie des changements client web.

---

## 21. Fichiers clés modifiés (index)

### Templates
| Fichier | Modifications |
|---------|---------------|
| `templates/admin_dashboard.html` | Boot overlay, prefetch, live map, mobile cards, WebSocket, thème |
| `templates/htmx/admin_enterprises.html` | KPI bar, carte emplacement |
| `templates/htmx/admin_withdrawals.html` | KPI bar, seg nav |
| `templates/htmx/admin_orders.html` | Grille cartes commandes |
| `templates/htmx/_admin_order_details.html` | Détails expandables, chat light |
| `templates/htmx/guest_phone_prompt.html` | Modal téléphone invité |
| `templates/htmx/_client_order_map.html` | Carte suivi + fullscreen |
| `templates/htmx/_client_order_compact.html` | Carte compacte client |
| `templates/htmx/_order_status_pipeline.html` | Pipeline statuts corrigé |
| `templates/htmx/_chat_composer.html` | Shell chat image/voix |
| `templates/htmx/chat_messages.html` | Rendu messages image/audio |
| `templates/htmx/plan_cards/**` | Cartes sur mesure tous rôles/étapes |
| `templates/htmx/client_price_proposal.html` | Format prix $ |
| `templates/htmx/client_account.html` | Lien entreprise, préchargement |
| `driver_home.html` | Resize carte, chat, thème, point bleu |
| `entreprise_dashboard.html` | Chat, thème |
| `vubez2.html` | **Fichier principal client** (monolithique, ~23k lignes) |

### JavaScript
| Fichier | Modifications |
|---------|---------------|
| `static/js/admin-maps.js` | Carte live + entreprise admin |
| `static/js/daxi-order-expand.js` | Voir plus/moins |
| `static/js/daxi-push-register.js` | Firebase validation |
| `static/js/daxi-theme.js` | Toggle dark/light |
| `static/js/daxi-map-theme.js` | Carte thème + crossfade |
| `static/js/daxi-auto-i18n.js` | Traductions auto |
| `static/js/daxi-chat-ui.js` | Menu WhatsApp |
| `static/js/daxi-chat-media.js` | Images + voix |
| `static/js/daxi-chat-composer.js` | Composer unifié |
| `static/js/daxi-plan-wizard.js` | Wizard forfaits |
| `static/js/daxi-realtime.js` | WebSocket relocate_prompt |
| `daxi-frequent-routes-map.js` | Préchargement itinéraires |
| `daxi-haiti-explorer-map.js` | Carte principale client |

### CSS
| Fichier | Modifications |
|---------|---------------|
| `static/css/admin-pro.css` | Boot, KPI, mobile cards, thème |
| `static/css/admin-maps.css` | Live map fullscreen |
| `static/css/admin_dashboard.css` | Styles admin legacy |
| `static/css/daxi-order-cards.css` | Système cartes unifié |
| `static/css/daxi-chat.css` | Chat WhatsApp |
| `static/css/daxi-plan-wizard.css` | Wizard forfaits |
| `static/css/daxi-map-theme.css` | Thème carte |
| `static/css/daxi-theme*.css` | Thèmes clair/sombre |
| `static/css/daxi-theme-admin-sections.css` | Admin sections thème |
| `static/css/entreprise-dashboard.css` | Dashboard entreprise |

### Python
| Fichier | Modifications |
|---------|---------------|
| `julmin_taxis/htmx_views.py` | `light=True`, plans, chat, commandes |
| `julmin_taxis/htmx_views_tracking.py` | GPS, relocate_prompt |
| `julmin_taxis/meeting_point_utils.py` | Seuils relocalisation |
| `julmin_taxis/live_map_utils.py` | Visibilité client/chauffeur carte |
| `julmin_taxis/media_utils.py` | Upload chat |
| `julmin_taxis/service_plans_i18n.py` | Traductions plans |
| `admin_panel/views.py` | Live map, stats, badges, Firebase config |
| `admin_panel/urls.py` | Route live-map |
| `orders/models.py` | meeting_lat/lng, champs chat |

---

## Chronologie des demandes utilisateur

| Date | Demande |
|------|---------|
| 20/07 | APK, flux GPS/téléphone, modal relocalisation, rebuild APK, sheet Ma course |
| 20/07 | HTG→$, fond contrat flou |
| 21/07 | Bouton ? guide commande, design sheet tabs, préchargement itinéraires |
| 21/07 | Bouton ×, notifications, traductions plans, GPS animé, suppression « autre départ » |
| 21/07 | Carte fullscreen, pills commandes, scrollbars, inscription redesign |
| 21/07 | Performance, images, logos PNG, menu sous modal, lien entreprise |
| 23/07 | Contrat, paiement QR, annulation, thème clair/sombre global |
| 23/07 | Corrections thème (multiples passes), carte thème, crossfade |
| 23/07 | Cartes commande tous types/étapes, admin maps, photos chauffeur |
| 23/07 | Erreurs 500 admin, Firebase 400, boot overlay, KPI bar |
| 23/07 | Chat WhatsApp, carte chauffeur resize, chips economy retirés |
| 23/07 | **Carte live admin** : plein écran, filtre en route, détail sur carte |

---

## Versions cache (dernières)

| Asset | Version |
|-------|---------|
| `admin-maps.css` | `?v=20260743` |
| `admin-maps.js` | `?v=20260743` |
| `admin-pro.css` | `?v=20260742` |
| `daxi-order-cards.css` | `?v=20260736` |
| `daxi-map-theme.css` | `?v=20260735` |

---

*Fin du document — généré le 23 juillet 2026.*
