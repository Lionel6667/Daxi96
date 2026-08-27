# Démarrer Daxi dans Android Studio (guide débutant)

## Erreur fréquente : mauvais dossier ouvert

Le projet Android se trouve dans le dossier Django consolidé :

```
julmin_taxis_django\clients\daxi-android
```

Dans Android Studio : **File → Open** → sélectionnez `clients/daxi-android` → **OK**.

---

## Première ouverture (15–20 min la 1ère fois)

1. Android Studio télécharge Gradle et les SDK (barre de progression en bas).
2. Si une bannière propose **Sync Now**, cliquez dessus.
3. Attendez **BUILD SUCCESSFUL** ou l'absence d'erreur rouge dans l'onglet **Build**.

### Si Gradle sync échoue

- **File → Settings → Build, Execution, Deployment → Build Tools → Gradle**
- **Gradle JDK** : choisir **jbr-21** (celui fourni avec Android Studio)
- **File → Invalidate Caches → Invalidate and Restart**

---

## Lancer l'app sur un téléphone virtuel (émulateur)

1. **Tools → Device Manager**
2. **Create Device** → ex. **Pixel 7** → **Next**
3. Choisir une image système (ex. **API 35**) → **Download** si besoin → **Next** → **Finish**
4. Cliquez sur le bouton vert **Run** (▶) en haut, ou **Shift+F10**
5. Sélectionnez votre émulateur dans la liste

L'app **Daxi** s'ouvre et charge https://daxipro.com (ou le cache hors ligne).

---

## Lancer sur un vrai téléphone Android

1. Sur le téléphone : **Paramètres → À propos** → appuyez 7× sur **Numéro de build** (mode développeur)
2. **Options développeur → Débogage USB** : activé
3. Branchez le téléphone en USB, acceptez « Autoriser le débogage »
4. Dans Android Studio, choisissez votre appareil dans la liste et cliquez **Run**

---

## Générer l'APK (fichier installable)

**Méthode Android Studio :** **Build → Build Bundle(s) / APK(s) → Build APK(s)**

**Méthode terminal** (dans le dossier `daxi-android`) :

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
.\gradlew.bat assembleDebug
```

APK créé ici :

```
daxi-android\app\build\outputs\apk\debug\app-debug.apk
```

Copiez ce fichier sur un téléphone et ouvrez-le pour installer (autoriser « sources inconnues » si demandé).

---

## Projet sur OneDrive

Si la compilation échoue avec *Unable to delete directory* :

- Fermez Android Studio
- Supprimez le dossier `daxi-android\app\build` manuellement
- Relancez la compilation

**Recommandation :** déplacez le projet hors OneDrive (ex. `C:\Dev\Julmin-Taxis`) pour éviter les blocages de fichiers.

---

## Structure du projet

| Dossier / fichier | Rôle |
|-------------------|------|
| `app/src/main/java/...` | Code Kotlin (GPS, notifications, WebView) |
| `app/src/main/assets/webcache/` | Interface hors ligne embarquée |
| `app/google-services.json` | Firebase (notifications push) |
| `vubez2.html` (dossier parent) | Site web — pas utilisé directement par Android Studio |

---

## Tester contre un serveur local (Django)

Dans `app/build.gradle.kts`, décommentez dans le bloc `debug` :

```kotlin
buildConfigField("String", "DAXI_BASE_URL", "\"http://10.0.2.2:8000\"")
```

`10.0.2.2` = votre PC vu depuis l'émulateur Android.

---

## Besoin d'aide ?

Indiquez le message d'erreur exact de l'onglet **Build** ou **Gradle Sync** dans Android Studio.
