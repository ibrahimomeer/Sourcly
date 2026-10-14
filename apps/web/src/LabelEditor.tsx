import {
  PEER_REVIEW_STATUSES,
  SOURCE_LEVELS,
  type LabelOverride,
  type Labels,
  type PeerReviewStatus,
  type SourceLevel,
} from "@sourcly/core";
import { labelText, valueName } from "./format";

/** The user's way to correct a label: pick a value, or go back to the rule's answer. */
export function LabelEditor({
  resultId,
  ruleLabels,
  override,
  onChange,
}: {
  resultId: string;
  /** What the rules say, ignoring any override. */
  ruleLabels: Labels;
  override: LabelOverride | undefined;
  onChange: (change: LabelOverride) => void;
}) {
  const levelId = `${resultId}-level`;
  const peerId = `${resultId}-peer`;

  return (
    <details className="panel">
      <summary>Change labels{override !== undefined ? " (you changed these)" : ""}</summary>
      <p className="muted">
        Labels are guesses from metadata. If you know better, set them yourself: the score and filters then use your choice.
      </p>
      <div className="field-row">
        <label htmlFor={levelId}>Level</label>
        <select
          id={levelId}
          value={override?.level ?? ""}
          onChange={(event) => onChange({ level: (event.target.value || undefined) as SourceLevel | undefined })}
        >
          <option value="">Use the rule ({labelText(ruleLabels.level)})</option>
          {SOURCE_LEVELS.map((level) => (
            <option key={level} value={level}>
              {valueName(level)}
            </option>
          ))}
        </select>
      </div>
      <div className="field-row">
        <label htmlFor={peerId}>Peer review</label>
        <select
          id={peerId}
          value={override?.peerReview ?? ""}
          onChange={(event) =>
            onChange({ peerReview: (event.target.value || undefined) as PeerReviewStatus | undefined })
          }
        >
          <option value="">Use the rule ({labelText(ruleLabels.peerReview)})</option>
          {PEER_REVIEW_STATUSES.map((status) => (
            <option key={status} value={status}>
              {valueName(status)}
            </option>
          ))}
        </select>
      </div>
    </details>
  );
}
