# ═══════════════════════════════════
# FULLY DISABLED - NO OBFUSCATION
# ═══════════════════════════════════
-dontobfuscate
-dontoptimize
-dontshrink
-dontpreverify
-keep class ** { *; }
-keepattributes *
-keepattributes Signature
-keepattributes *Annotation*
-keep class com.spinplay99.adminpanel.** { *; }
