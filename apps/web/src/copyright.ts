/** First year of the project; the footer shows a range once the year passes it. */
export const FIRST_YEAR = 2026;

/** "2026" during the first year, then "2026–<currentYear>" (en dash). */
export function copyrightYears(currentYear: number): string {
  return currentYear > FIRST_YEAR ? `${FIRST_YEAR}–${currentYear}` : String(FIRST_YEAR);
}
