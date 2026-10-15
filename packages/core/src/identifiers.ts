import { normalizeDoi } from "./doi";
import { looksLikeQuestion } from "./query";

// What was typed in the search box: keywords, or something that names one work (a DOI, a link, an ID, a title).
// Plain rules, no guessing and no network: the same text always gives the same answer. A link is never
// fetched here, and a page is never scraped: only a DOI, an ID or a link that holds one is recognised, and
// anything else is looked up by its address in OpenAlex (see lookup.ts) or reported as not recognised.

export type DetectedInput =
  | { kind: "keywords" }
  | { kind: "doi"; doi: string }
  | { kind: "arxiv"; id: string; doi: string }
  | { kind: "pmid"; pmid: string }
  | { kind: "pmcid"; pmcid: string }
  | { kind: "openalex"; id: string }
  | { kind: "url"; url: string }
  | { kind: "title"; title: string };

/** What the page says it detected, e.g. "DOI". */
export function describeInput(input: DetectedInput): string {
  switch (input.kind) {
    case "doi":
      return "DOI";
    case "arxiv":
      return "arXiv ID";
    case "pmid":
      return "PubMed ID";
    case "pmcid":
      return "PubMed Central ID";
    case "openalex":
      return "OpenAlex ID";
    case "url":
      return "link";
    case "title":
      return "title";
    case "keywords":
      return "keywords";
  }
}

/** A title has at least this many words (and no operator and no question mark). */
export const MIN_TITLE_WORDS = 8;

const KEYWORDS: DetectedInput = { kind: "keywords" };

const DOI_IN_TEXT = /10\.\d{4,9}\/[^\s"'<>?#]+/;
/** What publishers add after the DOI in a page address. */
const DOI_SUFFIXES = /(?:\/(?:pdf|epdf|full|fulltext|abs|abstract|figures|references|citedby|metrics|suppl|supplementary-material)|\.pdf|\.html?|\.full|\.abstract)+$/i;

const ARXIV_NEW = /(\d{4}\.\d{4,5})(?:v\d+)?/;
const ARXIV_OLD = /([a-z-]+(?:\.[A-Za-z]{2})?\/\d{7})(?:v\d+)?/;

function cleanDoi(raw: string): string | null {
  let doi = raw;
  try {
    doi = decodeURIComponent(doi);
  } catch {
    // Left as written: it is not a valid escape.
  }
  doi = doi.replace(DOI_SUFFIXES, "").replace(/[.,;:]+$/, "").replace(/\/+$/, "");
  // A closing bracket that has no opening one is punctuation after the DOI, not part of it.
  while (doi.endsWith(")") && (doi.match(/\(/g)?.length ?? 0) < (doi.match(/\)/g)?.length ?? 0)) doi = doi.slice(0, -1);
  return normalizeDoi(doi);
}

function arxivDoi(id: string): string {
  return `10.48550/arxiv.${id.toLowerCase()}`;
}

function asUrl(text: string): URL | null {
  if (/\s/.test(text)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : /^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+\/\S*$/i.test(text) ? `https://${text}` : null;
  if (withScheme === null) return null;
  try {
    const url = new URL(withScheme);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function fromUrl(url: URL): DetectedInput {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const path = url.pathname;
  const decoded = (() => {
    try {
      return decodeURIComponent(path);
    } catch {
      return path;
    }
  })();

  if (host === "doi.org" || host === "dx.doi.org") {
    const doi = cleanDoi(decoded.replace(/^\//, ""));
    if (doi !== null) return { kind: "doi", doi };
  }

  if (host === "arxiv.org" || host.endsWith(".arxiv.org")) {
    const match = /^\/(?:abs|pdf|html|format)\/(.+?)(?:\.pdf)?$/.exec(path);
    const id = match?.[1] === undefined ? null : (ARXIV_NEW.exec(match[1])?.[1] ?? ARXIV_OLD.exec(match[1])?.[1] ?? null);
    if (id !== null) return { kind: "arxiv", id, doi: arxivDoi(id) };
  }

  if (host === "pubmed.ncbi.nlm.nih.gov" || (host === "ncbi.nlm.nih.gov" && /^\/pubmed\//.test(path))) {
    const pmid = /\/(\d{1,9})(?:\/|$)/.exec(path)?.[1];
    if (pmid !== undefined) return { kind: "pmid", pmid };
  }
  if (host === "pmc.ncbi.nlm.nih.gov" || (host === "ncbi.nlm.nih.gov" && /^\/pmc\//.test(path))) {
    const pmcid = /\b(PMC\d{4,9})\b/i.exec(path)?.[1];
    if (pmcid !== undefined) return { kind: "pmcid", pmcid: pmcid.toUpperCase() };
  }
  if (host === "europepmc.org") {
    const match = /^\/(?:article|abstract)\/(MED|PMC)\/(\w+)/i.exec(path);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      return match[1].toUpperCase() === "MED"
        ? { kind: "pmid", pmid: match[2] }
        : { kind: "pmcid", pmcid: (/^PMC/i.test(match[2]) ? match[2] : `PMC${match[2]}`).toUpperCase() };
    }
  }

  if (host === "openalex.org" || host === "api.openalex.org") {
    const id = /\/(W\d{4,12})\b/i.exec(path)?.[1];
    if (id !== undefined) return { kind: "openalex", id: id.toUpperCase() };
  }

  // Nature's article addresses are the DOI's suffix under Springer Nature's prefix: nature.com/articles/<id> is 10.1038/<id>.
  if (host === "nature.com") {
    const id = /^\/articles\/([a-z0-9][a-z0-9.-]*)\/?$/i.exec(path)?.[1];
    if (id !== undefined && !/\.(pdf|html?)$/i.test(id)) return { kind: "doi", doi: `10.1038/${id.toLowerCase()}` };
  }

  // A publisher address that carries the DOI in its path (Springer, Wiley, Taylor & Francis, PNAS, Science, ...).
  const inPath = DOI_IN_TEXT.exec(decoded);
  if (inPath !== null) {
    const doi = cleanDoi(inPath[0]);
    if (doi !== null) return { kind: "doi", doi };
  }
  // Some addresses carry it as a parameter: ...?doi=10.1234/xyz
  for (const value of url.searchParams.values()) {
    if (!/^10\.\d{4,9}\//.test(value)) continue;
    const doi = cleanDoi(value);
    if (doi !== null) return { kind: "doi", doi };
  }
  return { kind: "url", url: url.toString() };
}

const OPERATOR = /(?:^|\s)(?:AND|OR|NOT)(?:\s|$)|["()]/;

/** Reads the text typed in the search box. */
export function parseInput(text: string): DetectedInput {
  const trimmed = text.trim();
  if (trimmed === "") return KEYWORDS;

  // Prefixed forms, which may have a space after the label: "doi: 10.1/x", "PMID 123", "arXiv:2304.00997".
  const labelled = /^(doi|pmid|pmcid|arxiv|openalex)\s*[:#]?\s*(\S+)$/i.exec(trimmed);
  if (labelled?.[1] !== undefined && labelled[2] !== undefined) {
    const label = labelled[1].toLowerCase();
    const value = labelled[2];
    if (label === "doi") {
      const doi = cleanDoi(value);
      if (doi !== null) return { kind: "doi", doi };
    } else if (label === "pmid" && /^\d{1,9}$/.test(value)) {
      return { kind: "pmid", pmid: value };
    } else if (label === "pmcid" && /^(?:PMC)?\d{4,9}$/i.test(value)) {
      return { kind: "pmcid", pmcid: /^PMC/i.test(value) ? value.toUpperCase() : `PMC${value}` };
    } else if (label === "arxiv") {
      const id = ARXIV_NEW.exec(value)?.[1] ?? ARXIV_OLD.exec(value)?.[1];
      if (id !== undefined && new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}(?:v\\d+)?$`).test(value)) return { kind: "arxiv", id, doi: arxivDoi(id) };
    } else if (label === "openalex" && /^W\d{4,12}$/i.test(value)) {
      return { kind: "openalex", id: value.toUpperCase() };
    }
  }

  if (!/\s/.test(trimmed)) {
    // A bare DOI first: "10.1016/B978..." also looks like an address without a scheme.
    const doi = /^10\.\d{4,9}\/\S+$/.test(trimmed) ? cleanDoi(trimmed) : null;
    if (doi !== null) return { kind: "doi", doi };

    const url = asUrl(trimmed);
    if (url !== null) return fromUrl(url);

    const arxiv = new RegExp(`^(?:${ARXIV_NEW.source}|${ARXIV_OLD.source})$`).exec(trimmed);
    const arxivId = arxiv?.[1] ?? arxiv?.[2];
    if (arxivId !== undefined) return { kind: "arxiv", id: arxivId, doi: arxivDoi(arxivId) };

    if (/^PMC\d{4,9}$/i.test(trimmed)) return { kind: "pmcid", pmcid: trimmed.toUpperCase() };
    if (/^W\d{6,12}$/.test(trimmed)) return { kind: "openalex", id: trimmed };
    return KEYWORDS;
  }

  const words = trimmed.split(/\s+/);
  if (words.length >= MIN_TITLE_WORDS && !OPERATOR.test(trimmed) && !trimmed.includes("?") && !looksLikeQuestion(trimmed)) {
    return { kind: "title", title: trimmed };
  }
  return KEYWORDS;
}
