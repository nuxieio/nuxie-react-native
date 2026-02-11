# @nuxie/react-native

React Native SDK for Nuxie.

`@nuxie/react-native` is a thin, native-first bridge over:

- Nuxie iOS SDK (`nuxie-ios`)
- Nuxie Android SDK (`nuxie-android`)

It gives you an ergonomic React Native API while keeping runtime behavior in native SDKs.

## Why This SDK

- Native truth: no duplicated trigger/feature/paywall runtime logic in JS.
- Expo-first ergonomics: config plugin + Expo module bridge.
- Bare RN support: same JS API, native linkage in your app.
- Optional React layer: use imperative API only, or add provider/hooks.

## Platform Support

| Runtime | Status | Notes |
| --- | --- | --- |
| Expo Dev Client / Prebuild | Supported | Recommended path |
| Bare React Native | Supported | Manual native setup required |
| Expo Go | Not supported | Native bridge module is required |

## Documentation

- [Getting Started](./docs/getting-started.md)
- [Expo Setup](./docs/expo-setup.md)
- [Bare React Native Setup](./docs/bare-react-native-setup.md)
- [API Reference](./docs/api-reference.md)
- [Purchase Controller Guide](./docs/purchase-controller.md)
- [Troubleshooting](./docs/troubleshooting.md)

## Install

```bash
bun add @nuxie/react-native
```

Peer requirements:

- `react` >= 18
- `react-native` >= 0.72
- `expo` >= 50

## Fast Start (Imperative API)

```ts
import { Nuxie } from "@nuxie/react-native";

await Nuxie.configure({
  apiKey: "NX_PROD_...", // optional when using plugin-provided NUXIE_API_KEY
  environment: "production",
});

await Nuxie.identify("user_123", {
  userProperties: { plan: "pro" },
});

const trigger = Nuxie.trigger("paywall_opened", {
  properties: { source: "settings" },
});

trigger.onUpdate((update) => {
  console.log("update", update);
});

const terminal = await trigger.done;
console.log("terminal", terminal);
```

## Fast Start (React Layer)

```tsx
import { NuxieProvider, useFeature, useTrigger } from "@nuxie/react-native";

export function App() {
  return (
    <NuxieProvider
      config={{
        apiKey: "NX_PROD_...",
        environment: "production",
      }}
    >
      <Screen />
    </NuxieProvider>
  );
}

function Screen() {
  const feature = useFeature("pro_export", { refreshOnMount: true });
  const trigger = useTrigger();

  return null;
}
```

## Expo Plugin (Optional API Key Fallback)

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

The plugin sets `NUXIE_API_KEY` in native config.

`configure()` API key precedence:

1. `options.apiKey`
2. plugin-provided `NUXIE_API_KEY`
3. throws `MISSING_API_KEY`

## Trigger Contract

`trigger()` returns a `TriggerOperation`:

- `requestId`
- `cancel()`
- `onUpdate(listener)`
- `done` promise (resolves only on terminal update)

Terminal update categories:

- `error`
- `journey`
- `decision` with: `no_match`, `suppressed`, `allowed_immediate`, `denied_immediate`
- `entitlement` with: `allowed`, `denied`

## Purchase Controller Bridge

If your app owns purchase execution (RevenueCat, BillingClient wrapper, custom StoreKit flow), wire a `NuxiePurchaseController`:

```ts
import { NuxieProvider, type NuxiePurchaseController } from "@nuxie/react-native";

const purchaseController: NuxiePurchaseController = {
  async onPurchase(request) {
    return {
      type: "success",
      productId: request.productId,
      purchaseToken: "token_123",
    };
  },
  async onRestore() {
    return { type: "success", restoredCount: 1 };
  },
};

<NuxieProvider
  config={{ apiKey: "NX_PROD_...", usePurchaseController: true }}
  purchaseController={purchaseController}
/>;
```

Outstanding purchase/restore requests have a native timeout (60s).

## Example App + Runability Verification

A full Expo example app lives in [`example/`](./example):

```bash
cd example
bun install
bun run verify
```

`verify` checks:

- SDK build
- example TypeScript compile
- Expo config resolution
- Android prebuild generation
- iOS prebuild generation

## Development

```bash
bun run typecheck
bun test
bun run build
```

## License

MIT
