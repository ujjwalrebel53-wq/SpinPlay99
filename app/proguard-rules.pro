-optimizationpasses 5
-dontusemixedcaseclassnames
-repackageclasses 'o'
-allowaccessmodification
-overloadaggressively

# WebView JS bridge
-keep class com.rebel.panel.MainActivity { *; }
-keep class com.rebel.panel.MainActivity$RebelBridge { *; }
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# BuildConfig secrets (fields only, names obfuscated elsewhere)
-keepclassmembers class com.rebel.panel.BuildConfig {
    public static <fields>;
}

# OkHttp / platform
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**

# Jetpack Security / EncryptedSharedPreferences
-keep class androidx.security.crypto.** { *; }
-dontwarn androidx.security.crypto.**

# Obfuscate security package (no keep rules)
# Attackers must deobfuscate o.a, o.b class names

# Remove logs in release
-assumenosideeffects class android.util.Log {
    public static *** d(...);
    public static *** v(...);
    public static *** i(...);
    public static *** w(...);
    public static *** e(...);
}

# Gson not used — org.json kept by default
