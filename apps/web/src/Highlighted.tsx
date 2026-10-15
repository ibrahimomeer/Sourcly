import { markText, type HighlightGroup } from "@sourcly/core";

/**
 * Text with the words that matched marked: the words of the search (lightly) and, in the counterargument
 * panel, the counterargument terms (heavily). Plain text when nothing matched.
 */
export function Highlighted({ text, groups }: { text: string; groups: readonly HighlightGroup[] }) {
  if (groups.every((group) => group.terms.length === 0)) return <>{text}</>;
  return (
    <>
      {markText(text, groups).map((segment, index) =>
        segment.term === null ? (
          <span key={index}>{segment.text}</span>
        ) : (
          <mark key={index} className={segment.group === "query" ? "mark-query" : undefined} title={`Matches “${segment.term}”`}>
            {segment.text}
          </mark>
        ),
      )}
    </>
  );
}
