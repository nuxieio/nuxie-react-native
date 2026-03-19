# Bare React Native Setup

Bare React Native apps can use the same JS API as Expo apps.

## Install

```bash
bun add @nuxie/react-native
```

## iOS

- Ensure Nuxie iOS SDK is available for your app target.
- Add any required usage-description keys if flows request tracking, camera,
  microphone, photos, or foreground location.
- Run CocoaPods install after dependency changes.

```bash
cd ios
pod install
```

## Android

- Ensure your app resolves `io.nuxie:nuxie-android` in Gradle.
- Declare any dangerous permissions used by flow-authored
  `request_permission(...)` actions in your app manifest.
- Build normally with your RN toolchain.

## Configure

Use explicit API key in code (recommended for bare setup unless you implement equivalent native key metadata):

```ts
await Nuxie.configure({
  apiKey: "NX_PROD_...",
  environment: "production",
});
```

## Known Difference vs Expo Plugin

The Expo config plugin is not part of a bare RN workflow unless you also run Expo prebuild tooling.

Typical native declarations for permission-based flows:

- iOS:
  - `NSUserTrackingUsageDescription`
  - `NSCameraUsageDescription`
  - `NSMicrophoneUsageDescription`
  - `NSPhotoLibraryUsageDescription`
  - `NSLocationWhenInUseUsageDescription`
- Android:
  - `android.permission.CAMERA`
  - `android.permission.RECORD_AUDIO`
  - `android.permission.READ_MEDIA_IMAGES` on Android 13+ or
    `android.permission.READ_EXTERNAL_STORAGE` on Android 12 and below
  - `android.permission.ACCESS_COARSE_LOCATION` and/or
    `android.permission.ACCESS_FINE_LOCATION`
