-optimizationpasses 5
-dontusemixedcaseclassnames
-repackageclasses ''
-allowaccessmodification

-keep class com.rebel.panel.MainActivity { *; }
-keep class com.rebel.panel.MainActivity$RebelBridge { *; }
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keepclassmembers class com.rebel.panel.BuildConfig {
    public static <fields>;
}

-assumenosideeffects class android.util.Log {
    public static *** d(...);
    public static *** v(...);
    public static *** i(...);
}
