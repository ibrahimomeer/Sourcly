import type { Labels, SourceLevel } from "./classify";
import { relevanceReadings } from "./relevance";
import { PROVIDER_NAMES, type Result } from "./types";

// score = sum(weight_i * factor_i) / sum(weight_i), over enabled factors, with
// every factor normalized to 0..1. Nothing here is learned or hidden: each
// factor reports how it read the result, so a ranking can always be explained.

export const FACTOR_IDS = [
  "relevance",
  "citations",
  "recency",
  "peerReview",
  "openAccess",
  "providerAgreement",
  "studyType",
] as const;
export type FactorId = (typeof FACTOR_IDS)[number];

export const FACTOR_LABELS: Record<FactorId, string> = {
  relevance: "Relevance (BM25)",
  citations: "Citations",
  recency: "Recency",
  peerReview: "Peer review",
  openAccess: "Open access",
  providerAgreement: "Provider agreement",
  studyType: "Study type",
};

export interface FactorSetting {
  enabled: boolean;
  weight: number;
}

export interface ScoringSettings {
  factors: Record<FactorId, FactorSetting>;
  /** Levels the user prefers; used only by the study-type factor. Empty = neutral. */
  preferredLevels: SourceLevel[];
  /** Years for the recency factor to fall to 0.5. */
  recencyHalfLifeYears: number;
}

/** A fresh copy each call, so callers can edit it freely. */
export function defaultScoringSettings(): ScoringSettings {
  return {
    factors: {
      relevance: { enabled: true, weight: 3 },
      citations: { enabled: true, weight: 1 },
      recency: { enabled: true, weight: 1 },
      peerReview: { enabled: true, weight: 1 },
      // 0 by default: with library access, being open access says little about
      // whether you can read a source. Raise it if you do not have that access.
      openAccess: { enabled: true, weight: 0 },
      // A result several independent sources returned is a little more likely to matter.
      providerAgreement: { enabled: true, weight: 0.5 },
      studyType: { enabled: false, weight: 0 },
    },
    preferredLevels: [],
    recencyHalfLifeYears: 10,
  };
}

/** What a factor scores when the result has no data for it. */
export const NEUTRAL = 0.5;

/** What a ranking needs to know besides the results and the settings. */
export interface ScoringContext {
  /** The year ages are measured from. Passed in, so the same inputs always rank the same way. */
  referenceYear: number;
  /** The words the query asks for (from `queryTerms`); relevance is BM25 over these. */
  queryTerms: readonly string[];
  /** How many sources answered; provider agreement is measured against this. */
  answeredSources: number;
  /**
   * Words a result must also match to be relevant: the counterargument terms. When given,
   * relevance multiplies a second BM25 reading of these terms into the usual one.
   */
  signalTerms?: readonly string[];
}

export interface ScoringItem {
  result: Result;
  /** The labels to score with, including any manual overrides. */
  labels: Labels;
}

export interface FactorBreakdown {
  factor: FactorId;
  label: string;
  enabled: boolean;
  weight: number;
  /** The measured value before normalizing (rank, citations per year, year, ...). */
  raw: number | string | null;
  /** One sentence saying how the raw value was read and turned into `normalized`. */
  detail: string;
  /** 0..1 */
  normalized: number;
  /** weight * normalized / sum of enabled weights. Contributions add up to `score`. */
  contribution: number;
}

export interface ScoredResult extends ScoringItem {
  /** 0..1 */
  score: number;
  factors: FactorBreakdown[];
}

interface FactorValue {
  raw: number | string | null;
  detail: string;
  normalized: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function cleanWeight(weight: number): number {
  return Number.isFinite(weight) && weight > 0 ? weight : 0;
}

/** Citations per year since publication; at least one year, so new papers do not explode. */
function citationRate(result: Result, referenceYear: number): number | null {
  if (result.citationCount === null || result.year === null) return null;
  return result.citationCount / Math.max(1, referenceYear - result.year);
}

/** Share of the population below `value`, counting ties as half. Always in (0, 1). */
function percentileRank(value: number, population: readonly number[]): number {
  let below = 0;
  let equal = 0;
  for (const other of population) {
    if (other < value) below += 1;
    else if (other === value) equal += 1;
  }
  return (below + equal / 2) / population.length;
}

/**
 * How many of the sources that answered returned this result. A result found independently
 * by several sources is a little more likely to be what you want. With fewer than two
 * answering sources there is nothing to compare, so it scores neutral.
 */
function agreementFactor(result: Result, answeredSources: number): FactorValue {
  const found = [...new Set(result.hits.map((hit) => hit.provider))];
  if (answeredSources < 2) {
    return {
      raw: found.length,
      detail: "Only one source answered, so agreement between sources cannot be measured: neutral (0.5)",
      normalized: NEUTRAL,
    };
  }
  const normalized = clamp01(found.length / answeredSources);
  return {
    raw: found.length,
    detail: `Found by ${found.length} of the ${answeredSources} sources that answered (${found.map((id) => PROVIDER_NAMES[id]).join(", ")}): ${found.length} / ${answeredSources}`,
    normalized,
  };
}

/** Turns BM25's reading into a factor value; "cannot be measured" is neutral. */
function relevanceFactor(reading: { raw: number | null; normalized: number | null; detail: string } | undefined): FactorValue {
  if (reading === undefined) return { raw: null, detail: "No relevance reading", normalized: NEUTRAL };
  return { raw: reading.raw, detail: reading.detail, normalized: reading.normalized ?? NEUTRAL };
}

function citationsFactor(
  result: Result,
  rate: number | null,
  population: readonly number[],
  referenceYear: number,
): FactorValue {
  if (rate === null || result.citationCount === null || result.year === null) {
    return { raw: null, detail: "No citation count or year, so it scores neutral (0.5)", normalized: NEUTRAL };
  }
  const normalized = percentileRank(rate, population);
  const years = Math.max(1, referenceYear - result.year);
  return {
    raw: rate,
    detail:
      `${result.citationCount} citations over ${years} year${years === 1 ? "" : "s"} = ${rate.toFixed(1)} per year, ` +
      `which is the ${(normalized * 100).toFixed(0)}th percentile among the ${population.length} results with citation data`,
    normalized,
  };
}

function recencyFactor(result: Result, referenceYear: number, halfLife: number): FactorValue {
  if (result.year === null) {
    return { raw: null, detail: "No publication year, so it scores neutral (0.5)", normalized: NEUTRAL };
  }
  const age = Math.max(0, referenceYear - result.year);
  const normalized = 0.5 ** (age / halfLife);
  return {
    raw: result.year,
    detail: `Published ${result.year}, ${age} year${age === 1 ? "" : "s"} before ${referenceYear}; the score halves every ${halfLife} years`,
    normalized,
  };
}

function peerReviewFactor({ peerReview }: Labels): FactorValue {
  const byValue = { "peer-reviewed": 1, unknown: NEUTRAL, "not-peer-reviewed": 0 } as const;
  const normalized = byValue[peerReview.value];
  const source = peerReview.origin === "user" ? " (set by you)" : " (likely, from metadata)";
  return {
    raw: peerReview.value,
    detail: `Peer review: ${peerReview.value}${source}; peer-reviewed = 1, unknown = 0.5, not peer-reviewed = 0`,
    normalized,
  };
}

function openAccessFactor(result: Result): FactorValue {
  const { isOpen, status } = result.openAccess;
  if (isOpen === true) {
    return { raw: `open (${status})`, detail: "Free to read online: scores 1", normalized: 1 };
  }
  if (isOpen === false) {
    return { raw: "closed", detail: "Not free to read online: scores 0", normalized: 0 };
  }
  return { raw: "unknown", detail: "No open-access information, so it counts as not open: scores 0", normalized: 0 };
}

function studyTypeFactor({ level }: Labels, preferred: readonly SourceLevel[]): FactorValue {
  if (preferred.length === 0) {
    return { raw: level.value, detail: "No preferred study types chosen, so every result scores neutral (0.5)", normalized: NEUTRAL };
  }
  const isPreferred = preferred.includes(level.value);
  return {
    raw: level.value,
    detail: `Level is ${level.value}, which is ${isPreferred ? "" : "not "}one of your preferred levels (${preferred.join(", ")}): scores ${isPreferred ? 1 : 0}`,
    normalized: isPreferred ? 1 : 0,
  };
}

function compareScored(a: ScoredResult, b: ScoredResult): number {
  if (a.score !== b.score) return b.score - a.score;
  // Deterministic tie-break on the DOI/id, by code unit so it does not depend on locale.
  if (a.result.id === b.result.id) return 0;
  return a.result.id < b.result.id ? -1 : 1;
}

/**
 * Scores and sorts results, best first. The reference year, the query words and the number of
 * answering sources are passed in (rather than read from the clock or the page) so the same
 * inputs always give the same ranking. Re-run it whenever settings, labels or the set of
 * results change; it never needs new data. Relevance is measured over the whole set given,
 * so pass every merged result, not only the ones currently shown.
 */
export function scoreResults(
  items: readonly ScoringItem[],
  settings: ScoringSettings,
  context: ScoringContext,
): ScoredResult[] {
  const { referenceYear, queryTerms, answeredSources, signalTerms } = context;
  const halfLife =
    Number.isFinite(settings.recencyHalfLifeYears) && settings.recencyHalfLifeYears > 0
      ? settings.recencyHalfLifeYears
      : defaultScoringSettings().recencyHalfLifeYears;

  const relevance = relevanceReadings(
    items.map(({ result }) => result),
    queryTerms,
    signalTerms,
  );
  const rates = items.map(({ result }) => citationRate(result, referenceYear));
  const population = rates.filter((rate): rate is number => rate !== null);

  const totalWeight = FACTOR_IDS.reduce((sum, id) => {
    const { enabled, weight } = settings.factors[id];
    return enabled ? sum + cleanWeight(weight) : sum;
  }, 0);

  const scored = items.map((item, index): ScoredResult => {
    const { result, labels } = item;
    const values: Record<FactorId, FactorValue> = {
      relevance: relevanceFactor(relevance[index]),
      citations: citationsFactor(result, rates[index] ?? null, population, referenceYear),
      recency: recencyFactor(result, referenceYear, halfLife),
      peerReview: peerReviewFactor(labels),
      openAccess: openAccessFactor(result),
      providerAgreement: agreementFactor(result, answeredSources),
      studyType: studyTypeFactor(labels, settings.preferredLevels),
    };

    const factors = FACTOR_IDS.map((id): FactorBreakdown => {
      const { enabled, weight } = settings.factors[id];
      const value = values[id];
      const clean = cleanWeight(weight);
      return {
        factor: id,
        label: FACTOR_LABELS[id],
        enabled,
        weight: clean,
        ...value,
        contribution: enabled && totalWeight > 0 ? (clean * value.normalized) / totalWeight : 0,
      };
    });

    return { ...item, score: factors.reduce((sum, f) => sum + f.contribution, 0), factors };
  });

  return scored.sort(compareScored);
}
