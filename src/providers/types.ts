export type ProviderMode = "mock" | "real";

export interface ProviderRuntime {
  name: string;
  mode: ProviderMode;
  isConfigured: boolean;
}

export interface ExternalProvider<Input, Output> extends ProviderRuntime {
  invoke(input: Input): Promise<Output>;
}

export interface ProviderFactoryOptions {
  mode?: ProviderMode;
}

export function envFlag(value: string | undefined) {
  return Boolean(value && value.trim().length > 0);
}

export function notImplementedProviderError(providerName: string) {
  return new Error(
    `${providerName} real provider is reserved but not implemented yet. The default provider remains mock-only.`
  );
}
