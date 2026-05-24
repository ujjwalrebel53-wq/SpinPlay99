# Obfuscation is fully disabled — all class/method/field names are preserved as-is.
-dontobfuscate
-dontoptimize
-dontshrink
-dontpreverify

# Keep all classes and members unconditionally
-keep class ** { *; }
-keepclassmembers class * { *; }

# Preserve all attributes including source file names and line numbers for readable stack traces
-keepattributes *
-keepattributes Signature,SourceFile,LineNumberTable

# Ensure JavaScript bridge methods are never stripped
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
