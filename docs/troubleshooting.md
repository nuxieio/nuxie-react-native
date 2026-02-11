# Troubleshooting

## `MISSING_API_KEY` on `configure()`

Cause: no API key provided in `configure()` and no native `NUXIE_API_KEY` metadata found.

Fix:

- pass `apiKey` directly in `configure()`, or
- configure Expo plugin with `apiKey`.

## Plugin resolution errors in Expo config

If Expo reports plugin import/resolve errors:

- ensure dependencies are installed (`bun install`)
- ensure plugin entry is `@nuxie/react-native/plugin`
- ensure your project uses a native-capable Expo workflow (not Expo Go)

## Native module unavailable

Error message: `Nuxie native bridge (NuxieExpo) is unavailable...`

Cause: app running without linked native module.

Fix:

- Expo: run prebuild/dev-client workflow (`expo prebuild`, `expo run:*`, `expo start --dev-client`)
- Bare RN: verify iOS pods and Android Gradle linkage

## Trigger never resolves

`TriggerOperation.done` resolves only on terminal updates. Non-terminal updates include:

- `decision.journey_started`
- `decision.journey_resumed`
- `decision.flow_shown`
- `entitlement.pending`

If a trigger seems stuck:

- inspect `onUpdate` stream for pending/intermediate states
- verify native runtime can present flow / evaluate entitlements

## Purchase request timeout

If purchase/restore callbacks time out:

- verify `purchaseController` is set before `configure()` or via provider
- ensure controller always returns a result (`success`, `cancelled`, `pending`, or `failed`)
- check for swallowed exceptions in your billing wrapper

## Example verification

Use the included example app to validate runability:

```bash
cd example
bun install
bun run verify
```
