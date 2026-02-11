import type {
  FeatureAccess,
  FeatureCheckResult,
  FeatureUsageResult,
  NuxieConfigurationOptions,
  ProfileResponse,
  RestoreResult,
  TriggerOptions,
  TriggerUpdate,
  PurchaseResult,
} from "./types";

export type NuxieNativeEventMap = {
  onTriggerUpdate: {
    requestId: string;
    update: TriggerUpdate;
    isTerminal?: boolean;
    timestampMs: number;
  };
  onFeatureAccessChanged: {
    featureId: string;
    from?: FeatureAccess | null;
    to: FeatureAccess;
    timestampMs: number;
  };
  onPurchaseRequest: {
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
  };
  onRestoreRequest: {
    requestId: string;
    platform: "ios" | "android";
    timestampMs: number;
  };
  onFlowPresented: {
    flowId: string;
    timestampMs: number;
  };
  onFlowDismissed: {
    flowId: string;
    reason?: string;
    timestampMs: number;
  };
};

export type NuxieNativeEventName = keyof NuxieNativeEventMap;

export interface NuxieNativeSubscription {
  remove(): void;
}

export interface NuxieNativeModule {
  configure(
    apiKey: string,
    options?: NuxieConfigurationOptions,
    usePurchaseController?: boolean,
    wrapperVersion?: string,
  ): Promise<void>;
  shutdown(): Promise<void>;
  identify(
    distinctId: string,
    userProperties?: Record<string, unknown>,
    userPropertiesSetOnce?: Record<string, unknown>,
  ): Promise<void>;
  reset(keepAnonymousId?: boolean): Promise<void>;
  getDistinctId(): Promise<string>;
  getAnonymousId(): Promise<string>;
  getIsIdentified(): Promise<boolean>;
  startTrigger(requestId: string, eventName: string, options?: TriggerOptions): Promise<void>;
  cancelTrigger(requestId: string): Promise<void>;
  showFlow(flowId: string): Promise<void>;
  refreshProfile(): Promise<ProfileResponse>;
  hasFeature(featureId: string, requiredBalance?: number, entityId?: string): Promise<FeatureAccess>;
  getCachedFeature(featureId: string, entityId?: string): Promise<FeatureAccess | null>;
  checkFeature(featureId: string, requiredBalance?: number, entityId?: string): Promise<FeatureCheckResult>;
  refreshFeature(featureId: string, requiredBalance?: number, entityId?: string): Promise<FeatureCheckResult>;
  useFeature(featureId: string, amount?: number, entityId?: string, metadata?: Record<string, unknown>): Promise<void>;
  useFeatureAndWait(
    featureId: string,
    amount?: number,
    entityId?: string,
    setUsage?: boolean,
    metadata?: Record<string, unknown>,
  ): Promise<FeatureUsageResult>;
  flushEvents(): Promise<boolean>;
  getQueuedEventCount(): Promise<number>;
  pauseEventQueue(): Promise<void>;
  resumeEventQueue(): Promise<void>;
  completePurchase(requestId: string, result: PurchaseResult): Promise<void>;
  completeRestore(requestId: string, result: RestoreResult): Promise<void>;
  addListener<K extends NuxieNativeEventName>(
    eventName: K,
    listener: (payload: NuxieNativeEventMap[K]) => void,
  ): NuxieNativeSubscription;
}

let nativeModuleCache: NuxieNativeModule | null = null;

async function resolveExpoNativeModule(): Promise<NuxieNativeModule | null> {
  try {
    const expo = await import("expo");
    const requireNativeModule = (expo as { requireNativeModule?: <T>(name: string) => T }).requireNativeModule;
    if (typeof requireNativeModule !== "function") {
      return null;
    }
    return requireNativeModule<NuxieNativeModule>("NuxieExpo");
  } catch {
    return null;
  }
}

async function resolveReactNativeBridge(): Promise<NuxieNativeModule | null> {
  try {
    const reactNative = (await import("react-native")) as {
      NativeModules?: Record<string, unknown>;
      NativeEventEmitter?: new (nativeModule: unknown) => {
        addListener(eventName: string, callback: (payload: unknown) => void): { remove: () => void };
      };
    };

    const nativeModule = (reactNative.NativeModules?.NuxieExpo as NuxieNativeModule | undefined) ?? null;
    if (nativeModule == null) {
      return null;
    }
    if (typeof nativeModule.addListener === "function") {
      return nativeModule;
    }

    if (reactNative.NativeEventEmitter == null) {
      return null;
    }

    const emitter = new reactNative.NativeEventEmitter(nativeModule);
    return {
      ...nativeModule,
      addListener(eventName, listener) {
        const subscription = emitter.addListener(eventName, listener as (payload: unknown) => void);
        return { remove: () => subscription.remove() };
      },
    };
  } catch {
    return null;
  }
}

export async function resolveNativeModule(): Promise<NuxieNativeModule> {
  if (nativeModuleCache != null) {
    return nativeModuleCache;
  }

  const viaExpo = await resolveExpoNativeModule();
  if (viaExpo != null) {
    nativeModuleCache = viaExpo;
    return viaExpo;
  }

  const viaReactNative = await resolveReactNativeBridge();
  if (viaReactNative != null) {
    nativeModuleCache = viaReactNative;
    return viaReactNative;
  }

  throw new Error(
    "Nuxie native bridge (NuxieExpo) is unavailable. Ensure @nuxie/react-native is linked in your app.",
  );
}

export function setNativeModuleForTesting(module: NuxieNativeModule | null): void {
  nativeModuleCache = module;
}
