"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

// Shared copy-to-clipboard affordance. Used by the hero install block and
// every code panel so copy coverage is consistent across the page.
export function CopyButton({
  value,
  label = "Copy",
  className = "",
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const onCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={copied ? "Copied" : label}
      className={`p-1.5 rounded-md hover:bg-line/70 text-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent transition-colors ${className}`}
    >
      {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
    </button>
  );
}
