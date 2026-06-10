# Layer 1 + 12 — aggressive R8 full mode
-optimizationpasses 5
-dontusemixedcaseclassnames
-repackageclasses 'o'
-allowaccessmodification
-overloadaggressively
-flattenpackagehierarchy 'o'

# WebView bridge only
-keep class com.rebel.panel.MainActivity { *; }
-keep class com.rebel.panel.MainActivity$RebelBridge { *; }
-keep class com.rebel.panel.LoginActivity { *; }
-keep class com.rebel.panel.LoginActivity$LoginBridge { *; }
-keepclassmembers class * { @android.webkit.JavascriptInterface <methods>; }

# JNI
-keepclasseswithmembernames class com.rebel.panel.security.NativeGuard {
    native <methods>;
}
-keepclassmembers class com.rebel.panel.security.SecureAssetVault { *; }

# BuildConfig fields for runtime
-keepclassmembers class com.rebel.panel.BuildConfig { public static <fields>; }

# OkHttp / SQLCipher / RootBeer
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }
-dontwarn net.sqlcipher.**
-keep class net.sqlcipher.** { *; }
-dontwarn com.scottyab.rootbeer.**

# Jetpack Security
-keep class androidx.security.crypto.** { *; }

# Obfuscate ALL security package (no -keep)
# Layer 14 VM + Layer 13 RASP names hidden

# Layer 9 — strip logs
-assumenosideeffects class com.rebel.panel.security.SecureLog {
    public static *** d(...);
    public static *** e(...);
}
-assumenosideeffects class android.util.Log {
    public static *** d(...);
    public static *** v(...);
    public static *** i(...);
    public static *** w(...);
    public static *** e(...);
}

# Junk retention confusion
-keepclassmembers class * { void junk*(...); }
