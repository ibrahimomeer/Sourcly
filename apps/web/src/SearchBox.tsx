import type { FormEvent, ReactNode } from "react";

export function SearchBox({
  value,
  onChange,
  onSearch,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  onSearch: (query: string) => void;
  /** Shown directly under the box: what the text was detected as, and suggested terms. */
  children?: ReactNode;
}) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (value.trim() !== "") onSearch(value);
  }

  return (
    <>
      <form className="search" role="search" onSubmit={handleSubmit}>
        <label className="visually-hidden" htmlFor="query">
          Search query
        </label>
        <input
          id="query"
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Search academic sources"
          autoComplete="off"
        />
        <button type="submit">Search</button>
      </form>

      {children}

      <details className="panel search-tips">
        <summary>How to write a search</summary>
        <ul>
          <li>
            Write the key concepts as nouns: <code>machine learning odor prediction</code> works better than a question.
            Avoid question words and generic verbs (“how”, “understand”, “use”): they are not required, and only add a
            small boost.
          </li>
          <li>
            Every concept has to match. A concept is a word, or a phrase kept together in quotes:{" "}
            <code>"state of the art"</code>. Each concept also matches a few curated alternatives (spellings,
            abbreviations, close synonyms), listed under “How we searched”. <strong>Your text is never changed.</strong>
          </li>
          <li>
            A word in capitals, such as <code>AI</code> or <code>CAN</code>, is an abbreviation: it is always searched, and
            matched with its capitals, as a whole word.
          </li>
          <li>
            <code>OR</code> matches either side, and <code>NOT</code> leaves a word out. Write them in capitals:{" "}
            <code>sleep OR nap NOT rats</code>. Parentheses group: <code>(sleep OR nap) memory</code>.
          </li>
          <li>
            Settings has “Search exactly as typed” (no word removed, no alternatives added, text sent as it is) and a
            switch for the curated alternatives.
          </li>
          <li>
            Not every source understands every operator. After a search, “How we searched” shows what each one received
            and what it could not apply.
          </li>
        </ul>
      </details>
    </>
  );
}
