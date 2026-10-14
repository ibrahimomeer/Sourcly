import { parseCounterTerm } from "@sourcly/core";
import { useState, type KeyboardEvent } from "react";

/**
 * The counterargument terms as chips the person can remove, with a box to add their own.
 * What is shown is exactly the list used in the search and for highlighting.
 */
export function CounterTerms({
  terms,
  onChange,
  onReset,
  isDefault,
}: {
  terms: readonly string[];
  onChange: (terms: string[]) => void;
  onReset: () => void;
  /** True when the list is the one Sourcly ships with. */
  isDefault: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  function handleAdd() {
    if (draft.trim() === "") return;
    const parsed = parseCounterTerm(draft);
    if (!parsed.ok) {
      setProblem(parsed.reason);
      return;
    }
    setProblem(null);
    setDraft("");
    if (!terms.some((term) => term.toLowerCase() === parsed.term.toLowerCase())) onChange([...terms, parsed.term]);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    handleAdd();
  }

  return (
    <div className="counter-terms">
      <ul className="chips" aria-label="Counterargument terms">
        {terms.map((term) => (
          <li key={term}>
            <span className="chip chip-term">
              {term}
              <button
                type="button"
                className="chip-remove"
                aria-label={`Remove ${term}`}
                title={`Remove “${term}”`}
                onClick={() => onChange(terms.filter((other) => other !== term))}
              >
                ×
              </button>
            </span>
          </li>
        ))}
        {terms.length === 0 && <li className="muted">No terms. Add one below.</li>}
      </ul>

      {/* Not a form of its own: this sits inside the search form, and Enter here adds a term instead of searching. */}
      <div className="field-row">
        <label htmlFor="counter-term">Add a term</label>
        <input
          id="counter-term"
          type="text"
          value={draft}
          autoComplete="off"
          placeholder="a word or short phrase"
          onChange={(event) => {
            setDraft(event.target.value);
            setProblem(null);
          }}
          onKeyDown={handleKeyDown}
        />
        <button type="button" disabled={draft.trim() === ""} onClick={handleAdd}>
          Add
        </button>
        <button type="button" disabled={isDefault} onClick={onReset}>
          Reset terms
        </button>
      </div>
      {problem !== null && (
        <p className="warning" role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}
