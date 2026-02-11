import { useEffect } from "react";
import type { NuxieClientEventMap } from "./client";
import { useNuxieClient } from "./react-context";

export interface NuxieEventCallbacks {
  onTriggerUpdate?: (payload: NuxieClientEventMap["triggerUpdate"]) => void;
  onFeatureAccessChanged?: (payload: NuxieClientEventMap["featureAccessChanged"]) => void;
  onPurchaseRequest?: (payload: NuxieClientEventMap["purchaseRequest"]) => void;
  onRestoreRequest?: (payload: NuxieClientEventMap["restoreRequest"]) => void;
  onFlowPresented?: (payload: NuxieClientEventMap["flowPresented"]) => void;
  onFlowDismissed?: (payload: NuxieClientEventMap["flowDismissed"]) => void;
}

export function useNuxieEvents(callbacks: NuxieEventCallbacks = {}): void {
  const client = useNuxieClient();

  useEffect(() => {
    const unsubscribers: Array<() => void> = [];

    if (callbacks.onTriggerUpdate != null) {
      unsubscribers.push(client.on("triggerUpdate", callbacks.onTriggerUpdate));
    }
    if (callbacks.onFeatureAccessChanged != null) {
      unsubscribers.push(client.on("featureAccessChanged", callbacks.onFeatureAccessChanged));
    }
    if (callbacks.onPurchaseRequest != null) {
      unsubscribers.push(client.on("purchaseRequest", callbacks.onPurchaseRequest));
    }
    if (callbacks.onRestoreRequest != null) {
      unsubscribers.push(client.on("restoreRequest", callbacks.onRestoreRequest));
    }
    if (callbacks.onFlowPresented != null) {
      unsubscribers.push(client.on("flowPresented", callbacks.onFlowPresented));
    }
    if (callbacks.onFlowDismissed != null) {
      unsubscribers.push(client.on("flowDismissed", callbacks.onFlowDismissed));
    }

    return () => {
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
    };
  }, [client, callbacks]);
}
