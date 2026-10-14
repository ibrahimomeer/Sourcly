import { useState, type FormEvent } from "react";

export function SearchBox({ onSearch }: { onSearch: (query: string) => void }) {
  const [query, setQuery] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed !== "") onSearch(trimmed);
  }

  return (
    <form className="search" role="search" onSubmit={handleSubmit}>
      <label className="visually-hidden" htmlFor="query">
        Search query
      </label>
      <input
        id="query"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search academic sources"
        autoComplete="off"
      />
      <button type="submit">Search</button>
    </form>
  );
}
