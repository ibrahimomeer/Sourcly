import { Fragment, type ReactNode } from "react";
import type { SourclyConfig } from "./config";
import { copyrightYears } from "./copyright";

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

  return (
    <footer className="site-footer">
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 && " · "}
          {part}
        </Fragment>
      ))}
    </footer>
  );
}
