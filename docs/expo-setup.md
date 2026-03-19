# Expo Setup

This SDK is Expo-first and works best in Dev Client / prebuild workflows.

## Requirements

- Expo SDK 50+
- Not supported in Expo Go

## Install

```bash
bun add @nuxie/react-native
```

## Add Plugin

In `app.json` or `app.config.ts`:

```json
{
  "expo": {
    "plugins": [
      [
        "@nuxie/react-native/plugin",
        {
          "apiKey": "NX_PROD_..."
        }
      ]
    ]
  }
}
```

Plugin behavior:

- iOS: writes `NUXIE_API_KEY` to `Info.plist`
- Android: writes `NUXIE_API_KEY` to app manifest metadata

The plugin currently manages only `NUXIE_API_KEY`. If your flows use native
permission actions, add the platform declarations in app config too.

Example:

```json
{
  "expo": {
    "plugins": [
      [
        "@nuxie/react-native/plugin",
        {
          "apiKey": "NX_PROD_..."
        }
      ]
    ],
    "ios": {
      "infoPlist": {
        "NSUserTrackingUsageDescription": "We use tracking to personalize flows.",
        "NSCameraUsageDescription": "We use the camera in onboarding flows.",
        "NSMicrophoneUsageDescription": "We use the microphone in onboarding flows.",
        "NSPhotoLibraryUsageDescription": "We use your photos in onboarding flows.",
        "NSLocationWhenInUseUsageDescription": "We use your location while the app is open."
      }
    },
    "android": {
      "permissions": [
        "android.permission.POST_NOTIFICATIONS",
        "android.permission.CAMERA",
        "android.permission.RECORD_AUDIO",
        "android.permission.READ_MEDIA_IMAGES",
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.ACCESS_FINE_LOCATION"
      ]
    }
  }
}
```

## Configure In App

You can provide `apiKey` in code, plugin config, or both.

```ts
await Nuxie.configure({
  environment: "production",
  logLevel: "warning",
});
```

If no key is found, `configure()` throws `MISSING_API_KEY`.

## Native permission actions

Flows using `request_notifications`, `request_tracking`, or
`request_permission(...)` do not require any extra JS calls, but they do rely
on native app configuration:

- `request_notifications` needs `android.permission.POST_NOTIFICATIONS` on
  Android 13+
- `request_tracking` is iOS-only
- `request_permission("photos")` uses `READ_EXTERNAL_STORAGE` on Android 12 and
  below, so add that permission if you still support those devices

## Build / Run

```bash
bunx expo prebuild
bunx expo run:ios
bunx expo run:android
```

Or with dev server:

```bash
bunx expo start --dev-client
```

## Verify Integration

Use the package example app:

```bash
cd example
bun install
bun run verify
```
