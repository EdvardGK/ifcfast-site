"use client";

/**
 * Mockup Concept A — "The Scene"
 * A cinematic scroll-film. The whole page is one fixed 3D scene (the Duplex
 * model in a near-black product-shot atmosphere). Scrolling advances a 5-chapter
 * film; each chapter re-aims the model-viewer camera and reveals content that
 * scrolls over/beside the fixed scene. All figures are fetched from the real
 * /sample/*.json artifacts at runtime — nothing here is invented.
 *
 * Self-contained: imports no existing site components. The model-viewer JSX
 * declaration pattern is copied from components/viewer.tsx.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, useScroll, useSpring } from "framer-motion";
import { Code, ArrowLeft, Copy, Check } from "lucide-react";

/* ------------------------------------------------------------------ */
/* model-viewer custom-element JSX declaration (pattern from viewer.tsx) */
/* ------------------------------------------------------------------ */
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

/* ------------------------------------------------------------------ */
/* Data shapes (match the real artifacts)                              */
/* ------------------------------------------------------------------ */
type Summary = {
  schema: string;
  products: number;
  storeys: number;
  authoring_app: string;
  length_unit: string;
  type_counts_total: number;
  parse_seconds: number;
};
type QtoRow = {
  entity: string;
  count: number;
  volume_m3: number | null;
  area_m2: number | null;
};
type Qto = { rows: QtoRow[]; products: number };
type TypeEntry = {
  slug: string;
  type_name: string;
  entity: string;
  count: number;
  glb: string;
  bytes: number;
};
type Manifest = { types: TypeEntry[] };
type Storey = { guid: string; name: string; elevation: number };
type Graph = {
  storeys: Storey[];
  contained_in: { product_guid: string; storey_guid: string }[];
};

/* ------------------------------------------------------------------ */
/* Chapter camera choreography                                          */
/* camera-orbit = "theta phi radius", fov re-aims the fixed scene.      */
/* model-viewer interpolates smoothly when these attributes change.     */
/* ------------------------------------------------------------------ */
type Cam = { orbit: string; fov: string };
const CHAPTERS: { id: string; label: string; cam: Cam }[] = [
  { id: "01", label: "OPEN", cam: { orbit: "28deg 74deg 118%", fov: "31deg" } },
  { id: "02", label: "TYPES", cam: { orbit: "-42deg 76deg 102%", fov: "28deg" } },
  { id: "03", label: "COUNT", cam: { orbit: "14deg 60deg 92%", fov: "35deg" } },
  { id: "04", label: "TRACE", cam: { orbit: "2deg 20deg 138%", fov: "28deg" } },
  { id: "05", label: "WRITE", cam: { orbit: "48deg 70deg 108%", fov: "28deg" } },
];

const ACCENT = "#ff8f3a";

/* deterministic seeded RNG so the constellation is stable */
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fmt = (n: number, d = 0) =>
  n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

/* ================================================================== */
/* Page                                                                */
/* ================================================================== */
export default function SceneMockup() {
  const mvRef = useRef<HTMLElement | null>(null);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(0);

  const [summary, setSummary] = useState<Summary | null>(null);
  const [qto, setQto] = useState<Qto | null>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [graph, setGraph] = useState<Graph | null>(null);

  // load model-viewer custom element once
  useEffect(() => {
    import("@google/model-viewer").then(() => setReady(true));
  }, []);

  // fetch all real artifacts
  useEffect(() => {
    const j = <T,>(u: string) => fetch(u).then((r) => r.json() as Promise<T>);
    j<Summary>("/sample/duplex.summary.json").then(setSummary).catch(() => {});
    j<Qto>("/sample/duplex.qto.json").then(setQto).catch(() => {});
    j<Manifest>("/sample/types/manifest.json").then(setManifest).catch(() => {});
    j<Graph>("/sample/duplex.graph.json").then(setGraph).catch(() => {});
  }, []);

  // re-aim the fixed camera when the active chapter changes
  useEffect(() => {
    const mv = mvRef.current;
    if (!mv || !ready) return;
    const cam = CHAPTERS[active].cam;
    mv.setAttribute("camera-orbit", cam.orbit);
    mv.setAttribute("field-of-view", cam.fov);
  }, [active, ready]);

  // chapter detection — section crossing viewport centre becomes active
  const registerSection = useCallback(
    (el: HTMLElement | null, index: number) => {
      if (!el) return;
      el.dataset.chapterIndex = String(index);
    },
    []
  );

  useEffect(() => {
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>("[data-chapter-index]")
    );
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const i = Number((e.target as HTMLElement).dataset.chapterIndex);
            setActive(i);
          }
        }
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  // scroll-progress spine
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.4 });

  // derived, real numbers
  const totalVol = qto ? qto.rows.reduce((s, r) => s + (r.volume_m3 ?? 0), 0) : 0;
  const totalArea = qto ? qto.rows.reduce((s, r) => s + (r.area_m2 ?? 0), 0) : 0;
  const parseMs = summary ? summary.parse_seconds * 1000 : 0;

  // curated specimen set for chapter 02 — real glbs, one representative per
  // entity (highest count), skipping degenerate/opening geometry per brief.
  const specimens: TypeEntry[] = (() => {
    if (!manifest) return [];
    const valid = manifest.types.filter(
      (t) => t.bytes >= 1000 && t.entity !== "IfcOpeningElement"
    );
    const best = new Map<string, TypeEntry>();
    for (const t of valid) {
      const cur = best.get(t.entity);
      if (!cur || t.count > cur.count) best.set(t.entity, t);
    }
    return Array.from(best.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  })();

  return (
    <>
      <style>{CSS}</style>

      {/* ---------- fixed 3D scene ---------- */}
      <motion.div
        className="scene-stage"
        initial={{ opacity: 0 }}
        animate={{ opacity: ready ? 1 : 0 }}
        transition={{ duration: 1.6, ease: "easeOut" }}
      >
        {ready && (
          /* @ts-expect-error — model-viewer is a custom element */
          <model-viewer
            ref={mvRef as React.MutableRefObject<HTMLElement | null>}
            src="/sample/duplex.glb"
            alt="The Duplex sample building, parsed by ifcfast"
            camera-controls
            disable-pan
            interaction-prompt="none"
            environment-image="neutral"
            exposure="0.92"
            shadow-intensity="1.1"
            shadow-softness="1"
            tone-mapping="commerce"
            camera-orbit={CHAPTERS[0].cam.orbit}
            field-of-view={CHAPTERS[0].cam.fov}
            min-camera-orbit="auto auto 55%"
            max-camera-orbit="auto auto 300%"
            style={{
              width: "100%",
              height: "100%",
              background:
                "radial-gradient(ellipse 120% 90% at 50% 38%, #191c22 0%, #0c0e12 52%, #060708 100%)",
              "--poster-color": "transparent",
            } as React.CSSProperties}
          />
        )}
        <div className="scene-vignette" />
        <div className="scene-grain" />
      </motion.div>

      {/* ---------- fixed HUD: chapter rail + brand ---------- */}
      <div className="hud-brand">
        <span className="hud-mark">ifcfast</span>
        <span className="hud-sub">the scene · duplex</span>
      </div>

      <nav className="chapter-rail" aria-label="chapters">
        <div className="rail-spine">
          <motion.div className="rail-fill" style={{ scaleY: progress }} />
        </div>
        <ul>
          {CHAPTERS.map((c, i) => (
            <li key={c.id} className={i === active ? "on" : ""}>
              <span className="r-num">{c.id}</span>
              <span className="r-label">{c.label}</span>
            </li>
          ))}
        </ul>
      </nav>

      {/* live parse badge, bottom-left */}
      <div className="hud-badge">
        {summary ? (
          <>
            <span className="dot" />
            {summary.schema} · {fmt(summary.products)} products ·{" "}
            {parseMs < 100 ? parseMs.toFixed(0) : fmt(parseMs)} ms
          </>
        ) : (
          <>
            <span className="dot pulse" /> parsing…
          </>
        )}
      </div>

      {/* ================= FILM ================= */}
      <main className="film" id="main">
        {/* 01 — OPEN */}
        <section
          className="chapter ch-open"
          ref={(el) => registerSection(el, 0)}
        >
          <div className="c-inner open-inner">
            <Reveal show={active === 0}>
              <p className="kicker">01 / OPEN</p>
              <h1 className="headline">
                A real building,
                <br />
                read in a blink.
              </h1>
              <p className="lede">
                This is the Duplex reference model — every wall, slab and window
                you can orbit is being drawn from geometry ifcfast parsed
                straight out of the IFC. No conversion step. No viewer server.
              </p>
              {summary && (
                <p className="factline">
                  <b>{summary.schema}</b> · {fmt(summary.products)} products ·{" "}
                  {summary.storeys} storeys · {summary.type_counts_total} classes
                  · parsed in{" "}
                  <b>{parseMs < 100 ? parseMs.toFixed(0) : fmt(parseMs)} ms</b>{" "}
                  from {summary.authoring_app}
                </p>
              )}
              <p className="scrollcue">scroll to run the film ↓</p>
            </Reveal>
          </div>
        </section>

        {/* 02 — TYPES */}
        <section className="chapter" ref={(el) => registerSection(el, 1)}>
          <div className="c-inner">
            <Reveal show={active === 1}>
              <div className="types-head">
                <p className="kicker">02 / TYPES</p>
                <h2 className="h2">The type catalogue, live.</h2>
                <p className="lede">
                  ifcfast resolves every product back to its authored type. Here
                  are real specimen meshes — one per class — extracted from the
                  same file, each its own tessellated glTF.
                </p>
              </div>
              <div className="type-strip">
                {specimens.map((t, i) => (
                  <TypeMini key={t.slug} entry={t} ready={ready} delay={i * 0.08} />
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* 03 — COUNT */}
        <section className="chapter ch-count" ref={(el) => registerSection(el, 2)}>
          <div className="c-inner">
            <Reveal show={active === 2}>
              <p className="kicker">03 / COUNT</p>
              <h2 className="h2">Quantities fall out of the mesh.</h2>
              <div className="numgrid">
                <Numeral value={qto ? fmt(qto.products) : "—"} unit="products" note="parsed elements" />
                <Numeral value={qto ? fmt(totalArea) : "—"} unit="m²" note="surface area, all classes" />
                <Numeral value={qto ? fmt(totalVol) : "—"} unit="m³" note="modeled volume, all classes" />
              </div>
              <p className="factline">
                Every figure above is summed from{" "}
                <code>duplex.qto.json</code> — {qto ? qto.rows.length : "—"} entity
                classes, computed from tessellated geometry, not read from a
                property set.
              </p>
            </Reveal>
          </div>
        </section>

        {/* 04 — TRACE */}
        <section className="chapter ch-trace" ref={(el) => registerSection(el, 3)}>
          <div className="c-inner trace-inner">
            <Reveal show={active === 3}>
              <div className="trace-copy">
                <p className="kicker">04 / TRACE</p>
                <h2 className="h2">The spatial structure is a graph.</h2>
                <p className="lede">
                  Storeys, containment, aggregation — ifcfast keeps the whole
                  hierarchy. This constellation is the Duplex&apos;s real storey
                  stack, each node a product contained on that level.
                </p>
              </div>
              <Constellation graph={graph} />
            </Reveal>
          </div>
        </section>

        {/* 05 — WRITE */}
        <section className="chapter ch-write" ref={(el) => registerSection(el, 4)}>
          <div className="c-inner">
            <Reveal show={active === 4}>
              <p className="kicker">05 / WRITE</p>
              <h2 className="h2">And it writes back.</h2>
              <p className="lede">
                Not just read. ifcfast performs surgical edits — subset, hotswap
                geometry, mutate attributes — and emits valid IFC on the other
                side.
              </p>
              <Terminal show={active === 4} />
              <div className="cta">
                <CopyPip />
                <div className="cta-links">
                  <a
                    className="btn primary"
                    href="https://github.com/EdvardGK/ifcfast"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Code size={16} /> GitHub
                  </a>
                  <a className="btn ghost" href="/">
                    <ArrowLeft size={16} /> back to ifcfast.com
                  </a>
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      </main>
    </>
  );
}

/* ================================================================== */
/* Reveal — content entrance tied to its chapter being active          */
/* ================================================================== */
function Reveal({ show, children }: { show: boolean; children: React.ReactNode }) {
  return (
    <motion.div
      initial={false}
      animate={{ opacity: show ? 1 : 0.12, y: show ? 0 : 26, filter: show ? "blur(0px)" : "blur(3px)" }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/* ================================================================== */
/* Numeral — huge display figure                                       */
/* ================================================================== */
function Numeral({ value, unit, note }: { value: string; unit: string; note: string }) {
  return (
    <div className="numeral">
      <div className="num-row">
        <span className="num-val">{value}</span>
        <span className="num-unit">{unit}</span>
      </div>
      <span className="num-note">{note}</span>
    </div>
  );
}

/* ================================================================== */
/* TypeMini — orbiting specimen mesh                                   */
/* ================================================================== */
function TypeMini({ entry, ready, delay }: { entry: TypeEntry; ready: boolean; delay: number }) {
  return (
    <motion.figure
      className="mini"
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10%" }}
      transition={{ duration: 0.6, delay, ease: "easeOut" }}
    >
      <div className="mini-view">
        {ready && (
          /* @ts-expect-error — model-viewer custom element */
          <model-viewer
            src={entry.glb}
            alt={entry.type_name}
            camera-controls
            disable-zoom
            disable-pan
            auto-rotate
            auto-rotate-delay="0"
            rotation-per-second="26deg"
            interaction-prompt="none"
            exposure="1.0"
            shadow-intensity="0.45"
            tone-mapping="commerce"
            environment-image="neutral"
            camera-orbit="35deg 72deg 105%"
            field-of-view="24deg"
            style={{ width: "100%", height: "100%", background: "transparent" }}
          />
        )}
      </div>
      <figcaption>
        <span className="mini-ent">{entry.entity.replace("Ifc", "")}</span>
        <span className="mini-name">{entry.type_name}</span>
        <span className="mini-count">×{entry.count}</span>
      </figcaption>
    </motion.figure>
  );
}

/* ================================================================== */
/* Constellation — custom SVG storey-stack (chapter 04)                */
/* ================================================================== */
function Constellation({ graph }: { graph: Graph | null }) {
  if (!graph) return <div className="constellation skel" />;

  const counts = new Map<string, number>();
  for (const c of graph.contained_in) {
    counts.set(c.storey_guid, (counts.get(c.storey_guid) ?? 0) + 1);
  }
  // top → bottom by elevation
  const storeys = [...graph.storeys].sort((a, b) => b.elevation - a.elevation);

  const W = 680;
  const H = 460;
  const padL = 150;
  const padR = 40;
  const top = 40;
  const bottom = H - 40;
  const rowGap = storeys.length > 1 ? (bottom - top) / (storeys.length - 1) : 0;
  const rand = mulberry32(20110907);

  return (
    <svg
      className="constellation"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Storey containment constellation"
    >
      {/* vertical spine */}
      <line x1={padL} y1={top} x2={padL} y2={bottom} stroke="rgba(255,143,58,0.28)" strokeWidth={1} />
      {storeys.map((s, i) => {
        const y = top + rowGap * i;
        const n = counts.get(s.guid) ?? 0;
        const dots = Array.from({ length: n }, (_, k) => {
          const t = n > 1 ? k / (n - 1) : 0.5;
          const x = padL + 46 + t * (W - padL - padR - 60);
          const jitter = (rand() - 0.5) * 34;
          return { x, y: y + jitter, r: 1.6 + rand() * 1.8 };
        });
        return (
          <g key={s.guid}>
            {/* hairlines from storey node to each dot */}
            {dots.map((d, k) => (
              <line
                key={k}
                x1={padL}
                y1={y}
                x2={d.x}
                y2={d.y}
                stroke="rgba(220,224,232,0.08)"
                strokeWidth={0.6}
              />
            ))}
            {dots.map((d, k) => (
              <circle key={`c${k}`} cx={d.x} cy={d.y} r={d.r} fill="rgba(224,230,240,0.72)" />
            ))}
            {/* storey node */}
            <circle cx={padL} cy={y} r={5} fill={ACCENT} />
            <circle cx={padL} cy={y} r={10} fill="none" stroke={ACCENT} strokeOpacity={0.4} strokeWidth={1} />
            <text x={padL - 16} y={y - 6} textAnchor="end" className="cst-name">
              {s.name}
            </text>
            <text x={padL - 16} y={y + 12} textAnchor="end" className="cst-meta">
              {s.elevation.toFixed(2)} m · {n} contained
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ================================================================== */
/* Terminal — write-back story lines materializing (chapter 05)        */
/* ================================================================== */
const TERM_LINES: { p: string; c: string }[] = [
  { p: "$", c: "python" },
  { p: ">>>", c: "import ifcfast" },
  { p: ">>>", c: 'm = ifcfast.Model("duplex.ifc")   # IFC2X3, 289 products' },
  { p: ">>>", c: "sub = m.subset(guids)              # surgical extract, styles kept" },
  { p: ">>>", c: "m.hotswap(guid, verts, tris)       # repoint Body geometry" },
  { p: ">>>", c: "m.mutate(ops)                      # batch attribute edits, atomic" },
  { p: ">>>", c: 'sub.save("out.ifc")                # valid IFC back out' },
];

function Terminal({ show }: { show: boolean }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!show) {
      setN(0);
      return;
    }
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setN(i);
      if (i >= TERM_LINES.length) clearInterval(id);
    }, 340);
    return () => clearInterval(id);
  }, [show]);

  return (
    <div className="terminal" role="img" aria-label="ifcfast write-back session">
      <div className="term-bar">
        <span /><span /><span />
        <em>ifcfast — write axis</em>
      </div>
      <pre className="term-body">
        {TERM_LINES.slice(0, n).map((l, i) => (
          <div key={i} className="term-line">
            <span className="term-prompt">{l.p}</span>
            <span className="term-code">{l.c}</span>
          </div>
        ))}
        {n < TERM_LINES.length && <span className="term-caret">▍</span>}
      </pre>
    </div>
  );
}

/* ================================================================== */
/* CopyPip — the pip install line with copy button                     */
/* ================================================================== */
function CopyPip() {
  const [copied, setCopied] = useState(false);
  const cmd = "pip install ifcfast";
  return (
    <button
      className="pip"
      onClick={() => {
        navigator.clipboard?.writeText(cmd).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        });
      }}
    >
      <span className="pip-prompt">$</span>
      <span className="pip-cmd">{cmd}</span>
      <span className="pip-icon">{copied ? <Check size={15} /> : <Copy size={15} />}</span>
    </button>
  );
}

/* ================================================================== */
/* Styles — scoped by class, tuned with clamp() for 1440 → 2560 → mobile */
/* ================================================================== */
const CSS = `
:root { --amber: ${ACCENT}; }

.scene-stage {
  position: fixed; inset: 0; z-index: 0;
  background: #060708;
}
.scene-stage model-viewer { display:block; }
.scene-vignette {
  position: fixed; inset: 0; z-index: 1; pointer-events: none;
  box-shadow: inset 0 0 clamp(120px,18vw,340px) clamp(40px,8vw,160px) rgba(0,0,0,0.72);
  background:
    radial-gradient(ellipse 80% 60% at 50% 42%, transparent 40%, rgba(0,0,0,0.28) 100%);
}
.scene-grain {
  position: fixed; inset: 0; z-index: 1; pointer-events: none; opacity: 0.05;
  mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}

/* --- fixed HUD --- */
.hud-brand {
  position: fixed; top: clamp(18px,2.4vw,34px); left: clamp(18px,2.6vw,42px);
  z-index: 30; display: flex; flex-direction: column; gap: 2px;
  color: #f2efe9;
}
.hud-mark {
  font-family: var(--font-mono); font-weight: 700; letter-spacing: -0.03em;
  font-size: clamp(15px,1.3vw,19px);
}
.hud-sub {
  font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.28em;
  text-transform: uppercase; color: #7d7b76;
}

.chapter-rail {
  position: fixed; top: 50%; right: clamp(16px,2.4vw,40px); transform: translateY(-50%);
  z-index: 30; display: flex; gap: 14px; align-items: stretch;
}
.chapter-rail .rail-spine {
  width: 2px; background: rgba(255,255,255,0.1); border-radius: 2px;
  position: relative; overflow: hidden;
}
.chapter-rail .rail-fill {
  position: absolute; inset: 0; transform-origin: top;
  background: linear-gradient(var(--amber), #ffb877);
  box-shadow: 0 0 14px 1px rgba(255,143,58,0.6);
}
.chapter-rail ul {
  display: flex; flex-direction: column; justify-content: space-between;
  list-style: none; margin: 0; padding: 4px 0;
}
.chapter-rail li {
  display: flex; align-items: baseline; gap: 8px;
  font-family: var(--font-mono); opacity: 0.42;
  transition: opacity 0.4s ease, transform 0.4s ease;
}
.chapter-rail li.on { opacity: 1; transform: translateX(-4px); }
.chapter-rail li .r-num {
  font-size: 11px; color: #c9c6c0; letter-spacing: 0.1em;
}
.chapter-rail li.on .r-num { color: var(--amber); text-shadow: 0 0 12px rgba(255,143,58,0.7); }
.chapter-rail li .r-label {
  font-size: 10px; letter-spacing: 0.24em; text-transform: uppercase; color: #8b8983;
}
.chapter-rail li.on .r-label { color: #f2efe9; }

.hud-badge {
  position: fixed; bottom: clamp(16px,2.2vw,30px); left: clamp(18px,2.6vw,42px);
  z-index: 30; display: flex; align-items: center; gap: 8px;
  font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.04em;
  color: #b9b6b0;
  background: rgba(10,11,13,0.55); backdrop-filter: blur(6px);
  border: 1px solid rgba(255,255,255,0.08); border-radius: 999px;
  padding: 7px 14px;
}
.hud-badge .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--amber);
  box-shadow: 0 0 10px 1px rgba(255,143,58,0.8); }
.hud-badge .dot.pulse { animation: pulse 1.2s ease-in-out infinite; }
@keyframes pulse { 0%,100%{opacity:0.35} 50%{opacity:1} }

/* --- film + chapters --- */
.film { position: relative; z-index: 10; }
.chapter {
  min-height: 100svh; display: flex; align-items: center;
  padding-block: clamp(80px,12vh,160px);
  padding-inline: clamp(20px, 8vw, 200px);
}
.chapter:first-child { min-height: 100svh; }
.c-inner { width: min(100%, 1180px); margin-inline: auto; }

/* text system */
.kicker {
  font-family: var(--font-mono); font-size: clamp(11px,0.85vw,13px);
  letter-spacing: 0.42em; text-transform: uppercase;
  color: var(--amber); margin-bottom: clamp(16px,2vw,26px);
  text-shadow: 0 0 18px rgba(255,143,58,0.35);
}
.headline {
  font-family: var(--font-sans); font-weight: 600;
  font-size: clamp(2.6rem, 6.4vw, 6.4rem); line-height: 0.98;
  letter-spacing: -0.035em; color: #f6f3ee;
  text-shadow: 0 2px 40px rgba(0,0,0,0.6);
  margin: 0 0 clamp(20px,2.4vw,34px);
}
.h2 {
  font-family: var(--font-sans); font-weight: 600;
  font-size: clamp(1.8rem, 3.8vw, 3.6rem); line-height: 1.02;
  letter-spacing: -0.03em; color: #f4f1ec;
  margin: 0 0 clamp(16px,2vw,28px); text-shadow: 0 2px 30px rgba(0,0,0,0.55);
}
.lede {
  font-family: var(--font-sans); font-size: clamp(1rem,1.25vw,1.32rem);
  line-height: 1.55; color: #c7c3bc; max-width: 60ch;
  margin: 0 0 clamp(18px,2vw,28px);
}
.factline {
  font-family: var(--font-mono); font-size: clamp(11px,0.9vw,13.5px);
  line-height: 1.7; color: #9a978f; max-width: 72ch;
}
.factline b { color: #f2efe9; font-weight: 600; }
.factline code { color: var(--amber); }
.scrollcue {
  margin-top: clamp(24px,4vw,52px);
  font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.28em;
  text-transform: uppercase; color: #6f6d68;
  animation: drift 2.4s ease-in-out infinite;
}
@keyframes drift { 0%,100%{transform:translateY(0);opacity:0.6} 50%{transform:translateY(5px);opacity:1} }

.open-inner { max-width: 1180px; }

/* --- 02 types --- */
.types-head { max-width: 62ch; margin-bottom: clamp(28px,4vw,52px); }
.type-strip {
  display: grid; gap: clamp(14px,1.6vw,26px);
  grid-template-columns: repeat(6, minmax(0,1fr));
}
.mini {
  margin: 0; display: flex; flex-direction: column; gap: 10px;
  padding: 10px; border-radius: 14px;
  background: rgba(16,18,22,0.42); backdrop-filter: blur(8px);
  border: 1px solid rgba(255,255,255,0.07);
  transition: border-color 0.3s ease, transform 0.3s ease;
}
.mini:hover { border-color: rgba(255,143,58,0.45); transform: translateY(-4px); }
.mini-view {
  aspect-ratio: 1 / 1; border-radius: 9px; overflow: hidden;
  background:
    radial-gradient(ellipse 90% 90% at 50% 30%, #1c2027 0%, #0b0d10 80%);
}
.mini figcaption { display: flex; flex-direction: column; gap: 2px; padding: 0 2px 2px; }
.mini-ent { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--amber); }
.mini-name { font-family: var(--font-sans); font-size: clamp(11px,0.8vw,13px);
  color: #d6d2cb; line-height: 1.2;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mini-count { font-family: var(--font-mono); font-size: 10px; color: #82807a; }

/* --- 03 count --- */
.numgrid {
  display: grid; grid-template-columns: repeat(3, minmax(0,1fr));
  gap: clamp(20px,3vw,64px); margin: clamp(20px,3vw,48px) 0 clamp(22px,3vw,40px);
}
.numeral { display: flex; flex-direction: column; gap: 8px; }
.num-row { display: flex; align-items: baseline; gap: 8px; }
.num-val {
  font-family: var(--font-mono); font-weight: 700;
  font-size: clamp(2.8rem, 7vw, 7.2rem); line-height: 0.9;
  letter-spacing: -0.05em; color: #f6f3ee;
  text-shadow: 0 0 44px rgba(255,143,58,0.22);
}
.num-unit {
  font-family: var(--font-mono); font-size: clamp(0.95rem,1.4vw,1.5rem);
  color: var(--amber); font-weight: 600;
}
.num-note {
  font-family: var(--font-mono); font-size: clamp(10px,0.8vw,12px);
  letter-spacing: 0.14em; text-transform: uppercase; color: #86847e;
}

/* --- 04 trace --- */
.trace-inner {
  display: grid; grid-template-columns: minmax(0,0.85fr) minmax(0,1.15fr);
  gap: clamp(24px,4vw,72px); align-items: center;
}
.trace-copy { max-width: 46ch; }
.constellation { width: 100%; height: auto; }
.constellation.skel { aspect-ratio: 680/460; opacity: 0.2;
  background: repeating-linear-gradient(90deg,transparent,transparent 20px,rgba(255,255,255,0.04) 21px); }
.cst-name { font-family: var(--font-mono); font-size: 12px; fill: #eae7e0; letter-spacing: 0.02em; }
.cst-meta { font-family: var(--font-mono); font-size: 9.5px; fill: #85837d; letter-spacing: 0.06em; }

/* --- 05 write --- */
.terminal {
  margin: clamp(20px,3vw,36px) 0; max-width: 820px;
  border-radius: 12px; overflow: hidden;
  border: 1px solid rgba(255,255,255,0.09);
  background: rgba(9,10,12,0.82); backdrop-filter: blur(10px);
  box-shadow: 0 30px 80px -30px rgba(0,0,0,0.9);
}
.term-bar {
  display: flex; align-items: center; gap: 6px;
  padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.07);
  background: rgba(255,255,255,0.02);
}
.term-bar span { width: 10px; height: 10px; border-radius: 50%; background: #33353a; }
.term-bar span:first-child { background: #e0603f; }
.term-bar em {
  margin-left: auto; font-family: var(--font-mono); font-style: normal;
  font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: #6f6d68;
}
.term-body {
  margin: 0; padding: clamp(16px,2vw,24px);
  font-family: var(--font-mono); font-size: clamp(11.5px,1vw,14px); line-height: 1.85;
  color: #d4d1ca; overflow-x: auto;
}
.term-line { display: flex; gap: 12px; white-space: pre; }
.term-prompt { color: var(--amber); flex-shrink: 0; }
.term-code { color: #d9d6cf; }
.term-caret { color: var(--amber); animation: blink 1s steps(2,start) infinite; }
@keyframes blink { to { opacity: 0; } }

.cta { display: flex; flex-wrap: wrap; align-items: center; gap: clamp(14px,2vw,28px); }
.pip {
  display: inline-flex; align-items: center; gap: 12px; cursor: pointer;
  font-family: var(--font-mono); font-size: clamp(13px,1.1vw,16px);
  padding: 14px 20px; border-radius: 11px;
  background: rgba(255,143,58,0.1); border: 1px solid rgba(255,143,58,0.45);
  color: #f6f3ee; transition: background 0.25s ease, box-shadow 0.25s ease;
}
.pip:hover { background: rgba(255,143,58,0.18); box-shadow: 0 0 26px -4px rgba(255,143,58,0.55); }
.pip-prompt { color: var(--amber); }
.pip-icon { color: var(--amber); display: inline-flex; }
.cta-links { display: flex; gap: 12px; flex-wrap: wrap; }
.btn {
  display: inline-flex; align-items: center; gap: 8px;
  font-family: var(--font-mono); font-size: 13px; letter-spacing: 0.02em;
  padding: 13px 18px; border-radius: 11px; text-decoration: none;
  transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
}
.btn.primary { background: #f2efe9; color: #0c0e12; border: 1px solid #f2efe9; }
.btn.primary:hover { transform: translateY(-2px); }
.btn.ghost { color: #cbc8c1; border: 1px solid rgba(255,255,255,0.16); }
.btn.ghost:hover { border-color: rgba(255,255,255,0.4); color: #f2efe9; }

/* ============ responsive ============ */
@media (max-width: 1100px) {
  .type-strip { grid-template-columns: repeat(3, minmax(0,1fr)); }
  .trace-inner { grid-template-columns: 1fr; }
  .numgrid { gap: clamp(18px,4vw,40px); }
}
@media (max-width: 720px) {
  .chapter { padding-inline: 20px; padding-block: 88px; }
  .chapter-rail { top: auto; bottom: 64px; right: 16px; transform: none; }
  .chapter-rail .rail-spine { display: none; }
  .chapter-rail ul { flex-direction: row; gap: 6px; }
  .chapter-rail li .r-label { display: none; }
  .chapter-rail li { border: 1px solid rgba(255,255,255,0.14); border-radius: 6px; padding: 4px 7px; }
  .chapter-rail li.on { transform: none; border-color: var(--amber); }
  .type-strip { grid-template-columns: repeat(2, minmax(0,1fr)); }
  .numgrid { grid-template-columns: 1fr; }
  .hud-sub { display: none; }
  .num-val { font-size: clamp(2.6rem, 15vw, 4rem); }
}
@media (min-width: 2000px) {
  .c-inner { width: min(100%, 1520px); }
  .type-strip { gap: 30px; }
}
`;
