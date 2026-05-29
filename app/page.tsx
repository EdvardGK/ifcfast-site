import { ArrowUpRight } from "lucide-react";

import { Code } from "@/components/code";

function Github({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.1c-3.2.69-3.88-1.54-3.88-1.54-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.78 1.2 1.78 1.2 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.74-1.55-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.47.11-3.06 0 0 .97-.31 3.18 1.18.92-.26 1.91-.39 2.89-.39s1.97.13 2.89.39c2.21-1.49 3.18-1.18 3.18-1.18.63 1.59.23 2.77.11 3.06.74.81 1.19 1.84 1.19 3.1 0 4.43-2.7 5.41-5.27 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}
import { HeroTerminal } from "@/components/terminal";
import { McpInstall } from "@/components/mcp-install";
import { ModelViewer } from "@/components/viewer";
import { QtoPanel } from "@/components/qto-panel";
import { VectorGraph } from "@/components/vector-graph";
import { SelectionProvider } from "@/components/selection-context";
import { DashTile } from "./dev/workbench/dash-tile";

const REPO = "https://github.com/EdvardGK/ifcfast";
const ISSUES = "https://github.com/EdvardGK/ifcfast/issues";

export default function Home() {
  return (
    <div className="relative z-10">
      <Header />
      <Hero />
      <WhatItIs />
      <ThreeLensSection />
      <WhatWeAreAttempting />
      <McpSection />
      <CodeShowcase />
      <Footer />
    </div>
  );
}

function ThreeLensSection() {
  return (
    <section className="border-b border-line">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 py-16 sm:py-24">
        <div className="max-w-2xl mb-10">
          <div className="text-xs uppercase tracking-wider text-muted mb-2">
            One parse, every lens.
          </div>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            See it. Count it.
            <br />
            <span className="text-muted">Trace it.</span>
          </h2>
          <p className="mt-4 text-muted leading-relaxed max-w-xl">
            A public-license IFC opened once with{" "}
            <code className="font-mono text-fg bg-bg border border-line px-1.5 py-0.5 rounded text-xs">
              ifcfast.open()
            </code>
            . Click anything in the data panel — the model dims,
            the graph highlights the path. Three lenses, one model,
            cross-filtered. A live look at what the parser produces,
            not a benchmark.
          </p>
        </div>
        <SelectionProvider>
          {/* 2×2 workbench — model viewer, relationship graph, a small
              dashboard, and the data panel, all reading from the same
              parse and cross-filtered through a shared selection. */}
          <div className="grid grid-cols-1 grid-rows-[repeat(4,minmax(420px,1fr))] lg:grid-cols-2 lg:grid-rows-2 gap-px bg-line rounded-xl overflow-hidden border border-line h-auto lg:h-[780px]">
            <div className="bg-card flex flex-col min-h-0 overflow-hidden">
              <ModelViewer
                src="/sample/duplex.glb"
                metaSrc="/sample/duplex.graph.json"
                alt="Duplex apartment IFC — buildingSMART community sample, CC BY 4.0"
              />
            </div>
            <div className="bg-card flex flex-col min-h-0 overflow-hidden">
              <VectorGraph src="/sample/duplex.graph.json" compact />
            </div>
            <div className="bg-card flex flex-col min-h-0 overflow-hidden">
              <DashTile qtoSrc="/sample/duplex.qto.json" graphSrc="/sample/duplex.graph.json" />
            </div>
            <div className="bg-card flex flex-col min-h-0 overflow-hidden">
              <QtoPanel src="/sample/duplex.qto.json" metaSrc="/sample/duplex.graph.json" compact />
            </div>
          </div>
        </SelectionProvider>
        <div className="mt-6 flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-6 text-xs text-muted">
          <span>
            Source IFC:{" "}
            <a
              href="https://github.com/buildingsmart-community/Community-Sample-Test-Files"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-fg"
            >
              buildingSMART community sample — Duplex Apartment
            </a>{" "}
            (CC BY 4.0).
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent"></span>
            <span>
              ifcfast hands over whatever it can read — mesh volume, AABB
              volume, per-face area, footprint, length, thickness,
              author-supplied <span className="font-mono">Qto_*</span> pset
              values, layer breakdowns. Interpreting them is the
              consumer&apos;s job: the numbers reflect the geometry the
              modeller authored (a lightbulb&apos;s mesh volume is its
              envelope, not its glass), and they are not yet verified
              against other tools — cross-check before relying on them.
            </span>
          </span>
        </div>
      </div>
    </section>
  );
}

function Header() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mark />
          <span className="font-semibold tracking-tight">ifcfast</span>
          <span className="text-[10px] font-mono text-muted ml-1 border border-line rounded-full px-1.5 py-0.5">
            experimental
          </span>
        </div>
        <nav className="flex items-center gap-1 sm:gap-4 text-sm">
          <a
            href={REPO}
            target="_blank"
            rel="noreferrer"
            className="hidden sm:inline-flex items-center gap-1.5 text-muted hover:text-fg px-2 py-1 rounded"
          >
            <Github size={14} /> GitHub
          </a>
          <a
            href="https://pypi.org/project/ifcfast/"
            target="_blank"
            rel="noreferrer"
            className="hidden sm:inline-flex items-center gap-1.5 text-muted hover:text-fg px-2 py-1 rounded font-mono text-xs"
          >
            pypi
          </a>
          <a
            href={`${REPO}/blob/main/AGENTS.md`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-fg hover:text-accent px-2 py-1 rounded"
          >
            For agents <ArrowUpRight size={14} />
          </a>
        </nav>
      </div>
    </header>
  );
}

function Mark() {
  return (
    <div
      className="w-6 h-6 rounded-md bg-fg text-bg grid place-items-center font-mono text-[10px] leading-none"
      aria-hidden
    >
      if
    </div>
  );
}

function Hero() {
  return (
    <section className="border-b border-line">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 py-16 sm:py-24 grid lg:grid-cols-12 gap-10 lg:gap-16 items-start">
        <div className="lg:col-span-5">
          <div className="inline-flex items-center gap-2 text-xs font-mono text-muted border border-line rounded-full px-3 py-1 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-accent"></span>
            an open IFC parser — early & in progress
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-[3.4rem] font-semibold tracking-tight leading-[1.05]">
            Open any IFC.
            <br />
            <span className="text-muted">Ask any question.</span>
          </h1>
          <p className="mt-6 text-lg text-muted leading-relaxed max-w-md">
            A native IFC parser with a Python API. It reads a model&apos;s{" "}
            <span className="text-fg font-medium">data and geometry</span> into
            pandas tables, triangle meshes, and point clouds — no geometry
            kernel on the hot path. Built for AI agents, analytics, and
            pipelines.
          </p>
          <p className="mt-3 text-sm text-muted/80 max-w-md">
            Open-source and under active development. It complements{" "}
            <span className="font-mono">ifcopenshell</span> rather than
            replacing it — different tradeoffs, different jobs.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#install"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md bg-fg text-bg text-sm font-medium hover:bg-fg/90"
            >
              Install{" "}
              <span className="font-mono text-xs opacity-70">
                pip install ifcfast
              </span>
            </a>
            <a
              href={REPO}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md border border-line bg-card text-sm hover:bg-bg"
            >
              <Github size={14} /> Source
            </a>
          </div>
          <div className="mt-10 flex flex-col gap-1 text-xs font-mono text-muted">
            <span>$ pip install ifcfast</span>
            <span>$ python -c &quot;import ifcfast; ifcfast.open(ifcfast.example_path()).summary()&quot;</span>
          </div>
        </div>
        <div className="lg:col-span-7">
          <HeroTerminal />
        </div>
      </div>
    </section>
  );
}

const CAPABILITIES = [
  {
    kicker: "Parse",
    title: "Native, kernel-free reading",
    body:
      "A Rust core reads the IFC STEP data section directly into typed tables. ifcopenshell stays an optional dev dependency used for cross-checking — never on the hot path.",
  },
  {
    kicker: "Data",
    title: "Everything as pandas",
    body:
      "Property sets, quantities, materials, and classifications come back as long-format DataFrames. Filter, join, pivot, dump to Excel — ordinary data work, no IFC-specific gymnastics.",
  },
  {
    kicker: "Graph",
    title: "Spatial relationships",
    body:
      "Containment and aggregation as edge tables, plus traversal helpers. m.ancestors(guid) walks storey → building → site → project in one call.",
  },
  {
    kicker: "Geometry",
    title: "Meshes & point clouds",
    body:
      "Per-product triangle meshes, area-weighted point-cloud sampling with normals, and geometric quantities — handed back as numpy / pandas. Drops straight into trimesh, Open3D, or your own pipeline.",
  },
  {
    kicker: "Substrate",
    title: "Geometry + semantics, joined",
    body:
      "An optional GeoParquet export that pairs each product's geometry with its data, so a model becomes something DuckDB or pandas can query like any other table.",
  },
  {
    kicker: "Agents",
    title: "MCP server",
    body:
      "ifcfast-mcp speaks the Model Context Protocol, so Claude, Cursor, or any MCP client can open and question IFC files directly — point at the server, get tools and a guide resource.",
  },
];

function WhatItIs() {
  return (
    <section className="border-b border-line">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 py-16 sm:py-24">
        <div className="max-w-2xl mb-12">
          <div className="text-xs uppercase tracking-wider text-muted mb-2">
            What it is
          </div>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            One parse.
            <br />
            <span className="text-muted">Data and geometry, both.</span>
          </h2>
          <p className="mt-4 text-muted leading-relaxed max-w-xl">
            ifcfast opens a model once and exposes it through ordinary
            Python objects — DataFrames, numpy arrays, JSON-friendly
            dicts. The pieces below are what it does today.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-line rounded-xl overflow-hidden border border-line">
          {CAPABILITIES.map((f) => (
            <div
              key={f.title}
              className="bg-card p-6 sm:p-8 flex flex-col gap-3"
            >
              <div className="text-xs font-mono text-accent uppercase tracking-wider">
                {f.kicker}
              </div>
              <h3 className="text-xl font-semibold tracking-tight">
                {f.title}
              </h3>
              <p className="text-sm text-muted leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function WhatWeAreAttempting() {
  return (
    <section className="border-b border-line">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 py-16 sm:py-24">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-16 items-start">
          <div className="lg:col-span-5">
            <div className="text-xs uppercase tracking-wider text-muted mb-2">
              What we&apos;re attempting
            </div>
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight leading-tight">
              An open experiment,
              <br />
              <span className="text-muted">honest about its edges.</span>
            </h2>
            <p className="mt-5 text-muted leading-relaxed max-w-md">
              The goal is to make IFC files fast and pleasant to query —
              for agents, analytics, and anyone who wants to ask
              questions of a model without standing up a full geometry
              kernel.
            </p>
            <p className="mt-4 text-muted leading-relaxed max-w-md">
              ifcfast is early and not yet verified against established
              tools. Treat its output as provisional and cross-check it
              against <span className="font-mono">ifcopenshell</span> or
              your existing toolchain before you rely on it.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href={ISSUES}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md bg-fg text-bg text-sm font-medium hover:bg-fg/90"
              >
                Report an issue <ArrowUpRight size={14} />
              </a>
              <a
                href={REPO}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md border border-line bg-card text-sm hover:bg-bg"
              >
                <Github size={14} /> Contribute
              </a>
            </div>
          </div>
          <div className="lg:col-span-7">
            <div className="rounded-xl border border-line bg-card overflow-hidden">
              <div className="px-5 py-2.5 border-b border-line text-xs font-mono text-muted">
                what we&apos;re trying to find out
              </div>
              <ul className="divide-y divide-line">
                {ATTEMPTS.map((a) => (
                  <li key={a.title} className="px-5 py-4 flex flex-col gap-1">
                    <div className="text-sm font-medium tracking-tight">
                      {a.title}
                    </div>
                    <div className="text-sm text-muted leading-relaxed">
                      {a.body}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="px-5 py-3.5 border-t border-line bg-bg/40 text-xs text-muted leading-relaxed">
                Found a wrong number, a missed entity, or a faulty
                assumption?{" "}
                <a
                  href={ISSUES}
                  target="_blank"
                  rel="noreferrer"
                  className="text-fg underline hover:text-accent"
                >
                  Open a GitHub issue
                </a>
                . That feedback is how this becomes trustworthy.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const ATTEMPTS = [
  {
    title: "Expose the whole file as tidy data",
    body:
      "Every part a model declares — properties, quantities, materials, classifications, relationships — as tables you can reason about, with nothing silently dropped.",
  },
  {
    title: "Carry geometry far enough for analysis",
    body:
      "Meshes, point clouds, and geometric quantities that are good enough to measure, sample, and compare — without trying to be a CAD kernel.",
  },
  {
    title: "Stay honest about limits",
    body:
      "Surface what the parser can't yet handle as explicit, visible gaps rather than hiding them — so you always know what you're looking at.",
  },
];

function McpSection() {
  return (
    <section id="install" className="border-b border-line">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 py-16 sm:py-24">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-16 items-start">
          <div className="lg:col-span-5">
            <div className="text-xs uppercase tracking-wider text-muted mb-2">
              For agents
            </div>
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight leading-tight">
              Plug into Claude.
              <br />
              <span className="text-muted">Or Cursor. Or anything MCP.</span>
            </h2>
            <p className="mt-5 text-muted leading-relaxed max-w-md">
              <span className="font-mono text-fg">ifcfast-mcp</span> exposes
              the parse, data, and geometry surface as Model Context
              Protocol tools. Add one line to your MCP client config and
              your agent can drive IFCs directly — without you writing any
              glue code.
            </p>
            <div className="mt-6 text-sm text-muted">
              Paste{" "}
              <code className="font-mono text-fg bg-bg border border-line px-1.5 py-0.5 rounded text-xs">
                ifcfast.system_prompt()
              </code>{" "}
              into the system prompt for instant ramp-up.
            </div>
          </div>
          <div className="lg:col-span-7">
            <McpInstall />
          </div>
        </div>
      </div>
    </section>
  );
}

const DATA_SNIPPET = `import ifcfast

m = ifcfast.open("model.ifc")

# Long-format pandas tables, lazy.
m.psets             # property sets
m.quantities        # base quantities
m.materials         # IfcMaterial / layer / constituent / profile
m.classifications   # NS 3451 / Uniformat / OmniClass`;

const GRAPH_SNIPPET = `# Spatial-relationship graph
m.contained_in       # product → storey edges
m.aggregates         # child → parent edges
m.storey_building    # storey → building edges

# Traversal helpers
m.parent(g);   m.children(g)
m.ancestors(g);   m.descendants(g)
m.storey_of(g);   m.building_of(g)
m.products_in(parent_g)`;

const GEOMETRY_SNIPPET = `# Geometry — no CAD kernel on the hot path
for mesh in m.meshes():          # per-product triangles
    verts, faces = mesh.vertices, mesh.faces
    # → trimesh.Trimesh(verts, faces), Open3D, ...

# Area-weighted surface sampling (+ normals)
pc = m.point_cloud(per_m2=1000)  # x,y,z,nx,ny,nz,guid,entity

# Geometric quantities
m.mesh_qto()                     # volume, area, orientation`;

function CodeShowcase() {
  return (
    <section className="border-b border-line">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 py-16 sm:py-24">
        <div className="max-w-2xl mb-10">
          <div className="text-xs uppercase tracking-wider text-muted mb-2">
            The API
          </div>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            Pandas and numpy out.
          </h2>
          <p className="mt-4 text-muted leading-relaxed">
            Data layers are long-format DataFrames; geometry is numpy
            arrays; summaries are JSON-friendly dicts. No{" "}
            <span className="font-mono">ifcopenshell.open()</span> on the
            hot path — <span className="font-mono">ifcopenshell</span> is an{" "}
            <em>optional dev dependency</em>, used to cross-check output in
            tests.
          </p>
        </div>
        <div className="grid lg:grid-cols-3 gap-6">
          <CodeCard kicker="Data layers" code={DATA_SNIPPET} />
          <CodeCard kicker="Spatial graph" code={GRAPH_SNIPPET} />
          <CodeCard kicker="Geometry" code={GEOMETRY_SNIPPET} />
        </div>
      </div>
    </section>
  );
}

function CodeCard({ kicker, code }: { kicker: string; code: string }) {
  return (
    <div className="rounded-xl border border-line bg-card overflow-hidden">
      <div className="px-5 py-2.5 border-b border-line text-xs font-mono text-muted">
        {kicker}
      </div>
      <div className="p-5 overflow-x-auto scroll-thin">
        <Code lang="python">{code}</Code>
      </div>
    </div>
  );
}

function Footer() {
  return (
    <footer>
      <div className="mx-auto max-w-6xl px-6 sm:px-8 py-12 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="flex items-center gap-2 text-sm">
          <Mark />
          <span className="font-semibold tracking-tight">ifcfast</span>
          <span className="text-muted ml-2 text-xs">
            MIT · open source · Rust core, Python API
          </span>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
          <a href={REPO} target="_blank" rel="noreferrer" className="hover:text-fg">GitHub</a>
          <a href="https://pypi.org/project/ifcfast/" target="_blank" rel="noreferrer" className="hover:text-fg">PyPI</a>
          <a href={`${REPO}/blob/main/AGENTS.md`} target="_blank" rel="noreferrer" className="hover:text-fg">AGENTS.md</a>
          <a href={ISSUES} target="_blank" rel="noreferrer" className="hover:text-fg">Report an issue</a>
        </div>
      </div>
    </footer>
  );
}
