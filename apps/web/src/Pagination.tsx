import type { Page } from "./paginate";

/** Previous / next controls for the merged list. Not shown when everything fits on one page. */
export function Pagination({
  page,
  shownOnPage,
  onPage,
  label,
}: {
  page: Page<unknown>;
  shownOnPage: number;
  onPage: (page: number) => void;
  /** Distinguishes the two copies (above and below the list) for screen readers. */
  label: string;
}) {
  if (page.totalPages <= 1) return null;
  const first = page.offset + 1;
  const last = page.offset + shownOnPage;

  return (
    <nav className="pagination" aria-label={label}>
      <button type="button" disabled={page.page <= 1} onClick={() => onPage(page.page - 1)}>
        Previous
      </button>
      <span>
        Page {page.page} of {page.totalPages} (results {first}–{last} of {page.total})
      </span>
      <button type="button" disabled={page.page >= page.totalPages} onClick={() => onPage(page.page + 1)}>
        Next
      </button>
    </nav>
  );
}
