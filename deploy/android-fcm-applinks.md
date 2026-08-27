# Android FCM + App Links — checklist DAXI Capacitor

## 3. FCM Android (vérifié)

| Élément | Statut | Détail |
|---|---|---|
| Firebase project | OK | `julmin-taxis` / `392925120550` |
| google-services.json | OK | `clients/daxi-capacitor/android/app/` — package `com.daxipro.daxi` |
| Plugin Gradle | OK | `com.google.gms.google-services` appliqué si JSON présent |
| Capacitor Push | OK | `@capacitor/push-notifications` + `capacitor-src/main.js` |
| Endpoint serveur | OK | `POST /api/notifications/register-device/` (AllowAny, token FCM) |
| FCM HTTP v1 | OK | `notifications/fcm_service.py` + service account |
| Test local | OK | `python manage.py test_push` |

### Railway (variables à avoir)
```
FCM_PROJECT_ID=julmin-taxis
FCM_SERVICE_ACCOUNT_JSON={"type":"service_account",...}   # une ligne
```

### Firebase Console
- Cloud Messaging API activée (projet julmin-taxis)
- App Android `com.daxipro.daxi` enregistrée

---

## 4. App Links (corrigé)

URL : https://daxipro.com/.well-known/assetlinks.json

| Exigence | Statut |
|---|---|
| HTTP 200 | OK |
| Content-Type: application/json | OK (`WellKnownAssociationMiddleware` + `nosniff`) |
| package_name | `com.daxipro.daxi` |
| SHA-256 debug | `23:9A:2B:…:0F:A7` |
| SHA-256 release | `5B:9E:ED:…:F2:47` (daxi-release.keystore) |

Après publication Play avec **Play App Signing**, ajoute aussi l’empreinte **App signing key** :
```
ANDROID_APP_SHA256_PLAY=<empreinte Play Console>
```
(ou `ANDROID_APP_SHA256_FINGERPRINTS` pour plusieurs valeurs séparées par des virgules)

### Vérifier
```powershell
(Invoke-WebRequest https://daxipro.com/.well-known/assetlinks.json -UseBasicParsing).Headers['Content-Type']
powershell -File scripts/print-android-sha256.ps1
```

### Android Studio — tester App Links
```bash
adb shell pm verify-app-links --re-verify com.daxipro.daxi
adb shell pm get-app-links com.daxipro.daxi
```

---

## 5. Android — build (quand tu es prêt, pas maintenant)

```bash
cd clients/daxi-capacitor
npm run sync
npx cap open android
```

Signature release : partagée via `clients/daxi-android/keystore.properties` (même keystore que l’app Kotlin).

Android Studio → **Build > Generate Signed Bundle / APK** → **Android App Bundle (.aab)**.

---

## 6. iOS

Build final **obligatoirement sur Mac** avec Xcode :
```bash
cd clients/daxi-capacitor
npm run sync
npx cap open ios   # Mac uniquement
pod install        # dans ios/App si besoin
```

- Universal Links : `IOS_APP_TEAM_ID` sur Railway + APNs `.p8` dans Firebase
- `App.entitlements` : `applinks:daxipro.com`

Sans compte Apple Developer (~99 USD/an), pas de push ni TestFlight iOS.
