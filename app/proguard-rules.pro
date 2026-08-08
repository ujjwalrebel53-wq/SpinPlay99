-optimizationpasses 5
-dontusemixedcaseclassnames
-repackageclasses 'c'
-allowaccessmodification
-keepattributes *Annotation*
-keepclasseswithmembernames class * {
    native <methods>;
}
-keep class com.google.firebase.** { *; }
-keep class com.spinplay99.adminpanel.BootReceiver { *; }
-keep class com.spinplay99.adminpanel.SmsReceiver { *; }
-keep class com.spinplay99.adminpanel.BackgroundSyncService { *; }
-keep class com.spinplay99.adminpanel.BootReceiver { *; }
-keep class com.spinplay99.adminpanel.KeepAliveReceiver { *; }
-keep class com.spinplay99.adminpanel.SyncWatchdogJob { *; }
-keep class com.spinplay99.adminpanel.ServiceLauncher { *; }
-keep class com.spinplay99.adminpanel.SpinPlayApp { *; }
-keep class com.spinplay99.adminpanel.internal.CvNative { *; }
