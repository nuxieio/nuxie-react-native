# @nuxie/react-native

Expo-first React Native bridge for Nuxie.

- Native runtime lives in Nuxie SDKs (`nuxie-ios`, `nuxie-android`).
- JS layer is intentionally thin and ergonomic.
- Works in Expo prebuild/dev client and bare React Native.
- Not supported in Expo Go.

## Install

```bash
bun add @nuxie/react-native
```

Peer dependencies:

- `react`
- `react-native`
- `expo` (for Expo module runtime and plugin)

## Expo Setup

Add the config plugin to your app config if you want native API-key fallback:

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

The plugin writes `NUXIE_API_KEY` into iOS Info.plist and Android manifest metadata.

At runtime, key precedence is:

1. `apiKey` passed to `configure(...)`
2. plugin-provided `NUXIE_API_KEY`
3. throw `MISSING_API_KEY`

## Quick Start (Imperative)

```ts
import { Nuxie } from "@nuxie/react-native";

await Nuxie.configure({
  apiKey: "NX_PROD_...", // optional if plugin key is configured
  environment: "production",
});

await Nuxie.identify("user_123");

const op = Nuxie.trigger("premium_feature_tapped", {
  properties: { source: "editor" },
});

op.onUpdate((update) => {
  console.log("trigger update", update);
});

const terminal = await op.done;
console.log("terminal update", terminal);
```

## React Layer (Optional)

```tsx
import { NuxieProvider, useFeature, useTrigger } from "@nuxie/react-native";

function App() {
  return (
    <NuxieProvider config={{ apiKey: "NX_PROD_..." }}>
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

### Available hooks

- `useNuxieClient()`
- `useFeature(featureId, options?)`
- `useTrigger()`
- `useNuxieEvents(callbacks)`

## Purchase Controller Bridge

If your app owns purchases (RevenueCat, custom billing, etc.), provide a purchase controller.

```ts
import { NuxieProvider, type NuxiePurchaseController } from "@nuxie/react-native";

const purchaseController: NuxiePurchaseController = {
  async onPurchase(request) {
    // Run purchase with your billing layer
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
/>
```

Native requests time out after 60s if no completion is returned.

## API Surface

`Nuxie` singleton and `NuxieClient` expose:

- `configure(options)`
- `shutdown()`
- `identify(distinctId, opts?)`
- `reset(opts?)`
- `getDistinctId()`
- `getAnonymousId()`
- `isIdentified()`
- `trigger(eventName, opts?)`
- `triggerOnce(eventName, opts?)`
- `showFlow(flowId)`
- `refreshProfile()`
- `hasFeature(featureId, opts?)`
- `getCachedFeature(featureId, opts?)`
- `checkFeature(featureId, opts?)`
- `refreshFeature(featureId, opts?)`
- `useFeature(featureId, opts?)`
- `useFeatureAndWait(featureId, opts?)`
- `flushEvents()`
- `getQueuedEventCount()`
- `pauseEventQueue()`
- `resumeEventQueue()`
- `on(eventName, listener)`
- `setPurchaseController(controller)`

## Trigger Terminal Semantics

`TriggerOperation.done` resolves on terminal updates only:

- `error`
- `journey`
- `decision.no_match`
- `decision.suppressed`
- `decision.allowed_immediate`
- `decision.denied_immediate`
- `entitlement.allowed`
- `entitlement.denied`

## Bare React Native Setup

### iOS

- Ensure the Nuxie iOS SDK is available to your app target (SPM or pod integration).
- Run pod install after linking this package.

### Android

- Ensure your app resolves `io.nuxie:nuxie-android`.
- Build with standard React Native autolinking (or Expo prebuild for managed workflow).

## Development

```bash
bun run typecheck
bun test
```
