import { createOpenAlexProvider, type Provider, type ProviderId } from "@sourcly/core";

export interface ProviderOption {
  id: ProviderId;
  name: string;
  description: string;
}

/** The sources the user can switch on and off. New providers are added here. */
export const PROVIDER_OPTIONS: readonly ProviderOption[] = [
  {
    id: "openalex",
    name: "OpenAlex",
    description: "A large open index of scholarly works in every field.",
  },
];

/** Provider ids switched on until the user changes it. */
export const DEFAULT_PROVIDERS: readonly ProviderId[] = ["openalex"];

export interface ProviderContext {
  /** The user's optional OpenAlex key; "" for none. */
  openAlexApiKey: string;
}

/** Builds the providers for the ids the user switched on, in a stable order. */
export function createProviders(enabled: readonly ProviderId[], context: ProviderContext): Provider[] {
  return PROVIDER_OPTIONS.filter((option) => enabled.includes(option.id)).map((option) => {
    switch (option.id) {
      case "openalex":
        return createOpenAlexProvider({ apiKey: context.openAlexApiKey });
      default:
        throw new Error(`No provider is wired up for "${option.id}"`);
    }
  });
}
