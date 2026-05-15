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
import { Benchmark } from "@/components/benchmark";
import { McpInstall } from "@/components/mcp-install";

export default function Home() {
  return (
    <div className="relative z-10">
      <Header />
      <Hero />
      <Why />
      <BenchmarkSection />
      <McpSection />
      <CodeShowcase />
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mark />
          <span className="font-semibold tracking-tight">ifcfast</span>
          <span className="text-xs font-mono text-muted ml-1">v0.1</span>
        </div>
        <nav className="flex items-center gap-1 sm:gap-4 text-sm">
          <a
            href="https://github.com/EdvardGK/ifcfast"
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
            href="https://github.com/EdvardGK/ifcfast/blob/main/AGENTS.md"
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
            the agent-first IFC parser
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-[3.4rem] font-semibold tracking-tight leading-[1.05]">
            Open any IFC.
            <br />
            <span className="text-muted">Ask any question.</span>
          </h1>
          <p className="mt-6 text-lg text-muted leading-relaxed max-w-md">
            Fast native IFC parsing for AI agents, RPA, and analytics
            pipelines.{" "}
            <span className="text-fg font-medium">
              20–30× faster than{" "}
              <span className="font-mono text-base">ifcopenshell.open</span>
            </span>
            . Spatial-relationship graph built in. Self-describing.
            MCP-compatible.
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
              href="https://github.com/EdvardGK/ifcfast"
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

const FEATURES = [
  {
    kicker: "Parse",
    title: "Tier-1 in milliseconds",
    body:
      "Rust core + memchr-accelerated tokenizer. 905 ms cold on an 834 MB / 14.3M-record MEP IFC. Byte-level parity vs ifcopenshell on 234K products from 5 authoring tools.",
  },
  {
    kicker: "Graph",
    title: "Spatial relationships built in",
    body:
      "m.contained_in / .aggregates / .storey_building DataFrames + seven traversal helpers. m.ancestors(wall_guid) walks storey → building → site → project in a single call.",
  },
  {
    kicker: "Diff",
    title: "Model versions, compared",
    body:
      "m.diff(other) returns added / removed / changed products, type cardinality deltas, storey elevation changes — JSON-friendly. \"What changed since v3?\" is a one-liner.",
  },
  {
    kicker: "Types",
    title: "Type-first extraction",
    body:
      "m.type_summary() emits one record per IFC entity with counts, storeys, predefined types, and sample GUIDs. Matches the abstraction your TypeBank already speaks.",
  },
  {
    kicker: "Cache",
    title: "Hot reload in tens of milliseconds",
    body:
      "Parquet cache keyed on file hash. Second open of a 200 MB IFC returns in 30 ms. Edit the file, cache invalidates. No bookkeeping.",
  },
  {
    kicker: "Agents",
    title: "MCP server, drop-in",
    body:
      "ifcfast-mcp speaks the Model Context Protocol. Claude Desktop, Cursor, ChatGPT-via-MCP — point at the server, get 18 tools and a guide resource. Zero glue code.",
  },
];

function Why() {
  return (
    <section className="border-b border-line">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 py-16 sm:py-24">
        <div className="max-w-2xl mb-12">
          <div className="text-xs uppercase tracking-wider text-muted mb-2">
            What you get
          </div>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            Built for the workflow,
            <br />
            <span className="text-muted">not the file format.</span>
          </h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-line rounded-xl overflow-hidden border border-line">
          {FEATURES.map((f) => (
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

function BenchmarkSection() {
  return (
    <section className="border-b border-line">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 py-16 sm:py-24">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-16 items-start">
          <div className="lg:col-span-5">
            <div className="text-xs uppercase tracking-wider text-muted mb-2">
              Benchmarks
            </div>
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight leading-tight">
              An order of magnitude.
              <br />
              <span className="text-muted">Sometimes two.</span>
            </h2>
            <p className="mt-5 text-muted leading-relaxed max-w-md">
              Warm-cache reads finish in tens of milliseconds. Cold parse
              on an 834 MB MEP IFC is{" "}
              <span className="font-mono text-fg">905 ms</span>. The same
              file OOMs <span className="font-mono">ifcopenshell.open</span>{" "}
              on an 8 GB box.
            </p>
            <div className="mt-6 grid grid-cols-3 gap-4 text-sm">
              <Stat label="speedup" value="20–30×" />
              <Stat label="hot reload" value="19 ms" />
              <Stat label="audit corpus" value="234K" />
            </div>
          </div>
          <div className="lg:col-span-7">
            <Benchmark />
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-l border-line pl-3">
      <div className="text-2xl font-semibold tracking-tight">{value}</div>
      <div className="text-xs uppercase tracking-wider text-muted mt-0.5">
        {label}
      </div>
    </div>
  );
}

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
              the full parse + spatial-graph + diff surface as Model
              Context Protocol tools. Add one line to your MCP client
              config and your agent can drive IFCs directly — without you
              writing any glue code.
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

const PRODUCTS_SNIPPET = `import ifcfast

m = ifcfast.open("model.ifc")

# Long-format pandas tables, lazy.
m.psets             # property sets
m.quantities        # base quantities
m.materials         # IfcMaterial / IfcMaterialLayerSet
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

const DIFF_SNIPPET = `# What changed between v1 and v2?
delta = m1.diff("model_v2.ifc")

delta["products"]
# {'added_count': 47, 'removed_count': 12,
#  'changed_count': 8, 'added': [...], ...}

delta["type_deltas"]["IfcWall"]
# {'left': 142, 'right': 148, 'delta': 6}`;

function CodeShowcase() {
  return (
    <section className="border-b border-line">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 py-16 sm:py-24">
        <div className="max-w-2xl mb-10">
          <div className="text-xs uppercase tracking-wider text-muted mb-2">
            The API
          </div>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            Pandas out. No kernel.
          </h2>
          <p className="mt-4 text-muted leading-relaxed">
            Everything is a long-format DataFrame or a JSON-friendly dict.
            Filter, join, dump to Excel. No
            <span className="font-mono"> ifcopenshell.open()</span> on the
            hot path; <span className="font-mono">ifcopenshell</span> is an{" "}
            <em>optional dev dep</em> used only for cross-checking parity in
            tests.
          </p>
        </div>
        <div className="grid lg:grid-cols-3 gap-6">
          <CodeCard kicker="Data layers" code={PRODUCTS_SNIPPET} />
          <CodeCard kicker="Spatial graph" code={GRAPH_SNIPPET} />
          <CodeCard kicker="Drift" code={DIFF_SNIPPET} />
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
            MIT · Rust core, Python API
          </span>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
          <a href="https://github.com/EdvardGK/ifcfast" target="_blank" rel="noreferrer" className="hover:text-fg">GitHub</a>
          <a href="https://pypi.org/project/ifcfast/" target="_blank" rel="noreferrer" className="hover:text-fg">PyPI</a>
          <a href="https://github.com/EdvardGK/ifcfast/blob/main/AGENTS.md" target="_blank" rel="noreferrer" className="hover:text-fg">AGENTS.md</a>
          <a href="https://github.com/EdvardGK/ifcfast/issues" target="_blank" rel="noreferrer" className="hover:text-fg">Issues</a>
          <a href="https://github.com/EdvardGK/ifcfast/blob/main/CHANGELOG.md" target="_blank" rel="noreferrer" className="hover:text-fg">Changelog</a>
        </div>
      </div>
    </footer>
  );
}
