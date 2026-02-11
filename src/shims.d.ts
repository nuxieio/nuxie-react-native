declare module "expo" {
  export function requireNativeModule<T = unknown>(name: string): T;
}

declare module "react-native" {
  export const NativeModules: Record<string, unknown>;

  export class NativeEventEmitter {
    constructor(nativeModule?: unknown);
    addListener(eventName: string, listener: (payload: unknown) => void): { remove: () => void };
  }
}

declare module "react" {
  export type ReactNode = unknown;
  export type JSX = { Element: unknown };

  export function createContext<T>(defaultValue: T): {
    Provider: (props: { value: T; children?: ReactNode }) => JSX["Element"];
  };
  export function useContext<T>(ctx: unknown): T;
  export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useMemo<T>(factory: () => T, deps: readonly unknown[]): T;
  export function useCallback<T extends (...args: never[]) => unknown>(fn: T, deps: readonly unknown[]): T;
  export function useRef<T>(value: T): { current: T };
  export function useState<T>(value: T): [T, (next: T) => void];
}

declare module "react/jsx-runtime" {
  export const Fragment: unique symbol;
  export function jsx(type: unknown, props: unknown, key?: string): unknown;
  export function jsxs(type: unknown, props: unknown, key?: string): unknown;
}
