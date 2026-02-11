# API Reference

## Exports

```ts
import {
  Nuxie,
  NuxieClient,
  NuxieProvider,
  useNuxieClient,
  useFeature,
  useTrigger,
  useNuxieEvents,
} from "@nuxie/react-native";
```

## `Nuxie` / `NuxieClient`

### Lifecycle

- `configure(options: NuxieConfigureOptions): Promise<void>`
- `shutdown(): Promise<void>`

#### `configure(options)` fields

`NuxieConfigureOptions` extends `NuxieConfigurationOptions` and adds:

- `apiKey?: string`
- `usePurchaseController?: boolean`

Commonly-used configuration fields:

- `environment: "production" | "staging" | "development" | "custom"`
- `apiEndpoint?: string`
- `logLevel?: "verbose" | "debug" | "info" | "warning" | "error" | "none"`
- `eventLinkingPolicy?: "keep_separate" | "migrate_on_identify"`
- `localeIdentifier?: string | null`
- `isDebugMode?: boolean`
- queue and transport tuning:
  - `flushAt`, `flushIntervalSeconds`, `eventBatchSize`, `maxQueueSize`
  - `retryCount`, `retryDelaySeconds`, `requestTimeoutSeconds`

Key behavior:

1. explicit `options.apiKey`
2. native `NUXIE_API_KEY` fallback
3. throw `MISSING_API_KEY`

### Identity

- `identify(distinctId: string, opts?): Promise<void>`
- `reset(opts?: { keepAnonymousId?: boolean }): Promise<void>`
- `getDistinctId(): Promise<string>`
- `getAnonymousId(): Promise<string>`
- `isIdentified(): Promise<boolean>`

### Triggers

- `trigger(eventName: string, opts?: TriggerOptions): TriggerOperation`
- `triggerOnce(eventName: string, opts?: TriggerOptions): Promise<TriggerTerminalUpdate>`

`TriggerOperation`:

- `requestId: string`
- `cancel(): Promise<void>`
- `onUpdate(listener): () => void`
- `done: Promise<TriggerTerminalUpdate>`

### Flow + Profile

- `showFlow(flowId: string): Promise<void>`
- `refreshProfile(): Promise<ProfileResponse>`

### Features

- `hasFeature(featureId, opts?): Promise<FeatureAccess>`
- `getCachedFeature(featureId, opts?): Promise<FeatureAccess | null>`
- `checkFeature(featureId, opts?): Promise<FeatureCheckResult>`
- `refreshFeature(featureId, opts?): Promise<FeatureCheckResult>`
- `useFeature(featureId, opts?): Promise<void>`
- `useFeatureAndWait(featureId, opts?): Promise<FeatureUsageResult>`

### Event Queue

- `flushEvents(): Promise<boolean>`
- `getQueuedEventCount(): Promise<number>`
- `pauseEventQueue(): Promise<void>`
- `resumeEventQueue(): Promise<void>`

### Event Subscription

- `on(eventName, listener): () => void`

Supported event names:

- `triggerUpdate`
- `featureAccessChanged`
- `purchaseRequest`
- `restoreRequest`
- `flowPresented`
- `flowDismissed`

Event payload type map:

```ts
type NuxieClientEventMap = {
  triggerUpdate: {
    requestId: string;
    update: TriggerUpdate;
    isTerminal?: boolean;
    timestampMs: number;
  };
  featureAccessChanged: {
    featureId: string;
    from?: FeatureAccess | null;
    to: FeatureAccess;
    timestampMs: number;
  };
  purchaseRequest: PurchaseRequest;
  restoreRequest: RestoreRequest;
  flowPresented: {
    flowId: string;
    timestampMs: number;
  };
  flowDismissed: {
    flowId?: string | null;
    reason?: string | null;
    journeyId?: string;
    campaignId?: string | null;
    screenId?: string | null;
    error?: string | null;
    timestampMs: number;
  };
};
```

### Purchase Controller

- `setPurchaseController(controller: NuxiePurchaseController | null): void`

## React Components/Hooks

### `NuxieProvider`

Props:

- `config?: NuxieConfigureOptions`
- `purchaseController?: NuxiePurchaseController | null`
- `client?: NuxieClient`
- `onConfigureError?: (error: unknown) => void`

### `useNuxieClient()`

Returns active `NuxieClient` (context client or singleton `Nuxie`).

### `useFeature(featureId, options?)`

`options`:

- `requiredBalance?: number`
- `entityId?: string`
- `refreshOnMount?: boolean`

Returns:

- `value: FeatureAccess | null`
- `isLoading: boolean`
- `error: Error | null`
- `refresh(): Promise<FeatureCheckResult>`

### `useTrigger()`

Returns:

- `isRunning`
- `lastUpdate`
- `terminalUpdate`
- `error`
- `run(eventName, options?)`
- `cancel()`

`run(...)` automatically cancels any previous in-flight trigger started by the same hook instance.

### `useNuxieEvents(callbacks)`

Callback map:

- `onTriggerUpdate`
- `onFeatureAccessChanged`
- `onPurchaseRequest`
- `onRestoreRequest`
- `onFlowPresented`
- `onFlowDismissed`

## Important Configure Behavior

`NuxieConfigureOptions.apiKey` is optional only because native plugin fallback is supported.

Resolution order:

1. explicit `options.apiKey`
2. native default key (`NUXIE_API_KEY`)
3. throw `MISSING_API_KEY`

## Trigger Terminal Semantics

`TriggerOperation.done` resolves on terminal updates only:

- `{ kind: "error" }`
- `{ kind: "journey" }`
- `{ kind: "decision", decision.type: "no_match" | "suppressed" | "allowed_immediate" | "denied_immediate" }`
- `{ kind: "entitlement", entitlement.type: "allowed" | "denied" }`

Not terminal:

- `decision.journey_started`
- `decision.journey_resumed`
- `decision.flow_shown`
- `entitlement.pending`
