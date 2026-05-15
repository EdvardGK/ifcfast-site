"use client";

import { motion } from "framer-motion";

// Anonymous file shapes from our test corpus. Public benchmarks against
// NIST + buildingSMART reference IFCs are queued — see the docs roadmap.
const ROWS = [
  { label: "Small ARK model",    subtitle: "22 MB · 8.8K products",        ifc: 1000,  fast: 29  },
  { label: "Federated mid-size", subtitle: "187 MB · 21K products",        ifc: 7800,  fast: 152 },
  { label: "Large MEP",          subtitle: "834 MB · 87K · 14.3M records", ifc: 30000, fast: 905 },
];

function fmt(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${n} ms`;
}

export function Benchmark() {
  const max = Math.max(...ROWS.map(r => r.ifc));
  return (
    <div className="rounded-xl border border-line bg-card p-6 sm:p-8 overflow-hidden">
      <div className="flex items-baseline justify-between mb-6">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted">
            cold parse, best of 5
          </div>
          <h3 className="text-lg font-semibold mt-1">
            ifcfast vs <span className="font-mono text-base">ifcopenshell.open</span>
          </h3>
        </div>
        <div className="text-xs text-muted hidden sm:block">lower is better</div>
      </div>
      <div className="space-y-5">
        {ROWS.map((r, i) => (
          <div key={r.label}>
            <div className="flex items-baseline justify-between mb-2">
              <div className="text-sm">
                <span className="font-medium">{r.label}</span>
                <span className="text-muted ml-2">{r.subtitle}</span>
              </div>
              <div className="font-mono text-xs text-muted">
                {(r.ifc / r.fast).toFixed(0)}× faster
              </div>
            </div>
            <div className="space-y-1.5">
              <Bar
                label="ifcopenshell"
                pct={(r.ifc / max) * 100}
                value={fmt(r.ifc)}
                shade="bg-line"
                delay={i * 0.2}
              />
              <Bar
                label="ifcfast"
                pct={(r.fast / max) * 100}
                value={fmt(r.fast)}
                shade="bg-accent"
                delay={i * 0.2 + 0.1}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="text-xs text-muted mt-6 leading-relaxed">
        Byte-level parity vs <span className="font-mono">ifcopenshell</span> across
        234,144 products from 5 authoring tools. ST28_RIV
        <span className="font-mono"> (834 MB)</span> opens in
        <span className="font-mono"> &lt;1 GB</span> resident — the same file
        OOMs <span className="font-mono">ifcopenshell.open()</span> on an 8 GB box.
      </div>
    </div>
  );
}

function Bar({
  label, pct, value, shade, delay,
}: {
  label: string;
  pct: number;
  value: string;
  shade: string;
  delay: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="text-xs font-mono w-24 text-muted">{label}</div>
      <div className="flex-1 h-5 bg-bg rounded-sm relative overflow-hidden">
        <motion.div
          className={`absolute inset-y-0 left-0 ${shade} rounded-sm`}
          initial={{ width: 0 }}
          whileInView={{ width: `${pct}%` }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.9, delay, ease: [0.2, 0.7, 0.2, 1] }}
        />
      </div>
      <div className="text-xs font-mono w-16 text-right tabular-nums">{value}</div>
    </div>
  );
}
