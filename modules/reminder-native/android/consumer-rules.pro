# Vosk (offline keyword recogniser) uses JNA, which references desktop-only classes.
-dontwarn java.awt.**
-dontwarn javax.swing.**
-keep class com.sun.jna.** { *; }
-keep class * implements com.sun.jna.** { *; }
-keep class org.vosk.** { *; }

# ML Kit text recognition is discovered by reflection (component registrars); R8 must not strip it.
-keep class com.google.mlkit.** { *; }
-keep class com.google.android.gms.internal.mlkit_vision_text_common.** { *; }
-keep class com.google.android.gms.internal.mlkit_vision_text_bundled_common.** { *; }
-keep class com.google.android.gms.internal.mlkit_vision_common.** { *; }
-keep class com.google.android.gms.internal.mlkit_common.** { *; }
-keep class com.google.firebase.components.** { *; }
-keep class * implements com.google.firebase.components.ComponentRegistrar { *; }
-keep class * implements com.google.mlkit.common.sdkinternal.** { *; }
-dontwarn com.google.mlkit.**
