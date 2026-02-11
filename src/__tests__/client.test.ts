import { describe, expect, test } from "bun:test";
import { NuxieClient } from "../client";
import { TestNativeModule, triggerUpdate } from "./test-native-module";
import type { TriggerTerminalUpdate } from "../types";

async function waitFor(predicate: () => boolean, timeoutMs = 250): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("waitFor timeout");
}

describe("NuxieClient", () => {
  test("configure forwards api key and options to native module", async () => {
    const module = new TestNativeModule();
    const client = new NuxieClient(async () => module);

    await client.configure({
      apiKey: "NX_TEST",
      environment: "staging",
      flushAt: 5,
      usePurchaseController: true,
    });

    expect(module.configureArgs).toEqual({
      apiKey: "NX_TEST",
      options: {
        environment: "staging",
        flushAt: 5,
      },
      usePurchaseController: true,
      wrapperVersion: "0.1.0",
    });
    expect(client.isConfigured).toBe(true);
  });

  test("trigger resolves only when a terminal update is emitted", async () => {
    const module = new TestNativeModule();
    const client = new NuxieClient(async () => module);
    const op = client.trigger("premium_tapped");

    const updates: string[] = [];
    op.onUpdate((update) => {
      updates.push(update.kind);
    });

    await waitFor(() => module.triggerStarts.length === 1);
    expect(module.triggerStarts.length).toBe(1);
    const requestId = module.triggerStarts[0]!.requestId;

    module.emit(
      "onTriggerUpdate",
      triggerUpdate(requestId, {
        kind: "entitlement",
        entitlement: { type: "pending" },
      }),
    );
    module.emit(
      "onTriggerUpdate",
      triggerUpdate(requestId, {
        kind: "decision",
        decision: {
          type: "flow_shown",
          ref: { journeyId: "j1", campaignId: "c1", flowId: "f1" },
        },
      }),
    );

    let settled = false;
    void op.done.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    const terminal: TriggerTerminalUpdate = {
      kind: "entitlement",
      entitlement: { type: "allowed", source: "purchase" },
    };
    module.emit("onTriggerUpdate", triggerUpdate(requestId, terminal));
    const result = await op.done;

    expect(result).toEqual(terminal);
    expect(updates).toEqual(["entitlement", "decision", "entitlement"]);
  });

  test("trigger can be cancelled and resolves as cancelled error", async () => {
    const module = new TestNativeModule();
    const client = new NuxieClient(async () => module);
    const op = client.trigger("premium_tapped");

    await waitFor(() => module.triggerStarts.length === 1);
    expect(module.triggerStarts.length).toBe(1);
    const requestId = module.triggerStarts[0]!.requestId;
    await op.cancel();

    expect(module.cancelledRequestIds).toEqual([requestId]);
    expect(await op.done).toEqual({
      kind: "error",
      error: {
        code: "trigger_cancelled",
        message: "Trigger cancelled",
      },
    });
  });

  test("trigger emits start error when native start fails", async () => {
    const module = new TestNativeModule();
    module.throwOnStartTrigger = true;

    const client = new NuxieClient(async () => module);
    const op = client.trigger("premium_tapped");
    const result = await op.done;

    expect(result).toEqual({
      kind: "error",
      error: {
        code: "trigger_start_failed",
        message: "start failed",
      },
    });
  });

  test("triggerOnce returns terminal update", async () => {
    const module = new TestNativeModule();
    const client = new NuxieClient(async () => module);

    const terminalPromise = client.triggerOnce("event_one");
    await waitFor(() => module.triggerStarts.length === 1);
    const requestId = module.triggerStarts[0]!.requestId;
    module.emit(
      "onTriggerUpdate",
      triggerUpdate(requestId, {
        kind: "decision",
        decision: { type: "allowed_immediate" },
      }),
    );

    await expect(terminalPromise).resolves.toEqual({
      kind: "decision",
      decision: { type: "allowed_immediate" },
    });
  });

  test("client forwards feature change and trigger update events to listeners", async () => {
    const module = new TestNativeModule();
    const client = new NuxieClient(async () => module);

    const triggerEvents: string[] = [];
    const featureEvents: string[] = [];

    const unsubTrigger = client.on("triggerUpdate", (payload) => {
      triggerEvents.push(payload.requestId);
    });
    const unsubFeature = client.on("featureAccessChanged", (payload) => {
      featureEvents.push(payload.featureId);
    });

    const op = client.trigger("event_with_listener");
    await waitFor(() => module.triggerStarts.length === 1);
    const requestId = module.triggerStarts[0]!.requestId;

    module.emit("onTriggerUpdate", triggerUpdate(requestId, { kind: "decision", decision: { type: "allowed_immediate" } }));
    module.emit("onFeatureAccessChanged", {
      featureId: "pro_export",
      from: null,
      to: { allowed: true, unlimited: false, balance: 10, type: "metered" },
      timestampMs: Date.now(),
    });

    await op.done;
    unsubTrigger();
    unsubFeature();

    expect(triggerEvents).toEqual([requestId]);
    expect(featureEvents).toEqual(["pro_export"]);
  });

  test("purchase controller receives purchase and restore requests and completes native callbacks", async () => {
    const module = new TestNativeModule();
    const client = new NuxieClient(async () => module);

    client.setPurchaseController({
      async onPurchase(request) {
        expect(request.productId).toBe("sku_premium");
        return { type: "success", productId: request.productId, purchaseToken: "tok_123" };
      },
      async onRestore() {
        return { type: "success", restoredCount: 2 };
      },
    });
    await client.configure({ apiKey: "NX_TEST", usePurchaseController: true });

    module.emit("onPurchaseRequest", {
      requestId: "p_1",
      platform: "android",
      productId: "sku_premium",
      basePlanId: null,
      offerId: null,
      timestampMs: Date.now(),
    });
    module.emit("onRestoreRequest", {
      requestId: "r_1",
      platform: "android",
      timestampMs: Date.now(),
    });

    await waitFor(() => module.completedPurchases.length === 1);
    await waitFor(() => module.completedRestores.length === 1);

    expect(module.completedPurchases[0]).toEqual({
      requestId: "p_1",
      result: {
        type: "success",
        productId: "sku_premium",
        purchaseToken: "tok_123",
      },
    });
    expect(module.completedRestores[0]).toEqual({
      requestId: "r_1",
      result: {
        type: "success",
        restoredCount: 2,
      },
    });
  });

  test("purchase controller failures map to failed completion payloads", async () => {
    const module = new TestNativeModule();
    const client = new NuxieClient(async () => module);

    client.setPurchaseController({
      async onPurchase() {
        throw new Error("rc unavailable");
      },
      async onRestore() {
        throw new Error("restore unavailable");
      },
    });
    await client.configure({ apiKey: "NX_TEST", usePurchaseController: true });

    module.emit("onPurchaseRequest", {
      requestId: "p_2",
      platform: "ios",
      productId: "sku_2",
      timestampMs: Date.now(),
    });
    module.emit("onRestoreRequest", {
      requestId: "r_2",
      platform: "ios",
      timestampMs: Date.now(),
    });

    await waitFor(() => module.completedPurchases.length === 1);
    await waitFor(() => module.completedRestores.length === 1);

    expect(module.completedPurchases[0]).toEqual({
      requestId: "p_2",
      result: {
        type: "failed",
        message: "rc unavailable",
      },
    });
    expect(module.completedRestores[0]).toEqual({
      requestId: "r_2",
      result: {
        type: "failed",
        message: "restore unavailable",
      },
    });
  });
});
