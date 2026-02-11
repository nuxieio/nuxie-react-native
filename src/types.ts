export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type NuxieLogLevel = "verbose" | "debug" | "info" | "warning" | "error" | "none";
export type NuxieEnvironment = "production" | "staging" | "development" | "custom";
export type EventLinkingPolicy = "keep_separate" | "migrate_on_identify";

export interface NuxieConfigurationOptions {
  environment?: NuxieEnvironment;
  apiEndpoint?: string;
  logLevel?: NuxieLogLevel;
  enableConsoleLogging?: boolean;
  enableFileLogging?: boolean;
  redactSensitiveData?: boolean;
  requestTimeoutSeconds?: number;
  retryCount?: number;
  retryDelaySeconds?: number;
  syncIntervalSeconds?: number;
  enableCompression?: boolean;
  eventBatchSize?: number;
  flushAt?: number;
  flushIntervalSeconds?: number;
  maxQueueSize?: number;
  maxCacheSizeBytes?: number;
  cacheExpirationSeconds?: number;
  enableEncryption?: boolean;
  customStoragePath?: string | null;
  featureCacheTtlSeconds?: number;
  defaultPaywallTimeoutSeconds?: number;
  respectDoNotTrack?: boolean;
  eventLinkingPolicy?: EventLinkingPolicy;
  localeIdentifier?: string | null;
  isDebugMode?: boolean;
  enablePlugins?: boolean;
  maxFlowCacheSizeBytes?: number;
  flowCacheExpirationSeconds?: number;
  maxConcurrentFlowDownloads?: number;
  flowDownloadTimeoutSeconds?: number;
  flowCacheDirectory?: string | null;
}

export interface NuxieConfigureOptions extends NuxieConfigurationOptions {
  apiKey: string;
  usePurchaseController?: boolean;
}

export interface TriggerOptions {
  properties?: Record<string, JsonValue>;
  userProperties?: Record<string, JsonValue>;
  userPropertiesSetOnce?: Record<string, JsonValue>;
}

export interface JourneyRef {
  journeyId: string;
  campaignId: string;
  flowId?: string | null;
}

export type SuppressReason =
  | "already_active"
  | "reentry_limited"
  | "holdout"
  | "no_flow"
  | "unknown";

export type TriggerDecision =
  | { type: "no_match" }
  | { type: "suppressed"; reason: SuppressReason; rawReason?: string }
  | { type: "journey_started"; ref: JourneyRef }
  | { type: "journey_resumed"; ref: JourneyRef }
  | { type: "flow_shown"; ref: JourneyRef }
  | { type: "allowed_immediate" }
  | { type: "denied_immediate" };

export type GateSource = "cache" | "purchase" | "restore";

export type EntitlementUpdate =
  | { type: "pending" }
  | { type: "allowed"; source: GateSource }
  | { type: "denied" };

export type JourneyExitReason =
  | "completed"
  | "goal_met"
  | "trigger_unmatched"
  | "expired"
  | "error"
  | "cancelled";

export interface JourneyUpdate {
  journeyId: string;
  campaignId: string;
  flowId?: string | null;
  exitReason: JourneyExitReason;
  goalMet: boolean;
  goalMetAtEpochMillis?: number | null;
  durationSeconds?: number | null;
  flowExitReason?: string | null;
}

export interface TriggerError {
  code: string;
  message: string;
}

export type TriggerUpdate =
  | { kind: "decision"; decision: TriggerDecision }
  | { kind: "entitlement"; entitlement: EntitlementUpdate }
  | { kind: "journey"; journey: JourneyUpdate }
  | { kind: "error"; error: TriggerError };

export type TriggerTerminalUpdate = Extract<
  TriggerUpdate,
  { kind: "journey" } | { kind: "error" }
> | {
  kind: "decision";
  decision: Extract<
    TriggerDecision,
    { type: "no_match" } | { type: "suppressed" } | { type: "allowed_immediate" } | { type: "denied_immediate" }
  >;
} | {
  kind: "entitlement";
  entitlement: Extract<EntitlementUpdate, { type: "allowed" } | { type: "denied" }>;
};

export type FeatureType = "boolean" | "metered" | "creditSystem";

export interface FeatureAccess {
  allowed: boolean;
  unlimited: boolean;
  balance?: number | null;
  type: FeatureType;
}

export interface FeatureCheckResult {
  customerId: string;
  featureId: string;
  requiredBalance: number;
  code: string;
  allowed: boolean;
  unlimited: boolean;
  balance?: number | null;
  type: FeatureType;
  preview?: JsonValue;
}

export interface FeatureUsageResult {
  success: boolean;
  featureId: string;
  amountUsed: number;
  message?: string | null;
  usage?: {
    current: number;
    limit?: number | null;
    remaining?: number | null;
  } | null;
}

export interface ProfileResponse {
  customerId?: string;
  campaigns?: JsonValue;
  segments?: JsonValue;
  flows?: JsonValue;
  features?: JsonValue;
  [key: string]: JsonValue | undefined;
}

export interface NuxieNativeError {
  code: string;
  message: string;
  nativeStack?: string;
}

export interface PurchaseRequest {
  requestId: string;
  platform: "ios" | "android";
  productId: string;
  basePlanId?: string | null;
  offerId?: string | null;
  displayName?: string | null;
  displayPrice?: string | null;
  price?: number | null;
  currencyCode?: string | null;
  timestampMs: number;
}

export interface RestoreRequest {
  requestId: string;
  platform: "ios" | "android";
  timestampMs: number;
}

export type PurchaseResult =
  | {
      type: "success";
      productId?: string;
      purchaseToken?: string;
      orderId?: string;
      transactionId?: string;
      originalTransactionId?: string;
      transactionJws?: string;
    }
  | { type: "cancelled" }
  | { type: "pending" }
  | { type: "failed"; message: string };

export type RestoreResult =
  | { type: "success"; restoredCount?: number }
  | { type: "no_purchases" }
  | { type: "failed"; message: string };

export interface NuxiePurchaseController {
  onPurchase(request: PurchaseRequest): Promise<PurchaseResult>;
  onRestore(request: RestoreRequest): Promise<RestoreResult>;
}

export interface TriggerOperation {
  requestId: string;
  cancel(): Promise<void>;
  onUpdate(listener: (update: TriggerUpdate) => void): () => void;
  done: Promise<TriggerTerminalUpdate>;
}
