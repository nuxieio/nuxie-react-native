import { NuxieClient } from "./client";
import { Nuxie } from "./singleton";
export type {
  EventLinkingPolicy,
  EntitlementUpdate,
  FeatureAccess,
  FeatureCheckResult,
  FeatureType,
  FeatureUsageResult,
  GateSource,
  JourneyExitReason,
  JourneyRef,
  JourneyUpdate,
  NuxieConfigureOptions,
  NuxieConfigurationOptions,
  NuxieEnvironment,
  NuxieLogLevel,
  NuxieNativeError,
  NuxiePurchaseController,
  ProfileResponse,
  PurchaseRequest,
  PurchaseResult,
  RestoreRequest,
  RestoreResult,
  SuppressReason,
  TriggerDecision,
  TriggerError,
  TriggerOperation,
  TriggerOptions,
  TriggerTerminalUpdate,
  TriggerUpdate,
} from "./types";
export type { NuxieNativeEventMap, NuxieNativeEventName } from "./native-module";
export type { NuxieClientEventMap } from "./client";
export { setNativeModuleForTesting } from "./native-module";
export { NuxieProvider, useNuxieClient } from "./react-context";
export { useFeature } from "./use-feature";
export { useTrigger } from "./use-trigger";
export { useNuxieEvents } from "./use-nuxie-events";

export { NuxieClient };
export { Nuxie };
