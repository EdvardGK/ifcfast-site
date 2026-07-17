"use client";

/**
 * Mockup Concept A+B — "The Scene, booting The Instrument"
 * ------------------------------------------------------------------
 * A combined experience merging the two approved mockups:
 *   • Concept A ("The Scene") — a dark cinematic scroll-film hosts the page.
 *     Chapters 01 OPEN → 02 TYPES → 03 COUNT → 04 TRACE → 05 WRITE play over a
 *     custom three.js scene (FilmScene) that choreographs the Duplex model:
 *     it assembles from a real point cloud, explodes into hard component
 *     groups by entity class, splits into storey slabs, dissolves back into
 *     the point cloud regrouped into storey bands, and reassembles — the
 *     product story (per-class subsets, storey splits, m.point_cloud()) told
 *     as motion, sat modestly off-centre behind the text.
 *   • Concept B ("The Instrument") — a graphite terminal panel becomes the final
 *     chapter 06 COMMAND you scroll into. The film's last cut "boots" it.
 *
 * One background family (near-black → graphite) and ONE accent (amber #ff8f3a)
 * unify both halves. When chapter 06 becomes active, the film's three.js loop
 * pauses so the instrument's own model-viewer is the only live 3D; scrolling
 * back up resumes it. B's boot veil fires the first time chapter 06 enters the
 * viewport. The instrument cross-filters its viewport: clicking a storey /
 * entity bar / type register row highlights the matching product primitives in
 * the GLB (materials are named by product GUID) and ghosts the rest.
 *
 * Assets (all real, all ifcfast-generated):
 *   /sample/duplex.glb          — per-product nodes with extras.guid / .entity
 *   /sample/duplex.graph.json   — guid → entity, storey_guid
 *   /sample/duplex.points.bin   — m.point_cloud(per_m2=10), 51,093 points
 *   /sample/duplex.points.json  — entities[], storeys[], center_world, …
 *
 * Self-contained: imports no existing site components; adapts code from both
 * mockup sources. The model-viewer JSX declaration is copied verbatim from
 * components/viewer.tsx (the namespace merges project-wide).
 */

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { motion, useScroll, useSpring } from "framer-motion";
import { Code, ArrowLeft, Copy, Check } from "lucide-react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/* ------------------------------------------------------------------ */
/* model-viewer custom-element JSX declaration (from components/viewer.tsx) */
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

/* ------------------------------------------------------------------ */
/* Data shapes (match the real /sample/*.json artifacts)              */
/* ------------------------------------------------------------------ */
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
type Qto = { rows: QtoRow[]; products: number };
type Product = {
  guid: string;
  entity: string;
  storey_guid: string | null;
  type_name: string | null;
  m3: number | null;
  m2: number | null;
  materials: string[] | null;
};
type Storey = { guid: string; name: string; elevation: number };
type Graph = {
  products: Product[];
  storeys: Storey[];
  contained_in: { product_guid: string; storey_guid: string }[];
};
type MType = {
  slug: string;
  type_name: string;
  entity: string;
  count: number;
  glb: string;
  bytes: number;
};
type Manifest = { generated_with: string; types: MType[] };

/* product-guid → meta lookup value used by the viewport cross-filter */
type Meta = { entity: string; storey_guid: string | null; type_name: string | null };
/* viewport highlight descriptor derived from instrument state */
type Highlight =
  | { mode: "storey"; value: string }
  | { mode: "entity"; value: string; storeyScope?: string }
  | { mode: "type"; value: string; storeyScope?: string }
  | null;

/* ------------------------------------------------------------------ */
/* Chapter rail (labels only — the film's camera choreography now lives */
/* in FilmScene as lerped three.js camera targets).                     */
/* ------------------------------------------------------------------ */
const CHAPTERS: { id: string; label: string }[] = [
  { id: "01", label: "OPEN" },
  { id: "02", label: "TYPES" },
  { id: "03", label: "COUNT" },
  { id: "04", label: "TRACE" },
  { id: "05", label: "WRITE" },
  { id: "06", label: "COMMAND" },
];
/* index of the instrument chapter */
const INST_INDEX = 5;

const ACCENT = "#ff8f3a";
/* viewport material factors (sRGB/255, matching components/viewer.tsx) */
const HL_ACCENT: [number, number, number, number] = [1.0, 0.561, 0.227, 1.0];
const HL_DIM: [number, number, number, number] = [0.3, 0.32, 0.36, 0.06];

/* ================================================================== */
/* FilmScene choreography constants                                    */
/* All per-node/per-point offsets are in the model's LOCAL Z-up metric */
/* space (metres). The GLB's ifcfast_root applies a −90°X rotation so    */
/* local +Z (height) → world +Y; the point cloud shares that rotation.  */
/* ================================================================== */
const TARGET_SIZE = 7; // normalised world size of the model's largest dim
const POINT_SIZE = 0.12; // world units, sizeAttenuation on (tuned to framing)
const EXPAND_AMP = 1.7; // metres of scatter when points are fully expanded
const SPLIT_GAP = 2.6; // metres per storey-rank for the mesh storey split
const BAND_GAP = 3.0; // metres between point-cloud storey bands
const EASE_K = 3.1; // exponential ease rate (~1.2 s settle)
const SCREEN_BIAS = 0.15; // fraction of width the model is pushed off-centre

/* per-entity explode vector (local Z-up metres) — a clean layered axon  */
const ENTITY_EXPLODE: Record<string, [number, number, number]> = {
  IfcWallStandardCase: [5.0, 0, 0],
  IfcWall: [5.0, 0, 0],
  IfcSlab: [0, 0, 4.5],
  IfcCovering: [0, 0, 6.0],
  IfcWindow: [-5.0, 0, 1.5],
  IfcDoor: [0, 4.5, 0.5],
  IfcFurnishingElement: [0, -5.5, -1.0],
  IfcBeam: [4.0, 0, 5.5],
  IfcMember: [4.5, 2.0, 4.0],
  IfcRailing: [-3.0, 3.5, 2.5],
  IfcStairFlight: [-4.5, -2.0, 2.0],
  IfcStair: [-4.5, -2.0, 2.0],
  IfcFooting: [0, 0, -4.5],
  IfcSpace: [0, 0, -6.0],
  IfcOpeningElement: [0, 0, -6.0],
};
const ENTITY_EXPLODE_DEFAULT: [number, number, number] = [0, 0, 3.0];

/* choreography state per film chapter (index 0–4) */
type FilmTarget = {
  mesh: number; // mesh opacity 0..1
  pts: number; // point-cloud opacity 0..1
  expand: number; // point scatter 0..1
  expEnt: number; // entity-explode amount 0..1
  expStorey: number; // storey-split amount 0..1
  band: number; // point storey-band flatten 0..1
  dir: [number, number, number]; // camera direction (world), normalised on use
  dist: number; // camera distance multiplier
};
const CH_T: FilmTarget[] = [
  // 01 OPEN — materialised solid (tweens in from the point-cloud preroll)
  { mesh: 1, pts: 0, expand: 0, expEnt: 0, expStorey: 0, band: 0, dir: [0.55, 0.4, 0.73], dist: 2.35 },
  // 02 TYPES — exploded into hard component groups by entity class
  { mesh: 1, pts: 0, expand: 0, expEnt: 1, expStorey: 0, band: 0, dir: [-0.6, 0.48, 0.64], dist: 2.85 },
  // 03 COUNT — regroup, then split into storey slabs
  { mesh: 1, pts: 0, expand: 0, expEnt: 0, expStorey: 1, band: 0, dir: [0.32, 0.3, 0.9], dist: 2.75 },
  // 04 TRACE — dissolve into the real point cloud, regrouped into storey bands
  { mesh: 0, pts: 1, expand: 0, expEnt: 0, expStorey: 0, band: 1, dir: [0.12, 0.16, 0.98], dist: 2.55 },
  // 05 WRITE — reassembled solid hero angle for the CTA handoff into 06
  { mesh: 1, pts: 0, expand: 0, expEnt: 0, expStorey: 0, band: 0, dir: [0.6, 0.34, 0.72], dist: 2.3 },
];
/* preroll (before chapter 01 settles): the file as an expanded point cloud */
const FILM_PREROLL: Omit<FilmTarget, "dir" | "dist"> = {
  mesh: 0, pts: 1, expand: 1, expEnt: 0, expStorey: 0, band: 0,
};
/* storey_idx (points.json order) → elevation rank; 255 = unplaced → −1     */
const STOREY_IDX_RANK: Record<number, number> = { 1: 0, 0: 1, 2: 2, 3: 3, 255: -1 };

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
const nfInt = new Intl.NumberFormat("en-US");
const short = (e: string) => e.replace(/^Ifc/i, "").toUpperCase();

/* ================================================================== */
/* Page                                                                */
/* ================================================================== */
export default function SceneInstrumentMockup() {
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(0);

  const [summary, setSummary] = useState<Summary | null>(null);
  const [qto, setQto] = useState<Qto | null>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [graph, setGraph] = useState<Graph | null>(null);

  /* chapter 06 lifecycle: entered (first IO hit) → booted (veil lifts) */
  const [instEntered, setInstEntered] = useState(false);
  const [booted, setBooted] = useState(false);
  const instRef = useRef<HTMLElement | null>(null);

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

  // chapter detection — section crossing viewport centre becomes active
  const registerSection = useCallback((el: HTMLElement | null, index: number) => {
    if (!el) return;
    el.dataset.chapterIndex = String(index);
  }, []);

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

  // boot trigger — the FIRST time chapter 06 enters the viewport (not page load)
  useEffect(() => {
    const el = instRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setInstEntered(true);
            io.disconnect();
          }
        }
      },
      { rootMargin: "0px", threshold: 0.01 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // once entered, lift the veil after a snappy beat (data is already loaded)
  useEffect(() => {
    if (!instEntered) return;
    const t = setTimeout(() => setBooted(true), 420);
    return () => clearTimeout(t);
  }, [instEntered]);

  // scroll-progress spine
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.4 });

  // derived, real numbers
  const totalVol = qto ? qto.rows.reduce((s, r) => s + (r.volume_m3 ?? 0), 0) : 0;
  const totalArea = qto ? qto.rows.reduce((s, r) => s + (r.area_m2 ?? 0), 0) : 0;
  const parseMs = summary ? summary.parse_seconds * 1000 : 0;

  // curated specimen set for chapter 02 — real glbs, one representative per
  // entity (highest count), skipping degenerate/opening geometry per brief.
  const specimens: MType[] = (() => {
    if (!manifest) return [];
    const valid = manifest.types.filter(
      (t) => t.bytes >= 1000 && t.entity !== "IfcOpeningElement"
    );
    const best = new Map<string, MType>();
    for (const t of valid) {
      const cur = best.get(t.entity);
      if (!cur || t.count > cur.count) best.set(t.entity, t);
    }
    return Array.from(best.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  })();

  const onInstrument = active === INST_INDEX;

  return (
    <>
      <style>{CSS}</style>
      <StyleBlock />

      {/* ---------- choreographed three.js film scene (chapters 01–05) ---------- */}
      {/* Loop pauses at chapter 06 so the instrument's model-viewer is the only  */}
      {/* live 3D — two heavy scenes must not fight. Resumes on scroll-up.        */}
      <FilmScene active={active} paused={onInstrument} />
      <div className="scene-vignette" />
      <div className="scene-grain" />

      {/* ---------- fixed HUD: chapter rail + brand (spans film + instrument) ---------- */}
      <div className="hud-brand">
        <span className="hud-mark">ifcfast</span>
        <span className="hud-sub">
          {onInstrument ? "the instrument" : "the scene · duplex"}
        </span>
      </div>

      <nav
        className={`chapter-rail${onInstrument ? " rail-retired" : ""}`}
        aria-label="chapters"
      >
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
        <section className="chapter ch-open" ref={(el) => registerSection(el, 0)}>
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
              <p className="scrollcue">scroll once more to boot the instrument ↓</p>
            </Reveal>
          </div>
        </section>

        {/* 06 — COMMAND · the instrument the film lands on */}
        <section
          className="chapter-inst"
          ref={(el) => {
            registerSection(el, INST_INDEX);
            instRef.current = el;
          }}
        >
          <InstrumentChapter
            summary={summary}
            qto={qto}
            graph={graph}
            manifest={manifest}
            entered={instEntered}
            booted={booted}
          />
        </section>

        {/* ---------- final CTA outro strip ---------- */}
        <footer className="outro">
          <div className="outro-inner">
            <p className="outro-kicker">06 / COMMAND · the instrument is yours</p>
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
          </div>
        </footer>
      </main>
    </>
  );
}

/* ================================================================== */
/* FilmScene — custom three.js scene choreographing the Duplex model    */
/* across chapters 01–05. One WebGL context; the render loop pauses when */
/* `paused` (chapter 06 active) so it never fights the instrument's      */
/* model-viewer. Degrades to nothing if WebGL/asset load fails.          */
/* ================================================================== */
type PartNode = {
  mesh: THREE.Object3D;
  base: THREE.Vector3;
  ent: THREE.Vector3; // entity-explode offset (local metres)
  storey: THREE.Vector3; // storey-split offset (local metres)
};
type FilmCur = {
  mesh: number;
  pts: number;
  expand: number;
  expEnt: number;
  expStorey: number;
  band: number;
  camPos: THREE.Vector3;
};

function FilmScene({ active, paused }: { active: number; paused: boolean }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false); // fades in once the scene is live
  const activeRef = useRef(active);
  const pausedRef = useRef(paused);
  // resume/pause the loop and steer the target when props change
  const controlRef = useRef<{ setChapter: (i: number) => void; setPaused: (b: boolean) => void } | null>(null);

  useEffect(() => {
    activeRef.current = active;
    controlRef.current?.setChapter(active);
  }, [active]);
  useEffect(() => {
    pausedRef.current = paused;
    controlRef.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;

    // ---- renderer / scene / camera ------------------------------------
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      return; // WebGL unavailable → film text still reads
    }
    const w = mount.clientWidth || window.innerWidth;
    const h = mount.clientHeight || window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.setClearColor(0x000000, 0); // CSS gradient shows through
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, w / h, 0.1, 2000);

    // amber/graphite lighting
    scene.add(new THREE.HemisphereLight(0xbfc6cf, 0x0a0b0d, 1.05));
    const key = new THREE.DirectionalLight(0xffe6cf, 1.35);
    key.position.set(6, 10, 8);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xff8f3a, 0.5);
    rim.position.set(-8, 4, -6);
    scene.add(rim);

    function applyViewBias() {
      const cw = mount!.clientWidth || window.innerWidth;
      const ch = mount!.clientHeight || window.innerHeight;
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
      if (cw >= 900) {
        // push the model to the right, off-centre behind the left-aligned text
        camera.setViewOffset(cw, ch, -cw * SCREEN_BIAS, 0, cw, ch);
      } else {
        camera.clearViewOffset();
      }
    }
    applyViewBias();

    // ---- scene graph: pivot → recenter → { mesh root, points pivot } ---
    const pivot = new THREE.Group();
    const recenter = new THREE.Group();
    pivot.add(recenter);
    scene.add(pivot);

    // ---- animation state ----------------------------------------------
    const cur: FilmCur = {
      mesh: FILM_PREROLL.mesh,
      pts: FILM_PREROLL.pts,
      expand: FILM_PREROLL.expand,
      expEnt: FILM_PREROLL.expEnt,
      expStorey: FILM_PREROLL.expStorey,
      band: FILM_PREROLL.band,
      camPos: new THREE.Vector3(0, 0, 40),
    };
    const parts: PartNode[] = [];
    const meshMats = new Set<THREE.Material>();
    let meshRoot: THREE.Object3D | null = null;
    let pointsObj: THREE.Points | null = null;
    let ptsMat: THREE.PointsMaterial | null = null;
    let ptsBase: Float32Array | null = null; // pristine positions (local, aligned)
    let ptsExpandDir: Float32Array | null = null; // per-point scatter direction
    let ptsBandOff: Float32Array | null = null; // per-point Z delta to its band
    let pointCount = 0;
    let lastExpand = -1;
    let lastBand = -1;
    let frameDist = TARGET_SIZE; // world radius used for camera framing
    let ready = false;

    const tmp = new THREE.Vector3();
    const dirV = new THREE.Vector3(); // reused each frame — no per-frame alloc
    const lookTarget = new THREE.Vector3(0, 0, 0);

    function currentTarget(): FilmTarget {
      const i = Math.max(0, Math.min(CH_T.length - 1, activeRef.current));
      return CH_T[i];
    }

    // ---- assets: glb + graph (guid→storey) + point cloud ---------------
    const loader = new GLTFLoader();
    Promise.all([
      new Promise<THREE.Object3D>((res, rej) =>
        loader.load("/sample/duplex.glb", (g) => res(g.scene), undefined, rej)
      ),
      fetch("/sample/duplex.graph.json").then((r) => r.json() as Promise<Graph>),
      fetch("/sample/duplex.points.bin").then((r) => r.arrayBuffer()),
      fetch("/sample/duplex.points.json").then((r) => r.json()),
    ])
      .then(([gscene, graph, pbuf, pmeta]) => {
        if (disposed) return;

        // guid → elevation rank (mesh storey split)
        const rankByStorey = new Map<string, number>();
        [...graph.storeys]
          .sort((a, b) => a.elevation - b.elevation)
          .forEach((s, i) => rankByStorey.set(s.guid, i));
        const guidStorey = new Map<string, string | null>();
        graph.products.forEach((p) => guidStorey.set(p.guid, p.storey_guid));

        // mesh root
        meshRoot = gscene;
        recenter.add(gscene);

        // buckets + per-node offsets
        gscene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!(m as THREE.Mesh).isMesh) return;
          const guid = (o.userData?.guid as string) ?? o.name;
          const entity =
            (o.userData?.entity as string) ?? "";
          const eo = ENTITY_EXPLODE[entity] ?? ENTITY_EXPLODE_DEFAULT;
          // storey rank: placed → by guid; unplaced → from local height (Z)
          const sg = guidStorey.get(guid) ?? null;
          let rank = sg != null ? rankByStorey.get(sg) : undefined;
          if (rank === undefined) {
            const z = o.position.z;
            rank = z < 0 ? 0 : z < 1.5 ? 1 : z < 4.5 ? 2 : 3;
          }
          parts.push({
            mesh: o,
            base: o.position.clone(),
            ent: new THREE.Vector3(eo[0], eo[1], eo[2]),
            storey: new THREE.Vector3(0, 0, (rank - 1.5) * SPLIT_GAP),
          });
          const mat = m.material;
          (Array.isArray(mat) ? mat : [mat]).forEach((mm) => {
            if (mm) {
              mm.transparent = true;
              meshMats.add(mm);
            }
          });
        });

        // point cloud — decode binary (u32 count | f32 xyz | u8 ent | u8 storey)
        const dv = new DataView(pbuf);
        const count = dv.getUint32(0, true);
        pointCount = count;
        const posOff = 4;
        const entOff = 4 + count * 12;
        const storOff = entOff + count;
        ptsBase = new Float32Array(pbuf, posOff, count * 3).slice(); // aligned copy
        ptsExpandDir = new Float32Array(count * 3);
        ptsBandOff = new Float32Array(count);
        const rand = mulberry32(20110907);
        for (let i = 0; i < count; i++) {
          const b = i * 3;
          // scatter direction (unit-ish) for the "expanded" preroll
          const dx = rand() * 2 - 1, dy = rand() * 2 - 1, dz = rand() * 2 - 1;
          const len = Math.hypot(dx, dy, dz) || 1;
          ptsExpandDir[b] = (dx / len) * EXPAND_AMP * (0.4 + rand());
          ptsExpandDir[b + 1] = (dy / len) * EXPAND_AMP * (0.4 + rand());
          ptsExpandDir[b + 2] = (dz / len) * EXPAND_AMP * (0.4 + rand());
          // storey band: flatten each storey's points to a distinct Z sheet
          const sidx = dv.getUint8(storOff + i);
          const srank = STOREY_IDX_RANK[sidx] ?? -1;
          const bandZ = (srank - 1.5) * BAND_GAP; // −1 (unplaced) sinks below
          ptsBandOff[i] = bandZ - ptsBase[b + 2];
        }

        const geo = new THREE.BufferGeometry();
        const posArr = ptsBase.slice();
        geo.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
        // per-point warm colour, brighter with height, for band legibility
        const col = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
          const b = i * 3;
          const sidx = dv.getUint8(storOff + i);
          const srank = STOREY_IDX_RANK[sidx] ?? -1;
          const lum = 0.55 + Math.max(0, srank) * 0.13;
          col[b] = 1.0 * lum;
          col[b + 1] = 0.56 * lum;
          col[b + 2] = 0.24 * lum;
        }
        geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
        ptsMat = new THREE.PointsMaterial({
          size: POINT_SIZE,
          sizeAttenuation: true,
          vertexColors: true,
          transparent: true,
          opacity: 1,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        pointsObj = new THREE.Points(geo, ptsMat);
        // points share the model's Z-up→Y-up rotation and undo the centroid rebase
        const rotQuat = new THREE.Quaternion(-0.70710677, 0, 0, 0.70710677);
        const ptsPivot = new THREE.Group();
        ptsPivot.quaternion.copy(rotQuat);
        const cw = (pmeta.center_world as number[]) ?? [0, 0, 0];
        pointsObj.position.set(cw[0], cw[1], cw[2]);
        ptsPivot.add(pointsObj);
        recenter.add(ptsPivot);

        // centre + normalise the whole composition
        const box = new THREE.Box3().setFromObject(gscene);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        recenter.position.copy(center).multiplyScalar(-1);
        pivot.scale.setScalar(TARGET_SIZE / maxDim);
        frameDist = TARGET_SIZE;

        ready = true;
        setVisible(true);
        start();
      })
      .catch(() => {
        /* asset/init failure → film text still reads */
      });

    // ---- render loop ---------------------------------------------------
    let raf = 0;
    let last = 0;
    let running = false;

    function applyScene() {
      // mesh opacity + explode
      if (meshRoot) meshRoot.visible = cur.mesh > 0.01;
      meshMats.forEach((mm) => {
        (mm as THREE.MeshStandardMaterial).opacity = cur.mesh;
        mm.depthWrite = cur.mesh > 0.95;
      });
      for (const p of parts) {
        tmp.copy(p.base)
          .addScaledVector(p.ent, cur.expEnt)
          .addScaledVector(p.storey, cur.expStorey);
        p.mesh.position.copy(tmp);
      }
      // points opacity + scatter/band (recompute positions only when changing)
      if (pointsObj && ptsMat && ptsBase && ptsExpandDir && ptsBandOff) {
        ptsMat.opacity = cur.pts;
        pointsObj.visible = cur.pts > 0.01;
        if (Math.abs(cur.expand - lastExpand) > 1e-4 || Math.abs(cur.band - lastBand) > 1e-4) {
          const attr = pointsObj.geometry.getAttribute("position") as THREE.BufferAttribute;
          const arr = attr.array as Float32Array;
          for (let i = 0; i < pointCount; i++) {
            const b = i * 3;
            arr[b] = ptsBase[b] + ptsExpandDir[b] * cur.expand;
            arr[b + 1] = ptsBase[b + 1] + ptsExpandDir[b + 1] * cur.expand;
            arr[b + 2] = ptsBase[b + 2] + ptsExpandDir[b + 2] * cur.expand + ptsBandOff[i] * cur.band;
          }
          attr.needsUpdate = true;
          lastExpand = cur.expand;
          lastBand = cur.band;
        }
      }
    }

    function frame(now: number) {
      if (!running) return;
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const t = currentTarget();
      const k = 1 - Math.exp(-dt * EASE_K);
      cur.mesh += (t.mesh - cur.mesh) * k;
      cur.pts += (t.pts - cur.pts) * k;
      cur.expand += (t.expand - cur.expand) * k;
      cur.expEnt += (t.expEnt - cur.expEnt) * k;
      cur.expStorey += (t.expStorey - cur.expStorey) * k;
      cur.band += (t.band - cur.band) * k;

      // camera: lerp toward the chapter's framing, with a slow idle drift
      dirV.set(t.dir[0], t.dir[1], t.dir[2]).normalize();
      const ang = now * 0.00004;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const rx = dirV.x * ca - dirV.z * sa;
      const rz = dirV.x * sa + dirV.z * ca;
      const camTarget = tmp.set(rx, dirV.y, rz).multiplyScalar(frameDist * t.dist);
      cur.camPos.lerp(camTarget, k);
      camera.position.copy(cur.camPos);
      camera.lookAt(lookTarget);

      applyScene();
      renderer.render(scene, camera);
    }

    function start() {
      if (running || disposed || pausedRef.current || document.hidden || !ready) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    // expose controls to the React effects
    controlRef.current = {
      setChapter: () => {
        /* target is read from activeRef each frame; ensure loop is running */
        start();
      },
      setPaused: (b: boolean) => {
        if (b) stop();
        else start();
      },
    };

    const onResize = () => {
      const cw = mount.clientWidth || window.innerWidth;
      const ch = mount.clientHeight || window.innerHeight;
      renderer.setSize(cw, ch);
      applyViewBias();
    };
    const onVis = () => {
      if (document.hidden) stop();
      else start();
    };
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVis);

    // ---- cleanup -------------------------------------------------------
    return () => {
      disposed = true;
      stop();
      controlRef.current = null;
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVis);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if ((m as THREE.Mesh).isMesh || (o as THREE.Points).isPoints) {
          m.geometry?.dispose();
          const mat = (m as THREE.Mesh).material;
          (Array.isArray(mat) ? mat : [mat]).forEach((mm) => mm?.dispose());
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      className="scene-stage"
      initial={{ opacity: 0 }}
      animate={{ opacity: visible && !paused ? 1 : 0 }}
      transition={{ duration: paused ? 0.55 : 1.4, ease: "easeOut" }}
    >
      <div ref={mountRef} className="scene-canvas" />
    </motion.div>
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
/* TypeMini — orbiting specimen mesh (chapter 02)                      */
/* ================================================================== */
function TypeMini({ entry, ready, delay }: { entry: MType; ready: boolean; delay: number }) {
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
/* useCountUp — rAF count-up, sells "live readout" on scope change      */
/* ================================================================== */
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

/* void / air entities excluded from a "solid" volume readout */
const VOID_ENTITIES = new Set(["IfcSpace", "IfcOpeningElement"]);

/* ================================================================== */
/* InstrumentChapter — concept B, adapted as film chapter 06           */
/* ================================================================== */
function InstrumentChapter({
  summary,
  qto,
  graph,
  manifest,
  entered,
  booted,
}: {
  summary: Summary | null;
  qto: Qto | null;
  graph: Graph | null;
  manifest: Manifest | null;
  entered: boolean;
  booted: boolean;
}) {
  // scope: "ALL" | "UNPLACED" | storey_guid  (drives numeric rescoping)
  const [scope, setScope] = useState<string>("ALL");
  // cross-highlight entity (hovering a dist bar OR a register row)
  const [hotEntity, setHotEntity] = useState<string | null>(null);
  // viewport swap target (register row hover = live mini-glb preview)
  const [hotType, setHotType] = useState<MType | null>(null);
  // pinned viewport filters (clicks)
  const [entitySel, setEntitySel] = useState<string | null>(null);
  const [typeSel, setTypeSel] = useState<string | null>(null);

  /* ── storey ordering (top elevation first) ── */
  const storeys = useMemo(() => {
    if (!graph) return [];
    return [...graph.storeys].sort((a, b) => b.elevation - a.elevation);
  }, [graph]);

  const qtoByEntity = useMemo(() => {
    const m = new Map<string, QtoRow>();
    qto?.rows.forEach((r) => m.set(r.entity, r));
    return m;
  }, [qto]);

  /* ── product-guid → meta lookup for viewport cross-filter ── */
  const guidLookup = useMemo(() => {
    const m = new Map<string, Meta>();
    graph?.products.forEach((p) =>
      m.set(p.guid, { entity: p.entity, storey_guid: p.storey_guid, type_name: p.type_name })
    );
    return m;
  }, [graph]);

  /* ── scoped product set (storey-based numeric scope) ── */
  const scoped = useMemo(() => {
    if (!graph) return [] as Product[];
    if (scope === "ALL") return graph.products;
    if (scope === "UNPLACED") return graph.products.filter((p) => !p.storey_guid);
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
  const storeyMax = Math.max(storeyCount.unplaced, ...[...storeyCount.m.values()], 1);

  const scopeLabel =
    scope === "ALL"
      ? "WHOLE MODEL"
      : scope === "UNPLACED"
        ? "UNPLACED · OPENINGS + FURNISHINGS"
        : storeys.find((s) => s.guid === scope)?.name ?? scope;

  const filterActive = !!(hotEntity || entitySel || typeSel || scope !== "ALL");

  /* ── viewport source: register hover previews a type mini-glb ── */
  const previewing = !!hotType;
  const viewSrc = previewing ? hotType!.glb : "/sample/duplex.glb";
  const viewLabel = previewing
    ? `${short(hotType!.entity)} · ${hotType!.type_name}`
    : filterActive
      ? `DUPLEX_A · FILTER · ${scopeLabel}`
      : "DUPLEX_A · FULL ASSEMBLY";

  /* ── highlight descriptor (precedence: hover → type click → entity click → storey) ── */
  const highlight: Highlight = useMemo(() => {
    if (previewing) return null; // mini-glb preview: no cross-filter
    const storeyScope = scope === "ALL" ? undefined : scope;
    const ent = hotEntity ?? entitySel;
    if (ent) return { mode: "entity", value: ent, storeyScope };
    if (typeSel) return { mode: "type", value: typeSel, storeyScope };
    if (scope !== "ALL") return { mode: "storey", value: scope };
    return null;
  }, [previewing, hotEntity, entitySel, typeSel, scope]);

  const clearFilters = () => {
    setScope("ALL");
    setEntitySel(null);
    setTypeSel(null);
    setHotType(null);
    setHotEntity(null);
  };

  const fileName = summary ? summary.path.split("/").pop() ?? summary.path : "—";
  const ready = summary && qto && graph && manifest;

  return (
    <div id="inst-b" className="inst-inflow">
      {/* boot veil — fires the first time the chapter enters view */}
      {entered && ready && !booted && <BootVeil ready={!!ready} />}

      {entered && ready && (
        <div className="grid">
          {/* ─────────── TITLE BLOCK (brand reduced — A's chrome carries ifcfast) ─────────── */}
          <section className="cell titleblk" style={{ gridArea: "title" }}>
            <div className="tb-mark">
              <span className="tb-live" />
              <span className="tb-brand">THE INSTRUMENT</span>
              <span className="tb-sub">COMMAND</span>
              <span className="tb-ver">v{manifest!.generated_with}</span>
            </div>
            <div className="tb-grid">
              <TB k="MODEL" v={fileName} wide />
              <TB k="SCHEMA" v={summary!.schema} />
              <TB k="PROJECT" v={summary!.project_name || "—"} />
              <TB k="SOURCE APP" v={summary!.authoring_app} wide />
              <TB k="UNITS" v={`${summary!.length_unit} · ×${summary!.unit_scale}`} />
              <TB k="SIZE" v={`${fmt(summary!.size_bytes / 1e6, 2)} MB`} />
              <TB k="PARSE" v={`${fmt(summary!.parse_seconds * 1000, 1)} ms`} accent />
              <TB k="ENTITIES" v={nfInt.format(summary!.type_counts_total)} />
              <TB k="CACHE" v={summary!.cache_key} mono />
            </div>
          </section>

          {/* ─────────── QUANTITIES STRIP ─────────── */}
          <section className="cell quant" style={{ gridArea: "quant" }}>
            <InstHead label="QUANTITIES" meta={scopeLabel} metaAccent={scope !== "ALL"} />
            <div className="qrow">
              <Readout label="PRODUCTS" value={q.products} d={0} unit="" />
              <Readout label="SOLID VOL" value={q.m3} d={1} unit="m³" />
              <Readout label="SURFACE" value={q.m2} d={0} unit="m²" />
              <Readout label="MATERIALS" value={q.mats} d={0} unit="dist" />
              <Readout label="MESHED" value={meshed} d={1} unit="%" muted fixed />
            </div>
          </section>

          {/* ─────────── STOREY STACK (section) ─────────── */}
          <section className="cell storey" style={{ gridArea: "storey" }}>
            <InstHead label="STOREY SECTION" meta={`${storeys.length} LVL`} />
            <div className="stack">
              {filterActive && (
                <button className="stk-reset" onClick={clearFilters}>
                  ◂ CLEAR FILTER
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
                      onClick={() => {
                        setEntitySel(null);
                        setTypeSel(null);
                        setScope(sel ? "ALL" : s.guid);
                      }}
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
                  onClick={() => {
                    setEntitySel(null);
                    setTypeSel(null);
                    setScope(scope === "UNPLACED" ? "ALL" : "UNPLACED");
                  }}
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
                      style={{ width: `${(storeyCount.unplaced / storeyMax) * 100}%` }}
                    />
                  </span>
                  <span className="stk-count">{storeyCount.unplaced}</span>
                </button>
              </div>
            </div>
          </section>

          {/* ─────────── 3D VIEWPORT (cross-filtered) ─────────── */}
          <section className="cell view" style={{ gridArea: "view" }}>
            <InstHead
              label="VIEWPORT"
              meta={previewing ? "TYPE PREVIEW" : highlight ? "FILTERED" : "GLB"}
              metaAccent={previewing || !!highlight}
            />
            <InstrumentViewport
              src={viewSrc}
              label={viewLabel}
              guidLookup={guidLookup}
              highlight={highlight}
            />
          </section>

          {/* ─────────── ENTITY DISTRIBUTION ─────────── */}
          <section className="cell dist" style={{ gridArea: "dist" }}>
            <InstHead label="ENTITY DISTRIBUTION" meta={`${dist.length} CLASSES`} />
            <div className="scrolly bars">
              {dist.map((d) => {
                const hot = hotEntity === d.entity || entitySel === d.entity;
                return (
                  <div
                    key={d.entity}
                    className={`bar-row${hot ? " hot" : ""}${entitySel === d.entity ? " pin" : ""}`}
                    onMouseEnter={() => setHotEntity(d.entity)}
                    onMouseLeave={() => setHotEntity(null)}
                    onClick={() => {
                      setTypeSel(null);
                      setEntitySel(entitySel === d.entity ? null : d.entity);
                    }}
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
            <InstHead label="TYPE REGISTER" meta={`${manifest!.types.length} TYPES`} />
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
                const pinned = typeSel === t.type_name;
                const inScope =
                  scope === "ALL" ||
                  dist.some((d) => d.entity === t.entity && d.count > 0);
                return (
                  <div
                    key={t.slug}
                    className={`reg-row${entHot ? " hot" : ""}${pinned ? " pin" : ""}${inScope ? "" : " dim"}`}
                    onMouseEnter={() => {
                      setHotType(t); // hover = live preview
                      setHotEntity(t.entity);
                    }}
                    onClick={() => {
                      // click = filter: return viewport to full glb, highlight this type
                      setHotType(null);
                      setEntitySel(null);
                      setTypeSel(typeSel === t.type_name ? null : t.type_name);
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
                    <span className="reg-bytes ra">{(t.bytes / 1024).toFixed(1)}k</span>
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
      <div className={`tb-v${accent ? " tb-acc" : ""}${mono ? " tb-mono" : ""}`} title={v}>
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
      {meta && <span className={`ihead-m${metaAccent ? " acc" : ""}`}>{meta}</span>}
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
}: {
  label: string;
  value: number;
  d: number;
  unit: string;
  muted?: boolean;
  fixed?: boolean;
}) {
  const anim = useCountUp(value);
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

/* ================================================================== */
/* InstrumentViewport — 3D instrument with GUID-material cross-filter   */
/* Materials in duplex.glb are named by product GUID ('<guid>' or       */
/* '<guid>#N' per segment). We snapshot originals on load, then recolour */
/* matches to the amber accent and dim the rest per the active filter.   */
/* ================================================================== */
function InstrumentViewport({
  src,
  label,
  guidLookup,
  highlight,
}: {
  src: string;
  label: string;
  guidLookup: Map<string, Meta>;
  highlight: Highlight;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const originals = useRef<
    Map<string, { color: [number, number, number, number]; alphaMode: string }>
  >(new Map());

  useEffect(() => {
    import("@google/model-viewer");
  }, []);

  type Mat = {
    name: string;
    setAlphaMode: (m: "OPAQUE" | "BLEND" | "MASK") => void;
    pbrMetallicRoughness: {
      setBaseColorFactor: (rgba: [number, number, number, number]) => void;
      baseColorFactor: [number, number, number, number];
    };
  };

  const storeyMatch = useCallback((meta: Meta, value: string) => {
    return value === "UNPLACED" ? meta.storey_guid == null : meta.storey_guid === value;
  }, []);

  const apply = useCallback(() => {
    const mv = ref.current as unknown as { model?: { materials: Mat[] } } | null;
    const mats = mv?.model?.materials;
    if (!mats) return;
    for (const m of mats) {
      const orig = originals.current.get(m.name);
      if (!orig) continue;
      // no active filter (or mini-glb preview) → restore original look
      if (!highlight) {
        m.setAlphaMode(orig.alphaMode as "OPAQUE" | "BLEND");
        m.pbrMetallicRoughness.setBaseColorFactor(orig.color);
        continue;
      }
      // multi-segment products carry '<guid>#1', '<guid>#2', … — normalize
      const guidKey = m.name.includes("#") ? m.name.slice(0, m.name.indexOf("#")) : m.name;
      const meta = guidLookup.get(guidKey);
      let match = false;
      if (meta) {
        if (highlight.mode === "storey") {
          match = storeyMatch(meta, highlight.value);
        } else if (highlight.mode === "entity") {
          match =
            meta.entity.toLowerCase() === highlight.value.toLowerCase() &&
            (highlight.storeyScope ? storeyMatch(meta, highlight.storeyScope) : true);
        } else if (highlight.mode === "type") {
          match =
            (meta.type_name ?? "—") === highlight.value &&
            (highlight.storeyScope ? storeyMatch(meta, highlight.storeyScope) : true);
        }
      }
      if (match) {
        m.setAlphaMode("OPAQUE");
        m.pbrMetallicRoughness.setBaseColorFactor(HL_ACCENT);
      } else {
        m.setAlphaMode("BLEND");
        m.pbrMetallicRoughness.setBaseColorFactor(HL_DIM);
      }
    }
  }, [highlight, guidLookup, storeyMatch]);

  // snapshot original material state on (re)load, then apply current filter
  useEffect(() => {
    const mv = ref.current as unknown as
      | {
          model?: { materials: Mat[] };
          addEventListener: HTMLElement["addEventListener"];
          removeEventListener: HTMLElement["removeEventListener"];
        }
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
      setLoaded(true);
      apply();
    };
    mv.addEventListener("load", onLoad);
    return () => mv.removeEventListener("load", onLoad);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // switching src (mini preview ⇄ full glb) drops known originals so the next
  // model's materials are snapshotted fresh
  useEffect(() => {
    originals.current = new Map();
    setLoaded(false);
  }, [src]);

  // re-apply whenever the filter changes
  useEffect(() => {
    apply();
  }, [apply, loaded]);

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
          IFCFAST · BOOTING INSTRUMENT
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

/* ================================================================== */
/* Film styles (concept A) — clamp()-tuned for 1440 → 2560 → mobile     */
/* ================================================================== */
const CSS = `
:root { --amber: ${ACCENT}; }

.scene-stage {
  position: fixed; inset: 0; z-index: 0;
  background:
    radial-gradient(ellipse 120% 90% at 62% 40%, #16191f 0%, #0b0d11 52%, #060708 100%);
}
.scene-canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.scene-canvas canvas { display: block; }
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

/* --- fixed HUD (non-interactive — must not steal instrument hover) --- */
.hud-brand {
  position: fixed; top: clamp(18px,2.4vw,34px); left: clamp(18px,2.6vw,42px);
  z-index: 30; display: flex; flex-direction: column; gap: 2px;
  color: #f2efe9; pointer-events: none;
}
.hud-mark {
  font-family: var(--font-mono); font-weight: 700; letter-spacing: -0.03em;
  font-size: clamp(15px,1.3vw,19px);
}
.hud-sub {
  font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.28em;
  text-transform: uppercase; color: #7d7b76;
  transition: color 0.4s ease;
}

.chapter-rail {
  position: fixed; top: 50%; right: clamp(16px,2.4vw,40px); transform: translateY(-50%);
  z-index: 30; display: flex; gap: 14px; align-items: stretch;
  pointer-events: none;
  transition: opacity 0.5s ease;
}
/* the rail's job ends where the instrument begins */
.chapter-rail.rail-retired { opacity: 0; }
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
  color: #b9b6b0; pointer-events: none;
  background: rgba(10,11,13,0.55); backdrop-filter: blur(6px);
  border: 1px solid rgba(255,255,255,0.08); border-radius: 999px;
  padding: 7px 14px;
}
.hud-badge .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--amber);
  box-shadow: 0 0 10px 1px rgba(255,143,58,0.8); }
.hud-badge .dot.pulse { animation: pulse-a 1.2s ease-in-out infinite; }
@keyframes pulse-a { 0%,100%{opacity:0.35} 50%{opacity:1} }

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

/* --- outro CTA strip (page end) --- */
.outro {
  position: relative; z-index: 10;
  background: linear-gradient(180deg, #0a0b0d 0%, #060708 100%);
  border-top: 1px solid rgba(255,255,255,0.08);
  padding: clamp(48px,7vw,96px) clamp(20px,8vw,200px);
}
.outro-inner { width: min(100%, 1180px); margin-inline: auto; }
.outro-kicker {
  font-family: var(--font-mono); font-size: clamp(11px,0.85vw,13px);
  letter-spacing: 0.42em; text-transform: uppercase; color: var(--amber);
  margin: 0 0 clamp(18px,2.4vw,30px); text-shadow: 0 0 18px rgba(255,143,58,0.35);
}
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

/* --- chapter 06 host — in-flow full-viewport instrument --- */
.chapter-inst { position: relative; z-index: 10; min-height: 100svh; }

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
  .outro { padding-inline: 20px; }
}
@media (min-width: 2000px) {
  .c-inner { width: min(100%, 1520px); }
  .type-strip { gap: 30px; }
}
`;

/* ================================================================== */
/* Instrument styles (concept B) — graphite terminal, accent unified    */
/* to the film's amber; positioning defeated so it sits in the film flow */
/* ================================================================== */
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
  --acc:${ACCENT}; --acc-dim:#b3671f; --steel:#454d56; --steel2:#5b636d;
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
/* --- defeat B's fixed positioning: chapter 06 sits in the film flow --- */
#inst-b.inst-inflow{
  position:relative; inset:auto; z-index:10;
  min-height:100svh; overflow:visible;
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
  #inst-b.inst-inflow{ height:100svh; min-height:100svh; overflow:hidden; }
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
#inst-b .tb-brand{ font-size:13px; letter-spacing:.2em; font-weight:700; }
#inst-b .tb-sub{ font-size:8.5px; letter-spacing:.34em; color:var(--acc); align-self:flex-end; margin-bottom:2px; }
#inst-b .tb-ver{ margin-left:auto; font-size:8.5px; letter-spacing:.13em; color:var(--mut); }
#inst-b .tb-live{
  width:6px; height:6px; background:var(--acc); border-radius:50%;
  box-shadow:0 0 7px 1px var(--acc); animation:pulse-b 1.7s ease-in-out infinite;
}
@keyframes pulse-b{ 0%,100%{opacity:1} 50%{opacity:.28} }
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
  background:rgba(255,143,58,.06); border:0; border-bottom:1px solid var(--ln);
  font-size:8.5px; letter-spacing:.13em; padding:6px 10px;
}
#inst-b .stk-reset:hover{ background:rgba(255,143,58,.13); }
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
#inst-b .stk-row.sel{ background:rgba(255,143,58,.07); }
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
  gap:8px; padding:3px 11px; cursor:pointer; border-bottom:1px solid rgba(34,38,44,.5);
}
#inst-b .mat-row{ grid-template-columns:1fr 70px 32px; cursor:default; }
#inst-b .bar-row.hot{ background:rgba(255,143,58,.09); }
#inst-b .bar-row.pin{ box-shadow:inset 3px 0 0 var(--acc); }
#inst-b .bar-name{ font-size:9.5px; letter-spacing:.06em; color:var(--fg); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:flex; align-items:center; gap:6px; }
#inst-b .mat-name{ color:var(--mut); letter-spacing:.02em; }
#inst-b .bar-flag{ font-size:7px; letter-spacing:.08em; color:#0b0c0e; background:var(--acc); padding:1px 3px; }
#inst-b .bar-track{ height:9px; background:#0c0e11; border:1px solid var(--ln); position:relative; overflow:hidden; }
#inst-b .bar-fill{ position:absolute; inset:0 auto 0 0; background:linear-gradient(90deg,var(--steel),var(--steel2)); transition:width .5s cubic-bezier(.2,.7,.2,1); }
#inst-b .bar-row.hot .bar-fill,#inst-b .bar-row.pin .bar-fill{ background:linear-gradient(90deg,var(--acc-dim),var(--acc)); }
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
#inst-b .reg-row{ border-bottom:1px solid rgba(34,38,44,.45); cursor:pointer; }
#inst-b .reg-row:hover,#inst-b .reg-row.hot{ background:rgba(255,143,58,.10); }
#inst-b .reg-row.pin{ background:rgba(255,143,58,.14); box-shadow:inset 3px 0 0 var(--acc); }
#inst-b .reg-row.dim{ opacity:.32; }
#inst-b .reg-ent{ font-size:8px; letter-spacing:.03em; color:var(--acc); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#inst-b .reg-name{ font-size:9px; color:var(--fg); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; letter-spacing:.01em; }
#inst-b .reg-n{ font-size:10px; color:var(--fg); }
#inst-b .reg-spark{ height:7px; background:#0c0e11; border:1px solid var(--ln); position:relative; overflow:hidden; }
#inst-b .reg-sparkfill{ position:absolute; inset:0 auto 0 0; background:var(--steel2); }
#inst-b .reg-row:hover .reg-sparkfill,#inst-b .reg-row.hot .reg-sparkfill,#inst-b .reg-row.pin .reg-sparkfill{ background:var(--acc); }
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
