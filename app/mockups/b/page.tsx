"use client";

/**
 * ifcfast.com — mockup concept B · "THE INSTRUMENT"
 * ------------------------------------------------------------------
 * A single, zero-scroll instrument panel reading one real IFC model
 * live — a Bloomberg-terminal-for-buildings. Dark graphite pole:
 * hairline-ruled sheet, uppercase mono microtype, tabular numerals,
 * no rounded corners, no cards. Every element is bespoke to this
 * concept — nothing imported from the production site.
 *
 * Data (all fetched at runtime, all real):
 *   /sample/duplex.summary.json   — title-block identity
 *   /sample/duplex.qto.json       — per-entity mesh coverage / no-mesh flags
 *   /sample/duplex.graph.json     — products (scope-aware), storeys, materials
 *   /sample/types/manifest.json   — type register + swappable mini-GLBs
 *   /sample/duplex.glb            — the 3D instrument
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";

/* ── model-viewer custom-element JSX declaration (from components/viewer.tsx) ── */
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

/* ── shapes of the real data ── */
type Summary = {
  path: string;
  size_bytes: number;
  schema: string;
  project_name: string;
  authoring_app: string;
  unit_scale: number;
  length_unit: string;
  cache_key: string;
  products: number;
  storeys: number;
  type_counts_total: number;
  parse_seconds: number;
};
type QtoRow = {
  entity: string;
  count: number;
  area_m2: number | null;
  volume_m3: number | null;
  triangles: number;
  products_with_mesh: number;
  products_without_mesh: number;
  source: string;
};
type Qto = { rows: QtoRow[] };
type Product = {
  guid: string;
  entity: string;
  storey_guid: string | null;
  m3: number | null;
  m2: number | null;
  materials: string[] | null;
};
type Storey = { guid: string; name: string; elevation: number };
type Graph = { products: Product[]; storeys: Storey[] };
type MType = {
  slug: string;
  type_name: string;
  entity: string;
  count: number;
  glb: string;
  bytes: number;
};
type Manifest = { generated_with: string; types: MType[] };

/* ── formatting ── */
const nfInt = new Intl.NumberFormat("en-US");
const short = (e: string) => e.replace(/^Ifc/i, "").toUpperCase();
function fmt(n: number, d: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}
/** void / air entities excluded from a "solid" volume readout */
const VOID_ENTITIES = new Set(["IfcSpace", "IfcOpeningElement"]);

/* ── rAF count-up: sells "live readout" on scope change ── */
function useCountUp(target: number, ms = 520): number {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const a = from.current;
    const b = target;
    if (a === b) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      setV(a + (b - a) * e);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = b;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

/* ══════════════════════════════════════════════════════════════ */
export default function InstrumentB() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [qto, setQto] = useState<Qto | null>(null);
  const [graph, setGraph] = useState<Graph | null>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [booted, setBooted] = useState(false);

  // scope: "ALL" | "UNPLACED" | storey_guid
  const [scope, setScope] = useState<string>("ALL");
  // cross-highlight entity (from hovering a dist bar OR a register row)
  const [hotEntity, setHotEntity] = useState<string | null>(null);
  // viewport swap target (register row hover)
  const [hotType, setHotType] = useState<MType | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([
      fetch("/sample/duplex.summary.json").then((r) => r.json()),
      fetch("/sample/duplex.qto.json").then((r) => r.json()),
      fetch("/sample/duplex.graph.json").then((r) => r.json()),
      fetch("/sample/types/manifest.json").then((r) => r.json()),
    ]).then(([s, q, g, m]) => {
      if (!live) return;
      setSummary(s);
      setQto(q);
      setGraph(g);
      setManifest(m);
      setTimeout(() => live && setBooted(true), 420);
    });
    return () => {
      live = false;
    };
  }, []);

  /* ── derived: storey ordering (section = top elevation first) ── */
  const storeys = useMemo(() => {
    if (!graph) return [];
    return [...graph.storeys].sort((a, b) => b.elevation - a.elevation);
  }, [graph]);

  const qtoByEntity = useMemo(() => {
    const m = new Map<string, QtoRow>();
    qto?.rows.forEach((r) => m.set(r.entity, r));
    return m;
  }, [qto]);

  /* ── scoped product set ── */
  const scoped = useMemo(() => {
    if (!graph) return [] as Product[];
    if (scope === "ALL") return graph.products;
    if (scope === "UNPLACED")
      return graph.products.filter((p) => !p.storey_guid);
    return graph.products.filter((p) => p.storey_guid === scope);
  }, [graph, scope]);

  /* ── entity distribution within scope ── */
  const dist = useMemo(() => {
    const m = new Map<string, { count: number; m3: number; m2: number }>();
    for (const p of scoped) {
      const cur = m.get(p.entity) ?? { count: 0, m3: 0, m2: 0 };
      cur.count += 1;
      cur.m3 += p.m3 ?? 0;
      cur.m2 += p.m2 ?? 0;
      m.set(p.entity, cur);
    }
    return [...m.entries()]
      .map(([entity, v]) => ({
        entity,
        ...v,
        noMesh: qtoByEntity.get(entity)?.source === "none",
      }))
      .sort((a, b) => b.count - a.count);
  }, [scoped, qtoByEntity]);
  const distMax = dist.reduce((mx, d) => Math.max(mx, d.count), 1);

  /* ── materials within scope ── */
  const materials = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of scoped)
      for (const name of p.materials ?? []) m.set(name, (m.get(name) ?? 0) + 1);
    return [...m.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [scoped]);
  const matMax = materials.reduce((mx, d) => Math.max(mx, d.count), 1);

  /* ── quantities strip (scope-aware) ── */
  const q = useMemo(() => {
    let m3 = 0,
      m2 = 0;
    for (const p of scoped) {
      m2 += p.m2 ?? 0;
      if (!VOID_ENTITIES.has(p.entity)) m3 += p.m3 ?? 0;
    }
    return { products: scoped.length, m3, m2, mats: materials.length };
  }, [scoped, materials]);

  /* ── global mesh coverage (from qto) ── */
  const meshed = useMemo(() => {
    if (!qto) return 0;
    let w = 0,
      t = 0;
    for (const r of qto.rows) {
      w += r.products_with_mesh;
      t += r.count;
    }
    return t ? (w / t) * 100 : 0;
  }, [qto]);

  /* ── storey counts (all products, by storey_guid) ── */
  const storeyCount = useMemo(() => {
    const m = new Map<string, number>();
    let unplaced = 0;
    graph?.products.forEach((p) => {
      if (!p.storey_guid) unplaced += 1;
      else m.set(p.storey_guid, (m.get(p.storey_guid) ?? 0) + 1);
    });
    return { m, unplaced };
  }, [graph]);
  const storeyMax = Math.max(
    storeyCount.unplaced,
    ...[...storeyCount.m.values()],
    1
  );

  const scopeLabel =
    scope === "ALL"
      ? "WHOLE MODEL"
      : scope === "UNPLACED"
        ? "UNPLACED · OPENINGS + FURNISHINGS"
        : storeys.find((s) => s.guid === scope)?.name ?? scope;

  const viewSrc = hotType ? hotType.glb : "/sample/duplex.glb";
  const viewLabel = hotType
    ? `${short(hotType.entity)} · ${hotType.type_name}`
    : "DUPLEX_A · FULL ASSEMBLY";

  const fileName = summary
    ? summary.path.split("/").pop() ?? summary.path
    : "—";

  const ready = summary && qto && graph && manifest;

  return (
    <div id="inst-b">
      <StyleBlock />
      {/* boot veil */}
      {!booted && <BootVeil ready={!!ready} />}

      {ready && (
        <div className="grid">
          {/* ─────────── TITLE BLOCK ─────────── */}
          <section className="cell titleblk" style={{ gridArea: "title" }}>
            <div className="tb-mark">
              <span className="tb-live" />
              <span className="tb-brand">IFCFAST</span>
              <span className="tb-sub">INSTRUMENT</span>
              <span className="tb-ver">v{manifest!.generated_with}</span>
            </div>
            <div className="tb-grid">
              <TB k="MODEL" v={fileName} wide />
              <TB k="SCHEMA" v={summary!.schema} />
              <TB k="PROJECT" v={summary!.project_name || "—"} />
              <TB k="SOURCE APP" v={summary!.authoring_app} wide />
              <TB
                k="UNITS"
                v={`${summary!.length_unit} · ×${summary!.unit_scale}`}
              />
              <TB k="SIZE" v={`${fmt(summary!.size_bytes / 1e6, 2)} MB`} />
              <TB
                k="PARSE"
                v={`${fmt(summary!.parse_seconds * 1000, 1)} ms`}
                accent
              />
              <TB k="ENTITIES" v={nfInt.format(summary!.type_counts_total)} />
              <TB k="CACHE" v={summary!.cache_key} mono />
            </div>
          </section>

          {/* ─────────── QUANTITIES STRIP ─────────── */}
          <section className="cell quant" style={{ gridArea: "quant" }}>
            <InstHead
              label="QUANTITIES"
              meta={scopeLabel}
              metaAccent={scope !== "ALL"}
            />
            <div className="qrow">
              <Readout label="PRODUCTS" value={q.products} d={0} unit="" />
              <Readout label="SOLID VOL" value={q.m3} d={1} unit="m³" />
              <Readout label="SURFACE" value={q.m2} d={0} unit="m²" />
              <Readout label="MATERIALS" value={q.mats} d={0} unit="dist" />
              <Readout
                label="MESHED"
                value={meshed}
                d={1}
                unit="%"
                muted
                fixed
              />
            </div>
          </section>

          {/* ─────────── STOREY STACK (section) ─────────── */}
          <section className="cell storey" style={{ gridArea: "storey" }}>
            <InstHead
              label="STOREY SECTION"
              meta={`${storeys.length} LVL`}
            />
            <div className="stack">
              {scope !== "ALL" && (
                <button className="stk-reset" onClick={() => setScope("ALL")}>
                  ◂ RESET TO WHOLE MODEL
                </button>
              )}
              <div className="stk-body">
                <div className="stk-axis" />
                {storeys.map((s) => {
                  const c = storeyCount.m.get(s.guid) ?? 0;
                  const sel = scope === s.guid;
                  return (
                    <button
                      key={s.guid}
                      className={`stk-row${sel ? " sel" : ""}`}
                      onClick={() => setScope(sel ? "ALL" : s.guid)}
                    >
                      {sel && (
                        <motion.span
                          layoutId="stk-sel"
                          className="stk-sel"
                          transition={{ type: "spring", stiffness: 520, damping: 40 }}
                        />
                      )}
                      <span className="stk-elev">
                        {s.elevation >= 0 ? "+" : "−"}
                        {fmt(Math.abs(s.elevation), 2)}
                      </span>
                      <span className="stk-name">{s.name}</span>
                      <span className="stk-bar">
                        <span
                          className="stk-fill"
                          style={{ width: `${(c / storeyMax) * 100}%` }}
                        />
                      </span>
                      <span className="stk-count">{c}</span>
                    </button>
                  );
                })}
                <button
                  className={`stk-row unplaced${scope === "UNPLACED" ? " sel" : ""}`}
                  onClick={() =>
                    setScope(scope === "UNPLACED" ? "ALL" : "UNPLACED")
                  }
                >
                  {scope === "UNPLACED" && (
                    <motion.span
                      layoutId="stk-sel"
                      className="stk-sel"
                      transition={{ type: "spring", stiffness: 520, damping: 40 }}
                    />
                  )}
                  <span className="stk-elev">·····</span>
                  <span className="stk-name">UNPLACED</span>
                  <span className="stk-bar">
                    <span
                      className="stk-fill"
                      style={{
                        width: `${(storeyCount.unplaced / storeyMax) * 100}%`,
                      }}
                    />
                  </span>
                  <span className="stk-count">{storeyCount.unplaced}</span>
                </button>
              </div>
            </div>
          </section>

          {/* ─────────── 3D VIEWPORT ─────────── */}
          <section className="cell view" style={{ gridArea: "view" }}>
            <InstHead label="VIEWPORT" meta={hotType ? "TYPE PREVIEW" : "GLB"} metaAccent={!!hotType} />
            <Viewport src={viewSrc} label={viewLabel} />
          </section>

          {/* ─────────── ENTITY DISTRIBUTION ─────────── */}
          <section className="cell dist" style={{ gridArea: "dist" }}>
            <InstHead
              label="ENTITY DISTRIBUTION"
              meta={`${dist.length} CLASSES`}
            />
            <div className="scrolly bars">
              {dist.map((d) => {
                const hot = hotEntity === d.entity;
                return (
                  <div
                    key={d.entity}
                    className={`bar-row${hot ? " hot" : ""}`}
                    onMouseEnter={() => setHotEntity(d.entity)}
                    onMouseLeave={() => setHotEntity(null)}
                  >
                    <span className="bar-name">
                      {short(d.entity)}
                      {d.noMesh && <span className="bar-flag">NO MESH</span>}
                    </span>
                    <span className="bar-track">
                      <span
                        className="bar-fill"
                        style={{ width: `${(d.count / distMax) * 100}%` }}
                      />
                    </span>
                    <span className="bar-n">{d.count}</span>
                    <span className="bar-v">{fmt(d.m3, 1)}</span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ─────────── MATERIALS ─────────── */}
          <section className="cell mat" style={{ gridArea: "mat" }}>
            <InstHead label="MATERIALS" meta={`${materials.length} DISTINCT`} />
            <div className="scrolly bars">
              {materials.length === 0 && (
                <div className="empty">NO MATERIAL ASSIGNMENTS IN SCOPE</div>
              )}
              {materials.map((m) => (
                <div key={m.name} className="bar-row mat-row">
                  <span className="bar-name mat-name" title={m.name}>
                    {m.name}
                  </span>
                  <span className="bar-track">
                    <span
                      className="bar-fill mat-fill"
                      style={{ width: `${(m.count / matMax) * 100}%` }}
                    />
                  </span>
                  <span className="bar-n">{m.count}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ─────────── TYPE REGISTER ─────────── */}
          <section className="cell reg" style={{ gridArea: "reg" }}>
            <InstHead
              label="TYPE REGISTER"
              meta={`${manifest!.types.length} TYPES`}
            />
            <div
              className="scrolly reg-body"
              onMouseLeave={() => {
                setHotType(null);
                setHotEntity(null);
              }}
            >
              <div className="reg-head">
                <span>ENT</span>
                <span>TYPE</span>
                <span className="ra">N</span>
                <span>DIST</span>
                <span className="ra">GLB</span>
              </div>
              {manifest!.types.map((t) => {
                const entHot = hotEntity === t.entity;
                const inScope =
                  scope === "ALL" ||
                  dist.some((d) => d.entity === t.entity && d.count > 0);
                return (
                  <div
                    key={t.slug}
                    className={`reg-row${entHot ? " hot" : ""}${inScope ? "" : " dim"}`}
                    onMouseEnter={() => {
                      setHotType(t);
                      setHotEntity(t.entity);
                    }}
                  >
                    <span className="reg-ent">{short(t.entity)}</span>
                    <span className="reg-name" title={t.type_name}>
                      {t.type_name}
                    </span>
                    <span className="reg-n ra">{t.count}</span>
                    <span className="reg-spark">
                      <span
                        className="reg-sparkfill"
                        style={{ width: `${(t.count / 50) * 100}%` }}
                      />
                    </span>
                    <span className="reg-bytes ra">
                      {(t.bytes / 1024).toFixed(1)}k
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

/* ── title-block field ── */
function TB({
  k,
  v,
  wide,
  accent,
  mono,
}: {
  k: string;
  v: string;
  wide?: boolean;
  accent?: boolean;
  mono?: boolean;
}) {
  return (
    <div className={`tb-cell${wide ? " tb-wide" : ""}`}>
      <div className="tb-k">{k}</div>
      <div
        className={`tb-v${accent ? " tb-acc" : ""}${mono ? " tb-mono" : ""}`}
        title={v}
      >
        {v}
      </div>
    </div>
  );
}

/* ── instrument header (ruled label bar) ── */
function InstHead({
  label,
  meta,
  metaAccent,
}: {
  label: string;
  meta?: string;
  metaAccent?: boolean;
}) {
  return (
    <div className="ihead">
      <span className="ihead-l">{label}</span>
      {meta && (
        <span className={`ihead-m${metaAccent ? " acc" : ""}`}>{meta}</span>
      )}
    </div>
  );
}

/* ── big animated readout ── */
function Readout({
  label,
  value,
  d,
  unit,
  muted,
  fixed,
}: {
  label: string;
  value: number;
  d: number;
  unit: string;
  muted?: boolean;
  fixed?: boolean;
}) {
  const anim = useCountUp(fixed ? value : value);
  return (
    <div className={`ro${muted ? " ro-muted" : ""}`}>
      <div className="ro-k">{label}</div>
      <div className="ro-v">
        {fmt(anim, d)}
        {unit && <span className="ro-u">{unit}</span>}
      </div>
    </div>
  );
}

/* ── 3D viewport instrument ── */
function Viewport({ src, label }: { src: string; label: string }) {
  const ref = useRef<HTMLElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    import("@google/model-viewer");
  }, []);
  return (
    <div className="vp">
      <div className="vp-crosshair vp-ch-tl" />
      <div className="vp-crosshair vp-ch-tr" />
      <div className="vp-crosshair vp-ch-bl" />
      <div className="vp-crosshair vp-ch-br" />
      {/* @ts-expect-error — model-viewer is a custom element */}
      <model-viewer
        ref={ref as React.MutableRefObject<HTMLElement | null>}
        src={src}
        alt={label}
        camera-controls
        auto-rotate
        rotation-per-second="16deg"
        environment-image="neutral"
        shadow-intensity="0.9"
        shadow-softness="1"
        exposure="1.15"
        tone-mapping="commerce"
        interaction-prompt="none"
        camera-orbit="40deg 68deg auto"
        min-camera-orbit="auto auto 55%"
        max-camera-orbit="auto auto 260%"
        field-of-view="26deg"
        onLoad={() => setLoaded(true)}
        style={{
          width: "100%",
          height: "100%",
          background:
            "radial-gradient(ellipse 120% 90% at 50% 8%, #202429 0%, #14171b 45%, #0c0e11 100%)",
          ["--poster-color" as string]: "transparent",
        }}
      />
      <div className="vp-cap">
        <span className="vp-dot" data-on={loaded} />
        {label}
      </div>
    </div>
  );
}

/* ── boot veil ── */
function BootVeil({ ready }: { ready: boolean }) {
  const lines = [
    "ifcfast · rust core · pyo3 wheel",
    "open Duplex_A_20110907.ifc",
    "parse step … 289 products · 4 storeys",
    "tessellate mesh · build substrate",
    ready ? "READY" : "…",
  ];
  return (
    <motion.div
      className="boot"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="boot-inner">
        <div className="boot-brand">
          <span className="tb-live" />
          IFCFAST · INSTRUMENT
        </div>
        {lines.map((l, i) => (
          <div key={i} className="boot-line">
            <span className="boot-caret">›</span> {l}
          </div>
        ))}
      </div>
    </motion.div>
  );
}

/* ══════════════════ scoped styling (dark graphite terminal) ══════════════════ */
function StyleBlock() {
  return (
    <style
      // eslint-disable-next-line react/no-unknown-property
      dangerouslySetInnerHTML={{
        __html: `
#inst-b{
  --bg:#0b0c0e; --sheet:#101215; --sheet2:#0d0f12;
  --ln:#22262c; --ln2:#2c313a;
  --fg:#e9e7e1; --mut:#71767e; --mut2:#565b62;
  --acc:#e07c2f; --acc-dim:#9a5a26; --steel:#454d56; --steel2:#5b636d;
  --mono:var(--font-mono),"JetBrains Mono",ui-monospace,monospace;
  position:fixed; inset:0; z-index:40;
  background:
    linear-gradient(0deg, rgba(255,255,255,0.012) 1px, transparent 1px) 0 0/100% 3px,
    radial-gradient(ellipse 140% 100% at 50% -10%, #16191e 0%, var(--bg) 60%);
  color:var(--fg);
  font-family:var(--mono);
  -webkit-font-smoothing:antialiased;
  overflow:auto;
}
#inst-b *{ box-sizing:border-box; }
#inst-b .grid{
  min-height:100%;
  display:grid;
  border-top:1px solid var(--ln); border-left:1px solid var(--ln);
  grid-template-columns:1fr;
  grid-template-areas:"title" "quant" "storey" "view" "dist" "mat" "reg";
}
#inst-b .cell{
  border-right:1px solid var(--ln); border-bottom:1px solid var(--ln);
  min-height:0; min-width:0; display:flex; flex-direction:column;
  background:var(--sheet);
  position:relative;
}
#inst-b .view{ min-height:280px; }
#inst-b .storey,#inst-b .dist,#inst-b .mat{ min-height:180px; }
#inst-b .reg{ min-height:260px; }

/* desktop — zero-scroll instrument */
@media(min-width:1200px){
  #inst-b{ overflow:hidden; }
  #inst-b .grid{
    height:100dvh; min-height:0;
    grid-template-columns:216px minmax(0,1.15fr) minmax(0,1fr) 302px;
    grid-template-rows:auto minmax(0,1fr) minmax(0,1fr);
    grid-template-areas:
      "title  title  quant  quant"
      "storey view   dist   reg"
      "storey view   mat    reg";
  }
  #inst-b .view,#inst-b .storey,#inst-b .dist,#inst-b .mat,#inst-b .reg{ min-height:0; }
}
/* wide — gain a column, split dist/mat, no stretch */
@media(min-width:1920px){
  #inst-b .grid{
    grid-template-columns:248px minmax(0,1.25fr) minmax(0,0.92fr) minmax(0,0.92fr) 360px;
    grid-template-rows:auto minmax(0,1fr) minmax(0,1fr);
    grid-template-areas:
      "title  title  title  quant  quant"
      "storey view   dist   mat    reg"
      "storey view   dist   mat    reg";
  }
}

/* ── instrument header ── */
#inst-b .ihead{
  display:flex; align-items:center; justify-content:space-between;
  gap:8px; padding:7px 10px 6px; border-bottom:1px solid var(--ln);
  background:linear-gradient(180deg,#14171b,#101216); flex:0 0 auto;
}
#inst-b .ihead-l{ font-size:9.5px; letter-spacing:.19em; color:var(--fg); font-weight:600; }
#inst-b .ihead-m{ font-size:8.5px; letter-spacing:.14em; color:var(--mut); }
#inst-b .ihead-m.acc{ color:var(--acc); }

/* ── title block ── */
#inst-b .titleblk{ background:linear-gradient(180deg,#111418,#0d0f12); }
#inst-b .tb-mark{
  display:flex; align-items:center; gap:9px; padding:9px 12px 8px;
  border-bottom:1px solid var(--ln);
}
#inst-b .tb-brand{ font-size:14px; letter-spacing:.26em; font-weight:700; }
#inst-b .tb-sub{ font-size:8.5px; letter-spacing:.34em; color:var(--acc); align-self:flex-end; margin-bottom:2px; }
#inst-b .tb-ver{ margin-left:auto; font-size:8.5px; letter-spacing:.13em; color:var(--mut); }
#inst-b .tb-live{
  width:6px; height:6px; background:var(--acc); border-radius:50%;
  box-shadow:0 0 7px 1px var(--acc); animation:pulse 1.7s ease-in-out infinite;
}
@keyframes pulse{ 0%,100%{opacity:1} 50%{opacity:.28} }
#inst-b .tb-grid{
  display:grid; grid-template-columns:repeat(4,minmax(0,1fr));
  flex:1 1 auto; align-content:start;
}
#inst-b .tb-cell{
  border-right:1px solid var(--ln); border-bottom:1px solid var(--ln);
  padding:6px 9px 7px; min-width:0; overflow:hidden;
}
#inst-b .tb-wide{ grid-column:span 2; }
#inst-b .tb-k{ font-size:8px; letter-spacing:.16em; color:var(--mut2); margin-bottom:3px; }
#inst-b .tb-v{
  font-size:11.5px; color:var(--fg); white-space:nowrap; overflow:hidden;
  text-overflow:ellipsis; letter-spacing:.01em; font-variant-numeric:tabular-nums;
}
#inst-b .tb-acc{ color:var(--acc); }
#inst-b .tb-mono{ font-size:10px; color:var(--mut); letter-spacing:.05em; }

/* ── quantities strip ── */
#inst-b .qrow{
  flex:1 1 auto; display:grid;
  grid-template-columns:repeat(5,minmax(0,1fr)); align-items:stretch;
}
#inst-b .ro{
  border-right:1px solid var(--ln); padding:9px 11px 10px;
  display:flex; flex-direction:column; justify-content:center; gap:5px; min-width:0;
}
#inst-b .ro:last-child{ border-right:0; }
#inst-b .ro-k{ font-size:8px; letter-spacing:.16em; color:var(--mut); }
#inst-b .ro-v{
  font-size:clamp(19px,2.1vw,29px); line-height:.95; color:var(--fg);
  font-variant-numeric:tabular-nums; letter-spacing:-.01em; white-space:nowrap;
}
#inst-b .ro-u{ font-size:10px; color:var(--mut); margin-left:5px; letter-spacing:.05em; }
#inst-b .ro-muted .ro-v{ color:var(--steel2); }

/* ── storey stack ── */
#inst-b .stack{ flex:1 1 auto; display:flex; flex-direction:column; min-height:0; }
#inst-b .stk-reset{
  font:inherit; text-align:left; cursor:pointer; color:var(--acc);
  background:rgba(224,124,47,.06); border:0; border-bottom:1px solid var(--ln);
  font-size:8.5px; letter-spacing:.13em; padding:6px 10px;
}
#inst-b .stk-reset:hover{ background:rgba(224,124,47,.13); }
#inst-b .stk-body{ position:relative; flex:1 1 auto; display:flex; flex-direction:column; }
#inst-b .stk-axis{
  position:absolute; left:56px; top:0; bottom:0; width:1px;
  background:repeating-linear-gradient(180deg,var(--ln2) 0 4px,transparent 4px 9px);
}
#inst-b .stk-row{
  position:relative; flex:1 1 0; min-height:38px;
  display:grid; grid-template-columns:56px 1fr; grid-template-rows:auto auto;
  align-content:center; gap:2px 10px;
  padding:0 12px 0 0; cursor:pointer; text-align:left;
  background:transparent; border:0; border-bottom:1px solid var(--ln);
  font:inherit; color:var(--fg);
}
#inst-b .stk-row:hover{ background:rgba(255,255,255,.025); }
#inst-b .stk-row.sel{ background:rgba(224,124,47,.07); }
#inst-b .stk-sel{ position:absolute; left:0; top:0; bottom:0; width:3px; background:var(--acc); box-shadow:0 0 8px var(--acc); }
#inst-b .stk-elev{
  grid-row:1/3; align-self:center; text-align:right; padding-left:10px;
  font-size:10px; color:var(--mut); font-variant-numeric:tabular-nums; letter-spacing:.02em;
}
#inst-b .stk-name{ font-size:10.5px; letter-spacing:.05em; color:var(--fg); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#inst-b .stk-row.sel .stk-name{ color:var(--acc); }
#inst-b .stk-bar{ grid-column:2; height:5px; background:#0c0e11; border:1px solid var(--ln); position:relative; overflow:hidden; margin-right:34px; }
#inst-b .stk-fill{ position:absolute; inset:0 auto 0 0; background:linear-gradient(90deg,var(--steel),var(--steel2)); transition:width .5s cubic-bezier(.2,.7,.2,1); }
#inst-b .stk-row.sel .stk-fill{ background:linear-gradient(90deg,var(--acc-dim),var(--acc)); }
#inst-b .stk-count{ position:absolute; right:12px; top:50%; transform:translateY(-50%); font-size:12px; font-variant-numeric:tabular-nums; color:var(--fg); }
#inst-b .stk-row.unplaced .stk-name,#inst-b .stk-row.unplaced .stk-elev{ color:var(--mut2); }

/* ── viewport ── */
#inst-b .vp{ flex:1 1 auto; position:relative; min-height:0; overflow:hidden; }
#inst-b .vp model-viewer{ display:block; }
#inst-b .vp-cap{
  position:absolute; left:8px; bottom:7px; display:flex; align-items:center; gap:6px;
  font-size:8.5px; letter-spacing:.13em; color:var(--mut);
  background:rgba(9,11,13,.72); padding:3px 7px; border:1px solid var(--ln); max-width:calc(100% - 16px);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
#inst-b .vp-dot{ width:5px; height:5px; border-radius:50%; background:var(--mut2); flex:0 0 auto; }
#inst-b .vp-dot[data-on="true"]{ background:var(--acc); box-shadow:0 0 6px var(--acc); }
#inst-b .vp-crosshair{ position:absolute; width:9px; height:9px; z-index:2; pointer-events:none; opacity:.5; }
#inst-b .vp-ch-tl{ top:7px; left:7px; border-top:1px solid var(--steel2); border-left:1px solid var(--steel2); }
#inst-b .vp-ch-tr{ top:7px; right:7px; border-top:1px solid var(--steel2); border-right:1px solid var(--steel2); }
#inst-b .vp-ch-bl{ bottom:7px; left:7px; border-bottom:1px solid var(--steel2); border-left:1px solid var(--steel2); }
#inst-b .vp-ch-br{ bottom:7px; right:7px; border-bottom:1px solid var(--steel2); border-right:1px solid var(--steel2); }

/* ── bars (distribution + materials) ── */
#inst-b .scrolly{ flex:1 1 auto; min-height:0; overflow-y:auto; }
#inst-b .scrolly::-webkit-scrollbar{ width:5px; }
#inst-b .scrolly::-webkit-scrollbar-thumb{ background:var(--ln2); }
#inst-b .scrolly::-webkit-scrollbar-track{ background:transparent; }
#inst-b .bars{ padding:2px 0; }
#inst-b .bar-row{
  display:grid; grid-template-columns:118px 1fr 32px 46px; align-items:center;
  gap:8px; padding:3px 11px; cursor:default; border-bottom:1px solid rgba(34,38,44,.5);
}
#inst-b .mat-row{ grid-template-columns:1fr 70px 32px; }
#inst-b .bar-row.hot{ background:rgba(224,124,47,.09); }
#inst-b .bar-name{ font-size:9.5px; letter-spacing:.06em; color:var(--fg); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:flex; align-items:center; gap:6px; }
#inst-b .mat-name{ color:var(--mut); letter-spacing:.02em; }
#inst-b .bar-flag{ font-size:7px; letter-spacing:.08em; color:#0b0c0e; background:var(--acc); padding:1px 3px; }
#inst-b .bar-track{ height:9px; background:#0c0e11; border:1px solid var(--ln); position:relative; overflow:hidden; }
#inst-b .bar-fill{ position:absolute; inset:0 auto 0 0; background:linear-gradient(90deg,var(--steel),var(--steel2)); transition:width .5s cubic-bezier(.2,.7,.2,1); }
#inst-b .bar-row.hot .bar-fill{ background:linear-gradient(90deg,var(--acc-dim),var(--acc)); }
#inst-b .mat-fill{ background:linear-gradient(90deg,#3a4048,#4c545e); }
#inst-b .bar-n{ font-size:11px; text-align:right; font-variant-numeric:tabular-nums; color:var(--fg); }
#inst-b .bar-v{ font-size:9px; text-align:right; font-variant-numeric:tabular-nums; color:var(--mut); }
#inst-b .empty{ padding:14px 12px; font-size:9px; letter-spacing:.1em; color:var(--mut2); }

/* ── type register ── */
#inst-b .reg-body{ font-variant-numeric:tabular-nums; }
#inst-b .reg-head,#inst-b .reg-row{
  display:grid; grid-template-columns:66px 1fr 26px 60px 40px; gap:7px;
  align-items:center; padding:3px 10px;
}
#inst-b .reg-head{
  position:sticky; top:0; z-index:1; background:#0e1013;
  border-bottom:1px solid var(--ln); font-size:7.5px; letter-spacing:.13em; color:var(--mut2);
}
#inst-b .ra{ text-align:right; }
#inst-b .reg-row{ border-bottom:1px solid rgba(34,38,44,.45); cursor:default; }
#inst-b .reg-row:hover,#inst-b .reg-row.hot{ background:rgba(224,124,47,.10); }
#inst-b .reg-row.dim{ opacity:.32; }
#inst-b .reg-ent{ font-size:8px; letter-spacing:.03em; color:var(--acc); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#inst-b .reg-name{ font-size:9px; color:var(--fg); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; letter-spacing:.01em; }
#inst-b .reg-n{ font-size:10px; color:var(--fg); }
#inst-b .reg-spark{ height:7px; background:#0c0e11; border:1px solid var(--ln); position:relative; overflow:hidden; }
#inst-b .reg-sparkfill{ position:absolute; inset:0 auto 0 0; background:var(--steel2); }
#inst-b .reg-row:hover .reg-sparkfill,#inst-b .reg-row.hot .reg-sparkfill{ background:var(--acc); }
#inst-b .reg-bytes{ font-size:8.5px; color:var(--mut); }

/* ── boot veil ── */
#inst-b .boot{ position:absolute; inset:0; z-index:60; background:var(--bg); display:flex; align-items:center; justify-content:center; }
#inst-b .boot-inner{ font-family:var(--mono); }
#inst-b .boot-brand{ display:flex; align-items:center; gap:9px; font-size:13px; letter-spacing:.26em; margin-bottom:14px; color:var(--fg); }
#inst-b .boot-line{ font-size:10px; letter-spacing:.05em; color:var(--mut); padding:2px 0; }
#inst-b .boot-caret{ color:var(--acc); }
`,
      }}
    />
  );
}
