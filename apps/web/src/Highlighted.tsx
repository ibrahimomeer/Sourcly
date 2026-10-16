import { markText, type HighlightGroup } from "@sourcly/core";

const isEmpty = (group: HighlightGroup) => group.terms.length === 0 && (group.spans === undefined || group.spans.length === 0);

/**
 * Text with the matches marked: the concepts of the search (lightly; their places were found by the same matching that
 * ranks the result) and, in the counterargument panel, the counterargument terms (heavily). Plain text when nothing matched.
 */
export function Highlighted({ text, groups }: { text: string; groups: readonly HighlightGroup[] }) {
  if (groups.every(isEmpty)) return <>{text}</>;
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
