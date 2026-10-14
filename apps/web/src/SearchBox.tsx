import type { FormEvent } from "react";

export function SearchBox({
  value,
  onChange,
  onSearch,
}: {
  value: string;
  onChange: (value: string) => void;
  onSearch: (query: string) => void;
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
      <details className="panel search-tips">
        <summary>How to write a search</summary>
        <ul>
          <li>
            Words next to each other must all match: <code>sleep memory</code>.
          </li>
          <li>
            Quotes keep words together as a phrase: <code>"memory consolidation"</code>.
          </li>
          <li>
            <code>OR</code> matches either side, and <code>NOT</code> leaves a word out. Write them in capitals:{" "}
            <code>sleep OR nap NOT rats</code>. Parentheses group: <code>(sleep OR nap) memory</code>.
          </li>
          <li>
            Common words such as “what”, “is” and “the” are removed from a question before searching. The box then shows
            the words that were searched, and you can edit them. Words inside quotes are kept.
          </li>
          <li>
            Not every source understands every operator. After a search, “Exact query sent to each source” shows what each
            one received and what it could not apply.
          </li>
        </ul>
      </details>
    </>
  );
}
