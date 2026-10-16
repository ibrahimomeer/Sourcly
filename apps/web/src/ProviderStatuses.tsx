import { PROVIDER_NAMES, type ProviderStatus } from "@sourcly/core";
import { pluralize } from "./format";
import { BlockedFromFileNotice, useRuntime } from "./RuntimeContext";
import { looksBlockedFromFile } from "./runtime";
import { orderedStatuses, type ActiveSearch } from "./searchState";

function describe(status: ProviderStatus): string {
  if (status.state === "ok") {
    return `ok, ${pluralize(status.count, "result")}${status.cached === true ? " (remembered from earlier in this visit)" : ""}`;
  }
  return `${status.state}. ${status.message}`;
}

/**
 * One line per source: searching, ok, rate-limited, failed or skipped, so a gap
 * in the results is never silent. Sources keep the order they were asked in.
 */
export function ProviderStatuses({ search }: { search: ActiveSearch }) {
  const { isLocalFile } = useRuntime();
  const answered = orderedStatuses(search);
  const byProvider = new Map(answered.map((status) => [status.provider, status]));
  const rows = [
    ...search.order.map((id) => ({ id, status: byProvider.get(id) ?? null })),
    // Sources that were never asked (skipped) come after the ones that were.
    ...answered.filter((status) => !search.order.includes(status.provider)).map((status) => ({ id: status.provider, status })),
  ];
  if (rows.length === 0) return null;

  const blocked = looksBlockedFromFile(
    isLocalFile,
    answered.flatMap((status) => (status.state === "ok" ? [] : [status])),
  );

  return (
    <>
      {blocked && <BlockedFromFileNotice />}
    <ul className="statuses" aria-label="Source status">
      {rows.map(({ id, status }) => (
        <li
          key={id}
          className={status === null ? undefined : status.state === "ok" ? undefined : status.state === "skipped" ? "status-skipped" : "status-problem"}
        >
          <strong>{PROVIDER_NAMES[id]}:</strong> {status === null ? "searching…" : describe(status)}
        </li>
      ))}
    </ul>
    </>
  );
}
