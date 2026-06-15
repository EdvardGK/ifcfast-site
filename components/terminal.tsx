"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Code } from "./code";
import { CopyButton } from "./copy-button";

const SCRIPT = `import ifcfast

m = ifcfast.open("model.ifc")

# Self-describing — what am I looking at?
m.summary()              # schema, counts, available tables

# Data layers, as pandas DataFrames
m.psets                  # property sets
m.materials              # material assignments
m.classifications        # NS 3451 / Uniformat / OmniClass

# Geometry, no CAD kernel required
m.meshes()               # per-product triangles (vertices, faces)
m.point_cloud(per_m2=1000)   # sampled surface points + normals

# Spatial graph
m.ancestors(wall_guid)   # storey → building → site → project`;

export function HeroTerminal() {
  const [shown, setShown] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (shown >= SCRIPT.length) {
      setDone(true);
      return;
    }
    // Skip the typewriter speed-up through whitespace, slow down on
    // newlines so the "lands" feel intentional.
    const ch = SCRIPT[shown];
    const delay = ch === "\n" ? 90 : ch === " " ? 12 : 24;
    const id = setTimeout(() => setShown(shown + 1), delay);
    return () => clearTimeout(id);
  }, [shown]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="rounded-xl border border-line bg-card shadow-[0_1px_0_0_rgba(0,0,0,0.02),0_24px_48px_-24px_rgba(0,0,0,0.08)] overflow-hidden"
    >
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-line bg-bg/40">
        <div className="flex gap-1.5" aria-hidden>
          <span className="w-2.5 h-2.5 rounded-full bg-line"></span>
          <span className="w-2.5 h-2.5 rounded-full bg-line"></span>
          <span className="w-2.5 h-2.5 rounded-full bg-line"></span>
        </div>
        <span className="text-xs text-muted font-mono ml-2">python</span>
        <CopyButton value={SCRIPT} label="Copy example script" className="ml-auto -mr-1" />
      </div>
      <div className="px-5 py-5 overflow-x-auto scroll-thin min-h-[360px]">
        <Code lang="python">{SCRIPT.slice(0, shown)}</Code>
        {!done && <span className="caret"></span>}
      </div>
    </motion.div>
  );
}
