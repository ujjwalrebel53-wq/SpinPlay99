# ═══════════════════════════════════
# 100% DISABLE OBFUSCATION
# ═══════════════════════════════════
-dontobfuscate
-dontoptimize
-dontshrink
-dontpreverify
-dontwarn
-ignorewarnings
-keep class ** { *; }
-keepattributes *
-keepattributes Signature
-keepattributes *Annotation*
-keepattributes InnerClasses
-keepattributes EnclosingMethod
-keep class com.spinplay99.adminpanel.** { *; }
-keep class com.google.firebase.** { *; }
-keep class androidx.** { *; }
