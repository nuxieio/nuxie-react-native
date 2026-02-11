import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TriggerOperation, TriggerOptions, TriggerTerminalUpdate, TriggerUpdate } from "./types";
import { useNuxieClient } from "./react-context";

export interface UseTriggerResult {
  isRunning: boolean;
  lastUpdate: TriggerUpdate | null;
  terminalUpdate: TriggerTerminalUpdate | null;
  error: Error | null;
  run: (eventName: string, options?: TriggerOptions) => Promise<TriggerTerminalUpdate>;
  cancel: () => Promise<void>;
}

export function useTrigger(): UseTriggerResult {
  const client = useNuxieClient();
  const operationRef = useRef<TriggerOperation | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<TriggerUpdate | null>(null);
  const [terminalUpdate, setTerminalUpdate] = useState<TriggerTerminalUpdate | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const cancel = useCallback(async () => {
    const operation = operationRef.current;
    if (operation == null) {
      return;
    }
    operationRef.current = null;
    await operation.cancel();
    setIsRunning(false);
  }, []);

  const run = useCallback(
    async (eventName: string, options?: TriggerOptions) => {
      await cancel();
      setIsRunning(true);
      setLastUpdate(null);
      setTerminalUpdate(null);
      setError(null);

      const operation = client.trigger(eventName, options);
      operationRef.current = operation;
      const unsubscribe = operation.onUpdate((update) => {
        setLastUpdate(update);
        if (update.kind === "error") {
          setError(new Error(update.error.message));
        }
      });

      try {
        const done = await operation.done;
        setTerminalUpdate(done);
        if (done.kind === "error") {
          setError(new Error(done.error.message));
        } else {
          setError(null);
        }
        return done;
      } finally {
        unsubscribe();
        if (operationRef.current?.requestId === operation.requestId) {
          operationRef.current = null;
        }
        setIsRunning(false);
      }
    },
    [cancel, client],
  );

  useEffect(() => {
    return () => {
      const operation = operationRef.current;
      operationRef.current = null;
      if (operation != null) {
        void operation.cancel();
      }
    };
  }, []);

  return useMemo(
    () => ({
      isRunning,
      lastUpdate,
      terminalUpdate,
      error,
      run,
      cancel,
    }),
    [cancel, error, isRunning, lastUpdate, run, terminalUpdate],
  );
}
