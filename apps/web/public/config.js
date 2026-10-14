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

  // Prefix for the "Open via UBC Library" button: prefix + DOI/URL.
  // Verify against UBC Library's official guidance before relying on it.
  ezproxyPrefix: "https://login.ezproxy.library.ubc.ca/login?url=",

  // Target of the footer "Download" link.
  downloadUrl: "https://github.com/ibrahimomeer/Sourcly/releases/latest",
};
