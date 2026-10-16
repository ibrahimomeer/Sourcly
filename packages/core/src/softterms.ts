// Soft terms: generic academic words that say how a paper is written, not what it is about ("understand",
// "using", "novel", "effects of"). A search for "How AI understand odor" is about AI and odor; "understand" is
// filler. A soft term is NOT required to match, is NOT sent to a source as a required word, and only gives a small
// boost in the relevance score when a result contains it (weight 0.3, against 1.0 for a hard term).
//
// Plain data. A word is here only if it is generic in almost every field. Add one only if it would be wrong to
// require it in a search about any subject (see CONTRIBUTING.md). If a query has no hard terms, soft terms count as hard.

export const SOFT_TERMS: readonly string[] = [
  // understanding and explaining
  "understand", "understanding", "understood", "understands", "explain", "explains", "explained", "explanation", "explaining",
  "overview", "introduction", "tutorial", "guide", "primer", "basics", "basic",
  // using and doing
  "use", "uses", "used", "using", "usage", "utilize", "utilise", "utilizing", "utilising", "employ", "employing",
  "work", "works", "working", "worked", "way", "ways", "make", "makes", "making", "made", "help", "helps", "helping", "helped",
  "get", "getting", "give", "gives", "take", "takes", "need", "needs", "want", "wants", "try", "trying",
  // newness and generality
  "new", "novel", "recent", "recently", "current", "modern", "latest", "emerging", "advance", "advances", "advancing",
  "improved", "improving", "improvement", "improvements", "better", "best", "good", "great", "important", "importance",
  "different", "various", "several", "general", "generally", "common", "commonly", "typical", "typically",
  // studies and results
  "study", "studies", "studying", "studied", "research", "researches", "investigation", "investigating", "investigate",
  "paper", "papers", "article", "articles", "report", "reports", "finding", "findings", "found", "show", "shows", "shown", "showing",
  "result", "results", "evidence", "case", "cases", "example", "examples", "question", "questions", "problem", "problems", "issue", "issues",
  // effects and relations
  "effect", "effects", "effective", "effectively", "impact", "impacts", "impacting", "role", "roles", "influence", "influences", "influencing",
  "affect", "affects", "affecting", "affected", "relationship", "relationships", "relation", "relations", "related", "relating",
  "benefit", "benefits", "advantage", "advantages", "implication", "implications", "consequence", "consequences",
  // approaches
  "based", "approach", "approaches", "method", "methods", "methodology", "technique", "techniques", "strategy", "strategies",
  "framework", "frameworks", "tool", "tools", "application", "applications", "applied", "applying", "application-based",
  "via", "toward", "towards", "using", "across", "among", "within", "versus", "vs",
  "perspective", "perspectives", "review", "reviews", "survey", "trend", "trends", "challenge", "challenges", "opportunity", "opportunities",
];
