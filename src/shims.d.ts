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
