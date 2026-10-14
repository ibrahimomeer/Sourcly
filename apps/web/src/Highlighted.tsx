import { highlightSegments } from "@sourcly/core";

/** Text with the words that matched the counterargument terms marked. Plain text when nothing matched. */
export function Highlighted({ text, terms }: { text: string; terms: readonly string[] }) {
  if (terms.length === 0) return <>{text}</>;
  return (
    <>
      {highlightSegments(text, terms).map((segment, index) =>
        segment.term === null ? (
          <span key={index}>{segment.text}</span>
        ) : (
          <mark key={index} title={`Matches “${segment.term}”`}>
            {segment.text}
          </mark>
        ),
      )}
    </>
  );
}
