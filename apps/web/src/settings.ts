import type { FactorId, FactorSetting, LabelOverride, ScoringSettings } from "@sourcly/core";

/** Adds the value if it is missing, removes it if present. Returns a new list. */
export function toggleInList<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

/** A copy of the scoring settings with one factor's switch or weight changed. */
export function withFactor(
  settings: ScoringSettings,
  id: FactorId,
  change: Partial<FactorSetting>,
): ScoringSettings {
  return { ...settings, factors: { ...settings.factors, [id]: { ...settings.factors[id], ...change } } };
}

/**
 * A copy of the overrides with one result's override changed. A key set to
 * undefined clears that axis, and a result with nothing left is removed, so
 * "no override" and "empty override" are never confused.
 */
export function withOverride(
  overrides: ReadonlyMap<string, LabelOverride>,
  resultId: string,
  change: LabelOverride,
): Map<string, LabelOverride> {
  const next = new Map(overrides);
  const merged: LabelOverride = { ...overrides.get(resultId), ...change };
  const cleaned: LabelOverride = {};
  if (merged.level !== undefined) cleaned.level = merged.level;
  if (merged.peerReview !== undefined) cleaned.peerReview = merged.peerReview;

  if (cleaned.level === undefined && cleaned.peerReview === undefined) next.delete(resultId);
  else next.set(resultId, cleaned);
  return next;
}
