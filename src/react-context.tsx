import { createContext, useContext, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { NuxieClient } from "./client";
import { Nuxie } from "./singleton";
import type { NuxieConfigureOptions, NuxiePurchaseController } from "./types";

interface NuxieContextValue {
  client: NuxieClient;
}

const NuxieContext = createContext<NuxieContextValue | null>(null);

export interface NuxieProviderProps {
  children: ReactNode;
  config?: NuxieConfigureOptions;
  purchaseController?: NuxiePurchaseController | null;
  client?: NuxieClient;
  onConfigureError?: (error: unknown) => void;
}

export function NuxieProvider({
  children,
  config,
  purchaseController = null,
  client = Nuxie,
  onConfigureError,
}: NuxieProviderProps): any {
  useEffect(() => {
    client.setPurchaseController(purchaseController);
    return () => {
      if (purchaseController != null) {
        client.setPurchaseController(null);
      }
    };
  }, [client, purchaseController]);

  useEffect(() => {
    if (config == null) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        await client.configure(config);
      } catch (error) {
        if (cancelled) {
          return;
        }
        onConfigureError?.(error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, config, onConfigureError]);

  const value = useMemo<NuxieContextValue>(() => ({ client }), [client]);
  return <NuxieContext.Provider value={value}>{children}</NuxieContext.Provider>;
}

export function useNuxieClient(): NuxieClient {
  const ctx = useContext(NuxieContext) as NuxieContextValue | null;
  return ctx?.client ?? Nuxie;
}
