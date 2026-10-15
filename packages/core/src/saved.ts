import { asArray, asBoolean, asHttpUrl, asInteger, asNumber, asRecord, asString } from "./json";
import { stripMarkup } from "./text";
import { PROVIDER_NAMES, type OaStatus, type ProviderHit, type ProviderId, type Result, type WorkType } from "./types";

// The list of sources the user saves. Logic only: the page decides where it is kept (this
// browser's localStorage). A saved source is a snapshot of the result as it was when saved, so a
// reference can be made later without searching again.

export interface SavedItem {
  result: Result;
  /** When it was saved, as an ISO date and time. */
  savedAt: string;
}

/** Bumped if the stored shape ever changes, so old data can be recognised. */
export const SAVED_FORMAT_VERSION = 1;

/** The most sources the list holds, so it can never outgrow what a browser will store. */
export const MAX_SAVED = 500;

/** The result without the parts a reference does not need (the abstract and the subject terms are the bulky ones). */
export function toSavedResult(result: Result): Result {
  return { ...result, abstract: null, subjects: [] };
}

export function isSaved(list: readonly SavedItem[], id: string): boolean {
  return list.some((item) => item.result.id === id);
}

/** Whether another source can be added. */
export function canSave(list: readonly SavedItem[]): boolean {
  return list.length < MAX_SAVED;
}

/** The list with the result added at the front (newest first). A source already on the list, or a full list, changes nothing. */
export function addSaved(list: readonly SavedItem[], result: Result, now: Date): SavedItem[] {
  if (isSaved(list, result.id) || !canSave(list)) return [...list];
  return [{ result: toSavedResult(result), savedAt: now.toISOString() }, ...list];
}

export function removeSaved(list: readonly SavedItem[], id: string): SavedItem[] {
  return list.filter((item) => item.result.id !== id);
}

export function savedResults(list: readonly SavedItem[]): Result[] {
  return list.map((item) => item.result);
}

export function serializeSaved(list: readonly SavedItem[]): string {
  return JSON.stringify({ version: SAVED_FORMAT_VERSION, items: list });
}

// ---- Reading stored data back. Anything in browser storage is untrusted, so every field is
// checked and rebuilt rather than trusted: a bad field becomes null, a bad item is dropped.

const WORK_TYPES: readonly WorkType[] = [
  "journal-article", "review", "preprint", "conference-paper", "book", "book-chapter",
  "reference-entry", "thesis", "report", "dataset", "other", "unknown",
];
const OA_STATUSES: readonly OaStatus[] = ["gold", "diamond", "hybrid", "green", "bronze", "closed", "unknown"];

const oneOf = <T extends string>(value: unknown, allowed: readonly T[]): T | null =>
  typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;

function readHits(value: unknown): ProviderHit[] {
  const providers = Object.keys(PROVIDER_NAMES) as ProviderId[];
  return asArray(value).flatMap((raw) => {
    const hit = asRecord(raw);
    const provider = oneOf(hit?.provider, providers);
    const id = asString(hit?.id);
    const rank = asInteger(hit?.rank);
    const listSize = asInteger(hit?.listSize);
    if (provider === null || id === null || rank === null || listSize === null) return [];
    return [{ provider, id, rank, listSize, score: asNumber(hit?.score) }];
  });
}

function readResult(raw: unknown): Result | null {
  const record = asRecord(raw);
  const id = asString(record?.id);
  if (record === null || id === null || id === "") return null;

  const authors = asArray(record.authors).flatMap((entry) => {
    const author = asRecord(entry);
    const name = asString(author?.name);
    if (name === null) return [];
    const family = asString(author?.family);
    const given = asString(author?.given);
    return [{ name, ...(family === null ? {} : { family }), ...(given === null ? {} : { given }) }];
  });
  const access = asRecord(record.openAccess);
  const retraction = asRecord(record.retraction);

  return {
    id,
    // Markup that an older version stored (a title with <i> in it) is removed on the way back in.
    title: stripMarkup(asString(record.title)),
    authors,
    year: asInteger(record.year),
    venue: stripMarkup(asString(record.venue)) || null,
    venueKind: null,
    volume: asString(record.volume),
    issue: asString(record.issue),
    pages: asString(record.pages),
    doi: asString(record.doi),
    // Only web addresses are kept, so stored data can never put a script address on a link.
    url: asHttpUrl(record.url),
    abstract: null,
    type: oneOf(record.type, WORK_TYPES) ?? "unknown",
    rawType: null,
    citationCount: asInteger(record.citationCount),
    language: asString(record.language),
    authorCountries: [],
    openAccess: {
      isOpen: asBoolean(access?.isOpen),
      status: oneOf(access?.status, OA_STATUSES) ?? "unknown",
      url: asHttpUrl(access?.url),
      pdfUrl: asHttpUrl(access?.pdfUrl),
    },
    retraction: { retracted: asBoolean(retraction?.retracted), source: asString(retraction?.source) },
    subjects: [],
    hits: readHits(record.hits),
  };
}

/** The saved list from stored text. Anything unreadable gives an empty list; unreadable items are dropped. */
export function parseSaved(stored: string | null | undefined): SavedItem[] {
  if (stored === null || stored === undefined || stored === "") return [];
  let data: unknown;
  try {
    data = JSON.parse(stored);
  } catch {
    return [];
  }
  const record = asRecord(data);
  if (record === null || record.version !== SAVED_FORMAT_VERSION) return [];

  const seen = new Set<string>();
  const items: SavedItem[] = [];
  for (const entry of asArray(record.items)) {
    const item = asRecord(entry);
    const result = readResult(item?.result);
    if (result === null || seen.has(result.id)) continue;
    const savedAt = asString(item?.savedAt);
    seen.add(result.id);
    items.push({ result, savedAt: savedAt !== null && !Number.isNaN(Date.parse(savedAt)) ? savedAt : new Date(0).toISOString() });
    if (items.length >= MAX_SAVED) break;
  }
  return items;
}
