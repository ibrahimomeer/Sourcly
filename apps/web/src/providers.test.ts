import { PROVIDER_NAMES, type ProviderId } from "@sourcly/core";
import { describe, expect, it } from "vitest";
import {
  createProviders,
  DEFAULT_PROVIDERS,
  PROVIDER_OPTIONS,
  skippedStatuses,
  UNAVAILABLE_PROVIDERS,
} from "./providers";

const context = { openAlexApiKey: "", contactEmail: "" };

describe("provider registry", () => {
  it("lists nine sources that work from a browser, each with a name and a plain description", () => {
    expect(PROVIDER_OPTIONS.map((option) => option.id)).toEqual([
      "openalex", "crossref", "pubmed", "europepmc", "doaj", "datacite", "zenodo", "wikipedia", "semanticscholar",
    ]);
    for (const option of PROVIDER_OPTIONS) {
      expect(option.name).toBe(PROVIDER_NAMES[option.id]);
      expect(option.description.length).toBeGreaterThan(20);
    }
  });

  it("switches every available source on by default", () => {
    expect([...DEFAULT_PROVIDERS]).toEqual(PROVIDER_OPTIONS.map((option) => option.id));
  });

  it("builds a provider for each id, with matching ids, in the listed order", () => {
    const providers = createProviders([...DEFAULT_PROVIDERS], context);
    expect(providers.map((provider) => provider.id)).toEqual(PROVIDER_OPTIONS.map((option) => option.id));
    expect(providers.map((provider) => provider.name)).toEqual(PROVIDER_OPTIONS.map((option) => option.name));
  });

  it("builds only the providers that are switched on, in the listed order whatever the selection order", () => {
    const selected: ProviderId[] = ["zenodo", "openalex", "pubmed"];
    expect(createProviders(selected, context).map((provider) => provider.id)).toEqual(["openalex", "pubmed", "zenodo"]);
    expect(createProviders([], context)).toEqual([]);
  });

  it("never builds a provider for a source that was found unusable from a browser", () => {
    const ids = createProviders(["arxiv", "openalex"], context).map((provider) => provider.id);
    expect(ids).toEqual(["openalex"]);
  });
});

describe("unavailable sources", () => {
  it("lists arXiv with the reason it cannot be used", () => {
    expect(UNAVAILABLE_PROVIDERS.map((provider) => provider.id)).toEqual(["arxiv"]);
    expect(UNAVAILABLE_PROVIDERS[0]?.reason).toMatch(/CORS/);
  });

  it("reports each one as skipped in every search, so a gap is never silent", () => {
    expect(skippedStatuses()).toEqual([
      {
        provider: "arxiv",
        state: "skipped",
        message: "arXiv's API does not allow requests from a web page, so it cannot be searched here",
      },
    ]);
  });

  it("does not overlap with the usable sources", () => {
    const usable = new Set(PROVIDER_OPTIONS.map((option) => option.id));
    for (const provider of UNAVAILABLE_PROVIDERS) expect(usable.has(provider.id)).toBe(false);
  });
});
