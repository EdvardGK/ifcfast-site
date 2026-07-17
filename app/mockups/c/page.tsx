"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type CSSProperties,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpRight, ArrowLeft, ArrowDown } from "lucide-react";

/* ------------------------------------------------------------------ *
 * model-viewer intrinsic-element typing.
 * Copied verbatim from components/viewer.tsx so the two declarations
 * merge to an identical type. Under React 19 the global JSX namespace
 * augmentation is not consulted for intrinsic elements, so every
 * <model-viewer> tag also carries a @ts-expect-error (see <Stage/>),
 * exactly as viewer.tsx does.
 * ------------------------------------------------------------------ */
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
          exposure?: string;
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

/* -------------------------------- data shapes -------------------------------- */

type Summary = {
  path: string;
  size_bytes: number;
  schema: string;
  project_name: string;
  authoring_app: string;
  length_unit: string;
  products: number;
  storeys: number;
  type_counts_total: number;
  parse_seconds: number;
  top_types: Record<string, number>;
};

type QtoRow = {
  entity: string;
  count: number;
  storeys: string[];
  area_m2: number | null;
  volume_m3: number | null;
  triangles: number;
  products_with_mesh: number;
  products_without_mesh: number;
  source: string;
};

type Qto = { schema: string; products: number; rows: QtoRow[] };

type Specimen = {
  slug: string;
  type_name: string;
  entity: string;
  count: number;
  guid: string;
  glb: string;
  bytes: number;
};

type Manifest = { source: string; generated_with: string; types: Specimen[] };

type PlatedSpecimen = Specimen & { plate: number };

/* -------------------------------- constants -------------------------------- */

// White-cyclorama product photography: subject on white, a warm floor fade.
const STAGE_BG =
  "radial-gradient(125% 105% at 50% 12%, #ffffff 0%, #ffffff 46%, #efe9dd 100%)";

// Live WebGL contexts are finite. Keep the pool comfortably under the browser
// ceiling; plates outside the pool render as typographic index cards.
const POOL_CAP = 12;

// Every Nth specimen is lifted out of the contact sheet as a feature plate.
const FEATURE_EVERY = 7;

/* -------------------------------- helpers -------------------------------- */

const fmtInt = (n: number) => n.toLocaleString("en-US");
const fmtDec = (n: number, d: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

const pad2 = (n: number) => String(n).padStart(2, "0");

// "IfcWallStandardCase" -> "Wall Standard Case"
const deCamel = (entity: string) =>
  entity
    .replace(/^Ifc/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");

const basename = (p: string) => p.split(/[/\\]/).pop() ?? p;

function setsEqual(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

/* ================================================================== *
 * Stage — the single <model-viewer> site in the whole page.
 * Product-photography lighting; auto-rotate is caller-driven so a
 * static plate shows geometry and a hovered / featured plate turns.
 * ================================================================== */

function Stage({
  src,
  rotate,
  speed = "18deg",
}: {
  src: string;
  rotate: boolean;
  speed?: string;
}) {
  return (
    <>
      {/* @ts-expect-error model-viewer is a custom element */}
      <model-viewer
        src={src}
        alt=""
        auto-rotate={rotate || undefined}
        rotation-per-second={speed}
        interaction-prompt="none"
        environment-image="neutral"
        exposure="1.12"
        shadow-intensity="0.85"
        shadow-softness="1"
        tone-mapping="neutral"
        camera-orbit="-24deg 74deg auto"
        field-of-view="30deg"
        loading="eager"
        reveal="auto"
        style={
          {
            width: "100%",
            height: "100%",
            background: STAGE_BG,
            "--poster-color": "transparent",
          } as CSSProperties
        }
      />
    </>
  );
}

/* ================================================================== *
 * Cover plate — the whole model, presented on white.
 * Gated by its own observer so its context is released once you
 * scroll into the specimen plates.
 * ================================================================== */

function CoverStage({ src }: { src: string }) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => setNear(e.isIntersecting),
      { rootMargin: "300px 0px 300px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={wrap} className="cat-cover-stage">
      {near ? (
        <Stage src={src} rotate speed="6deg" />
      ) : (
        <div className="cat-stage-ph" aria-hidden />
      )}
    </div>
  );
}

/* ================================================================== *
 * Title page + cover.
 * ================================================================== */

function TitlePage({
  summary,
  manifest,
  glb,
}: {
  summary: Summary | null;
  manifest: Manifest | null;
  glb: string;
}) {
  const edition = manifest?.generated_with ?? "0.4.42";
  const file = summary ? basename(summary.path) : "…";
  const facts: [string, string][] = summary
    ? [
        ["File", file],
        ["Schema", summary.schema],
        ["Authored in", summary.authoring_app],
        ["Products", fmtInt(summary.products)],
        ["Storeys", String(summary.storeys)],
        ["Distinct types", String(summary.type_counts_total)],
        ["Size", `${fmtDec(summary.size_bytes / 1_000_000, 2)} MB`],
        ["Read in", `${fmtDec(summary.parse_seconds * 1000, 0)} ms`],
      ]
    : [];

  return (
    <header className="cat-section cat-title">
      <FolioBar folio="00" right={`EDITION ${edition}`} />

      <div className="cat-title-grid">
        <div className="cat-title-lead">
          <motion.p
            className="cat-kicker"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.9 }}
          >
            A monograph of one building file
          </motion.p>
          <motion.h1
            className="cat-h1"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.0, ease: [0.16, 1, 0.3, 1] }}
          >
            One file,
            <br />
            <em>catalogued.</em>
          </motion.h1>
          <motion.p
            className="cat-deck"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.1, delay: 0.25 }}
          >
            An IFC model is a dense, tangled document. ifcfast reads it whole —
            geometry and data — in a blink, then lays it out like a printed
            catalogue: the building, its every type of part, and the numbers
            that fall out of the mesh.
          </motion.p>
        </div>

        <aside className="cat-colophon-mini" aria-label="File particulars">
          <div className="cat-mini-rule" />
          <dl className="cat-facts">
            {facts.map(([k, v]) => (
              <div key={k} className="cat-fact">
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </div>

      <figure className="cat-cover-figure">
        <CoverStage src={glb} />
        <figcaption className="cat-cover-cap">
          <span>PLATE 00</span>
          <span className="cat-cap-mid">THE WHOLE FILE — {file}</span>
          <span className="cat-cap-turn">
            slowly turning <ArrowDown size={11} strokeWidth={1.6} />
          </span>
        </figcaption>
      </figure>
    </header>
  );
}

/* ================================================================== *
 * Folio bar — the running head at the top of every section.
 * ================================================================== */

function FolioBar({ folio, right }: { folio: string; right: string }) {
  return (
    <div className="cat-folio">
      <span className="cat-folio-l">ifcfast — catalogue of one file</span>
      <span className="cat-folio-c">·</span>
      <span className="cat-folio-r">{right}</span>
      <span className="cat-folio-n">FOLIO {folio}</span>
    </div>
  );
}

/* ================================================================== *
 * A single specimen plate (contact-sheet cell).
 * ================================================================== */

function SpecimenPlate({
  sp,
  live,
  expanded,
  qto,
  onRef,
  onHover,
  onToggle,
}: {
  sp: PlatedSpecimen;
  live: boolean;
  expanded: boolean;
  qto: QtoRow | undefined;
  onRef: (slug: string, el: HTMLElement | null) => void;
  onHover: (slug: string | null) => void;
  onToggle: (slug: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const rotate = hovered || expanded;

  return (
    <motion.article
      data-slug={sp.slug}
      ref={(el: HTMLElement | null) => onRef(sp.slug, el)}
      className={`cat-plate${expanded ? " is-expanded" : ""}`}
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      onMouseEnter={() => {
        setHovered(true);
        onHover(sp.slug);
      }}
      onMouseLeave={() => {
        setHovered(false);
        onHover(null);
      }}
    >
      <button
        type="button"
        className="cat-plate-stage"
        onClick={() => onToggle(sp.slug)}
        aria-expanded={expanded}
        aria-label={`${expanded ? "Collapse" : "Expand"} plate ${pad2(
          sp.plate
        )}, ${sp.type_name}`}
      >
        {live ? (
          <Stage src={sp.glb} rotate={rotate} speed="26deg" />
        ) : (
          <PlatePlaceholder entity={sp.entity} />
        )}
        <span className="cat-plate-no">PLATE {pad2(sp.plate)}</span>
      </button>

      <div className="cat-plate-cap">
        <div className="cat-plate-meta">
          <span className="cat-plate-entity">{sp.entity}</span>
          <span className="cat-plate-count">×{fmtInt(sp.count)}</span>
        </div>
        <div className="cat-plate-name">{sp.type_name}</div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            className="cat-plate-detail"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          >
            <SpecTable sp={sp} qto={qto} compact />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

function PlatePlaceholder({ entity }: { entity: string }) {
  const glyph = entity.replace(/^Ifc/, "").slice(0, 2).toUpperCase();
  return (
    <div className="cat-stage-ph" aria-hidden>
      <span className="cat-ph-glyph">{glyph}</span>
    </div>
  );
}

/* ================================================================== *
 * Print-style spec table (real QTO numbers for the specimen's entity).
 * ================================================================== */

function SpecTable({
  sp,
  qto,
  compact = false,
}: {
  sp: PlatedSpecimen;
  qto: QtoRow | undefined;
  compact?: boolean;
}) {
  const nv = (v: number | null, d: number, unit: string) =>
    v == null ? "—" : `${fmtDec(v, d)} ${unit}`;
  const rows: [string, string][] = [
    ["This type", `×${fmtInt(sp.count)}`],
    ["Entity total", qto ? `×${fmtInt(qto.count)}` : "—"],
    ["Meshed", qto ? fmtInt(qto.products_with_mesh) : "—"],
    ["Surface area", qto ? nv(qto.area_m2, 1, "m²") : "—"],
    ["Volume", qto ? nv(qto.volume_m3, 2, "m³") : "—"],
    ["Triangles", qto ? fmtInt(qto.triangles) : "—"],
    ["Geometry source", qto ? qto.source : "—"],
    ["On storeys", qto && qto.storeys.length ? qto.storeys.join(", ") : "—"],
  ];
  return (
    <table className={`cat-spec${compact ? " is-compact" : ""}`}>
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <th scope="row">{k}</th>
            <td>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ================================================================== *
 * Feature plate — a full-width lift of one specimen.
 * ================================================================== */

function FeaturePlate({
  sp,
  live,
  qto,
  onRef,
  onHover,
}: {
  sp: PlatedSpecimen;
  live: boolean;
  qto: QtoRow | undefined;
  onRef: (slug: string, el: HTMLElement | null) => void;
  onHover: (slug: string | null) => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <motion.section
      data-slug={sp.slug}
      ref={(el: HTMLElement | null) => onRef(sp.slug, el)}
      className="cat-feature"
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
      onMouseEnter={() => {
        setHovered(true);
        onHover(sp.slug);
      }}
      onMouseLeave={() => {
        setHovered(false);
        onHover(null);
      }}
    >
      <div className="cat-feature-stage">
        {live ? (
          <Stage src={sp.glb} rotate={hovered} speed="14deg" />
        ) : (
          <PlatePlaceholder entity={sp.entity} />
        )}
        <span className="cat-plate-no cat-plate-no--big">
          PLATE {pad2(sp.plate)}
        </span>
      </div>
      <div className="cat-feature-body">
        <p className="cat-kicker">Feature specimen</p>
        <h3 className="cat-feature-title">{deCamel(sp.entity)}</h3>
        <p className="cat-feature-sub">{sp.type_name}</p>
        <SpecTable sp={sp} qto={qto} />
        <p className="cat-feature-note">
          One representative instance, meshed by ifcfast and shown at catalogue
          scale. The figures are measured off the geometry, not read from a
          property set.
        </p>
      </div>
    </motion.section>
  );
}

/* ================================================================== *
 * The specimen sequence — owns the shared live-pool observer.
 * ================================================================== */

type Block =
  | { kind: "grid"; items: PlatedSpecimen[] }
  | { kind: "feature"; item: PlatedSpecimen };

function buildBlocks(specimens: PlatedSpecimen[]): {
  blocks: Block[];
  featureSlugs: Set<string>;
} {
  const blocks: Block[] = [];
  const featureSlugs = new Set<string>();
  let chunk: PlatedSpecimen[] = [];
  specimens.forEach((sp, i) => {
    const isFeature = i > 0 && (i + 1) % FEATURE_EVERY === 0;
    if (isFeature) {
      if (chunk.length) {
        blocks.push({ kind: "grid", items: chunk });
        chunk = [];
      }
      blocks.push({ kind: "feature", item: sp });
      featureSlugs.add(sp.slug);
    } else {
      chunk.push(sp);
    }
  });
  if (chunk.length) blocks.push({ kind: "grid", items: chunk });
  return { blocks, featureSlugs };
}

function SpecimenSequence({
  specimens,
  qtoByEntity,
}: {
  specimens: PlatedSpecimen[];
  qtoByEntity: Map<string, QtoRow>;
}) {
  const { blocks, featureSlugs } = buildBlocks(specimens);

  const [live, setLive] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const ratios = useRef<Map<string, number>>(new Map());
  const nodes = useRef<Map<string, HTMLElement>>(new Map());
  const io = useRef<IntersectionObserver | null>(null);
  const raf = useRef<number | null>(null);
  const expandedRef = useRef<string | null>(null);
  const hoverRef = useRef<string | null>(null);
  expandedRef.current = expanded;
  hoverRef.current = hover;

  const recompute = useCallback(() => {
    const entries = [...ratios.current.entries()];
    // Features that are on screen at all keep their slot (no flicker when a
    // tall plate is only half in view).
    const next = new Set<string>();
    for (const [slug, r] of entries) {
      if (featureSlugs.has(slug) && r > 0.05) next.add(slug);
    }
    const rest = entries
      .filter(([slug, r]) => r > 0 && !featureSlugs.has(slug))
      .sort((a, b) => b[1] - a[1]);
    for (const [slug] of rest) {
      if (next.size >= POOL_CAP) break;
      next.add(slug);
    }
    if (expandedRef.current) next.add(expandedRef.current);
    if (hoverRef.current) next.add(hoverRef.current);
    setLive((prev) => (setsEqual(prev, next) ? prev : next));
  }, [featureSlugs]);

  useEffect(() => {
    io.current = new IntersectionObserver(
      (ents) => {
        for (const e of ents) {
          const slug = (e.target as HTMLElement).dataset.slug;
          if (!slug) continue;
          ratios.current.set(slug, e.isIntersecting ? e.intersectionRatio : 0);
        }
        if (raf.current) cancelAnimationFrame(raf.current);
        raf.current = requestAnimationFrame(recompute);
      },
      {
        threshold: [0, 0.15, 0.35, 0.6, 0.85, 1],
        rootMargin: "12% 0px 12% 0px",
      }
    );
    for (const el of nodes.current.values()) io.current.observe(el);
    return () => {
      io.current?.disconnect();
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [recompute]);

  // Recompute when the forced (hover / expanded) members change.
  useEffect(() => {
    recompute();
  }, [hover, expanded, recompute]);

  const onRef = useCallback((slug: string, el: HTMLElement | null) => {
    const prev = nodes.current.get(slug);
    if (prev && prev !== el) {
      io.current?.unobserve(prev);
      nodes.current.delete(slug);
      ratios.current.delete(slug);
    }
    if (el) {
      nodes.current.set(slug, el);
      io.current?.observe(el);
    }
  }, []);

  const onToggle = useCallback(
    (slug: string) => setExpanded((cur) => (cur === slug ? null : slug)),
    []
  );

  return (
    <section className="cat-section cat-specimens">
      <FolioBar folio="01" right="THE SPECIMENS" />
      <div className="cat-sec-head">
        <motion.h2
          className="cat-h2"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          Forty-one <em>specimens</em>
        </motion.h2>
        <motion.p
          className="cat-lead"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.9, delay: 0.15 }}
        >
          Every distinct type in the file, mounted as its own plate — a contact
          sheet of the parts that compose the building. Hover a plate to set it
          turning; click to open its measured record.
        </motion.p>
      </div>

      <div className="cat-blocks">
        {blocks.map((b, i) =>
          b.kind === "grid" ? (
            <div className="cat-grid" key={`g${i}`}>
              {b.items.map((sp) => (
                <SpecimenPlate
                  key={sp.slug}
                  sp={sp}
                  live={live.has(sp.slug)}
                  expanded={expanded === sp.slug}
                  qto={qtoByEntity.get(sp.entity)}
                  onRef={onRef}
                  onHover={setHover}
                  onToggle={onToggle}
                />
              ))}
            </div>
          ) : (
            <FeaturePlate
              key={b.item.slug}
              sp={b.item}
              live={live.has(b.item.slug)}
              qto={qtoByEntity.get(b.item.entity)}
              onRef={onRef}
              onHover={setHover}
            />
          )
        )}
      </div>
    </section>
  );
}

/* ================================================================== *
 * Index — the quantities as a printed table of contents.
 * ================================================================== */

function IndexSection({ rows }: { rows: QtoRow[] }) {
  const sorted = [...rows].sort((a, b) => b.count - a.count);
  const totals = sorted.reduce(
    (acc, r) => {
      acc.count += r.count;
      acc.area += r.area_m2 ?? 0;
      acc.vol += r.volume_m3 ?? 0;
      acc.tris += r.triangles;
      return acc;
    },
    { count: 0, area: 0, vol: 0, tris: 0 }
  );

  return (
    <section className="cat-section cat-index">
      <FolioBar folio="02" right="THE INDEX" />
      <div className="cat-sec-head">
        <motion.h2
          className="cat-h2"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          Index of <em>quantities</em>
        </motion.h2>
        <motion.p
          className="cat-lead"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.9, delay: 0.15 }}
        >
          Counts, surface area and volume for every entity class — measured off
          the mesh in the same read that drew the plates. Dashes mark classes
          ifcfast left un-meshed.
        </motion.p>
      </div>

      <div className="cat-index-head" aria-hidden>
        <span>Entity</span>
        <span className="cat-idx-cols">
          <span>Count</span>
          <span>Area · m²</span>
          <span>Volume · m³</span>
        </span>
      </div>

      <ol className="cat-idx-list">
        {sorted.map((r, i) => (
          <motion.li
            key={r.entity}
            className="cat-idx-row"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: "0px 0px -8% 0px" }}
            transition={{ duration: 0.5, delay: Math.min(i, 8) * 0.02 }}
          >
            <span className="cat-idx-no">{pad2(i + 1)}</span>
            <span className="cat-idx-name">{deCamel(r.entity)}</span>
            <span className="cat-idx-ent">{r.entity}</span>
            <span className="cat-idx-leader" />
            <span className="cat-idx-cols">
              <span className="cat-idx-n">{fmtInt(r.count)}</span>
              <span className="cat-idx-n">
                {r.area_m2 == null ? "—" : fmtDec(r.area_m2, 1)}
              </span>
              <span className="cat-idx-n">
                {r.volume_m3 == null ? "—" : fmtDec(r.volume_m3, 2)}
              </span>
            </span>
          </motion.li>
        ))}
        <li className="cat-idx-row cat-idx-total">
          <span className="cat-idx-no">Σ</span>
          <span className="cat-idx-name">All classes</span>
          <span className="cat-idx-ent">{fmtInt(totals.tris)} triangles</span>
          <span className="cat-idx-leader" />
          <span className="cat-idx-cols">
            <span className="cat-idx-n">{fmtInt(totals.count)}</span>
            <span className="cat-idx-n">{fmtDec(totals.area, 1)}</span>
            <span className="cat-idx-n">{fmtDec(totals.vol, 2)}</span>
          </span>
        </li>
      </ol>
    </section>
  );
}

/* ================================================================== *
 * Colophon — what set the catalogue.
 * ================================================================== */

function Colophon({
  summary,
  manifest,
}: {
  summary: Summary | null;
  manifest: Manifest | null;
}) {
  return (
    <footer className="cat-section cat-colophon">
      <FolioBar folio="03" right="COLOPHON" />
      <div className="cat-colophon-grid">
        <div>
          <motion.h2
            className="cat-h2"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            Set by <em>ifcfast</em>
          </motion.h2>
          <p className="cat-lead">
            This catalogue was composed from a single IFC file. Every plate,
            every measurement and the whole cover model were produced in one
            read by ifcfast — an open, Rust-core IFC toolkit with a Python API.
          </p>

          <div className="cat-install">
            <span className="cat-install-lbl">install</span>
            <code>pip install ifcfast</code>
          </div>

          <div className="cat-links">
            <a
              className="cat-link"
              href="https://github.com/EdvardGK/ifcfast"
              target="_blank"
              rel="noreferrer"
            >
              github.com/EdvardGK/ifcfast
              <ArrowUpRight size={15} strokeWidth={1.7} />
            </a>
            <a className="cat-link cat-link--back" href="/">
              <ArrowLeft size={15} strokeWidth={1.7} />
              Return to ifcfast.com
            </a>
          </div>
        </div>

        <dl className="cat-credits">
          <div>
            <dt>Subject</dt>
            <dd>{summary ? basename(summary.path) : "Duplex_A_20110907.ifc"}</dd>
          </div>
          <div>
            <dt>Schema</dt>
            <dd>{summary?.schema ?? "IFC2X3"}</dd>
          </div>
          <div>
            <dt>Authored in</dt>
            <dd>{summary?.authoring_app ?? "Autodesk Revit"}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>buildingSMART community sample · CC BY 4.0</dd>
          </div>
          <div>
            <dt>Read &amp; set with</dt>
            <dd>ifcfast {manifest?.generated_with ?? "0.4.42"}</dd>
          </div>
          <div>
            <dt>Typeset in</dt>
            <dd>Fraunces &amp; JetBrains Mono</dd>
          </div>
        </dl>
      </div>
      <div className="cat-end">— fin —</div>
    </footer>
  );
}

/* ================================================================== *
 * Page.
 * ================================================================== */

export default function CataloguePage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [qto, setQto] = useState<Qto | null>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    import("@google/model-viewer");
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch("/sample/duplex.summary.json").then((r) => r.json()),
      fetch("/sample/duplex.qto.json").then((r) => r.json()),
      fetch("/sample/types/manifest.json").then((r) => r.json()),
    ])
      .then(([s, q, m]: [Summary, Qto, Manifest]) => {
        if (!alive) return;
        setSummary(s);
        setQto(q);
        setManifest(m);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  const specimens: PlatedSpecimen[] = (manifest?.types ?? [])
    .filter((t) => t.bytes >= 1000 && t.entity !== "IfcOpeningElement")
    .map((t, i) => ({ ...t, plate: i + 1 }));

  const qtoByEntity = new Map<string, QtoRow>();
  for (const r of qto?.rows ?? []) qtoByEntity.set(r.entity, r);

  return (
    <main id="main" className="cat-root">
      <CatalogueStyles />

      <TitlePage summary={summary} manifest={manifest} glb="/sample/duplex.glb" />

      {failed && (
        <p className="cat-fallback">
          The file particulars could not be loaded. The catalogue reads its
          numbers live from the sample data.
        </p>
      )}

      {specimens.length > 0 && (
        <SpecimenSequence specimens={specimens} qtoByEntity={qtoByEntity} />
      )}

      {qto && <IndexSection rows={qto.rows} />}

      <Colophon summary={summary} manifest={manifest} />
    </main>
  );
}

/* ================================================================== *
 * Styles — the whole catalogue, namespaced under .cat-*.
 * Own tokens, own type ramp; nothing shared with the existing site.
 * ================================================================== */

function CatalogueStyles() {
  return (
    <style>{`
.cat-root {
  --paper: #f4f1e9;
  --plate: #ffffff;
  --ink: #191510;
  --ink-soft: #4a443b;
  --muted: #8b8377;
  --rule: #d9d3c6;
  --rule-soft: #e8e3d8;
  --accent: #bd5822;
  --serif: var(--font-serif), "Iowan Old Style", Georgia, serif;
  --mono: var(--font-mono), "JetBrains Mono", ui-monospace, monospace;
  --mx: clamp(1.25rem, 5.5vw, 8rem);

  background: var(--paper);
  color: var(--ink);
  font-family: var(--serif);
  font-optical-sizing: auto;
  -webkit-font-smoothing: antialiased;
  overflow-x: hidden;
  position: relative;
  z-index: 1;
}
.cat-root em { font-style: italic; }

.cat-section {
  padding: clamp(3.5rem, 8vw, 9rem) var(--mx);
  max-width: 2400px;
  margin: 0 auto;
}

/* ---- folio / running head ---- */
.cat-folio {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  font-family: var(--mono);
  font-size: clamp(9px, 0.72vw, 11px);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--muted);
  padding-bottom: 0.9rem;
  margin-bottom: clamp(2rem, 5vw, 4.5rem);
  border-bottom: 1px solid var(--ink);
}
.cat-folio-c { color: var(--rule); }
.cat-folio-r { color: var(--ink-soft); }
.cat-folio-n { margin-left: auto; color: var(--ink); }

/* ---- type ramp ---- */
.cat-kicker {
  font-family: var(--mono);
  font-size: clamp(10px, 0.8vw, 12px);
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--accent);
  margin-bottom: 1.4rem;
}
.cat-h1 {
  font-family: var(--serif);
  font-weight: 340;
  font-size: clamp(3.4rem, 13vw, 12rem);
  line-height: 0.88;
  letter-spacing: -0.035em;
  margin: 0;
}
.cat-h1 em {
  color: var(--accent);
  font-weight: 360;
}
.cat-h2 {
  font-family: var(--serif);
  font-weight: 350;
  font-size: clamp(2.2rem, 6vw, 5.5rem);
  line-height: 0.98;
  letter-spacing: -0.025em;
  margin: 0 0 1.4rem;
  max-width: 18ch;
}
.cat-h2 em { color: var(--accent); }
.cat-deck {
  font-family: var(--serif);
  font-size: clamp(1.15rem, 1.7vw, 1.7rem);
  line-height: 1.45;
  color: var(--ink-soft);
  margin: 2.2rem 0 0;
  max-width: 34ch;
}
.cat-lead {
  font-family: var(--serif);
  font-size: clamp(1.05rem, 1.35vw, 1.4rem);
  line-height: 1.5;
  color: var(--ink-soft);
  max-width: 52ch;
  margin: 0;
}
.cat-sec-head { margin-bottom: clamp(2.5rem, 5vw, 5rem); }

/* ---- title page ---- */
.cat-title-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: clamp(2.5rem, 5vw, 5rem);
  align-items: end;
}
.cat-title-lead { min-width: 0; }
.cat-colophon-mini { min-width: 0; }
.cat-mini-rule {
  height: 1px;
  background: var(--rule);
  margin-bottom: 1.5rem;
}
.cat-facts {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.85rem 2rem;
  margin: 0;
}
.cat-fact {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1rem;
  border-bottom: 1px dotted var(--rule);
  padding-bottom: 0.55rem;
}
.cat-fact dt {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
  white-space: nowrap;
}
.cat-fact dd {
  margin: 0;
  font-family: var(--serif);
  font-size: clamp(0.95rem, 1.1vw, 1.15rem);
  color: var(--ink);
  text-align: right;
  line-height: 1.25;
}

.cat-cover-figure {
  margin: clamp(3rem, 7vw, 7rem) 0 0;
}
.cat-cover-stage,
.cat-cover-figure {
  position: relative;
}
.cat-cover-stage {
  width: 100%;
  aspect-ratio: 16 / 10;
  background: #ffffff;
  border: 1px solid var(--rule-soft);
  overflow: hidden;
}
.cat-cover-cap {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-top: 1rem;
  font-family: var(--mono);
  font-size: clamp(9px, 0.78vw, 11px);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--muted);
}
.cat-cover-cap > span:first-child { color: var(--ink); }
.cat-cap-mid { color: var(--ink-soft); }
.cat-cap-turn {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--accent);
}

/* ---- placeholder / poster ---- */
.cat-stage-ph {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: ${STAGE_BG};
}
.cat-ph-glyph {
  font-family: var(--serif);
  font-weight: 340;
  font-size: clamp(2rem, 4vw, 3.5rem);
  color: var(--rule);
  letter-spacing: -0.02em;
}

/* ---- specimen grid ---- */
.cat-blocks {
  display: flex;
  flex-direction: column;
  gap: clamp(2.5rem, 5vw, 5rem);
}
.cat-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: clamp(1.5rem, 2.6vw, 3rem) clamp(1.25rem, 2.2vw, 2.75rem);
}
@media (min-width: 520px) {
  .cat-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (min-width: 920px) {
  .cat-grid { grid-template-columns: repeat(3, 1fr); }
}
@media (min-width: 1400px) {
  .cat-grid { grid-template-columns: repeat(4, 1fr); }
}
@media (min-width: 2200px) {
  .cat-grid { grid-template-columns: repeat(5, 1fr); }
}

.cat-plate { min-width: 0; display: flex; flex-direction: column; }
.cat-plate.is-expanded { grid-column: 1 / -1; }
.cat-plate-stage {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 1 / 1;
  border: 1px solid var(--rule-soft);
  background: #ffffff;
  overflow: hidden;
  cursor: pointer;
  padding: 0;
  transition: border-color 0.3s ease;
}
.cat-plate.is-expanded .cat-plate-stage { aspect-ratio: 16 / 9; }
.cat-plate-stage:hover { border-color: var(--ink); }
.cat-plate-stage:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.cat-plate-no {
  position: absolute;
  top: 0.6rem;
  left: 0.7rem;
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  color: var(--muted);
  background: rgba(255,255,255,0.7);
  padding: 0.15rem 0.4rem;
  backdrop-filter: blur(2px);
}
.cat-plate-no--big {
  font-size: clamp(11px, 1vw, 13px);
  top: 1rem; left: 1rem;
}
.cat-plate-cap {
  padding-top: 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.cat-plate-meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
}
.cat-plate-entity { color: var(--ink-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cat-plate-count { color: var(--accent); flex: none; }
.cat-plate-name {
  font-family: var(--serif);
  font-size: clamp(1rem, 1.15vw, 1.2rem);
  line-height: 1.2;
  color: var(--ink);
}
.cat-plate-detail { overflow: hidden; }

/* ---- spec table ---- */
.cat-spec {
  width: 100%;
  border-collapse: collapse;
  margin-top: 1.4rem;
}
.cat-spec.is-compact { margin-top: 1rem; max-width: 560px; }
.cat-spec th, .cat-spec td {
  text-align: left;
  padding: 0.6rem 0;
  border-bottom: 1px solid var(--rule);
  vertical-align: baseline;
}
.cat-spec th {
  font-family: var(--mono);
  font-weight: 400;
  font-size: 10px;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--muted);
  width: 42%;
}
.cat-spec td {
  font-family: var(--serif);
  font-size: clamp(0.95rem, 1.05vw, 1.15rem);
  color: var(--ink);
  text-align: right;
  font-variant-numeric: tabular-nums;
}

/* ---- feature plate ---- */
.cat-feature {
  display: grid;
  grid-template-columns: 1fr;
  gap: clamp(1.75rem, 3.5vw, 3.5rem);
  padding: clamp(1.75rem, 3vw, 3rem);
  background: var(--plate);
  border: 1px solid var(--rule);
  align-items: center;
}
@media (min-width: 900px) {
  .cat-feature { grid-template-columns: 1.15fr 1fr; }
}
.cat-feature-stage {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  background: #ffffff;
  border: 1px solid var(--rule-soft);
  overflow: hidden;
}
.cat-feature-body { min-width: 0; }
.cat-feature-title {
  font-family: var(--serif);
  font-weight: 350;
  font-size: clamp(2rem, 4vw, 3.5rem);
  line-height: 0.98;
  letter-spacing: -0.025em;
  margin: 0.6rem 0 0.4rem;
}
.cat-feature-sub {
  font-family: var(--serif);
  font-style: italic;
  font-size: clamp(1.05rem, 1.4vw, 1.4rem);
  color: var(--ink-soft);
  margin: 0;
}
.cat-feature-note {
  font-family: var(--serif);
  font-size: clamp(0.95rem, 1.05vw, 1.1rem);
  line-height: 1.5;
  color: var(--muted);
  margin: 1.6rem 0 0;
  max-width: 46ch;
}

/* ---- index ---- */
.cat-index-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding-bottom: 0.8rem;
  border-bottom: 1px solid var(--ink);
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
}
.cat-idx-cols {
  display: inline-flex;
  gap: clamp(1.25rem, 4vw, 4rem);
}
.cat-idx-cols > span {
  min-width: clamp(3.5rem, 7vw, 6.5rem);
  text-align: right;
}
.cat-idx-list { list-style: none; margin: 0; padding: 0; }
.cat-idx-row {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  padding: clamp(0.7rem, 1.2vw, 1.1rem) 0;
  border-bottom: 1px solid var(--rule-soft);
}
.cat-idx-no {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--muted);
  width: 2.2ch;
  flex: none;
}
.cat-idx-name {
  font-family: var(--serif);
  font-size: clamp(1.1rem, 1.6vw, 1.7rem);
  color: var(--ink);
  flex: none;
  letter-spacing: -0.01em;
}
.cat-idx-ent {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
  flex: none;
  align-self: center;
}
.cat-idx-leader {
  flex: 1 1 auto;
  align-self: stretch;
  border-bottom: 1px dotted var(--rule);
  transform: translateY(-0.32em);
  min-width: 1.5rem;
}
.cat-idx-row .cat-idx-cols { flex: none; }
.cat-idx-n {
  font-family: var(--mono);
  font-size: clamp(0.85rem, 1.05vw, 1.05rem);
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}
.cat-idx-total { border-bottom: none; border-top: 1px solid var(--ink); margin-top: 0.4rem; }
.cat-idx-total .cat-idx-name { font-style: italic; }
.cat-idx-total .cat-idx-n { color: var(--accent); }

@media (max-width: 620px) {
  .cat-idx-ent { display: none; }
  .cat-idx-name { font-size: 1.1rem; }
  .cat-idx-cols { gap: 1rem; }
  .cat-idx-cols > span { min-width: 3.2rem; }
  .cat-index-head span:last-child span:nth-child(2) { display: none; }
}

/* ---- colophon ---- */
.cat-colophon { border-top: 1px solid var(--ink); }
.cat-colophon-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: clamp(2.5rem, 5vw, 5rem);
}
@media (min-width: 900px) {
  .cat-colophon-grid { grid-template-columns: 1.4fr 1fr; }
}
.cat-install {
  display: inline-flex;
  align-items: center;
  gap: 0.9rem;
  margin: 2.2rem 0 2rem;
  border: 1px solid var(--ink);
  padding: 0.7rem 1.1rem;
}
.cat-install-lbl {
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--muted);
}
.cat-install code {
  font-family: var(--mono);
  font-size: clamp(0.95rem, 1.3vw, 1.2rem);
  color: var(--ink);
}
.cat-links { display: flex; flex-direction: column; gap: 0.9rem; align-items: flex-start; }
.cat-link {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-family: var(--mono);
  font-size: clamp(0.85rem, 1.05vw, 1rem);
  letter-spacing: 0.02em;
  color: var(--ink);
  text-decoration: none;
  border-bottom: 1px solid var(--rule);
  padding-bottom: 0.2rem;
  transition: border-color 0.25s ease, color 0.25s ease;
}
.cat-link:hover { color: var(--accent); border-color: var(--accent); }
.cat-link--back { color: var(--muted); }

.cat-credits {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0;
  margin: 0;
  align-self: start;
}
.cat-credits > div {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1rem;
  padding: 0.7rem 0;
  border-bottom: 1px dotted var(--rule);
}
.cat-credits dt {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--muted);
  flex: none;
}
.cat-credits dd {
  margin: 0;
  font-family: var(--serif);
  font-size: clamp(0.95rem, 1.05vw, 1.1rem);
  color: var(--ink);
  text-align: right;
  line-height: 1.3;
}
.cat-end {
  margin-top: clamp(3rem, 7vw, 6rem);
  text-align: center;
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: var(--muted);
}

.cat-fallback {
  padding: 0 var(--mx) 2rem;
  max-width: 60ch;
  font-family: var(--mono);
  font-size: 0.8rem;
  color: var(--accent);
}

/* wide title layout */
@media (min-width: 1000px) {
  .cat-title-grid { grid-template-columns: 1.6fr 1fr; }
  .cat-facts { grid-template-columns: 1fr; }
}
@media (min-width: 1600px) {
  .cat-facts { grid-template-columns: repeat(2, 1fr); }
}

@media (prefers-reduced-motion: reduce) {
  .cat-root * { animation: none !important; }
}
    `}</style>
  );
}
