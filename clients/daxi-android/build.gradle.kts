plugins {
    id("com.android.application") version "8.13.2" apply false
    id("org.jetbrains.kotlin.android") version "2.2.0" apply false
    id("com.google.devtools.ksp") version "2.2.0-2.0.2" apply false
    id("com.google.gms.google-services") version "4.5.0" apply false
}


val daxiBuildRoot = java.io.File(
    System.getenv("LOCALAPPDATA") ?: System.getProperty("user.home"),
    "daxi-android-build"
)
subprojects {
    layout.buildDirectory.set(daxiBuildRoot.resolve(project.name))
}
