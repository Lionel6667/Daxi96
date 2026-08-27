plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.devtools.ksp")
    id("com.google.gms.google-services")
}

import java.util.Properties
import java.io.File
import org.gradle.api.GradleException

fun resolveDaxiBaseUrl(): String {
    val ngrokFile = rootProject.file("scripts/ngrok-url.txt")
    if (ngrokFile.exists()) {
        val url = ngrokFile.readText().trim()
        if (url.startsWith("http")) return url.trimEnd('/')
    }
    return "https://daxipro.com"
}

val daxiBaseUrl = resolveDaxiBaseUrl()

val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties().apply {
    if (keystorePropertiesFile.exists()) {
        load(keystorePropertiesFile.inputStream())
    }
}

fun signingProp(envName: String, propName: String): String? {
    val fromEnv = System.getenv(envName)?.trim().orEmpty()
    if (fromEnv.isNotEmpty()) return fromEnv
    return keystoreProperties.getProperty(propName)?.trim()?.takeIf { it.isNotEmpty() }
}

val releaseStoreFilePath = signingProp("DAXI_STORE_FILE", "storeFile")
val releaseKeyAlias = signingProp("DAXI_KEY_ALIAS", "keyAlias")
val releaseStorePassword = signingProp("DAXI_STORE_PASSWORD", "storePassword")
val releaseKeyPassword = signingProp("DAXI_KEY_PASSWORD", "keyPassword")
val releaseStoreFile = releaseStoreFilePath?.let { path ->
    val f = File(path)
    if (f.isAbsolute) f else rootProject.file(path)
}
val hasReleaseSigning = releaseStoreFile != null &&
    releaseStoreFile.exists() &&
    !releaseKeyAlias.isNullOrBlank() &&
    !releaseStorePassword.isNullOrBlank() &&
    !releaseKeyPassword.isNullOrBlank()

if (keystorePropertiesFile.exists() && !hasReleaseSigning) {
    logger.warn(
        "keystore.properties présent mais signature incomplete " +
            "(storeExists=${releaseStoreFile?.exists()} path=${releaseStoreFilePath})",
    )
}
android {
    namespace = "com.daxipro.daxi"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.daxipro.daxi"
        minSdk = 26
        targetSdk = 36
        versionCode = 29
        versionName = "1.6.0"
        buildConfigField("String", "DAXI_BASE_URL", "\"$daxiBaseUrl\"")
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
                storeFile = releaseStoreFile
                storePassword = releaseStorePassword
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            if (!hasReleaseSigning) {
                throw GradleException(
                    "Signature release manquante. Créez clients/daxi-android/keystore.properties " +
                        "(voir keystore.properties.example) ou définissez DAXI_STORE_FILE / " +
                        "DAXI_KEY_ALIAS / DAXI_STORE_PASSWORD / DAXI_KEY_PASSWORD.",
                )
            }
            signingConfig = signingConfigs.getByName("release")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        debug {
            isMinifyEnabled = false
            // Décommentez pour tester contre Django local sur émulateur :
            // buildConfigField("String", "DAXI_BASE_URL", "\"http://10.0.2.2:8000\"")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        buildConfig = true
        viewBinding = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.constraintlayout:constraintlayout:2.2.0")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("com.google.android.gms:play-services-location:21.3.0")
    implementation(platform("com.google.firebase:firebase-bom:34.15.0"))
    implementation("com.google.firebase:firebase-analytics")
    implementation("com.google.firebase:firebase-messaging")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.9.0")
    implementation("androidx.work:work-runtime-ktx:2.10.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("androidx.room:room-runtime:2.7.1")
    implementation("androidx.room:room-ktx:2.7.1")
    ksp("androidx.room:room-compiler:2.7.1")
    implementation("org.nanohttpd:nanohttpd:2.3.1")
}
