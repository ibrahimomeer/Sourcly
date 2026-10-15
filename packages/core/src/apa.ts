import { doiUrl } from "./doi";
import { stripMarkup } from "./text";
import type { Author, Result } from "./types";

// APA 7 references, made by a small formatter of our own from the fields Sourcly collects
// (authors, year, title, venue, volume, issue, pages, DOI or link, type). The rules followed are
// written out in docs/methodology.md. Metadata can be incomplete, so every reference also gets a
// list of things to check, which the app shows next to it.

/** A stretch of a reference, italic or not. Titles of stand-alone works, journal names and volumes are italic. */
export interface ApaPart {
  text: string;
  italic: boolean;
}

export interface ApaOptions {
  /** When the page was looked at. Needed for pages that change, such as Wikipedia ("Retrieved ..."). Defaults to now. */
  retrievedOn?: Date;
}

/** The two ways to cite a source in a sentence: in brackets, or with the author as part of the sentence. */
export interface ApaCitation {
  /** (Stickgold, 2005) */
  parenthetical: ApaPart[];
  /** Stickgold (2005) */
  narrative: ApaPart[];
}

export interface ApaEntry {
  result: Result;
  parts: ApaPart[];
  /** The reference as plain text (no italics). */
  text: string;
  /** The reference as one HTML paragraph with a hanging indent and italics. */
  html: string;
  /** What to check before handing it in. */
  checks: string[];
  /** How to cite it in the text. Worked out with the whole list, because the same names or years can need telling apart. */
  citation: ApaCitation;
}

// ---- Names

const GROUP_WORDS =
  /\b(?:university|universit[ée]|institute|institut|organi[sz]ation|association|committee|group|consortium|society|centre|center|department|council|collaboration|collaborative|network|foundation|agency|ministry|board|commission|team|project|authority|service|trust|academy|college|hospital|laborator(?:y|ies)|company|corporation|inc|ltd|llc|initiative|investigators|trialists|collaborators)\b/i;

const PARTICLES: ReadonlySet<string> = new Set([
  "van", "von", "de", "der", "den", "la", "le", "du", "di", "da", "del", "della", "dos", "das", "do",
  "bin", "ibn", "al", "el", "ter", "ten", "st", "st.", "af", "av", "zu", "zum", "zur",
]);

const SUFFIX = /^(?:jr\.?|sr\.?|ii|iii|iv)$/i;

type ParsedName = { kind: "person"; family: string; initials: string; suffix: string } | { kind: "group"; name: string };

/** "Jean-Paul" becomes "J.-P.", "Mary Ann" "M. A.", "J.R." and "JR" "J. R.". */
function initialsOf(given: string): string {
  const out: string[] = [];
  for (const token of given.split(/\s+/).filter((part) => part !== "")) {
    if (/^\p{Lu}{2,3}$/u.test(token)) {
      out.push(...Array.from(token).map((letter) => `${letter}.`));
    } else if (/^(?:\p{Lu}\.)+$/u.test(token)) {
      out.push(...Array.from(token.replace(/\./g, "")).map((letter) => `${letter}.`));
    } else if (token.includes("-")) {
      const pieces = token.split("-").filter((piece) => piece !== "");
      out.push(pieces.map((piece) => `${(Array.from(piece)[0] ?? "").toUpperCase()}.`).join("-"));
    } else {
      out.push(`${(Array.from(token)[0] ?? "").toUpperCase()}.`);
    }
  }
  return out.join(" ");
}

/**
 * Splits one author into family name and initials. A structured name (family and given, from
 * Crossref or PubMed) is used as it is. A single string is read by rule: "Family, Given",
 * "Family G" (initials last) or "Given Family", with a few name particles (van, de, ...) kept with
 * the family name and Jr./III moved to the end. Names that look like an organisation, and
 * one-word names, are kept whole.
 */
export function splitName(author: Author): ParsedName {
  if (author.family !== undefined && author.family.trim() !== "") {
    return {
      kind: "person",
      family: author.family.trim(),
      initials: initialsOf(author.given?.trim() ?? ""),
      suffix: "",
    };
  }
  const name = author.name.replace(/\s+/g, " ").replace(/[,\s]+$/, "").trim();
  if (name === "") return { kind: "group", name: "" };
  if (GROUP_WORDS.test(name)) return { kind: "group", name };

  if (name.includes(",")) {
    const [family = "", given = "", suffix = ""] = name.split(",").map((part) => part.trim());
    if (family !== "") {
      // "Smith, Jr." has a suffix where the given names would be.
      return SUFFIX.test(given)
        ? { kind: "person", family, initials: "", suffix: given }
        : { kind: "person", family, initials: initialsOf(given), suffix };
    }
  }

  const words = name.split(" ");
  if (words.length === 1) return { kind: "group", name };

  let suffix = "";
  const last = words[words.length - 1] ?? "";
  if (words.length > 2 && SUFFIX.test(last)) {
    suffix = last;
    words.pop();
  }

  // "Stickgold R" or "Stickgold RJ": initials last.
  const tail = words[words.length - 1] ?? "";
  if (words.length > 1 && /^\p{Lu}{1,3}\.?$/u.test(tail) && (words[words.length - 2] ?? "").length > 1) {
    return { kind: "person", family: words.slice(0, -1).join(" "), initials: initialsOf(tail.replace(".", "")), suffix };
  }

  // "Robert Stickgold", "Ludwig van Beethoven".
  let familyStart = words.length - 1;
  while (familyStart > 1 && PARTICLES.has((words[familyStart - 1] ?? "").toLowerCase())) familyStart -= 1;
  return {
    kind: "person",
    family: words.slice(familyStart).join(" "),
    initials: initialsOf(words.slice(0, familyStart).join(" ")),
    suffix,
  };
}

function formatName(author: Author): string {
  const parsed = splitName(author);
  if (parsed.kind === "group") return parsed.name;
  const base = parsed.initials === "" ? parsed.family : `${parsed.family}, ${parsed.initials}`;
  return parsed.suffix === "" ? base : `${base}, ${parsed.suffix}`;
}

/**
 * The author list as APA 7 writes it: one author; two joined by "&"; up to twenty with a comma
 * and "&" before the last; and for twenty-one or more the first nineteen, ". . .", then the last
 * (no "&").
 */
export function formatApaAuthors(authors: readonly Author[]): string {
  const names = authors.map(formatName).filter((name) => name !== "");
  if (names.length === 0) return "";
  if (names.length === 1) return names[0] as string;
  if (names.length === 2) return `${names[0]}, & ${names[1]}`;
  if (names.length <= 20) return `${names.slice(0, -1).join(", ")}, & ${names[names.length - 1]}`;
  return `${names.slice(0, 19).join(", ")}, . . . ${names[names.length - 1]}`;
}

// ---- Pieces

const MONTHS = [
  "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December",
];

function longDate(date: Date): string {
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

/** The title cleaned for a reference: spaces collapsed and a final full stop removed (it is added back). */
function cleanTitle(title: string): string {
  return stripMarkup(title).replace(/\.+$/, "");
}

const SMALL_WORDS: ReadonlySet<string> = new Set([
  "a", "an", "and", "as", "at", "but", "by", "de", "des", "du", "for", "in", "la", "le", "of", "on", "or", "the", "to", "with",
]);

/**
 * A journal name in capitals the way APA writes it. PubMed gives names in lower case ("Brain
 * communications", "Current biology : CB"); names that already have every main word capitalised, and
 * names with capitals inside a word (eLife, PLoS ONE, mBio), are left as they are.
 */
export function journalCase(name: string): string {
  const tidy = name.replace(/\s+/g, " ").replace(/\s+:\s*/g, ": ").trim();
  const words = tidy.split(" ");
  const needsFixing = words.some((word, index) => index > 0 && !SMALL_WORDS.has(word) && /^\p{Ll}/u.test(word));
  if (!needsFixing && !/^\p{Ll}[\p{Ll}\p{N}]*$/u.test(words[0] ?? "")) return tidy;
  return words
    .map((word, index) => {
      if (/\p{Lu}/u.test(word.slice(1))) return word; // eLife, PLoS, CB: capitals inside already
      if (index > 0 && SMALL_WORDS.has(word) && !words[index - 1]?.endsWith(":")) return word;
      return `${(Array.from(word)[0] ?? "").toUpperCase()}${Array.from(word).slice(1).join("")}`;
    })
    .join(" ");
}

/** A sentence end: a full stop, unless the text already ends with ? or !. */
const stop = (text: string): string => (/[?!]$/.test(text) ? text : `${text}.`);

type PagesKind = { kind: "range"; text: string } | { kind: "article"; text: string } | { kind: "page"; text: string };

/** Reads the pages value: a range (en dash), an article number (it has a letter), or one page. */
function readPages(pages: string | null): PagesKind | null {
  if (pages === null) return null;
  const text = pages.trim();
  if (text === "") return null;
  const range = /^(\S+?)\s*[-–—]\s*(\S+)$/.exec(text);
  if (range !== null) return { kind: "range", text: `${range[1]}–${range[2]}` };
  if (/\p{L}/u.test(text)) return { kind: "article", text };
  return { kind: "page", text };
}

/** The address to cite: the DOI as an https link, else the page address, unless it is only a database record. */
function citeLink(result: Result): string | null {
  if (result.doi !== null) return doiUrl(result.doi);
  if (result.url === null) return null;
  try {
    const host = new URL(result.url).hostname;
    if (host === "openalex.org" || host.endsWith(".openalex.org")) return null;
  } catch {
    return null;
  }
  return result.url;
}

type Kind = "article" | "preprint" | "book" | "chapter" | "entry" | "dataset" | "thesis" | "report" | "paper" | "web" | "other";

function referenceKind(result: Result): Kind {
  if (result.venue === "Wikipedia" || result.hits.some((hit) => hit.provider === "wikipedia")) return "web";
  switch (result.type) {
    case "journal-article":
    case "review":
      return result.venue === null ? "other" : "article";
    case "preprint":
      return "preprint";
    case "book":
      return "book";
    case "book-chapter":
      return "chapter";
    case "reference-entry":
      return "entry";
    case "dataset":
      return "dataset";
    case "thesis":
      return "thesis";
    case "report":
      return "report";
    case "conference-paper":
      return "paper";
    default:
      return "other";
  }
}

const STANDALONE_NOTE: Partial<Record<Kind, string>> = { dataset: " [Data set]", thesis: " [Thesis]" };

function build(result: Result, yearLabel: string, options: ApaOptions): ApaPart[] {
  const kind = referenceKind(result);
  const authors = formatApaAuthors(result.authors);
  const title = cleanTitle(result.title === "" ? "Untitled" : result.title);
  const link = citeLink(result);
  const venue = stripMarkup(result.venue) || null;
  const pages = readPages(result.pages);
  const parts: ApaPart[] = [];
  const push = (text: string, italic = false) => {
    if (text !== "") parts.push({ text, italic });
  };

  const standalone = kind === "book" || kind === "dataset" || kind === "thesis" || kind === "report";
  if (standalone) {
    if (authors !== "") push(`${authors} (${yearLabel}). `);
    const note = STANDALONE_NOTE[kind] ?? "";
    push(title, true);
    push(note === "" ? (/[?!]$/.test(title) ? " " : ". ") : `${note}. `);
    if (authors === "") push(`(${yearLabel}). `);
    if (venue !== null) push(`${stop(venue)} `);
  } else {
    // Without authors the title moves to the author position.
    push(authors !== "" ? `${authors} (${yearLabel}). ${stop(title)} ` : `${stop(title)} (${yearLabel}). `);
    switch (kind) {
      case "article": {
        const volume = result.volume;
        const source = `${journalCase(venue ?? "")}${volume !== null ? `, ${volume}` : ""}`;
        push(source, true);
        if (result.issue !== null && volume !== null) push(`(${result.issue})`);
        if (pages !== null) push(`, ${pages.kind === "article" ? `Article ${pages.text}` : pages.text}`);
        push(". ");
        break;
      }
      case "preprint":
      case "other":
        if (venue !== null) {
          push(venue, true);
          push(". ");
        }
        break;
      case "chapter":
      case "paper":
        if (venue !== null) {
          push("In ");
          push(venue, true);
          push(pages !== null && pages.kind !== "article" ? ` (${pages.kind === "range" ? "pp." : "p."} ${pages.text}). ` : ". ");
        }
        break;
      case "entry":
        if (venue !== null) {
          push("In ");
          push(venue, true);
          push(". ");
        }
        break;
      case "web": {
        push("In ");
        push("Wikipedia", true);
        push(". ");
        if (link !== null) {
          push(`Retrieved ${longDate(options.retrievedOn ?? new Date())}, from ${link}`);
          return parts;
        }
        break;
      }
    }
  }

  if (link !== null) {
    push(link);
  } else {
    // No address to end on, so the last sentence keeps its full stop and loses the trailing space.
    const last = parts[parts.length - 1];
    if (last !== undefined) last.text = last.text.replace(/\s+$/, "");
  }
  return parts;
}

const textOf = (parts: readonly ApaPart[]): string => parts.map((part) => part.text).join("");

const escapeHtml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function htmlOf(parts: readonly ApaPart[]): string {
  const inner = parts.map((part) => (part.italic ? `<i>${escapeHtml(part.text)}</i>` : escapeHtml(part.text))).join("");
  // A hanging indent, which is how APA sets a reference list, and double spacing.
  return `<p style="margin:0 0 0 36pt;text-indent:-36pt;line-height:2">${inner}</p>`;
}

/** Parts as inline HTML (italics only), for pasting a citation into a word processor. */
export function apaInlineHtml(parts: readonly ApaPart[]): string {
  return parts.map((part) => (part.italic ? `<i>${escapeHtml(part.text)}</i>` : escapeHtml(part.text))).join("");
}

const yearOf = (result: Result): string => (result.year === null ? "n.d." : String(result.year));

/** One reference, as parts. Use buildReferenceList for a whole list: it also sorts and tells apart same-year works. */
export function formatApa(result: Result, options: ApaOptions = {}): ApaPart[] {
  return build(result, yearOf(result), options);
}

export function apaText(parts: readonly ApaPart[]): string {
  return textOf(parts);
}

// ---- Things to check

function looksTitleCased(title: string): boolean {
  const words = title.split(/\s+/).filter((word) => /^\p{L}{4,}$/u.test(word));
  if (words.length < 4) return false;
  const capitalised = words.filter((word) => /^\p{Lu}/u.test(word)).length;
  return capitalised / words.length >= 0.6;
}

/** Plain-language things to check in a reference before submitting it. Empty when nothing stands out. */
export function apaChecks(result: Result): string[] {
  const kind = referenceKind(result);
  const checks: string[] = [];
  if (result.authors.length === 0 && kind !== "web") checks.push("No authors were listed, so the title stands in the author position.");
  if (result.authors.some((author) => author.family === undefined) && result.authors.length > 0) {
    checks.push("Author names came as one piece of text, so Sourcly split them into family name and initials by rule. Check them.");
  }
  if (result.year === null && kind !== "web") checks.push("No year was listed, so it shows (n.d.).");
  if (result.title.trim() === "") checks.push("No title was listed.");
  else if (looksTitleCased(result.title)) checks.push("The title looks like Title Case. APA 7 wants sentence case (only the first word and proper nouns capitalised).");
  if (kind === "article") {
    if (result.volume === null || result.pages === null) {
      checks.push("The sources gave no volume, issue or pages for this article. Add them from the publisher's page.");
    }
  } else if (kind === "other" && result.venue === null && result.type !== "dataset") {
    checks.push("No journal or publisher was listed.");
  }
  if (kind === "chapter") checks.push("Editors and the publisher are not available. Add them from the book.");
  if (kind === "paper") checks.push("The conference name may need its place and date added.");
  if (kind === "web") checks.push("The retrieval date is today's date. Wikipedia changes, so APA asks for it.");
  if (citeLink(result) === null) checks.push("No DOI or web address was found.");
  return checks;
}

// ---- A whole reference list

const FOLD_MARKS = /[̀-ͯ]/g;

/** Letters only, lowercase, accents removed: the way APA alphabetises ("letter by letter"). */
function alphaKey(text: string): string {
  return text.normalize("NFKD").replace(FOLD_MARKS, "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

const titleKey = (title: string): string => alphaKey(title.replace(/^(?:a|an|the)\s+/i, ""));

function nameKeys(result: Result): string[] {
  if (result.authors.length === 0) return [titleKey(result.title)];
  return result.authors.map((author) => {
    const parsed = splitName(author);
    return alphaKey(parsed.kind === "group" ? parsed.name : `${parsed.family} ${parsed.initials}`);
  });
}

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function compareResults(a: Result, b: Result): number {
  const ka = nameKeys(a);
  const kb = nameKeys(b);
  for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
    const x = ka[i];
    const y = kb[i];
    // One author before several that start the same way.
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const order = compareText(x, y);
    if (order !== 0) return order;
  }
  // No date comes before dated works, then earliest first.
  const ya = a.year ?? Number.NEGATIVE_INFINITY;
  const yb = b.year ?? Number.NEGATIVE_INFINITY;
  if (ya !== yb) return ya < yb ? -1 : 1;
  return compareText(titleKey(a.title), titleKey(b.title)) || compareText(a.id, b.id);
}

/** The year as it is written for each result in a sorted list: 2020, or 2020a and 2020b for the same authors in the same year (n.d.-a for no date). */
function yearLabels(sorted: readonly Result[]): string[] {
  const keyOf = (result: Result) => `${formatApaAuthors(result.authors) || titleKey(result.title)}|${yearOf(result)}`;
  const groups = new Map<string, number>();
  for (const result of sorted) groups.set(keyOf(result), (groups.get(keyOf(result)) ?? 0) + 1);

  const seen = new Map<string, number>();
  return sorted.map((result) => {
    const key = keyOf(result);
    const index = seen.get(key) ?? 0;
    seen.set(key, index + 1);
    const suffix = (groups.get(key) ?? 1) > 1 ? String.fromCharCode(97 + (index % 26)) : "";
    const year = yearOf(result);
    return suffix === "" ? year : year === "n.d." ? `n.d.-${suffix}` : `${year}${suffix}`;
  });
}

// ---- Citing in the text

interface CiteAuthor {
  family: string;
  initials: string;
}

function citeAuthors(result: Result): CiteAuthor[] {
  return result.authors
    .map(splitName)
    .map((name): CiteAuthor => (name.kind === "group" ? { family: name.name, initials: "" } : { family: name.family, initials: name.initials }))
    .filter((author) => author.family !== "");
}

/** A title for the author position of a citation: the part before a colon, at most six words, main words capitalised. */
function citeTitle(title: string): string {
  const words = cleanTitle(title).split(/:\s/)[0]?.split(" ").filter((word) => word !== "").slice(0, 6) ?? [];
  // A shortened title should not end on "of" or "the".
  while (words.length > 1 && SMALL_WORDS.has((words[words.length - 1] ?? "").toLowerCase())) words.pop();
  const cased = words.map((word, index) => {
    if (/\p{Lu}/u.test(word.slice(1))) return word; // capitals inside already: COVID-19, mRNA
    if (index > 0 && SMALL_WORDS.has(word.toLowerCase())) return word.toLowerCase();
    return `${(Array.from(word)[0] ?? "").toUpperCase()}${Array.from(word).slice(1).join("")}`;
  });
  return cased.join(" ").replace(/[,;:.]+$/, "");
}

const STANDALONE_KINDS: ReadonlySet<Kind> = new Set<Kind>(["book", "dataset", "thesis", "report"]);

/**
 * How to cite each work in the text, for a sorted list. The rules (APA 7, 8.17 to 8.20):
 * one author (Smith, 2020); two (Smith & Jones, 2020), and "Smith and Jones (2020)" in a sentence;
 * three or more (Smith et al., 2020). First authors with the same surname but different initials get
 * their initials (J. Smith); works whose shortened form would be identical show as many authors as
 * it takes to tell them apart (Smith, Jones, et al., 2020). With no author, the title is used (in
 * quotation marks, or italic for a book or report), and with no year it is (Smith, n.d.).
 */
function buildCitations(sorted: readonly Result[], labels: readonly string[]): ApaCitation[] {
  const authors = sorted.map(citeAuthors);

  // First authors who share a surname but not initials need their initials in every citation.
  const initialsSeen = new Map<string, Set<string>>();
  for (const list of authors) {
    const first = list[0];
    if (first === undefined) continue;
    const key = alphaKey(first.family);
    initialsSeen.set(key, (initialsSeen.get(key) ?? new Set()).add(alphaKey(first.initials)));
  }
  const nameOf = (author: CiteAuthor, isFirst: boolean): string => {
    const needsInitials = isFirst && author.initials !== "" && (initialsSeen.get(alphaKey(author.family))?.size ?? 0) > 1;
    return needsInitials ? `${author.initials} ${author.family}` : author.family;
  };

  // Works with three or more authors that would shorten to the same "Smith et al., 2020".
  const shortForm = (list: CiteAuthor[], index: number) => `${nameOf(list[0] as CiteAuthor, true)}|${labels[index]}`;
  const crowded = new Map<string, number[]>();
  authors.forEach((list, index) => {
    if (list.length < 3) return;
    const key = shortForm(list, index);
    crowded.set(key, [...(crowded.get(key) ?? []), index]);
  });
  const shown = new Map<number, number>(); // how many authors to name before "et al."
  for (const indexes of crowded.values()) {
    if (indexes.length < 2) continue;
    const longest = Math.max(...indexes.map((index) => (authors[index] as CiteAuthor[]).length));
    let count = longest - 1;
    for (let k = 2; k < longest; k++) {
      const tuples = indexes.map((index) =>
        (authors[index] as CiteAuthor[]).slice(0, k).map((author) => alphaKey(`${author.family} ${author.initials}`)).join("|"),
      );
      if (new Set(tuples).size === tuples.length) {
        count = k;
        break;
      }
    }
    for (const index of indexes) shown.set(index, Math.min(count, (authors[index] as CiteAuthor[]).length - 1));
  }

  return sorted.map((result, index): ApaCitation => {
    const list = authors[index] as CiteAuthor[];
    const label = labels[index] as string;
    const part = (text: string, italic = false): ApaPart => ({ text, italic });

    if (list.length === 0) {
      const title = citeTitle(result.title === "" ? "Untitled" : result.title);
      if (STANDALONE_KINDS.has(referenceKind(result))) {
        return {
          parenthetical: [part("("), part(title, true), part(`, ${label})`)],
          narrative: [part(title, true), part(` (${label})`)],
        };
      }
      const comma = /[?!]$/.test(title) ? "" : ",";
      return {
        parenthetical: [part(`(“${title}${comma}” ${label})`)],
        narrative: [part(`“${title}” (${label})`)],
      };
    }

    const names = list.map((author, position) => nameOf(author, position === 0));
    let lead: { parenthetical: string; narrative: string };
    if (names.length === 1) lead = { parenthetical: names[0] as string, narrative: names[0] as string };
    else if (names.length === 2) lead = { parenthetical: `${names[0]} & ${names[1]}`, narrative: `${names[0]} and ${names[1]}` };
    else {
      const count = shown.get(index) ?? 1;
      const text = `${names.slice(0, count).join(", ")}${count > 1 ? "," : ""} et al.`;
      lead = { parenthetical: text, narrative: text };
    }
    return {
      parenthetical: [part(`(${lead.parenthetical}, ${label})`)],
      narrative: [part(`${lead.narrative} (${label})`)],
    };
  });
}

/**
 * Formats results as an APA 7 reference list: alphabetical by first author's family name (letter
 * by letter), then year; works with the same authors and the same year get a, b, c after the year in
 * title order. Each entry also carries how to cite it in the text. Nothing is added or removed, and
 * the input is not changed.
 */
export function buildReferenceList(results: readonly Result[], options: ApaOptions = {}): ApaEntry[] {
  const sorted = [...results].sort(compareResults);
  const labels = yearLabels(sorted);
  const citations = buildCitations(sorted, labels);

  return sorted.map((result, index) => {
    const parts = build(result, labels[index] as string, options);
    return {
      result,
      parts,
      text: textOf(parts),
      html: htmlOf(parts),
      checks: apaChecks(result),
      citation: citations[index] as ApaCitation,
    };
  });
}

/** The list as plain text: one reference per paragraph, blank line between. No italics. */
export function referenceListText(entries: readonly ApaEntry[]): string {
  return entries.length === 0 ? "" : `${entries.map((entry) => entry.text).join("\n\n")}\n`;
}

/** The list as HTML paragraphs with italics and a hanging indent, for pasting into a word processor. */
export function referenceListHtml(entries: readonly ApaEntry[]): string {
  return entries.map((entry) => entry.html).join("\n");
}
