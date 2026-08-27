# DAXI — Application Android native (Kotlin)

Application **Kotlin** avec shell natif (permissions, GPS Fused Location, notifications FCM, mode hors ligne) qui charge votre site DAXI.

Ce n'est pas un simple APK WebView : l'app gère nativement :
- **GPS haute précision** (`FusedLocationProvider`) injecté dans le site via `DaxiAndroid`
- **Permissions** localisation + notifications (Android 13+)
- **Détection online/offline** avec bannière et écran hors ligne
- **Notifications push** Firebase Cloud Messaging
- **Pull-to-refresh**, barre de progression, cookies de session

## Ouvrir dans Android Studio

> **Important :** ouvrez le dossier **`clients/daxi-android`** depuis la racine du projet Django (`julmin_taxis_django/`).

1. **File → Open** → sélectionnez `julmin_taxis_django/clients/daxi-android` → **OK**
2. Attendez la fin de **Gradle Sync** (10–20 min la première fois)
3. **Gradle JDK** : Settings → Build Tools → Gradle → **jbr-21** (JDK fourni par Android Studio)
4. `app/google-services.json` est déjà configuré pour `com.daxipro.daxi` (Firebase Julmin Taxis)

Guide pas à pas pour débutants : **[DEMARRAGE_ANDROID_STUDIO.md](DEMARRAGE_ANDROID_STUDIO.md)**

### Fichiers ajoutés pour que le projet compile

- `gradlew.bat` + `gradle/wrapper/gradle-wrapper.jar` (Gradle Wrapper)
- `local.properties` (chemin SDK — régénéré automatiquement par Android Studio si absent)

## URL du serveur

Par défaut l'app charge **https://daxipro.com** (debug et release).

Pour tester contre Django local sur **émulateur**, décommentez dans `app/build.gradle.kts` (bloc `debug`) :
```kotlin
buildConfigField("String", "DAXI_BASE_URL", "\"http://10.0.2.2:8000\"")
```

## Mode hors ligne

L'APK embarque un **cache UI Daxi** (`assets/webcache/`) : page d'accueil, JS, logo, bootstrap — disponible **dès l'installation**, sans Internet.

- Au lancement : splash **Daxi** (logo + indicateur, pas barre Chrome)
- **Sans réseau** : interface cache locale immédiate (courses, forfaits, carte)
- **Avec réseau** : site live `daxipro.com` + mise à jour du cache disque en arrière-plan

### Rafraîchir le cache embarqué avant une release

```powershell
cd daxi-android\scripts
.\bundle-webcache.ps1
```

Télécharge la dernière version du site depuis `daxipro.com` dans `assets/webcache/`.

## Build APK

```bash
cd daxi-android
./gradlew assembleDebug
```

APK : `app/build/outputs/apk/debug/app-debug.apk`

Release signé : **Build → Generate Signed Bundle/APK** dans Android Studio.

## Play Store

- Icône adaptive à personnaliser (`res/drawable/`)
- Politique de confidentialité (localisation + notifications)
- Remplacer le `google-services.json` placeholder par le vrai projet Firebase

## Lien avec le site

Le site détecte `DaxiAndroid.getCurrentLocation()` pour le GPS natif (voir `vubez2.html`).
