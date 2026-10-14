/**
 * Common English words that carry no topic: they are dropped from unquoted parts of a
 * query, and never counted when matching a query against a result. The list includes
 * the question words ("what", "how", "why") and the auxiliary verbs ("does", "are"), so
 * a question reduces to its keywords. It is fixed and short on purpose: nothing here is
 * learned, and a word you want kept can be put in quotes.
 *
 * Only lowercase words are stopwords. AND, OR and NOT in capitals are operators.
 */
export const STOPWORDS: ReadonlySet<string> = new Set(
  (
    "a about above after again against all also am an and any are aren as at be because been before being below " +
    "between both but by can cannot could couldn did didn do does doesn doing don down during each few for from " +
    "further had hadn has hasn have haven having he her here hers him his how i if in into is isn it its itself ll " +
    "just me more most my no nor not of off on once only or other our ours out over own re same shall she should " +
    "shouldn so some such than that the their theirs them then there these they this those through to too under " +
    "until up ve very was wasn we were weren what when where which while who whom whose why will with won would " +
    "wouldn you your yours dont doesnt didnt isnt arent wasnt werent havent hasnt hadnt wont wouldnt couldnt shouldnt cant"
  ).split(" "),
);
