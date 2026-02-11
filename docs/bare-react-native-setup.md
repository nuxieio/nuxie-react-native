# Bare React Native Setup

Bare React Native apps can use the same JS API as Expo apps.

## Install

```bash
bun add @nuxie/react-native
```

## iOS

- Ensure Nuxie iOS SDK is available for your app target.
- Run CocoaPods install after dependency changes.

```bash
cd ios
pod install
```

## Android

- Ensure your app resolves `io.nuxie:nuxie-android` in Gradle.
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
