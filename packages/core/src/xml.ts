import { decodeEntities } from "./text";

// A small XML reader, enough for the well-formed documents providers send
// (PubMed's efetch). It avoids needing a DOM, so it works the same in the
// browser, in Node and in tests. It does not validate, resolve namespaces or
// load DTDs; it reads elements, attributes and text.

export interface XmlNode {
  name: string;
  attributes: Record<string, string>;
  /** Child elements and text pieces, in document order (so mixed content such as "a <i>b</i> c" keeps its order). */
  content: (XmlNode | string)[];
}

export class XmlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XmlError";
  }
}

/** Finds the end of a tag's "<...>" while ignoring ">" inside quoted attribute values. */
function findTagEnd(source: string, start: number): number {
  let quote: string | null = null;
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if (quote !== null) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ">") {
      return i;
    }
  }
  throw new XmlError("Unterminated tag");
}

const ATTRIBUTE = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/** Parses a document and returns its root element. Throws XmlError if it is not well formed. */
export function parseXml(source: string): XmlNode {
  const root: XmlNode = { name: "#document", attributes: {}, content: [] };
  const stack: XmlNode[] = [root];
  const top = (): XmlNode => {
    const node = stack[stack.length - 1];
    if (node === undefined) throw new XmlError("Unbalanced tags");
    return node;
  };
  let pos = 0;

  while (pos < source.length) {
    const lt = source.indexOf("<", pos);
    if (lt === -1) {
      top().content.push(decodeEntities(source.slice(pos)));
      break;
    }
    if (lt > pos) top().content.push(decodeEntities(source.slice(pos, lt)));

    if (source.startsWith("<!--", lt)) {
      const end = source.indexOf("-->", lt + 4);
      if (end === -1) throw new XmlError("Unterminated comment");
      pos = end + 3;
    } else if (source.startsWith("<![CDATA[", lt)) {
      const end = source.indexOf("]]>", lt + 9);
      if (end === -1) throw new XmlError("Unterminated CDATA section");
      top().content.push(source.slice(lt + 9, end));
      pos = end + 3;
    } else if (source.startsWith("<?", lt)) {
      const end = source.indexOf("?>", lt + 2);
      if (end === -1) throw new XmlError("Unterminated processing instruction");
      pos = end + 2;
    } else if (source.startsWith("<!", lt)) {
      // <!DOCTYPE ...>, possibly with an [internal subset]. Skipped, never loaded.
      let depth = 0;
      let i = lt + 2;
      for (; i < source.length; i += 1) {
        const char = source[i];
        if (char === "[") depth += 1;
        else if (char === "]") depth -= 1;
        else if (char === ">" && depth <= 0) break;
      }
      if (i >= source.length) throw new XmlError("Unterminated declaration");
      pos = i + 1;
    } else if (source[lt + 1] === "/") {
      const end = source.indexOf(">", lt);
      if (end === -1) throw new XmlError("Unterminated closing tag");
      const name = source.slice(lt + 2, end).trim();
      const open = stack.pop();
      if (open === undefined || stack.length === 0 || open.name !== name) {
        throw new XmlError(`Unexpected closing tag </${name}>`);
      }
      pos = end + 1;
    } else {
      const end = findTagEnd(source, lt + 1);
      const inner = source.slice(lt + 1, end);
      const selfClosing = inner.endsWith("/");
      const body = selfClosing ? inner.slice(0, -1) : inner;
      const nameEnd = body.search(/\s/);
      const name = nameEnd === -1 ? body : body.slice(0, nameEnd);
      if (name === "") throw new XmlError("Tag without a name");

      const attributes: Record<string, string> = {};
      if (nameEnd !== -1) {
        for (const match of body.slice(nameEnd).matchAll(ATTRIBUTE)) {
          attributes[match[1] ?? ""] = decodeEntities(match[2] ?? match[3] ?? "");
        }
      }
      const node: XmlNode = { name, attributes, content: [] };
      top().content.push(node);
      if (!selfClosing) stack.push(node);
      pos = end + 1;
    }
  }

  if (stack.length !== 1) throw new XmlError(`Unclosed tag <${top().name}>`);
  const rootElement = root.content.find((item): item is XmlNode => typeof item !== "string");
  if (rootElement === undefined) throw new XmlError("No root element");
  return rootElement;
}

/** All text inside a node, including nested elements, in order and trimmed. */
export function textOf(node: XmlNode | null | undefined): string {
  if (node === null || node === undefined) return "";
  const parts: string[] = [];
  const walk = (current: XmlNode) => {
    for (const item of current.content) {
      if (typeof item === "string") parts.push(item);
      else walk(item);
    }
  };
  walk(node);
  return parts.join("").replace(/\s+/g, " ").trim();
}

/** Direct child elements with this name. */
export function childrenNamed(node: XmlNode | null | undefined, name: string): XmlNode[] {
  if (node === null || node === undefined) return [];
  return node.content.filter((item): item is XmlNode => typeof item !== "string" && item.name === name);
}

/** The first direct child with this name, or null. */
export function firstChild(node: XmlNode | null | undefined, name: string): XmlNode | null {
  return childrenNamed(node, name)[0] ?? null;
}

/** Follows a path of child names, e.g. descend(article, "Journal", "JournalIssue", "PubDate"). */
export function descend(node: XmlNode | null | undefined, ...path: string[]): XmlNode | null {
  let current: XmlNode | null | undefined = node;
  for (const name of path) current = firstChild(current, name);
  return current ?? null;
}
