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
});
