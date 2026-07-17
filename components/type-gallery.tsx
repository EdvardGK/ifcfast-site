"use client";

import { useEffect, useMemo, useState } from "react";
import { useSelection } from "./selection-context";

// Type gallery — the model's type catalogue as a wall of live 3D
// specimens. One representative instance per IfcTypeObject, each
// extracted with m.subset([guid]) → to_gltf() (authored colours and
// cut openings carried through). Clicking a specimen fires the same
// type-selection the QTO panel uses, so the whole workbench
// cross-filters to that type.
//
// Data: /sample/types/manifest.json + one mini-glb per type
// (43 types ≈ 144 KB total — each glb is a single deduplicated
// representation, so the entire catalogue costs less than one photo).

type TypeEntry = {
  slug: string;
  type_name: string;
  entity: string;
  count: number;
  guid: string;
  glb: string;
  bytes: number;
};

type Manifest = {
  source: string;
  generated_with: string;
  types: TypeEntry[];
};

export function TypeGallery() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const { selection, toggleType } = useSelection();

  useEffect(() => {
    // model-viewer custom element (shared renderer across instances)
    import("@google/model-viewer");
    fetch("/sample/types/manifest.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => m && setManifest(m))
      .catch(() => {});
  }, []);

  const types = useMemo(() => {
    if (!manifest) return [];
    return manifest.types
      // sub-1KB glbs are empty shells (e.g. a roof whose geometry
      // lives entirely in aggregated slabs) — nothing to show
      .filter((t) => t.bytes >= 1000)
      .sort((a, b) => {
        // openings are honest data but a poor opening act — sort last
        const ao = a.entity === "IfcOpeningElement" ? 1 : 0;
        const bo = b.entity === "IfcOpeningElement" ? 1 : 0;
        if (ao !== bo) return ao - bo;
        return b.count - a.count || a.type_name.localeCompare(b.type_name);
      });
  }, [manifest]);

  if (!types.length) return null;

  return (
    <div className="border-t border-line">
      <div className="px-6 sm:px-8 py-10">
        <div className="flex flex-wrap items-baseline justify-between gap-4 max-w-none">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted mb-2">
              The type catalogue
            </div>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              Every type in the file.{" "}
              <span className="text-muted">One mesh each.</span>
            </h2>
          </div>
          <p className="text-sm text-muted max-w-md leading-relaxed">
            One representative instance per type, carved with{" "}
            <code className="font-mono text-fg text-xs">m.subset()</code> and
            exported with{" "}
            <code className="font-mono text-fg text-xs">to_gltf()</code> —
            the whole catalogue weighs less than one photo. Click a specimen
            to filter the workbench.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-px bg-line border-t border-line">
        {types.map((t) => (
          <SpecimenCard
            key={t.slug}
            t={t}
            selected={selection?.kind === "type" && selection.value === t.type_name}
            dimmed={selection?.kind === "type" && selection.value !== t.type_name}
            onClick={() => toggleType(t.type_name, "gallery")}
          />
        ))}
      </div>
    </div>
  );
}

function SpecimenCard({
  t,
  selected,
  dimmed,
  onClick,
}: {
  t: TypeEntry;
  selected: boolean;
  dimmed: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-pressed={selected}
      title={`${t.type_name} — ${t.count} × ${t.entity}`}
      className={`group relative bg-card text-left flex flex-col transition-opacity focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent ${
        dimmed ? "opacity-40 hover:opacity-80" : ""
      } ${selected ? "outline outline-2 outline-offset-[-2px] outline-accent" : ""}`}
    >
      <div className="aspect-square w-full overflow-hidden">
        {/* @ts-expect-error — custom element */}
        <model-viewer
          src={t.glb}
          loading="lazy"
          reveal="auto"
          auto-rotate={hover || selected ? true : undefined}
          rotation-per-second="40deg"
          interaction-prompt="none"
          disable-zoom
          shadow-intensity="0.6"
          exposure="0.9"
          style={{ width: "100%", height: "100%", pointerEvents: "none" }}
        />
      </div>
      <div className="px-2.5 pb-2.5 pt-1 min-h-[3.25rem]">
        <div className="text-[10px] font-mono uppercase tracking-wider text-accent">
          {t.entity.replace(/^Ifc/, "")}
          <span className="text-muted normal-case tracking-normal"> × {t.count}</span>
        </div>
        <div className="text-[11px] leading-snug text-fg/90 line-clamp-2 mt-0.5">
          {t.type_name}
        </div>
      </div>
    </button>
  );
}
