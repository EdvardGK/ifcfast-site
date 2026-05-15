"use client";

import { useEffect, useRef, useState } from "react";
import { Ghost } from "lucide-react";
import { useSelection } from "./selection-context";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          alt?: string;
          ar?: boolean;
          "camera-controls"?: boolean;
          "auto-rotate"?: boolean;
          "rotation-per-second"?: string;
          "shadow-intensity"?: string;
          "shadow-softness"?: string;
          "exposure"?: string;
          "environment-image"?: string;
          "interaction-prompt"?: string;
          "camera-orbit"?: string;
          "min-camera-orbit"?: string;
          "max-camera-orbit"?: string;
          "camera-target"?: string;
          "field-of-view"?: string;
          "tone-mapping"?: string;
          loading?: "auto" | "lazy" | "eager";
          reveal?: string;
        },
        HTMLElement
      >;
    }
  }
}

type Mat = {
  name: string;
  setAlphaMode: (m: "OPAQUE" | "BLEND" | "MASK") => void;
  pbrMetallicRoughness: {
    setBaseColorFactor: (rgba: [number, number, number, number]) => void;
    baseColorFactor: [number, number, number, number];
  };
};

export function ModelViewer({
  src,
  alt,
  metaSrc,
}: {
  src: string;
  alt: string;
  /** JSON URL with product-guid → {entity, storey_guid} lookup. */
  metaSrc?: string;
}) {
  const mvRef = useRef<HTMLElement | null>(null);
  const originals = useRef<
    Map<string, { color: [number, number, number, number]; alphaMode: string }>
  >(new Map());
  const guidLookup = useRef<Map<string, { entity: string; storey_guid: string | null; typed?: boolean }>>(new Map());
  const { selection } = useSelection();
  // When on, non-matching products fade to ~invisible. When off, they keep
  // their original colours and only the selected ones recolour to accent.
  const [ghostMode, setGhostMode] = useState(true);

  useEffect(() => {
    import("@google/model-viewer");
  }, []);

  // Load the metadata JSON once — used to map a material's GUID name
  // back to its (entity, storey_guid) for cross-filter routing.
  useEffect(() => {
    if (!metaSrc) return;
    fetch(metaSrc)
      .then(r => r.json())
      .then((g: { products: { guid: string; entity: string; storey_guid: string | null; typed?: boolean }[] }) => {
        const m = new Map<string, { entity: string; storey_guid: string | null; typed?: boolean }>();
        for (const p of g.products) m.set(p.guid, { entity: p.entity, storey_guid: p.storey_guid, typed: p.typed });
        guidLookup.current = m;
        applySelection();
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metaSrc]);

  // Capture original material state on load.
  useEffect(() => {
    const mv = mvRef.current as unknown as
      | { model?: { materials: Mat[] }; addEventListener: HTMLElement["addEventListener"]; removeEventListener: HTMLElement["removeEventListener"] }
      | null;
    if (!mv) return;
    const onLoad = () => {
      const mats = mv.model?.materials ?? [];
      for (const m of mats) {
        if (originals.current.has(m.name)) continue;
        const c = m.pbrMetallicRoughness.baseColorFactor;
        originals.current.set(m.name, {
          color: [c[0], c[1], c[2], c[3]],
          alphaMode: c[3] < 1 ? "BLEND" : "OPAQUE",
        });
      }
      applySelection();
    };
    mv.addEventListener("load", onLoad);
    return () => mv.removeEventListener("load", onLoad);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-apply selection whenever it (or the ghost flag) changes.
  useEffect(() => {
    applySelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, ghostMode]);

  function applySelection() {
    const mv = mvRef.current as unknown as { model?: { materials: Mat[] } } | null;
    const mats = mv?.model?.materials;
    if (!mats) return;
    const ACCENT: [number, number, number, number] = [0.878, 0.486, 0.184, 1.0];
    const DIM:    [number, number, number, number] = [0.5, 0.5, 0.5, 0.03];
    const HIDE:   [number, number, number, number] = [0, 0, 0, 0];
    // Entities that are "ghost-by-nature" — translucent volumes that show
    // structure (rooms, opening cut-outs). Ghost-off hides these entirely.
    const GHOST_ENTITIES = new Set(["ifcspace", "ifcopeningelement"]);

    for (const m of mats) {
      const meta = guidLookup.current.get(m.name);
      const orig = originals.current.get(m.name);
      if (!orig) continue;
      const isGhostEntity = !!meta && GHOST_ENTITIES.has(meta.entity.toLowerCase());

      // Ghost OFF + ghost-by-nature entity → hide regardless of filter.
      if (!ghostMode && isGhostEntity) {
        m.setAlphaMode("BLEND");
        m.pbrMetallicRoughness.setBaseColorFactor(HIDE);
        continue;
      }

      let isMatch = !selection;
      if (selection?.kind === "entity" && meta) {
        isMatch = meta.entity.toLowerCase() === selection.value.toLowerCase();
        // Storey-scoped entity selection: also require the storey to match.
        if (isMatch && selection.storey_guid) {
          isMatch = meta.storey_guid === selection.storey_guid;
        }
      } else if (selection?.kind === "storey" && meta) {
        isMatch = meta.storey_guid === selection.value;
      } else if (selection?.kind === "untyped" && meta) {
        isMatch = meta.typed === false;
      }

      if (!selection) {
        m.setAlphaMode(orig.alphaMode as "OPAQUE" | "BLEND");
        m.pbrMetallicRoughness.setBaseColorFactor(orig.color);
      } else if (isMatch) {
        m.setAlphaMode("OPAQUE");
        m.pbrMetallicRoughness.setBaseColorFactor(ACCENT);
      } else if (ghostMode) {
        // Filter active, ghost on → dim to faint context.
        m.setAlphaMode("BLEND");
        m.pbrMetallicRoughness.setBaseColorFactor(DIM);
      } else {
        // Filter active, ghost off → hide everything that isn't matching.
        m.setAlphaMode("BLEND");
        m.pbrMetallicRoughness.setBaseColorFactor(HIDE);
      }
    }
  }

  return (
    <div className="relative w-full h-full">
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-card/85 backdrop-blur border border-line rounded-md">
        <button
          onClick={() => setGhostMode(g => !g)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wider hover:bg-bg/70"
          title={ghostMode ? "Ghost ON — non-selected fade" : "Ghost OFF — non-selected stay visible"}
          aria-pressed={ghostMode}
        >
          <Ghost
            size={13}
            className={ghostMode ? "text-accent" : "text-muted"}
            strokeWidth={ghostMode ? 2.2 : 1.6}
          />
          <span className={ghostMode ? "text-fg" : "text-muted"}>
            ghost {ghostMode ? "on" : "off"}
          </span>
        </button>
      </div>
      {/* @ts-expect-error — model-viewer is a custom element */}
      <model-viewer
        ref={mvRef as React.MutableRefObject<HTMLElement | null>}
        src={src}
        alt={alt}
        camera-controls
        auto-rotate
        rotation-per-second="14deg"
        environment-image="neutral"
        shadow-intensity="1.4"
        shadow-softness="1"
        exposure="1.05"
        tone-mapping="commerce"
        interaction-prompt="none"
        camera-orbit="42deg 70deg auto"
        min-camera-orbit="auto auto 60%"
        max-camera-orbit="auto auto 250%"
        field-of-view="27deg"
        style={{
          width: "100%",
          height: "100%",
          // Diorama: pale-sky top fading to a warm-clay horizon, with a
          // subtle vignette via inset shadow on the wrapper. Reads like
          // looking into a small architectural model on a museum plinth.
          background:
            "radial-gradient(ellipse 110% 80% at 50% 100%, #e8d9bc 0%, #d4cbb9 40%, #b9c1c8 75%, #d6dde2 100%)",
          "--poster-color": "transparent",
        } as React.CSSProperties}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{ boxShadow: "inset 0 -40px 80px -20px rgba(0,0,0,0.18), inset 0 30px 60px -30px rgba(255,255,255,0.45)" }}
      />
    </div>
  );
}
