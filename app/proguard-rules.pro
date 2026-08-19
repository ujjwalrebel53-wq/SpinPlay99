-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.nya.panel.MainActivity$RebelAndroidBridge { *; }
-keep class com.nya.panel.** { *; }
