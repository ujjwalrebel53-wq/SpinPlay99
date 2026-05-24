-dontobfuscate
-dontoptimize
-dontshrink
-dontpreverify
-keep class ** { *; }
-keepclassmembers class * { *; }
-keepattributes *
-keepattributes Signature,SourceFile,LineNumberTable
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
