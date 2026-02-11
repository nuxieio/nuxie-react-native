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

## Configure In App

You can provide `apiKey` in code, plugin config, or both.

```ts
await Nuxie.configure({
  environment: "production",
  logLevel: "warning",
});
```

If no key is found, `configure()` throws `MISSING_API_KEY`.

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
