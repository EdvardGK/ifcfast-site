"use client";

/**
 * QTO Workbench — local high-fi mockup.
 *
 * Replaces the current ThreeLensSection (viewer + tabbed QTO/Spatial/Vector)
 * with a 4-tile workbench where all lenses are visible at once and
 * cross-filter through the existing SelectionProvider.
 *
 * Tiles (all reusable components from /components):
 *   - ModelViewer  (3D)
 *   - VectorGraph  (2D projection)
 *   - DashTile     (new — mini KPI + class bar chart from the same JSON)
 *   - QtoPanel     (existing Types · Untyped · Materials · LayerSets)
 *
 * Five layouts share the same four tiles. Toolbar switches A–E.
 * Route: /workbench
 */

import { useState } from "react";
import { ModelViewer } from "@/components/viewer";
import { QtoPanel } from "@/components/qto-panel";
import { VectorGraph } from "@/components/vector-graph";
import { SelectionProvider, useSelection } from "@/components/selection-context";
import { DashTile } from "@/components/dash-tile";
import { TileChrome } from "@/components/tile-chrome";

type LayoutKey = "A" | "B" | "C" | "D" | "E";

const LAYOUTS: { key: LayoutKey; label: string; desc: string }[] = [
  { key: "A", label: "2×2",        desc: "Quadrant — equal weight" },
  { key: "B", label: "Viewer L",   desc: "Big 3D, three small right" },
  { key: "C", label: "Table L",    desc: "Big inventory table left" },
  { key: "D", label: "Three-band", desc: "Dash · viewer+vector · table" },
  { key: "E", label: "Stack",      desc: "Single column · scrolls" },
];

const SAMPLE = {
  glb: "/sample/duplex.glb",
  graph: "/sample/duplex.graph.json",
  qto: "/sample/duplex.qto.json",
  bundle: "/sample/duplex.bundle.json",
};

export default function WorkbenchPage() {
  const [layout, setLayout] = useState<LayoutKey>("A");

  return (
    <SelectionProvider>
      <div className="flex h-screen flex-col bg-bg text-fg">
        <Header layout={layout} onLayoutChange={setLayout} />
        <FilterChipRow />
        <LayoutGrid layout={layout} />
      </div>
    </SelectionProvider>
  );
}

// ─── Header / filter strip ──────────────────────────────────────────────────

function Header({
  layout,
  onLayoutChange,
}: {
  layout: LayoutKey;
  onLayoutChange: (l: LayoutKey) => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-line bg-card px-4 py-2 flex-shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-5 h-5 rounded bg-fg text-bg grid place-items-center font-mono text-[9px]">
          if
        </div>
        <h1 className="text-sm font-semibold tracking-tight truncate">
          QTO Workbench
        </h1>
        <span className="text-[11px] font-mono text-muted truncate">
          duplex.ifc · 289 products · buildingSMART sample
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="hidden lg:block text-[10px] text-muted max-w-[200px] truncate">
          {LAYOUTS.find((l) => l.key === layout)?.desc}
        </div>
        <div className="inline-flex rounded-md border border-line overflow-hidden">
          {LAYOUTS.map((l) => (
            <button
              key={l.key}
              onClick={() => onLayoutChange(l.key)}
              title={`${l.label} — ${l.desc}`}
              className={`px-2.5 py-1 text-[11px] font-mono font-medium transition border-r border-line last:border-r-0 ${
                layout === l.key
                  ? "bg-fg text-bg"
                  : "text-muted hover:bg-bg hover:text-fg"
              }`}
            >
              {l.key}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function FilterChipRow() {
  const { selection, clear } = useSelection();
  const label = describeSelection(selection);
  return (
    <div className="flex items-center gap-2 border-b border-line bg-bg/40 px-4 py-1.5 text-[11px] font-mono flex-shrink-0">
      <span className="text-muted uppercase tracking-wider text-[10px]">
        Filter
      </span>
      {label ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2 py-0.5 text-accent">
          {label}
          <button onClick={clear} aria-label="Clear" className="hover:opacity-60">
            ×
          </button>
        </span>
      ) : (
        <span className="text-muted text-[10px] italic">
          click any row, class, or storey to cross-filter every tile
        </span>
      )}
    </div>
  );
}

function describeSelection(s: ReturnType<typeof useSelection>["selection"]): string | null {
  if (!s) return null;
  if (s.kind === "entity") return `entity · ${s.value}${s.storey_label ? ` · ${s.storey_label}` : ""}`;
  if (s.kind === "storey") return `storey · ${s.label ?? s.value.slice(0, 8)}`;
  if (s.kind === "type") return `type · ${s.value}`;
  if (s.kind === "material") return `material · ${s.value}`;
  if (s.kind === "layer_set") return `layer set · ${s.value}`;
  if (s.kind === "untyped") return "untyped";
  if (s.kind === "instance") {
    const label = s.name ?? s.value.slice(0, 12);
    const ent = s.entity ? `${s.entity} · ` : "";
    return `instance · ${ent}${label}`;
  }
  return null;
}

// ─── Layout grid ────────────────────────────────────────────────────────────

function LayoutGrid({ layout }: { layout: LayoutKey }) {
  const tiles = {
    viewer: (
      <Tile>
        <TileChrome label="3D viewer">
          <ModelViewer
            src={SAMPLE.glb}
            metaSrc={SAMPLE.graph}
            alt="Duplex apartment IFC — buildingSMART community sample, CC BY 4.0"
          />
        </TileChrome>
      </Tile>
    ),
    vector: (
      <Tile>
        <TileChrome label="Spatial graph">
          <VectorGraph src={SAMPLE.graph} compact />
        </TileChrome>
      </Tile>
    ),
    dash: (
      <Tile>
        <TileChrome label="Dashboard">
          <DashTile qtoSrc={SAMPLE.qto} graphSrc={SAMPLE.graph} bundleSrc={SAMPLE.bundle} />
        </TileChrome>
      </Tile>
    ),
    table: (
      <Tile>
        <TileChrome label="Quantities">
          <QtoPanel src={SAMPLE.qto} metaSrc={SAMPLE.graph} bundleSrc={SAMPLE.bundle} compact />
        </TileChrome>
      </Tile>
    ),
  };

  const gap = "gap-px";
  const base = `flex-1 min-h-0 bg-line ${gap}`;

  if (layout === "A") {
    return (
      <div className={`${base} grid grid-cols-1 grid-rows-4 lg:grid-cols-2 lg:grid-rows-2`}>
        {tiles.viewer}
        {tiles.vector}
        {tiles.dash}
        {tiles.table}
      </div>
    );
  }

  if (layout === "B") {
    return (
      <div className={`${base} grid grid-cols-1 grid-rows-4 lg:grid-cols-[2fr_1fr] lg:grid-rows-3`}>
        <div className="lg:row-span-3 min-h-0">{tiles.viewer}</div>
        <div className="min-h-0">{tiles.vector}</div>
        <div className="min-h-0">{tiles.dash}</div>
        <div className="min-h-0">{tiles.table}</div>
      </div>
    );
  }

  if (layout === "C") {
    return (
      <div className={`${base} grid grid-cols-1 grid-rows-4 lg:grid-cols-[2fr_1fr] lg:grid-rows-3`}>
        <div className="lg:row-span-3 min-h-0">{tiles.table}</div>
        <div className="min-h-0">{tiles.viewer}</div>
        <div className="min-h-0">{tiles.vector}</div>
        <div className="min-h-0">{tiles.dash}</div>
      </div>
    );
  }

  if (layout === "D") {
    return (
      <div className={`${base} grid grid-cols-1 grid-rows-[auto_1fr_1fr] lg:grid-rows-[auto_2fr_1.5fr]`}>
        <div className="min-h-0 h-[clamp(180px,22vh,260px)]">{tiles.dash}</div>
        <div className={`grid grid-cols-1 lg:grid-cols-2 ${gap} min-h-0 bg-line`}>
          {tiles.viewer}
          {tiles.vector}
        </div>
        <div className="min-h-0">{tiles.table}</div>
      </div>
    );
  }

  // E — single column stack
  return (
    <div className={`${base} flex flex-col overflow-auto`}>
      <div className="h-[60vh] min-h-[340px] shrink-0">{tiles.viewer}</div>
      <div className="h-[50vh] min-h-[300px] shrink-0">{tiles.vector}</div>
      <div className="h-[55vh] min-h-[320px] shrink-0">{tiles.dash}</div>
      <div className="h-[60vh] min-h-[360px] shrink-0">{tiles.table}</div>
    </div>
  );
}

// ─── Tile frame ─────────────────────────────────────────────────────────────
//
// Bare wrapper. No header, no padding — the contained component owns its
// own chrome. The 1px gap from the grid is the only visual separator.

function Tile({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-card flex flex-col min-h-0 h-full overflow-hidden">
      {children}
    </div>
  );
}
