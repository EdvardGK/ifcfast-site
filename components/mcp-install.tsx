"use client";

import { useState } from "react";
import { Code } from "./code";
import { CopyButton } from "./copy-button";

type Client = {
  id: string;
  name: string;
  configPath: string;
  config: string;
  verify?: string;
};

// Most clients use the `mcpServers` key; VS Code's native MCP support reads
// `servers` from .vscode/mcp.json — different shape, kept distinct on purpose.
const STANDARD_CONFIG = `{
  "mcpServers": {
    "ifcfast": {
      "command": "ifcfast-mcp"
    }
  }
}`;

const CLIENTS: Client[] = [
  {
    id: "claude-desktop",
    name: "Claude Desktop",
    configPath:
      "~/Library/Application Support/Claude/claude_desktop_config.json (macOS)\n%APPDATA%/Claude/claude_desktop_config.json (Windows)\n~/.config/Claude/claude_desktop_config.json (Linux)",
    config: STANDARD_CONFIG,
    verify: "Settings → Developer should list ifcfast under MCP servers.",
  },
  {
    id: "cursor",
    name: "Cursor",
    configPath: "~/.cursor/mcp.json (global) or .cursor/mcp.json (project)",
    config: STANDARD_CONFIG,
    verify: "Settings → MCP shows ifcfast with a green dot when the server is live.",
  },
  {
    id: "claude-code",
    name: "Claude Code",
    configPath: ".mcp.json in your project root",
    config: STANDARD_CONFIG,
    verify: "Run /mcp in the session to confirm ifcfast is connected.",
  },
  {
    id: "vscode",
    name: "VS Code",
    configPath: ".vscode/mcp.json (MCP must be enabled in Settings)",
    // VS Code uses the `servers` key, not `mcpServers`.
    config: `{
  "servers": {
    "ifcfast": {
      "command": "ifcfast-mcp"
    }
  }
}`,
    verify: "Run “MCP: List Servers” from the Command Palette to confirm ifcfast loaded.",
  },
];

export function McpInstall() {
  const [active, setActive] = useState(CLIENTS[0].id);
  const client = CLIENTS.find(c => c.id === active)!;
  return (
    <div className="rounded-xl border border-line bg-card overflow-hidden">
      <div role="tablist" aria-label="MCP client" className="flex flex-wrap gap-1 px-3 py-2.5 border-b border-line">
        {CLIENTS.map(c => (
          <button
            key={c.id}
            role="tab"
            id={`mcp-tab-${c.id}`}
            aria-selected={c.id === active}
            aria-controls={`mcp-panel-${c.id}`}
            onClick={() => setActive(c.id)}
            className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              c.id === active
                ? "bg-fg text-bg"
                : "text-muted hover:text-fg hover:bg-bg"
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`mcp-panel-${client.id}`}
        aria-labelledby={`mcp-tab-${client.id}`}
        className="p-6 space-y-4"
      >
        <Step n={1} title="Install" tone="muted">
          <CopyBlock value="pip install 'ifcfast[mcp]'" />
        </Step>
        <Step n={2} title={`Add to ${client.name}`}>
          <p className="text-xs text-muted font-mono mb-2 whitespace-pre-line">
            {client.configPath}
          </p>
          <CopyBlock value={client.config} multiline />
        </Step>
        <Step n={3} title="Restart, then verify">
          <p className="text-sm text-muted">
            ifcfast appears as <span className="font-mono">22 tools</span> +{" "}
            <span className="font-mono">ifcfast://agents-guide</span> resource —
            your agent can open IFCs, query psets, quantities and materials,
            walk the spatial graph, diff revisions, and extract type
            catalogues.
          </p>
          {client.verify && (
            <p className="text-xs text-muted mt-2">{client.verify}</p>
          )}
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
  return (
    <div className="relative">
      <div className="rounded-md bg-bg border border-line px-3 py-2.5 pr-10">
        {multiline ? (
          <Code lang="json">{value}</Code>
        ) : (
          <Code lang="bash">{value}</Code>
        )}
      </div>
      <CopyButton value={value} className="absolute top-2 right-2" />
    </div>
  );
}
