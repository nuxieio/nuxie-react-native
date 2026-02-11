import type {
  FeatureAccess,
  FeatureCheckResult,
  FeatureAccessChangedEvent,
  FlowDismissedEvent,
  FlowPresentedEvent,
  FeatureUsageResult,
  NuxieConfigureOptions,
  NuxieConfigurationOptions,
  NuxiePurchaseController,
  PurchaseRequest,
  ProfileResponse,
  RestoreRequest,
  TriggerOperation,
  TriggerOptions,
  TriggerTerminalUpdate,
  TriggerUpdate,
} from "./types";
import type {
  NuxieNativeEventMap,
  NuxieNativeEventName,
  NuxieNativeModule,
  NuxieNativeSubscription,
} from "./native-module";
import { resolveNativeModule } from "./native-module";

const WRAPPER_VERSION = "0.1.0";

export interface NuxieClientEventMap {
  triggerUpdate: NuxieNativeEventMap["onTriggerUpdate"];
  featureAccessChanged: FeatureAccessChangedEvent;
  purchaseRequest: PurchaseRequest;
  restoreRequest: RestoreRequest;
  flowPresented: FlowPresentedEvent;
  flowDismissed: FlowDismissedEvent;
}

interface TriggerOperationState {
  listeners: Set<(update: TriggerUpdate) => void>;
  resolve: (update: TriggerTerminalUpdate) => void;
  finished: boolean;
}

type ClientEventName = keyof NuxieClientEventMap;
type ClientListenerMap = {
  [K in ClientEventName]: Set<(payload: NuxieClientEventMap[K]) => void>;
};

type NuxieClientErrorCode = "MISSING_API_KEY";

const CLIENT_TO_NATIVE_EVENT: Record<ClientEventName, NuxieNativeEventName> = {
  triggerUpdate: "onTriggerUpdate",
  featureAccessChanged: "onFeatureAccessChanged",
  purchaseRequest: "onPurchaseRequest",
  restoreRequest: "onRestoreRequest",
  flowPresented: "onFlowPresented",
  flowDismissed: "onFlowDismissed",
};

function generateRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `trigger-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createClientError(code: NuxieClientErrorCode, message: string): Error & { code: NuxieClientErrorCode } {
  const error = new Error(message) as Error & { code: NuxieClientErrorCode };
  error.code = code;
  return error;
}

function isTerminalTriggerUpdate(update: TriggerUpdate): update is TriggerTerminalUpdate {
  if (update.kind === "error" || update.kind === "journey") {
    return true;
  }
  if (update.kind === "entitlement") {
    return update.entitlement.type === "allowed" || update.entitlement.type === "denied";
  }
  if (update.kind === "decision") {
    return (
      update.decision.type === "no_match" ||
      update.decision.type === "suppressed" ||
      update.decision.type === "allowed_immediate" ||
      update.decision.type === "denied_immediate"
    );
  }
  return false;
}

function cancelledUpdate(): TriggerTerminalUpdate {
  return {
    kind: "error",
    error: {
      code: "trigger_cancelled",
      message: "Trigger cancelled",
    },
  };
}

function startFailedUpdate(error: unknown): TriggerTerminalUpdate {
  const message = error instanceof Error ? error.message : "trigger_failed";
  return {
    kind: "error",
    error: {
      code: "trigger_start_failed",
      message,
    },
  };
}

export class NuxieClient {
  private readonly moduleResolver: () => Promise<NuxieNativeModule>;
  private modulePromise: Promise<NuxieNativeModule> | null = null;
  private triggerOperations = new Map<string, TriggerOperationState>();
  private nativeSubscriptions = new Map<NuxieNativeEventName, NuxieNativeSubscription>();
  private nativeSubscriptionPromises = new Map<NuxieNativeEventName, Promise<void>>();
  private purchaseController: NuxiePurchaseController | null = null;
  private configured = false;
  private configuring = false;
  private readonly listeners: ClientListenerMap = {
    triggerUpdate: new Set(),
    featureAccessChanged: new Set(),
    purchaseRequest: new Set(),
    restoreRequest: new Set(),
    flowPresented: new Set(),
    flowDismissed: new Set(),
  };

  constructor(moduleResolver: () => Promise<NuxieNativeModule> = resolveNativeModule) {
    this.moduleResolver = moduleResolver;
  }

  get isConfigured(): boolean {
    return this.configured;
  }

  get isConfiguring(): boolean {
    return this.configuring;
  }

  on<K extends ClientEventName>(
    eventName: K,
    listener: (payload: NuxieClientEventMap[K]) => void,
  ): () => void {
    this.listeners[eventName].add(listener);
    void this.ensureNativeSubscription(CLIENT_TO_NATIVE_EVENT[eventName]);
    return () => {
      this.listeners[eventName].delete(listener);
    };
  }

  setPurchaseController(controller: NuxiePurchaseController | null): void {
    this.purchaseController = controller;
    if (controller != null) {
      void this.ensureNativeSubscription("onPurchaseRequest");
      void this.ensureNativeSubscription("onRestoreRequest");
    }
  }

  private async module(): Promise<NuxieNativeModule> {
    if (this.modulePromise == null) {
      this.modulePromise = this.moduleResolver();
    }
    return this.modulePromise;
  }

  private emit<K extends ClientEventName>(eventName: K, payload: NuxieClientEventMap[K]): void {
    for (const listener of this.listeners[eventName]) {
      listener(payload);
    }
  }

  private async ensureNativeSubscription(eventName: NuxieNativeEventName): Promise<void> {
    if (this.nativeSubscriptions.has(eventName)) {
      return;
    }
    const pending = this.nativeSubscriptionPromises.get(eventName);
    if (pending != null) {
      await pending;
      return;
    }
    const createPromise = (async () => {
      const module = await this.module();
      if (this.nativeSubscriptions.has(eventName)) {
        return;
      }
      const subscription = module.addListener(eventName, (payload) => {
        this.routeNativeEvent(eventName, payload);
      });
      this.nativeSubscriptions.set(eventName, subscription);
    })();
    this.nativeSubscriptionPromises.set(eventName, createPromise);
    try {
      await createPromise;
    } finally {
      this.nativeSubscriptionPromises.delete(eventName);
    }
  }

  private routeNativeEvent(eventName: NuxieNativeEventName, payload: NuxieNativeEventMap[NuxieNativeEventName]): void {
    switch (eventName) {
      case "onTriggerUpdate": {
        const triggerPayload = payload as NuxieNativeEventMap["onTriggerUpdate"];
        this.handleTriggerUpdate(triggerPayload);
        this.emit("triggerUpdate", triggerPayload);
        return;
      }
      case "onFeatureAccessChanged": {
        this.emit("featureAccessChanged", payload as NuxieNativeEventMap["onFeatureAccessChanged"]);
        return;
      }
      case "onPurchaseRequest": {
        const purchasePayload = payload as NuxieNativeEventMap["onPurchaseRequest"];
        this.emit("purchaseRequest", purchasePayload);
        void this.handlePurchaseRequest(purchasePayload);
        return;
      }
      case "onRestoreRequest": {
        const restorePayload = payload as NuxieNativeEventMap["onRestoreRequest"];
        this.emit("restoreRequest", restorePayload);
        void this.handleRestoreRequest(restorePayload);
        return;
      }
      case "onFlowPresented": {
        this.emit("flowPresented", payload as NuxieNativeEventMap["onFlowPresented"]);
        return;
      }
      case "onFlowDismissed": {
        this.emit("flowDismissed", payload as NuxieNativeEventMap["onFlowDismissed"]);
        return;
      }
      default:
        return;
    }
  }

  private async handlePurchaseRequest(payload: NuxieNativeEventMap["onPurchaseRequest"]): Promise<void> {
    const controller = this.purchaseController;
    if (controller == null) {
      return;
    }
    const module = await this.module();
    try {
      const result = await controller.onPurchase(payload);
      await module.completePurchase(payload.requestId, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "purchase_failed";
      await module.completePurchase(payload.requestId, { type: "failed", message });
    }
  }

  private async handleRestoreRequest(payload: NuxieNativeEventMap["onRestoreRequest"]): Promise<void> {
    const controller = this.purchaseController;
    if (controller == null) {
      return;
    }
    const module = await this.module();
    try {
      const result = await controller.onRestore(payload);
      await module.completeRestore(payload.requestId, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "restore_failed";
      await module.completeRestore(payload.requestId, { type: "failed", message });
    }
  }

  private handleTriggerUpdate(payload: NuxieNativeEventMap["onTriggerUpdate"]): void {
    const operation = this.triggerOperations.get(payload.requestId);
    if (operation == null || operation.finished) {
      return;
    }

    for (const listener of operation.listeners) {
      listener(payload.update);
    }

    const terminal = payload.isTerminal === true || isTerminalTriggerUpdate(payload.update);
    if (!terminal) {
      return;
    }

    if (isTerminalTriggerUpdate(payload.update)) {
      operation.finished = true;
      this.triggerOperations.delete(payload.requestId);
      operation.resolve(payload.update);
      return;
    }

    const fallbackTerminal: TriggerTerminalUpdate = {
      kind: "error",
      error: {
        code: "invalid_terminal_update",
        message: "Native bridge marked a non-terminal trigger update as terminal.",
      },
    };
    operation.finished = true;
    this.triggerOperations.delete(payload.requestId);
    operation.resolve(fallbackTerminal);
  }

  async configure(options: NuxieConfigureOptions): Promise<void> {
    this.configuring = true;
    try {
      const module = await this.module();
      const explicitApiKey = options.apiKey?.trim();
      const defaultApiKey =
        explicitApiKey == null || explicitApiKey.length === 0
          ? await module.getDefaultApiKey?.().catch(() => null)
          : null;
      const apiKey = explicitApiKey && explicitApiKey.length > 0 ? explicitApiKey : defaultApiKey?.trim();
      if (apiKey == null || apiKey.length === 0) {
        throw createClientError(
          "MISSING_API_KEY",
          "Nuxie API key is required. Pass apiKey to configure() or set NUXIE_API_KEY via the Expo config plugin.",
        );
      }

      const config = toNativeConfiguration(options);
      const usePurchaseController = options.usePurchaseController === true || this.purchaseController != null;
      await module.configure(apiKey, config, usePurchaseController, WRAPPER_VERSION);
      await this.ensureNativeSubscription("onTriggerUpdate");
      await this.ensureNativeSubscription("onFeatureAccessChanged");
      if (usePurchaseController) {
        await this.ensureNativeSubscription("onPurchaseRequest");
        await this.ensureNativeSubscription("onRestoreRequest");
      }
      this.configured = true;
    } finally {
      this.configuring = false;
    }
  }

  async shutdown(): Promise<void> {
    const module = await this.module();
    await module.shutdown();
    this.configured = false;
    this.configuring = false;
    this.nativeSubscriptionPromises.clear();

    for (const [, subscription] of this.nativeSubscriptions) {
      subscription.remove();
    }
    this.nativeSubscriptions.clear();
    for (const [, operation] of this.triggerOperations) {
      if (!operation.finished) {
        operation.resolve(cancelledUpdate());
      }
    }
    this.triggerOperations.clear();
  }

  async identify(
    distinctId: string,
    opts?: {
      userProperties?: Record<string, unknown>;
      userPropertiesSetOnce?: Record<string, unknown>;
    },
  ): Promise<void> {
    const module = await this.module();
    await module.identify(distinctId, opts?.userProperties, opts?.userPropertiesSetOnce);
  }

  async reset(opts?: { keepAnonymousId?: boolean }): Promise<void> {
    const module = await this.module();
    await module.reset(opts?.keepAnonymousId);
  }

  async getDistinctId(): Promise<string> {
    const module = await this.module();
    return module.getDistinctId();
  }

  async getAnonymousId(): Promise<string> {
    const module = await this.module();
    return module.getAnonymousId();
  }

  async isIdentified(): Promise<boolean> {
    const module = await this.module();
    return module.getIsIdentified();
  }

  trigger(eventName: string, opts?: TriggerOptions): TriggerOperation {
    const requestId = generateRequestId();
    let resolveDone: ((update: TriggerTerminalUpdate) => void) | null = null;
    const done = new Promise<TriggerTerminalUpdate>((resolve) => {
      resolveDone = resolve;
    });
    const state: TriggerOperationState = {
      listeners: new Set(),
      resolve: (update) => {
        if (resolveDone != null) {
          resolveDone(update);
        }
      },
      finished: false,
    };
    this.triggerOperations.set(requestId, state);

    void (async () => {
      try {
        await this.ensureNativeSubscription("onTriggerUpdate");
        const module = await this.module();
        await module.startTrigger(requestId, eventName, opts);
      } catch (error) {
        const update = startFailedUpdate(error);
        for (const listener of state.listeners) {
          listener(update);
        }
        state.finished = true;
        this.triggerOperations.delete(requestId);
        state.resolve(update);
      }
    })();

    return {
      requestId,
      cancel: async () => {
        const existing = this.triggerOperations.get(requestId);
        if (existing == null || existing.finished) {
          return;
        }
        const module = await this.module();
        await module.cancelTrigger(requestId);
        const update = cancelledUpdate();
        for (const listener of existing.listeners) {
          listener(update);
        }
        existing.finished = true;
        this.triggerOperations.delete(requestId);
        existing.resolve(update);
      },
      onUpdate: (listener) => {
        state.listeners.add(listener);
        return () => {
          state.listeners.delete(listener);
        };
      },
      done,
    };
  }

  async triggerOnce(eventName: string, opts?: TriggerOptions): Promise<TriggerTerminalUpdate> {
    return this.trigger(eventName, opts).done;
  }

  async showFlow(flowId: string): Promise<void> {
    const module = await this.module();
    await module.showFlow(flowId);
  }

  async refreshProfile(): Promise<ProfileResponse> {
    const module = await this.module();
    return module.refreshProfile();
  }

  async hasFeature(featureId: string, opts?: { requiredBalance?: number; entityId?: string }): Promise<FeatureAccess> {
    const module = await this.module();
    return module.hasFeature(featureId, opts?.requiredBalance, opts?.entityId);
  }

  async getCachedFeature(featureId: string, opts?: { entityId?: string }): Promise<FeatureAccess | null> {
    const module = await this.module();
    return module.getCachedFeature(featureId, opts?.entityId);
  }

  async checkFeature(
    featureId: string,
    opts?: { requiredBalance?: number; entityId?: string },
  ): Promise<FeatureCheckResult> {
    const module = await this.module();
    return module.checkFeature(featureId, opts?.requiredBalance, opts?.entityId);
  }

  async refreshFeature(
    featureId: string,
    opts?: { requiredBalance?: number; entityId?: string },
  ): Promise<FeatureCheckResult> {
    const module = await this.module();
    return module.refreshFeature(featureId, opts?.requiredBalance, opts?.entityId);
  }

  async useFeature(
    featureId: string,
    opts?: { amount?: number; entityId?: string; metadata?: Record<string, unknown> },
  ): Promise<void> {
    const module = await this.module();
    await module.useFeature(featureId, opts?.amount, opts?.entityId, opts?.metadata);
  }

  async useFeatureAndWait(
    featureId: string,
    opts?: { amount?: number; entityId?: string; setUsage?: boolean; metadata?: Record<string, unknown> },
  ): Promise<FeatureUsageResult> {
    const module = await this.module();
    return module.useFeatureAndWait(featureId, opts?.amount, opts?.entityId, opts?.setUsage, opts?.metadata);
  }

  async flushEvents(): Promise<boolean> {
    const module = await this.module();
    return module.flushEvents();
  }

  async getQueuedEventCount(): Promise<number> {
    const module = await this.module();
    return module.getQueuedEventCount();
  }

  async pauseEventQueue(): Promise<void> {
    const module = await this.module();
    await module.pauseEventQueue();
  }

  async resumeEventQueue(): Promise<void> {
    const module = await this.module();
    await module.resumeEventQueue();
  }
}

function toNativeConfiguration(config: NuxieConfigureOptions): NuxieConfigurationOptions {
  const {
    apiKey: _apiKey,
    usePurchaseController: _usePurchaseController,
    ...nativeConfig
  } = config;
  return nativeConfig;
}
