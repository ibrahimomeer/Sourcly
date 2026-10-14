/** Results shown on one page of the merged list. */
export const PAGE_SIZE = 25;

export interface Page<T> {
  items: T[];
  /** The page actually shown, 1-based, after clamping into range. */
  page: number;
  totalPages: number;
  /** Position of the first item on this page in the whole list, 0-based. */
  offset: number;
  total: number;
}

/** Cuts one page out of a list. A page number outside the list is moved to the nearest real page. */
export function paginate<T>(items: readonly T[], page: number, pageSize: number = PAGE_SIZE): Page<T> {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const clamped = Math.min(totalPages, Math.max(1, Number.isFinite(page) ? Math.floor(page) : 1));
  const offset = (clamped - 1) * pageSize;
  return { items: items.slice(offset, offset + pageSize), page: clamped, totalPages, offset, total: items.length };
}
