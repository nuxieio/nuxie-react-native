# Expo Example App

This is a full Expo app that uses `@nuxie/react-native` from the local package via `file:..`.

## Install

```bash
cd example
bun install
```

## Run

```bash
bun run ios
bun run android
```

## Runability Verification

The verification script confirms the SDK and plugin are runnable in an Expo native workflow:

```bash
bun run verify
```

It performs:

1. SDK build (`../dist` output)
2. Example app typecheck
3. Expo config resolution
4. Android prebuild (clean, no-install)
5. iOS prebuild (clean, no-install)

If this passes, the app resolves the SDK package, consumes the plugin, and generates native projects successfully.
