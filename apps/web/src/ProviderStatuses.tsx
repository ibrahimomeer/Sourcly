import { PROVIDER_NAMES, type ProviderStatus } from "@sourcly/core";
import { pluralize } from "./format";

/** One line per source asked: ok, rate-limited or failed, so a gap is never silent. */
export function ProviderStatuses({ statuses }: { statuses: readonly ProviderStatus[] }) {
  if (statuses.length === 0) return null;

  return (
    <ul className="statuses" aria-label="Source status">
      {statuses.map((status) => (
        <li key={status.provider} className={status.state === "ok" ? undefined : "status-problem"}>
          <strong>{PROVIDER_NAMES[status.provider]}:</strong>{" "}
          {status.state === "ok" ? `ok, ${pluralize(status.count, "result")}` : `${status.state}. ${status.message}`}
        </li>
      ))}
    </ul>
  );
}
