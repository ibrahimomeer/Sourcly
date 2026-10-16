import type { SourclyConfig } from "./config";

// The "independent student project, not affiliated" notice. The wording is built from the configured names, so a fork
// that sets its own institutionName, libraryName and siteName in config.js gets a notice that names its own institution
// and library. With the default config the text is exactly the one in the README's "Disclaimer" section (a test checks it).

/** "A", "A or B", "A, B or C"; each name once, empty ones left out. */
function joinNames(names: readonly string[]): string {
  const unique = names.filter((name, index) => name !== "" && names.indexOf(name) === index);
  if (unique.length <= 1) return unique.join("");
  return `${unique.slice(0, -1).join(", ")} or ${unique[unique.length - 1]}`;
}

/** The short line under the footer: "Independent student project. Not affiliated with or endorsed by UBC or UBC Library." */
export function footerNotice(config: Pick<SourclyConfig, "institutionName" | "libraryName">): string {
  const names = joinNames([config.institutionName, config.libraryName]);
  return names === "" ? "Independent student project." : `Independent student project. Not affiliated with or endorsed by ${names}.`;
}

/** The full disclaimer, as in the README and on the Methodology page. */
export function fullDisclaimer(config: Pick<SourclyConfig, "siteName" | "institutionName" | "libraryName">): string {
  const { siteName, institutionName: institution, libraryName: library } = config;
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

/** The line shown in Settings beside the library name and sign-in prefix. */
export function libraryLinkNote(config: Pick<SourclyConfig, "siteName">): string {
  return `This only builds a link to your library's login. ${config.siteName} never sees your password or library account.`;
}
