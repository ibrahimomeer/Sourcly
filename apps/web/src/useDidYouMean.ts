import { createPubmedSpellchecker, type SpellingSuggestion } from "@sourcly/core";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RankedView } from "./pipeline";
import type { SearchState } from "./searchState";
import { suggestionFor, wordsToAsk } from "./spelling";

/**
 * A "Did you mean ...?" suggestion for the finished search, or null. It asks PubMed's spell checker (once
 * per set of words, remembered for this visit) and only offers the answer; it never changes anything.
 * A failed request is not an error worth showing: there is simply no suggestion.
 */
export function useDidYouMean(search: SearchState, ranked: RankedView | null, contactEmail: string): SpellingSuggestion | null {
  const words = useMemo(() => wordsToAsk(search, ranked), [search, ranked]);
  const key = words.join(" ");
  const searchId = search.phase === "idle" ? null : search.id;
  const remembered = useRef(new Map<string, string | null>());
  const [answer, setAnswer] = useState<{ id: number; key: string; corrected: string | null } | null>(null);

  useEffect(() => {
    if (key === "" || searchId === null) return undefined;
    const known = remembered.current.get(key);
    if (known !== undefined) {
      setAnswer({ id: searchId, key, corrected: known });
      return undefined;
    }
    const controller = new AbortController();
    createPubmedSpellchecker({ email: contactEmail })(key.split(" "), controller.signal)
      .then((corrected) => {
        remembered.current.set(key, corrected);
        if (!controller.signal.aborted) setAnswer({ id: searchId, key, corrected });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [key, searchId, contactEmail]);

  return useMemo(
    () => (answer === null || answer.id !== searchId || answer.key !== key ? null : suggestionFor(search, words, answer.corrected)),
    [answer, searchId, key, search, words],
  );
}
