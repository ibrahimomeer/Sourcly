// Sourcly configuration.
//
// This is a plain classic script. It is NOT bundled or inlined into the app, so
// you can edit it after building (or after unzipping a release) to rebrand the
// site. Forks and downloaders only need to change this file.
window.SOURCLY_CONFIG = {
  // Name shown in the page title and header.
  siteName: "Sourcly",

  // Shown in the footer copyright line. Use a person, team or project name.
  authorName: "Sourcly",

  // Source repository. The header's GitHub and Methodology links and the footer's
  // "Source on GitHub" link are built from this.
  repoUrl: "https://github.com/ibrahimomeer/Sourcly",

  // Contact email for providers that ask for one (Crossref's polite pool, and
  // Unpaywall, which requires it). OpenAlex does not use it. Leave empty to ship
  // nothing; Unpaywall stays disabled until this is set. Do not commit a personal
  // email. (Not used yet: those providers arrive in a later stage.)
  contactEmail: "",

  // Library sign-in prefix for the "Open via UBC Library" button. The link is the
  // prefix followed by the work's address, percent-encoded as one value: the
  // publisher's landing page when the result has one, otherwise https://doi.org/<DOI>.
  // Leave it empty ("") to hide the button.
  //
  // The default is UBC Library's OpenAthens redirector, the library's current method
  // (guides.library.ubc.ca/connect, updated July 2026). It was tested with a publisher
  // landing page and with a doi.org link, both percent-encoded.
  //
  // NOTE: the legacy EZproxy prefix, https://login.ezproxy.library.ubc.ca/login?url=,
  // no longer works for most resources. UBC replaced EZproxy with OpenAthens in 2021
  // and says only a few resources (it names three) still require it. Do not use it.
  //
  // Other libraries: put your own proxy prefix here. For an old-style EZproxy prefix,
  // end it in "qurl=" rather than "url=", because the address is sent encoded.
  libraryProxyPrefix: "https://go.openathens.net/redirector/ubc.ca?url=",

  // Target of the footer "Download" link.
  downloadUrl: "https://github.com/ibrahimomeer/Sourcly/releases/latest",
};
