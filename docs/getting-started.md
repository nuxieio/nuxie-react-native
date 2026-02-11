# Getting Started

## 1. Install

```bash
bun add @nuxie/react-native
```

## 2. Configure

```ts
import { Nuxie } from "@nuxie/react-native";

await Nuxie.configure({
  apiKey: "NX_PROD_...",
  environment: "production",
});
```

## 3. Identify

```ts
await Nuxie.identify("user_123", {
  userProperties: {
    plan: "pro",
    locale: "en_US",
  },
});
```

## 4. Trigger

```ts
const op = Nuxie.trigger("paywall_opened", {
  properties: {
    source: "settings",
  },
});

op.onUpdate((update) => {
  console.log(update);
});

const terminal = await op.done;
console.log(terminal);
```

## 5. Feature Checks

```ts
const access = await Nuxie.hasFeature("pro_export");

if (access.allowed) {
  // allow feature
}
```

For metered features:

```ts
const check = await Nuxie.checkFeature("ai_credits", {
  requiredBalance: 5,
  entityId: "project_123",
});

if (check.allowed) {
  await Nuxie.useFeatureAndWait("ai_credits", {
    amount: 5,
    entityId: "project_123",
  });
}
```

## 6. Optional React Provider/Hooks

```tsx
import { NuxieProvider, useFeature, useTrigger } from "@nuxie/react-native";

function Root() {
  return (
    <NuxieProvider config={{ apiKey: "NX_PROD_..." }}>
      <Screen />
    </NuxieProvider>
  );
}

function Screen() {
  const feature = useFeature("pro_export");
  const trigger = useTrigger();
  return null;
}
```

## Next

- [Expo Setup](./expo-setup.md)
- [Bare React Native Setup](./bare-react-native-setup.md)
- [API Reference](./api-reference.md)
