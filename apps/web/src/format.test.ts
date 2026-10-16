import { applyOverride, classify, type OaStatus } from "@sourcly/core";
import { makeResult } from "@sourcly/core/testing";
import { describe, expect, it } from "vitest";
import {
  accessBadgeText,
  describeLexiconMatches,
  fewResultsMessage,
  ORDER_SENTENCE,
  formatAuthors,
  formatNumber,
  formatRaw,
  labelText,
  pluralize,
  reviewBadgeText,
  valueName,
} from "./format";

describe("labelText", () => {
  it("calls rule-based labels 'likely'", () => {
    const { level, peerReview } = classify(makeResult());
    expect(labelText(level)).toBe("likely primary");
    expect(labelText(peerReview)).toBe("likely peer-reviewed");
  });

  it("does not add 'likely' to unknown", () => {
    const { level } = classify(makeResult({ type: "unknown", rawType: null }));
    expect(labelText(level)).toBe("unknown");
  });

  it("states a user's choice as theirs, with no 'likely'", () => {
    const labels = applyOverride(classify(makeResult()), { level: "tertiary", peerReview: "not-peer-reviewed" });
    expect(labelText(labels.level)).toBe("tertiary (set by you)");
    expect(labelText(labels.peerReview)).toBe("not peer-reviewed (set by you)");
  });

  it("states an override to unknown as the user's choice", () => {
    const labels = applyOverride(classify(makeResult()), { level: "unknown" });
    expect(labelText(labels.level)).toBe("unknown (set by you)");
  });
});

describe("formatAuthors", () => {
  const people = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Author ${i + 1}` }));

  it("says so when there are none", () => {
    expect(formatAuthors([])).toBe("No authors listed");
  });

  it("lists a few authors in full", () => {
    expect(formatAuthors(people(3))).toBe("Author 1, Author 2, Author 3");
    expect(formatAuthors(people(6))).toBe("Author 1, Author 2, Author 3, Author 4, Author 5, Author 6");
  });

  it("shortens a long list and says how many are left out", () => {
    expect(formatAuthors(people(9))).toBe("Author 1, Author 2, Author 3, Author 4, Author 5, Author 6 and 3 more");
  });
});

describe("accessBadgeText", () => {
  const access = (isOpen: boolean | null, status: OaStatus) => ({ isOpen, status, url: null, pdfUrl: null });

  it("names the kind of open access", () => {
    expect(accessBadgeText(access(true, "gold"), true)).toBe("Open access (gold)");
    expect(accessBadgeText(access(true, "green"), false)).toBe("Open access (green)");
    expect(accessBadgeText(access(true, "bronze"), true)).toBe("Open access (bronze)");
  });

  it("says plain 'Open access' when the kind is not known", () => {
    expect(accessBadgeText(access(true, "unknown"), true)).toBe("Open access");
  });

  it("names the library the person set, or 'your library' when none", () => {
    expect(accessBadgeText(access(false, "closed"), true, "Example Library")).toBe("Not open access, try Example Library");
    expect(accessBadgeText(access(null, "unknown"), true, "  ")).toBe("Open access status unknown, try your library");
    expect(accessBadgeText(access(false, "closed"), false, "Example Library")).toBe("Not open access");
  });

  it("points to UBC Library for a work that is not open access", () => {
    expect(accessBadgeText(access(false, "closed"), true)).toBe("Not open access, try UBC Library");
  });

  it("does not point to a library link the card does not have", () => {
    expect(accessBadgeText(access(false, "closed"), false)).toBe("Not open access");
    expect(accessBadgeText(access(null, "unknown"), false)).toBe("Open access status unknown");
  });

  it("does not claim a work is closed when the provider did not say", () => {
    expect(accessBadgeText(access(null, "unknown"), true)).toBe("Open access status unknown, try UBC Library");
  });
});

describe("valueName", () => {
  it("capitalizes and fixes the 'not-' prefix", () => {
    expect(valueName("primary")).toBe("Primary");
    expect(valueName("peer-reviewed")).toBe("Peer-reviewed");
    expect(valueName("not-peer-reviewed")).toBe("Not peer-reviewed");
    expect(valueName("unknown")).toBe("Unknown");
  });
});

describe("formatRaw / formatNumber / pluralize", () => {
  it("formats raw factor values", () => {
    expect(formatRaw(null)).toBe("none");
    expect(formatRaw("peer-reviewed")).toBe("peer-reviewed");
    expect(formatRaw(2005)).toBe("2005");
    expect(formatRaw(12.3456)).toBe("12.35");
  });

  it("fixes decimals", () => {
    expect(formatNumber(0.94871794)).toBe("0.95");
    expect(formatNumber(0.5, 3)).toBe("0.500");
  });

  it("pluralizes", () => {
    expect(pluralize(1, "result")).toBe("1 result");
    expect(pluralize(0, "result")).toBe("0 results");
    expect(pluralize(50, "result")).toBe("50 results");
  });
});

describe("reviewBadgeText", () => {
  const review = (value: string | null) =>
    makeResult({ type: "review", rawType: value === null ? null : { value, provider: "pubmed", field: "PublicationType" } });

  it("says Review for a plain review, with or without a raw type", () => {
    expect(reviewBadgeText(review("review"))).toBe("Review");
    expect(reviewBadgeText(review("Review"))).toBe("Review");
    expect(reviewBadgeText(review("review-article"))).toBe("Review");
    expect(reviewBadgeText(review("Review Article"))).toBe("Review");
    expect(reviewBadgeText(review(null))).toBe("Review");
    expect(reviewBadgeText(review(""))).toBe("Review");
  });

  it("uses the source's own wording when it is more specific", () => {
    expect(reviewBadgeText(review("Systematic Review"))).toBe("Systematic Review");
    expect(reviewBadgeText(review("Meta-Analysis"))).toBe("Meta-Analysis");
    expect(reviewBadgeText(review("meta-analysis"))).toBe("Meta-analysis");
  });

  it("says Review rather than a raw value that does not name a review", () => {
    expect(reviewBadgeText(review("article"))).toBe("Review");
  });

  it("is null for anything that is not a review", () => {
    expect(reviewBadgeText(makeResult({ type: "journal-article" }))).toBeNull();
    expect(reviewBadgeText(makeResult({ type: "preprint" }))).toBeNull();
  });
});

describe("describeLexiconMatches", () => {
  it("lists each term with where it was found", () => {
    expect(
      describeLexiconMatches([
        { term: "limitation", fields: ["title", "abstract"] },
        { term: "bias", fields: ["abstract"] },
      ]),
    ).toBe("limitation (title and abstract), bias (abstract)");
  });

  it("is empty for no matches", () => {
    expect(describeLexiconMatches([])).toBe("");
  });
});

describe("ORDER_SENTENCE and fewResultsMessage", () => {
  it("says how the main list is ordered: concepts, then adjacency, then score", () => {
    expect(ORDER_SENTENCE).toBe("Sorted by how many of your concepts each result matches, then by whether neighbouring concepts appear next to each other in order, then by score.");
  });

  it("says what the page does when few results match every concept", () => {
    expect(fewResultsMessage()).toBe(
      "Fewer than 15 results match all your concepts, so results that match all but one are listed too, labelled “Matches N of M concepts”. Check spelling or try different words.",
    );
  });
});
