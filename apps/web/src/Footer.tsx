import { Fragment, type ReactNode } from "react";
import { releasesUrl, type SourclyConfig } from "./config";
import { copyrightYears } from "./copyright";
import { footerNotice } from "./disclaimer";
import { runningFromFile } from "./runtime";
import { APP_VERSION, versionLabel } from "./version";

/** The label of the footer's link to the GitHub Releases page (a plain link: the page asks GitHub for nothing). */
export const DOWNLOAD_LABEL = "Download offline copy (GitHub Releases)";

export function Footer({ config, isLocalFile = runningFromFile() }: { config: SourclyConfig; isLocalFile?: boolean }) {
  const years = copyrightYears(new Date().getFullYear());
  const download = releasesUrl(config);

  const parts: ReactNode[] = [
    config.authorName === "" ? `© ${years}` : `© ${years} ${config.authorName}`,
    "MIT License",
  ];
  if (config.repoUrl !== "") {
    parts.push(
      <a href={config.repoUrl} target="_blank" rel="noopener noreferrer">
        Source on GitHub
      </a>,
    );
  }
  // The offline copy is already downloaded, so it offers no download. It cannot update itself either, so it says where
  // the newest version is. The hosted site links to the Releases page and sends GitHub nothing.
  if (!isLocalFile && download !== "") {
    parts.push(
      <a href={download} target="_blank" rel="noopener noreferrer">
        {DOWNLOAD_LABEL}
      </a>,
    );
  }

  const version = versionLabel(APP_VERSION);
  if (version !== "") parts.push(<span title={`Sourcly version ${APP_VERSION}`}>You are using {version}</span>);
  if (isLocalFile && config.siteUrl !== "") {
    parts.push(
      <span>
        Newest version:{" "}
        <a href={config.siteUrl} target="_blank" rel="noopener noreferrer">
          {config.siteUrl}
        </a>
      </span>,
    );
  }

  return (
    <footer className="site-footer">
      <p className="footer-line">
        {parts.map((part, index) => (
          <Fragment key={index}>
            {index > 0 && " · "}
            {part}
          </Fragment>
        ))}
      </p>
      <p className="footer-notice">{footerNotice(config)}</p>
    </footer>
  );
}
