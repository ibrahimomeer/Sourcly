import { createContext, useContext } from "react";
import { DEFAULT_CONFIG } from "./config";
import { blockedRequestMessage, type RuntimeInfo } from "./runtime";

const RuntimeContext = createContext<RuntimeInfo>({ isLocalFile: false, siteUrl: DEFAULT_CONFIG.siteUrl });

export const RuntimeProvider = RuntimeContext.Provider;
export const useRuntime = (): RuntimeInfo => useContext(RuntimeContext);

/** The sentence that explains a request a browser blocked for a page opened from a file, with the website as a link. */
export function BlockedFromFileNotice() {
  const { siteUrl } = useRuntime();
  const text = blockedRequestMessage(siteUrl);
  if (siteUrl === "") return <p className="warning" role="status">{text}</p>;
  const [before] = text.split(siteUrl);
  return (
    <p className="warning" role="status">
      {before}
      <a href={siteUrl} target="_blank" rel="noopener noreferrer">
        {siteUrl}
      </a>
      .
    </p>
  );
}
