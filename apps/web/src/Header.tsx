import { methodologyUrl, type SourclyConfig } from "./config";

export function Header({ config }: { config: SourclyConfig }) {
  const methodology = methodologyUrl(config);

  return (
    <header className="site-header">
      <h1 className="site-name">{config.siteName}</h1>
      <nav aria-label="Project links">
        {methodology !== "" && (
          <a href={methodology} target="_blank" rel="noopener noreferrer">
            Methodology
          </a>
        )}
        {config.repoUrl !== "" && (
          <a href={config.repoUrl} target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
        )}
      </nav>
    </header>
  );
}
