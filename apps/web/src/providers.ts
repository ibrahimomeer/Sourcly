import {
  createCrossrefProvider,
  createDataCiteProvider,
  createDoajProvider,
  createEuropePmcProvider,
  createOpenAlexProvider,
  createPubmedProvider,
  createSemanticScholarProvider,
  createWikipediaProvider,
  createZenodoProvider,
  type Provider,
  type ProviderId,
  type ProviderStatus,
} from "@sourcly/core";

export interface ProviderOption {
  id: ProviderId;
  name: string;
  description: string;
}

/** The sources the user can switch on and off, in the order they are listed. */
export const PROVIDER_OPTIONS: readonly ProviderOption[] = [
  { id: "openalex", name: "OpenAlex", description: "A large open index of scholarly works in every field." },
  { id: "crossref", name: "Crossref", description: "DOIs registered by publishers. Strong on metadata, light on abstracts." },
  { id: "pubmed", name: "PubMed", description: "Biomedical and life-science literature from the U.S. National Library of Medicine." },
  { id: "europepmc", name: "Europe PMC", description: "Life-science articles and preprints, with citation counts and free full-text links." },
  { id: "doaj", name: "DOAJ", description: "Journals that are fully open access." },
  { id: "datacite", name: "DataCite", description: "Datasets, theses and other deposits in repositories, each with a DOI." },
  { id: "zenodo", name: "Zenodo", description: "Whatever researchers upload: papers, datasets, software. At most 25 results per search." },
  { id: "wikipedia", name: "Wikipedia", description: "An encyclopedia, included as an example of a tertiary source. At most 20 pages per search." },
  {
    id: "semanticscholar",
    name: "Semantic Scholar",
    description: "Its free shared pool is often busy and may refuse requests; if so, that is shown as a status.",
  },
];

/** Provider ids switched on until the user changes it: every source that works from a browser. */
export const DEFAULT_PROVIDERS: readonly ProviderId[] = PROVIDER_OPTIONS.map((option) => option.id);

export interface UnavailableProvider {
  id: ProviderId;
  name: string;
  /** Shown in Settings. */
  reason: string;
  /** Shown as the status after a search. */
  statusMessage: string;
}

/** Sources that were checked and cannot be used from a browser. They are shown, not silently dropped. */
export const UNAVAILABLE_PROVIDERS: readonly UnavailableProvider[] = [
  {
    id: "arxiv",
    name: "arXiv",
    reason:
      "arXiv's search API sends no CORS headers (checked), and its manual says it is not intended for use inside a web browser, so a browser cannot read its answers. OpenAlex indexes many arXiv preprints.",
    statusMessage: "arXiv's API does not allow requests from a web page, so it cannot be searched here",
  },
];

/** Statuses for the unavailable sources, added to every search so a gap is never silent. */
export function skippedStatuses(): ProviderStatus[] {
  return UNAVAILABLE_PROVIDERS.map((provider) => ({
    provider: provider.id,
    state: "skipped",
    message: provider.statusMessage,
  }));
}

export interface ProviderContext {
  /** The user's optional OpenAlex key; "" for none. */
  openAlexApiKey: string;
  /** config.contactEmail; "" for none. Sent only to providers that offer a faster pool for it. */
  contactEmail: string;
}

function create(id: ProviderId, context: ProviderContext): Provider {
  switch (id) {
    case "openalex":
      return createOpenAlexProvider({ apiKey: context.openAlexApiKey });
    case "crossref":
      return createCrossrefProvider({ mailto: context.contactEmail });
    case "pubmed":
      return createPubmedProvider({ email: context.contactEmail });
    case "europepmc":
      return createEuropePmcProvider();
    case "doaj":
      return createDoajProvider();
    case "datacite":
      return createDataCiteProvider();
    case "zenodo":
      return createZenodoProvider();
    case "wikipedia":
      return createWikipediaProvider();
    case "semanticscholar":
      return createSemanticScholarProvider();
    default:
      throw new Error(`No provider is wired up for "${id}"`);
  }
}

/** Builds the providers for the ids the user switched on, in the order they are listed. */
export function createProviders(enabled: readonly ProviderId[], context: ProviderContext): Provider[] {
  return PROVIDER_OPTIONS.filter((option) => enabled.includes(option.id)).map((option) => create(option.id, context));
}
