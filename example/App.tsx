import React from "react";
import { Button, SafeAreaView, Text } from "react-native";
import { NuxieProvider, useFeature, useTrigger } from "@nuxie/react-native";

function DemoScreen() {
  const feature = useFeature("pro_export", { refreshOnMount: true });
  const trigger = useTrigger();

  return (
    <SafeAreaView style={{ padding: 16, gap: 12 }}>
      <Text>pro_export allowed: {String(feature.value?.allowed ?? false)}</Text>
      <Button
        title={trigger.isRunning ? "Running..." : "Trigger Paywall"}
        onPress={() => {
          void trigger.run("paywall_opened", { properties: { source: "demo" } });
        }}
      />
      <Text>Last update: {trigger.lastUpdate?.kind ?? "none"}</Text>
      <Text>Terminal: {trigger.terminalUpdate?.kind ?? "none"}</Text>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <NuxieProvider
      config={{
        apiKey: "NX_PROD_REPLACE_ME",
        environment: "production",
      }}
    >
      <DemoScreen />
    </NuxieProvider>
  );
}
