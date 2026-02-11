import { useCallback, useEffect, useMemo, useState } from "react";
import type { FeatureAccess, FeatureCheckResult } from "./types";
import { useNuxieClient } from "./react-context";

export interface UseFeatureOptions {
  requiredBalance?: number;
  entityId?: string;
  refreshOnMount?: boolean;
}

export interface UseFeatureResult {
  value: FeatureAccess | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<FeatureCheckResult>;
}

function toFeatureAccess(result: FeatureCheckResult): FeatureAccess {
  return {
    allowed: result.allowed,
    unlimited: result.unlimited,
    balance: result.balance ?? null,
    type: result.type,
  };
}

export function useFeature(featureId: string, options: UseFeatureOptions = {}): UseFeatureResult {
  const client = useNuxieClient();
  const [value, setValue] = useState<FeatureAccess | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    const result = await client.refreshFeature(featureId, {
      requiredBalance: options.requiredBalance,
      entityId: options.entityId,
    });
    const access = toFeatureAccess(result);
    setValue(access);
    setError(null);
    return result;
  }, [client, featureId, options.entityId, options.requiredBalance]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    void (async () => {
      try {
        const access = await client.hasFeature(featureId, {
          requiredBalance: options.requiredBalance,
          entityId: options.entityId,
        });
        if (!cancelled) {
          setValue(access);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError : new Error("feature_check_failed"));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }

      if (options.refreshOnMount === true && !cancelled) {
        await refresh().catch(() => {
          // Keep best-effort refresh errors isolated from initial load.
        });
      }
    })();

    const unsubscribe = client.on("featureAccessChanged", (payload) => {
      if (payload.featureId !== featureId) {
        return;
      }
      setValue(payload.to);
      setError(null);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [client, featureId, options.entityId, options.refreshOnMount, options.requiredBalance, refresh]);

  return useMemo(
    () => ({
      value,
      isLoading,
      error,
      refresh,
    }),
    [value, isLoading, error, refresh],
  );
}
