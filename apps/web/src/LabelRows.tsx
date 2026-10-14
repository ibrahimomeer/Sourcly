import type { Labels, PeerReviewStatus, SourceLevel } from "@sourcly/core";
import { Badge, type BadgeStyle } from "./Badge";
import { labelText } from "./format";

const LEVEL_STYLE: Record<SourceLevel, BadgeStyle> = {
  primary: "solid",
  secondary: "dashed",
  tertiary: "dotted",
  other: "faint",
  unknown: "faint-dashed",
};

const PEER_REVIEW_STYLE: Record<PeerReviewStatus, BadgeStyle> = {
  "peer-reviewed": "solid",
  "not-peer-reviewed": "dashed",
  unknown: "faint-dashed",
};

/**
 * Both labels with their reasons. A label is never shown without why it was
 * given and which metadata field it came from.
 */
export function LabelRows({ labels }: { labels: Labels }) {
  const rows = [
    { name: "Level", label: labels.level, style: LEVEL_STYLE[labels.level.value] },
    { name: "Peer review", label: labels.peerReview, style: PEER_REVIEW_STYLE[labels.peerReview.value] },
  ];

  return (
    <ul className="labels">
      {rows.map(({ name, label, style }) => (
        <li key={name}>
          <span className="label-name">{name}:</span> <Badge style={style}>{labelText(label)}</Badge>{" "}
          <span className="label-reason">
            {label.reason} <span className="muted">(from {label.field})</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
