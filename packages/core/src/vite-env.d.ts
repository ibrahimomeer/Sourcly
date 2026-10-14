// Lets tests import a fixture file's text with `import xml from "./file.xml?raw"` (Vite feature).
declare module "*?raw" {
  const content: string;
  export default content;
}
