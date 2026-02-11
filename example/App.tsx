import { StatusBar } from "expo-status-bar";
import React, { useMemo, useState } from "react";
import { Button, Platform, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  NuxieProvider,
  useFeature,
  useNuxieClient,
  useNuxieEvents,
  useTrigger,
  type NuxiePurchaseController,
} from "@nuxie/react-native";

const purchaseController: NuxiePurchaseController = {
  async onPurchase(request) {
    return {
      type: "cancelled",
      productId: request.productId,
    };
  },
  async onRestore() {
    return { type: "no_purchases" };
  },
};

function DemoScreen() {
  const client = useNuxieClient();
  const trigger = useTrigger();
  const feature = useFeature("pro_export", { refreshOnMount: true });

  const [identity, setIdentity] = useState("(unknown)");
  const [logs, setLogs] = useState<string[]>([]);

  const appendLog = (message: string) => {
    setLogs((prev) => {
      const next = [`${new Date().toISOString()} ${message}`, ...prev];
      return next.slice(0, 20);
    });
  };

  useNuxieEvents({
    onTriggerUpdate(payload) {
      appendLog(`trigger ${payload.requestId}: ${payload.update.kind}`);
    },
    onFeatureAccessChanged(payload) {
      appendLog(`feature ${payload.featureId}: allowed=${payload.to.allowed}`);
    },
    onPurchaseRequest(payload) {
      appendLog(`purchase request ${payload.requestId} for ${payload.productId}`);
    },
    onRestoreRequest(payload) {
      appendLog(`restore request ${payload.requestId}`);
    },
    onFlowPresented(payload) {
      appendLog(`flow presented ${payload.flowId}`);
    },
    onFlowDismissed(payload) {
      appendLog(`flow dismissed ${payload.flowId ?? "unknown"} reason=${payload.reason ?? "none"}`);
    },
  });

  const triggerSummary = useMemo(() => {
    if (trigger.terminalUpdate == null) {
      return "(none)";
    }
    return JSON.stringify(trigger.terminalUpdate);
  }, [trigger.terminalUpdate]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="auto" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Nuxie React Native SDK Example</Text>
        <Text>Platform: {Platform.OS}</Text>
        <Text>Configured: {String(client.isConfigured)}</Text>
        <Text>Feature loading: {String(feature.isLoading)}</Text>
        <Text>Feature allowed: {String(feature.value?.allowed ?? false)}</Text>
        <Text>Feature balance: {String(feature.value?.balance ?? "n/a")}</Text>
        <Text>Identity: {identity}</Text>
        <Text>Trigger running: {String(trigger.isRunning)}</Text>
        <Text>Trigger terminal: {triggerSummary}</Text>

        <View style={styles.buttons}>
          <Button
            title="Identify User"
            onPress={() => {
              void (async () => {
                const distinctId = `example_${Date.now()}`;
                await client.identify(distinctId, {
                  userProperties: { plan: "free" },
                });
                setIdentity(await client.getDistinctId());
                appendLog(`identified ${distinctId}`);
              })().catch((error) => appendLog(`identify failed: ${String(error)}`));
            }}
          />
          <Button
            title="Run Trigger"
            onPress={() => {
              void trigger
                .run("paywall_opened", {
                  properties: { source: "example_button" },
                })
                .then((terminal) => appendLog(`trigger done ${terminal.kind}`))
                .catch((error) => appendLog(`trigger failed: ${String(error)}`));
            }}
          />
          <Button
            title="Check Feature"
            onPress={() => {
              void feature.refresh().then(() => appendLog("feature refreshed"));
            }}
          />
          <Button
            title="Show Flow"
            onPress={() => {
              void client.showFlow("example_flow").catch((error) => appendLog(`showFlow failed: ${String(error)}`));
            }}
          />
        </View>

        <Text style={styles.subtitle}>Recent Events</Text>
        {logs.length === 0 ? <Text>(no events yet)</Text> : null}
        {logs.map((line, idx) => (
          <Text key={`${line}-${idx}`} style={styles.logLine}>
            {line}
          </Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

export default function App() {
  const [configureError, setConfigureError] = useState<string | null>(null);

  return (
    <NuxieProvider
      config={{
        environment: "development",
        logLevel: "debug",
        usePurchaseController: true,
      }}
      purchaseController={purchaseController}
      onConfigureError={(error) => {
        const message = error instanceof Error ? error.message : String(error);
        setConfigureError(message);
      }}
    >
      <DemoScreen />
      {configureError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>Configure error: {configureError}</Text>
        </View>
      ) : null}
    </NuxieProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  content: {
    padding: 16,
    gap: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 4,
  },
  subtitle: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: "600",
  },
  buttons: {
    marginTop: 8,
    gap: 10,
  },
  logLine: {
    fontSize: 12,
  },
  errorBanner: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#fee2e2",
    borderTopWidth: 1,
    borderTopColor: "#ef4444",
  },
  errorText: {
    color: "#991b1b",
    fontSize: 12,
  },
});
