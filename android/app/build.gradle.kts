import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.bountiful.terminal"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.bountiful.terminal"
        minSdk = 26          // AES-GCM Keystore without user auth requires 23+; 26 gives modern APIs
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
    }

    signingConfigs {
        create("release") {
            val props = Properties()
            val f = rootProject.file("keystore.properties")
            if (f.exists()) {
                f.inputStream().use { props.load(it) }
            }
            // Wired only when the keystore is present, so a fork without the
            // signing secrets still builds (debug-signed) instead of failing.
            if (props.containsKey("storeFile")) {
                storeFile = rootProject.file(props.getProperty("storeFile"))
                storePassword = props.getProperty("storePassword")
                keyAlias = props.getProperty("keyAlias")
                keyPassword = props.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (rootProject.file("keystore.properties").exists()) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    // The built React app is copied into assets/public by the Gradle task below.
    sourceSets {
        getByName("main") {
            assets.srcDirs("src/main/assets", "../../dist")
        }
    }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
}

/**
 * Copies dist/ into the packaged assets so the WebView can load it offline.
 * Fails loudly if dist/ is absent — a silently empty bundle would ship an app
 * that opens to a blank screen.
 */
val syncWebBundle by tasks.registering(Copy::class) {
    from(rootProject.file("../dist"))
    into(layout.projectDirectory.dir("src/main/assets/public"))
    doFirst {
        val index = File(rootProject.file("../dist").resolve(), "index.html")
        if (!index.exists()) {
            throw GradleException(
                "dist/index.html not found. Run `npm run build` before assembling the APK.",
            )
        }
    }
}

tasks.named("preBuild") { dependsOn(syncWebBundle) }