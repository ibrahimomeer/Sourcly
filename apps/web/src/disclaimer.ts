import type { SourclyConfig } from "./config";
import { joinNames } from "./libraryLink";

// The "independent student project, not affiliated" notice. The wording is built from the configured names, so a fork
// that sets its own institutionName, libraries and siteName in config.js gets a notice that names its own institution
// and library. With the default config the text is exactly the one in the README's "Disclaimer" section (a test checks it).
//
// The notice speaks of the institution and its own library, which is the FIRST entry of `libraries`. The other libraries
// (UofT by default) are only links a person can use; they are named on their buttons and in the access note on a card, not here.

type Names = Pick<SourclyConfig, "institutionName" | "libraries">;

/** The library the project belongs to: the first of the configured libraries, or "" when there is none. */
function ownLibrary(config: Names): string {
  return config.libraries[0]?.name.trim() ?? "";
}

/** The short line under the footer: "Independent student project. Not affiliated with or endorsed by UBC or UBC Library." */
export function footerNotice(config: Names): string {
  const names = joinNames([config.institutionName, ownLibrary(config)]);
  return names === "" ? "Independent student project." : `Independent student project. Not affiliated with or endorsed by ${names}.`;
}

/** The full disclaimer, as in the README and on the Methodology page. */
export function fullDisclaimer(config: Pick<SourclyConfig, "siteName"> & Names): string {
  const { siteName, institutionName: institution } = config;
  const library = ownLibrary(config);
  const sentences = [`${siteName} is an independent student project.`];
  const official = institution !== "" ? institution : library;
  const names = joinNames([institution, library]);
  if (official !== "") {
    sentences.push(`It is not an official ${official} service and is not affiliated with, endorsed by or supported by ${names}.`);
  }
  if (library !== "") {
    sentences.push(`${library} links use your own ${institution !== "" ? `${institution} ` : ""}login, and access depends on ${library}'s subscriptions.`);
  }
  sentences.push("Labels and rankings are heuristics based on metadata; verify sources before citing.");
  return sentences.join(" ");
}

/** The line shown in Settings beside the library names and sign-in prefixes. */
export function libraryLinkNote(config: Pick<SourclyConfig, "siteName">): string {
  return `This only builds a link to your library's login. ${config.siteName} never sees your password or library account.`;
}
