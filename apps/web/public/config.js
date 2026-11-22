// Sourcly configuration: OPTIONAL. Sourcly works without this file. Every value below already has a built-in
// default, and the offline copy (a single .html file) does not need this file next to it. Leave it as it is,
// or delete it, unless you run your own copy of the site (a fork).
//
// This is a plain classic script. It is NOT bundled into the app, so you can edit it after building without
// rebuilding. Uncomment a line to override that one value; anything you leave out keeps its default. Normal users
// do not edit files: the library names and links, the contact email and the OpenAlex key are in Settings.
//
// FORKS: change institutionName and the libraries to your own institution and libraries, and adapt the "Disclaimer"
// in README.md and "About this project" in docs/methodology.md to match, so the "independent student project, not
// affiliated with ..." notice never names an institution that is not yours. Use no logo, crest, colour or wording
// that suggests an official service of that institution. An empty string ("") names none.
window.SOURCLY_CONFIG = {
  // siteName: "Sourcly",                  // shown in the page title and header
  // authorName: "Sourcly",                // the footer's copyright line
  // institutionName: "UBC",               // named in the "not affiliated" notice
  // repoUrl: "https://github.com/ibrahimomeer/Sourcly",   // the GitHub and Methodology links, and the Download link
  // siteUrl: "https://sourcly.getscove.com",              // where the newest version lives (shown by the offline copy)
  // contactEmail: "",                     // do not commit a personal address; people set their own in Settings
  //
  // The libraries that get an "Access with <name>" button, in this order, and a search link under "Search elsewhere".
  // The button's link is proxyPrefix followed by the work's address, percent-encoded as one value (so a prefix for an
  // EZproxy library ends in "qurl=", an OpenAthens redirector in "url="). An empty proxyPrefix or searchUrl hides that
  // button or link; an empty list ([]) hides every library. The FIRST library is the institution's own: the "not
  // affiliated" notice names it next to institutionName. The others are only links. These are the defaults:
  // libraries: [
  //   {
  //     name: "UBC Library",
  //     proxyPrefix: "https://go.openathens.net/redirector/ubc.ca?url=",
  //     searchUrl: "https://ubc.summon.serialssolutions.com/search?s.q=",
  //   },
  //   {
  //     name: "UofT",
  //     proxyPrefix: "https://myaccess.library.utoronto.ca/login?qurl=",
  //     searchUrl: "https://librarysearch.library.utoronto.ca/nde/search?vid=01UTORONTO_INST:UTORONTO_NDE&query=",
  //   },
  // ],
};
