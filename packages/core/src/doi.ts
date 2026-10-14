const DOI_PREFIX = /^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/i;
const DOI_SHAPE = /^10\.\d{4,9}\/\S+$/;

/**
 * Reduces any common way of writing a DOI ("https://doi.org/10.1/X", "doi:10.1/X",
 * "10.1/X") to the bare, lowercase form "10.1/x". DOIs are case-insensitive, so
 * lowercasing makes them safe to compare. Returns null for anything that does
 * not look like a DOI.
 */
export function normalizeDoi(input: string | null | undefined): string | null {
  if (input == null) return null;
  const bare = input.trim().replace(DOI_PREFIX, "").toLowerCase();
  return DOI_SHAPE.test(bare) ? bare : null;
}

/** The https URL form of a normalized DOI, as APA 7 expects. */
export function doiUrl(doi: string): string {
  return `https://doi.org/${doi}`;
}
