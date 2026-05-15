// Tiny semantic syntax highlighter — no shiki, no prism. Hand-tokenises
// Python / bash / JSON well enough for landing-page snippets.

import React from "react";

type Lang = "python" | "bash" | "json";

const PY_KW = new Set([
  "import", "from", "as", "def", "class", "return", "if", "elif",
  "else", "for", "in", "while", "try", "except", "with", "not", "and",
  "or", "is", "True", "False", "None", "print", "len", "list", "dict",
  "set", "tuple", "lambda",
]);

const PY_BUILTINS = new Set([
  "open", "summary", "schemas", "preview", "types", "by_type",
  "ancestors", "descendants", "children", "parent", "storey_of",
  "building_of", "products_in", "diff", "example_path",
  "system_prompt", "type_summary", "type_bank",
]);

function tokenize(src: string, lang: Lang): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let i = 0, key = 0;

  const push = (cls: string | null, text: string) => {
    if (!text) return;
    if (cls === null) out.push(text);
    else out.push(<span key={key++} className={cls}>{text}</span>);
  };

  while (i < src.length) {
    const c = src[i];
    // Comment.
    if ((lang === "python" && c === "#") || (lang === "bash" && c === "#")) {
      let j = i;
      while (j < src.length && src[j] !== "\n") j++;
      push("tok-com", src.slice(i, j));
      i = j;
      continue;
    }
    // String.
    if (c === '"' || c === "'") {
      const q = c;
      let j = i + 1;
      while (j < src.length && src[j] !== q) {
        if (src[j] === "\\") j++;
        j++;
      }
      j = Math.min(j + 1, src.length);
      push("tok-str", src.slice(i, j));
      i = j;
      continue;
    }
    // Number.
    if (/\d/.test(c)) {
      let j = i;
      while (j < src.length && /[\d._]/.test(src[j])) j++;
      push("tok-num", src.slice(i, j));
      i = j;
      continue;
    }
    // Identifier.
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      const tok = src.slice(i, j);
      if (lang === "python" && PY_KW.has(tok)) push("tok-kw", tok);
      else if (lang === "python" && PY_BUILTINS.has(tok)) push("tok-fn", tok);
      else if (lang === "bash" && (tok === "pip" || tok === "ifcfast")) {
        push("tok-fn", tok);
      }
      else push("tok-id", tok);
      i = j;
      continue;
    }
    // Punctuation.
    if (/[(){}\[\].,:;=+\-*/<>!]/.test(c)) {
      push("tok-pn", c);
      i++;
      continue;
    }
    // Default.
    push(null, c);
    i++;
  }
  return out;
}

export function Code({
  children,
  lang = "python",
  className = "",
}: {
  children: string;
  lang?: Lang;
  className?: string;
}) {
  return (
    <pre className={`code-block whitespace-pre-wrap ${className}`}>
      {tokenize(children, lang)}
    </pre>
  );
}
