import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { resolveConfig } from "./config";
import "./styles.css";

const config = resolveConfig(window.SOURCLY_CONFIG);
document.title = config.siteName;

const root = document.getElementById("root");
if (root === null) throw new Error("Missing #root element in index.html");

createRoot(root).render(
  <StrictMode>
    <App config={config} />
  </StrictMode>,
);
