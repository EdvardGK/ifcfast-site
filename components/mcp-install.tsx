"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Code } from "./code";

type Client = {
  id: string;
  name: string;
  configPath: string;
  config: string;
  installNote?: string;
};

const CLIENTS: Client[] = [
  {
    id: "claude-desktop",
    name: "Claude Desktop",
    configPath: "~/Library/Application Support/Claude/claude_desktop_config.json (macOS)\n%APPDATA%/Claude/claude_desktop_config.json (Windows)",
    config: `{
  "mcpServers": {
    "ifcfast": {
      "command": "ifcfast-mcp"
    }
  }
}`,
  },
  {
    id: "cursor",
    name: "Cursor",
    configPath: "~/.cursor/mcp.json (global) or .cursor/mcp.json (project)",
    config: `{
  "mcpServers": {
    "ifcfast": {
      "command": "ifcfast-mcp"
    }
  }
}`,
  },
  {
    id: "claude-code",
    name: "Claude Code",
    configPath: ".mcp.json in your project root",
    config: `{
  "mcpServers": {
    "ifcfast": {
      "command": "ifcfast-mcp"
    }
  }
}`,
  },
  {
    id: "vscode",
    name: "VS Code",
    configPath: ".vscode/mcp.json or your user settings",
    config: `{
  "mcpServers": {
    "ifcfast": {
      "command": "ifcfast-mcp"
    }
  }
}`,
  },
];

export function McpInstall() {
  const [active, setActive] = useState(CLIENTS[0].id);
  const client = CLIENTS.find(c => c.id === active)!;
  return (
    <div className="rounded-xl border border-line bg-card overflow-hidden">
      <div className="flex flex-wrap gap-1 px-3 py-2.5 border-b border-line">
        {CLIENTS.map(c => (
          <button
            key={c.id}
            onClick={() => setActive(c.id)}
            className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
              c.id === active
                ? "bg-fg text-bg"
                : "text-muted hover:text-fg hover:bg-bg"
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>
      <div className="p-6 space-y-4">
        <Step n={1} title="Install" tone="muted">
          <CopyBlock value="pip install 'ifcfast[mcp]'" />
        </Step>
        <Step n={2} title={`Add to ${client.name}`}>
          <p className="text-xs text-muted font-mono mb-2 whitespace-pre-line">
            {client.configPath}
          </p>
          <CopyBlock value={client.config} multiline />
        </Step>
        <Step n={3} title="Restart the client">
          <p className="text-sm text-muted">
            ifcfast appears as <span className="font-mono">18 tools</span> +{" "}
            <span className="font-mono">ifcfast://agents-guide</span> resource.
            Your agent can now open IFCs, walk the spatial graph, run drift, and
            extract type catalogues — without any glue code.
          </p>
        </Step>
      </div>
    </div>
  );
}

function Step({
  n, title, tone, children,
}: {
  n: number;
  title: string;
  tone?: "muted";
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex-none w-7 h-7 rounded-full bg-bg border border-line flex items-center justify-center text-xs font-mono">
        {n}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium mb-2 ${tone === "muted" ? "text-fg" : "text-fg"}`}>
          {title}
        </div>
        {children}
      </div>
    </div>
  );
}

function CopyBlock({ value, multiline = false }: { value: string; multiline?: boolean }) {
  const [copied, setCopied] = useState(false);
  const onCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="relative">
      <div className="rounded-md bg-bg border border-line px-3 py-2.5 pr-10">
        {multiline ? (
          <Code lang="json">{value}</Code>
        ) : (
          <Code lang="bash">{value}</Code>
        )}
      </div>
      <button
        onClick={onCopy}
        className="absolute top-2 right-2 p-1.5 rounded-md hover:bg-line/70 text-muted"
        aria-label="Copy"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  );
}
