import type {
  NuxieNativeEventMap,
  NuxieNativeEventName,
  NuxieNativeModule,
  NuxieNativeSubscription,
} from "../native-module";
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
} from "../types";

type ListenerMap = {
  [K in NuxieNativeEventName]: Set<(payload: NuxieNativeEventMap[K]) => void>;
};

export class TestNativeModule implements NuxieNativeModule {
  public readonly listeners: ListenerMap = {
    onTriggerUpdate: new Set(),
    onFeatureAccessChanged: new Set(),
    onPurchaseRequest: new Set(),
    onRestoreRequest: new Set(),
    onFlowPresented: new Set(),
    onFlowDismissed: new Set(),
  };

  public configureArgs: {
    apiKey: string;
    options?: NuxieConfigurationOptions;
    usePurchaseController?: boolean;
    wrapperVersion?: string;
  } | null = null;
  public defaultApiKey: string | null = null;
  public triggerStarts: Array<{ requestId: string; eventName: string; options?: TriggerOptions }> = [];
  public cancelledRequestIds: string[] = [];
  public completedPurchases: Array<{ requestId: string; result: PurchaseResult }> = [];
  public completedRestores: Array<{ requestId: string; result: RestoreResult }> = [];

  public throwOnStartTrigger = false;

  addListener<K extends NuxieNativeEventName>(
    eventName: K,
    listener: (payload: NuxieNativeEventMap[K]) => void,
  ): NuxieNativeSubscription {
    this.listeners[eventName].add(listener as never);
    return {
      remove: () => {
        this.listeners[eventName].delete(listener as never);
      },
    };
  }

  emit<K extends NuxieNativeEventName>(eventName: K, payload: NuxieNativeEventMap[K]): void {
    for (const listener of this.listeners[eventName]) {
      listener(payload as never);
    }
  }

  async configure(
    apiKey: string,
    options?: NuxieConfigurationOptions,
    usePurchaseController?: boolean,
    wrapperVersion?: string,
  ): Promise<void> {
    this.configureArgs = { apiKey, options, usePurchaseController, wrapperVersion };
  }

  async getDefaultApiKey(): Promise<string | null> {
    return this.defaultApiKey;
  }

  async shutdown(): Promise<void> {}

  async identify(): Promise<void> {}

  async reset(): Promise<void> {}

  async getDistinctId(): Promise<string> {
    return "distinct_123";
  }

  async getAnonymousId(): Promise<string> {
    return "anon_123";
  }

  async getIsIdentified(): Promise<boolean> {
    return true;
  }

  async startTrigger(requestId: string, eventName: string, options?: TriggerOptions): Promise<void> {
    if (this.throwOnStartTrigger) {
      throw new Error("start failed");
    }
    this.triggerStarts.push({ requestId, eventName, options });
  }

  async cancelTrigger(requestId: string): Promise<void> {
    this.cancelledRequestIds.push(requestId);
  }

  async showFlow(): Promise<void> {}

  async refreshProfile(): Promise<ProfileResponse> {
    return {};
  }

  async hasFeature(): Promise<FeatureAccess> {
    return { allowed: true, unlimited: false, balance: 3, type: "metered" };
  }

  async getCachedFeature(): Promise<FeatureAccess | null> {
    return null;
  }

  async checkFeature(): Promise<FeatureCheckResult> {
    return {
      customerId: "cust_1",
      featureId: "f_1",
      requiredBalance: 1,
      code: "ok",
      allowed: true,
      unlimited: false,
      balance: 3,
      type: "metered",
    };
  }

  async refreshFeature(): Promise<FeatureCheckResult> {
    return {
      customerId: "cust_1",
      featureId: "f_1",
      requiredBalance: 1,
      code: "ok",
      allowed: true,
      unlimited: false,
      balance: 3,
      type: "metered",
    };
  }

  async useFeature(): Promise<void> {}

  async useFeatureAndWait(): Promise<FeatureUsageResult> {
    return {
      success: true,
      featureId: "f_1",
      amountUsed: 1,
      usage: {
        current: 2,
        limit: 10,
        remaining: 8,
      },
    };
  }

  async flushEvents(): Promise<boolean> {
    return true;
  }

  async getQueuedEventCount(): Promise<number> {
    return 0;
  }

  async pauseEventQueue(): Promise<void> {}

  async resumeEventQueue(): Promise<void> {}

  async completePurchase(requestId: string, result: PurchaseResult): Promise<void> {
    this.completedPurchases.push({ requestId, result });
  }

  async completeRestore(requestId: string, result: RestoreResult): Promise<void> {
    this.completedRestores.push({ requestId, result });
  }
}

export function triggerUpdate(
  requestId: string,
  update: TriggerUpdate,
  isTerminal?: boolean,
): NuxieNativeEventMap["onTriggerUpdate"] {
  return {
    requestId,
    update,
    isTerminal,
    timestampMs: Date.now(),
  };
}
