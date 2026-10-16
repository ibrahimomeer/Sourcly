// Sourcly configuration: OPTIONAL. Sourcly works without this file. Every value below already has a built-in
// default, and the offline copy (a single .html file) does not need this file next to it. Leave it as it is,
// or delete it, unless you run your own copy of the site (a fork).
//
// This is a plain classic script. It is NOT bundled into the app, so you can edit it after building without
// rebuilding. Uncomment a line to override that one value; anything you leave out keeps its default. Normal users
// do not edit files: the library name, the library link, the contact email and the OpenAlex key are in Settings.
//
// FORKS: change institutionName and libraryName to your own institution and library, and adapt the "Disclaimer"
// in README.md and "About this project" in docs/methodology.md to match, so the "independent student project, not
// affiliated with ..." notice never names an institution that is not yours. Use no logo, crest, colour or wording
// that suggests an official service of that institution. An empty string ("") names none.
window.SOURCLY_CONFIG = {
  // siteName: "Sourcly",                  // shown in the page title and header
  // authorName: "Sourcly",                // the footer's copyright line
  // institutionName: "UBC",               // named in the "not affiliated" notice
  // libraryName: "UBC Library",           // the library the "Access with ..." button signs in to
  // repoUrl: "https://github.com/ibrahimomeer/Sourcly",   // the GitHub and Methodology links, and the Download link
  // siteUrl: "https://sourcly.getscove.com",              // where the newest version lives (shown by the offline copy)
  // libraryProxyPrefix: "https://go.openathens.net/redirector/ubc.ca?url=",   // "" hides the library button
  // librarySearchUrl: "https://ubc.summon.serialssolutions.com/search?s.q=",  // "" hides the library search link
  // contactEmail: "",                     // do not commit a personal address; people set their own in Settings
};
