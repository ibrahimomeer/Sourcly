import { Fragment, type ReactNode } from "react";
import type { SourclyConfig } from "./config";
import { copyrightYears } from "./copyright";
import { footerNotice } from "./disclaimer";
import { APP_VERSION, versionLabel } from "./version";

export function Footer({ config }: { config: SourclyConfig }) {
  const years = copyrightYears(new Date().getFullYear());

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
  if (config.downloadUrl !== "") {
    parts.push(
      <a href={config.downloadUrl} target="_blank" rel="noopener noreferrer">
        Download
      </a>,
    );
  }

  const version = versionLabel(APP_VERSION);
  if (version !== "") parts.push(<span title={`Sourcly version ${APP_VERSION}`}>{version}</span>);

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
