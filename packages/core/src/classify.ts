import { PROVIDER_NAMES, type Result, type Sourced } from "./types";

/**
 * Two independent axes. Both are heuristics read from metadata, never facts:
 * the UI must present them as "likely", and must show `reason` and `field`.
 */
export const SOURCE_LEVELS = ["primary", "secondary", "tertiary", "other", "unknown"] as const;
export type SourceLevel = (typeof SOURCE_LEVELS)[number];

export const PEER_REVIEW_STATUSES = ["peer-reviewed", "not-peer-reviewed", "unknown"] as const;
export type PeerReviewStatus = (typeof PEER_REVIEW_STATUSES)[number];

export interface Label<T extends string> {
  value: T;
  /** One line explaining why. */
  reason: string;
  /** The metadata field the decision was based on, e.g. "OpenAlex type". */
  field: string;
  /** "rule" = decided by the rules below, "user" = overridden by the user. */
  origin: "rule" | "user";
}

export interface Labels {
  level: Label<SourceLevel>;
  peerReview: Label<PeerReviewStatus>;
}

export interface LabelOverride {
  level?: SourceLevel;
  peerReview?: PeerReviewStatus;
}

function describeField(source: Sourced<unknown> | null, fallback: string): string {
  return source === null ? fallback : `${PROVIDER_NAMES[source.provider]} ${source.field}`;
}

function rule<T extends string>(value: T, reason: string, field: string): Label<T> {
  return { value, reason, field, origin: "rule" };
}

/** Axis 1: how the source relates to the research it describes. */
function classifyLevel(result: Result): Label<SourceLevel> {
  const field = describeField(result.rawType, "no type in metadata");
  const raw = result.rawType?.value;

  switch (result.type) {
    case "review":
      return rule("secondary", "Review article, so it summarizes other studies", field);
    case "journal-article":
      return rule("primary", "Journal article, not a review", field);
    case "preprint":
      return rule("primary", "Preprint: reports original work", field);
    case "conference-paper":
      return rule("primary", "Conference paper: usually reports original work", field);
    case "book":
      return rule("tertiary", "Book: usually synthesizes other sources", field);
    case "reference-entry":
      return rule("tertiary", "Reference or encyclopedia entry", field);
    case "book-chapter":
      return rule(
        "unknown",
        "Book chapter: could be original work, a review or a summary, and the metadata does not say",
        field,
      );
    case "thesis":
      return rule("other", "Thesis or dissertation", field);
    case "report":
      return rule("other", "Report or working paper issued outside the journal system", field);
    case "dataset":
      return rule("other", "Dataset, not a paper", field);
    case "other":
      return rule(
        "other",
        `${raw === undefined ? "This type" : `Type "${raw}"`} is not a research article, review or reference work`,
        field,
      );
    case "unknown":
      return rule(
        "unknown",
        raw === undefined
          ? "The metadata gives no document type"
          : `Document type "${raw}" is not one we can classify`,
        field,
      );
  }
}

/** Axis 2: whether the work was (likely) peer reviewed. */
function classifyPeerReview(result: Result): Label<PeerReviewStatus> {
  const typeField = describeField(result.rawType, "no type in metadata");

  // Wikipedia is the one source here that is known not to be peer reviewed.
  if (result.rawType?.provider === "wikipedia") {
    return rule("not-peer-reviewed", "Wikipedia is written and edited by volunteers, not peer reviewed", typeField);
  }

  switch (result.type) {
    case "preprint":
      return rule("not-peer-reviewed", "Preprint: posted before peer review", typeField);

    case "journal-article":
    case "review": {
      const venue = result.venueKind;
      const venueField = describeField(venue, "no venue type in metadata");
      const field = `${typeField}; ${venueField}`;
      if (venue?.value === "journal") {
        return rule(
          "peer-reviewed",
          "Published in a journal, and journals normally peer-review articles, but this record does not confirm it",
          field,
        );
      }
      return rule(
        "unknown",
        venue === null
          ? "No venue type in the metadata, so peer review is unverified"
          : `Not clearly published in a journal (venue type: ${venue.value}), so peer review is unverified`,
        field,
      );
    }

    default:
      return rule("unknown", "Peer review is not stated for this type of source", typeField);
  }
}

/**
 * Applies the rules to one result. Pure and deterministic: the same result
 * always gets the same labels, and each label says why.
 */
export function classify(result: Result): Labels {
  return { level: classifyLevel(result), peerReview: classifyPeerReview(result) };
}

/** The user's manual choice always wins over the rules, and is marked as such. */
export function applyOverride(labels: Labels, override: LabelOverride | undefined): Labels {
  if (override === undefined) return labels;
  const manual = <T extends string>(value: T): Label<T> => ({
    value,
    reason: "Set manually by you",
    field: "your override",
    origin: "user",
  });
  return {
    level: override.level !== undefined ? manual(override.level) : labels.level,
    peerReview: override.peerReview !== undefined ? manual(override.peerReview) : labels.peerReview,
  };
}
