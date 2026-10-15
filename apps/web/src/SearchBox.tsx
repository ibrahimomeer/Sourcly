import type { FormEvent, ReactNode } from "react";

export function SearchBox({
  value,
  onChange,
  onSearch,
  ignoreCommon,
  onIgnoreCommonChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  /** `exact` is true for "Search exactly as typed". */
  onSearch: (query: string, exact: boolean) => void;
  ignoreCommon: boolean;
  onIgnoreCommonChange: (ignore: boolean) => void;
  /** Shown directly under the box: how the text is read. */
  children?: ReactNode;
}) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (value.trim() !== "") onSearch(value, false);
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

      <div className="search-options">
        <label className="check">
          <input type="checkbox" checked={ignoreCommon} onChange={(event) => onIgnoreCommonChange(event.target.checked)} />
          Ignore common words
        </label>
        <button
          type="button"
          className="small-button"
          disabled={value.trim() === ""}
          title="Sends your text to every source as it is: no word removed, no word-ending changes, no operators added"
          onClick={() => onSearch(value, true)}
        >
          Search exactly as typed
        </button>
      </div>

      {children}

      <details className="panel search-tips">
        <summary>How to write a search</summary>
        <ul>
          <li>
            Words next to each other must all match: <code>sleep memory</code>. Under the box, “Searching for” shows the
            words that will be used. <strong>Your text is never changed</strong>: click a word to leave it out of the search.
          </li>
          <li>
            Quotes keep words together as a phrase, with every word inside them, common ones too:{" "}
            <code>"state of the art"</code>.
          </li>
          <li>
            <code>OR</code> matches either side, and <code>NOT</code> leaves a word out. Write them in capitals:{" "}
            <code>sleep OR nap NOT rats</code>. Parentheses group: <code>(sleep OR nap) memory</code>.
          </li>
          <li>
            Common words such as “what”, “is” and “the” are not used while “Ignore common words” is on. They are listed
            under “Ignored common words”, and clicking one puts it back. A word in capitals, such as <code>CAN</code> bus
            or <code>US</code>, is always used. The full list is in Settings.
          </li>
          <li>
            “Search exactly as typed” sends your text to every source unchanged: no word removed, no word endings
            changed, no operators added.
          </li>
          <li>
            Not every source understands every operator. After a search, “Queries sent” shows what each one received and
            what it could not apply.
          </li>
        </ul>
      </details>
    </>
  );
}
