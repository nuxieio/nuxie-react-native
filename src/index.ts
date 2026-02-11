import { NuxieClient } from "./client";
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
export { setNativeModuleForTesting } from "./native-module";

export const Nuxie = new NuxieClient();
export { NuxieClient };
