/**
 * MeSH "check tags": headings that NLM indexers attach by routine to say which species, age
 * group, country or historical period a study concerns. They are on a large share of
 * biomedical records ("Humans", "Male", "Adult") and say almost nothing about the topic, so
 * they are not offered as related terms.
 *
 * The 40 terms are those listed in the NLM Lister Hill Center report "Check Tags MeSH Terms
 * Indexing Research Project" (D. Le and J. G. Mork), which names the 40 headings it studies.
 */
export const CHECK_TAGS: ReadonlySet<string> = new Set(
  [
    "Adolescent",
    "Adult",
    "Aged",
    "Aged, 80 and over",
    "Animals",
    "Bees",
    "Cats",
    "Cattle",
    "Chlorocebus aethiops",
    "Chick Embryo",
    "Child",
    "Child, Preschool",
    "Cricetinae",
    "Dogs",
    "Female",
    "Guinea Pigs",
    "History of Medicine",
    "History, 15th Century",
    "History, 16th Century",
    "History, 17th Century",
    "History, 18th Century",
    "History, 19th Century",
    "History, 20th Century",
    "History, 21st Century",
    "History, Ancient",
    "History, Medieval",
    "Horses",
    "Humans",
    "Infant",
    "Infant, Newborn",
    "Male",
    "Mice",
    "Middle Aged",
    "Pregnancy",
    "Rabbits",
    "Rats",
    "Sheep",
    "Swine",
    "United States",
    "Young Adult",
  ].map((term) => term.toLowerCase()),
);

export function isCheckTag(term: string): boolean {
  return CHECK_TAGS.has(term.trim().toLowerCase());
}
