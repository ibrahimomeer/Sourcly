import { describe, expect, it } from "vitest";
import { applyOverride, classify } from "./classify";
import { parseOpenAlexWork } from "./providers/openalex";
import fixtures from "./providers/__fixtures__/openalex-works.json";
import { makeResult } from "./testing/make-result";
import type { Result, VenueKind, WorkType } from "./types";

const venue = (value: VenueKind): Result["venueKind"] => ({
  value,
  provider: "openalex",
  field: "primary_location.source.type",
});

describe("classify: the rules", () => {
  // [type, venue, expected level, expected peer review]
  it.each<[WorkType, VenueKind | null, string, string]>([
    ["journal-article", "journal", "primary", "peer-reviewed"],
    ["journal-article", "repository", "primary", "unknown"],
    ["journal-article", null, "primary", "unknown"],
    ["review", "journal", "secondary", "peer-reviewed"],
    ["review", "repository", "secondary", "unknown"],
    ["preprint", "repository", "primary", "not-peer-reviewed"],
    ["conference-paper", "conference", "primary", "unknown"],
    ["book", "book", "tertiary", "unknown"],
    ["reference-entry", "journal", "tertiary", "unknown"],
    ["book-chapter", "book", "unknown", "unknown"],
    ["thesis", "repository", "other", "unknown"],
    ["report", null, "other", "unknown"],
    ["dataset", null, "other", "unknown"],
    ["other", null, "other", "unknown"],
    ["unknown", null, "unknown", "unknown"],
  ])("%s in venue %s -> level %s, peer review %s", (type, venueKind, level, peerReview) => {
    const labels = classify(makeResult({ type, venueKind: venueKind === null ? null : venue(venueKind) }));
    expect(labels.level.value).toBe(level);
    expect(labels.peerReview.value).toBe(peerReview);
  });

  it("gives every label a reason, a field and the 'rule' origin, for every work type", () => {
    const types: WorkType[] = [
      "journal-article", "review", "preprint", "conference-paper", "book", "book-chapter",
      "reference-entry", "thesis", "report", "dataset", "other", "unknown",
    ];
    for (const type of types) {
      const { level, peerReview } = classify(makeResult({ type }));
      for (const label of [level, peerReview]) {
        expect(label.reason.length, `${type} reason`).toBeGreaterThan(10);
        expect(label.field.length, `${type} field`).toBeGreaterThan(0);
        expect(label.origin).toBe("rule");
      }
    }
  });

  it("explains a plain journal article the way the spec words it", () => {
    const { level } = classify(makeResult());
    expect(level.reason).toBe("Journal article, not a review");
    expect(level.field).toBe("OpenAlex type");
  });

  it("names both fields when peer review depends on type and venue", () => {
    const { peerReview } = classify(makeResult());
    expect(peerReview.value).toBe("peer-reviewed");
    expect(peerReview.field).toBe("OpenAlex type; OpenAlex primary_location.source.type");
    expect(peerReview.reason).toContain("does not confirm it");
  });

  it("says why peer review is unverified when the venue is not a journal", () => {
    const { peerReview } = classify(makeResult({ venueKind: venue("repository") }));
    expect(peerReview.value).toBe("unknown");
    expect(peerReview.reason).toContain("venue type: repository");
  });

  it("quotes the raw type when it falls back to 'other' or 'unknown'", () => {
    const other = classify(makeResult({ type: "other", rawType: { value: "editorial", provider: "openalex", field: "type" } }));
    expect(other.level.reason).toContain('Type "editorial"');

    const unknown = classify(makeResult({ type: "unknown", rawType: { value: "gizmo", provider: "openalex", field: "type" } }));
    expect(unknown.level.value).toBe("unknown");
    expect(unknown.level.reason).toContain('"gizmo"');

    const missing = classify(makeResult({ type: "unknown", rawType: null }));
    expect(missing.level.reason).toContain("no document type");
    expect(missing.level.field).toBe("no type in metadata");
  });

  it("does not guess from the title or abstract", () => {
    const labels = classify(
      makeResult({ title: "A systematic review and meta-analysis", abstract: "We review the literature.", type: "unknown", rawType: null }),
    );
    expect(labels.level.value).toBe("unknown");
  });

  it("is deterministic", () => {
    const result = makeResult();
    expect(classify(result)).toEqual(classify(result));
  });
});

describe("classify: real OpenAlex records", () => {
  const labelsFor = (raw: unknown) => {
    const result = parseOpenAlexWork(raw, 1, 1);
    if (result === null) throw new Error("fixture did not parse");
    return classify(result);
  };

  it.each([
    ["a research article", fixtures.search.results[0], "primary", "peer-reviewed"],
    ["a systematic-review guideline (type review)", fixtures.review, "secondary", "peer-reviewed"],
    ["an arXiv preprint", fixtures.preprint, "primary", "not-peer-reviewed"],
    ["a book on an ebook platform", fixtures.book, "tertiary", "unknown"],
    ["a book chapter", fixtures.bookChapter, "unknown", "unknown"],
    // OpenAlex lists this encyclopedia entry under a "journal" source; peer review is still not claimed.
    ["an encyclopedia entry in a journal-type source", fixtures.referenceEntry, "tertiary", "unknown"],
    ["a dissertation", fixtures.dissertation, "other", "unknown"],
    ["a dataset", fixtures.dataset, "other", "unknown"],
    ["a conference paper", fixtures.conferencePaper, "primary", "unknown"],
    ["a report", fixtures.report, "other", "unknown"],
    ["OpenAlex's catch-all 'other' type", fixtures.other, "unknown", "unknown"],
    ["a retracted article (retraction is a badge, not a label)", fixtures.retracted, "primary", "peer-reviewed"],
    ["an article held only in a repository", fixtures.noDoi, "primary", "unknown"],
  ])("%s", (_name, raw, level, peerReview) => {
    const labels = labelsFor(raw);
    expect(labels.level.value).toBe(level);
    expect(labels.peerReview.value).toBe(peerReview);
  });
});

describe("applyOverride", () => {
  const labels = classify(makeResult());

  it("returns the rule labels untouched when there is no override", () => {
    expect(applyOverride(labels, undefined)).toBe(labels);
    expect(applyOverride(labels, {})).toEqual(labels);
  });

  it("replaces only the overridden axis and marks it as the user's", () => {
    const result = applyOverride(labels, { level: "secondary" });
    expect(result.level).toEqual({
      value: "secondary",
      reason: "Set manually by you",
      field: "your override",
      origin: "user",
    });
    expect(result.peerReview).toBe(labels.peerReview);
  });

  it("can override both axes, including to 'unknown'", () => {
    const result = applyOverride(labels, { level: "unknown", peerReview: "not-peer-reviewed" });
    expect(result.level.value).toBe("unknown");
    expect(result.peerReview.value).toBe("not-peer-reviewed");
    expect(result.peerReview.origin).toBe("user");
  });

  it("does not change the labels it was given", () => {
    const before = structuredClone(labels);
    applyOverride(labels, { level: "tertiary", peerReview: "unknown" });
    expect(labels).toEqual(before);
  });
});
