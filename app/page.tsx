import { Suspense } from "react";

import {
  Command,
  Fig,
  Figures,
  Link,
  Note,
  Prose,
  Receipt,
  Scroller,
  Shell,
  Stamp,
} from "@/components/receipts/primitives";
import { InstrumentSection } from "@/components/receipts/instrument-section";
import { PypiBadge } from "@/components/receipts/pypi";
import {
  bytes,
  clash,
  dec,
  int,
  m3,
  mcp,
  parse,
  qto,
  write,
} from "@/components/receipts/data";

const REPO = "https://github.com/EdvardGK/ifcfast";
const ISSUES = `${REPO}/issues`;
const PYPI = "https://pypi.org/project/ifcfast/";
const AGENTS = `${REPO}/blob/main/AGENTS.md`;

export default function Home() {
  return (
    <>
      <Masthead />
      <main id="main">
        <Hero />
        <Speed />
        <Federation />
        <Quantities />
        <Writing />
        <Agents />
        <Status />
      </main>
      <Footer />
    </>
  );
}

/* ------------------------------------------------------------------ */

function Masthead() {
  return (
    <header className="border-b border-rule">
      <Shell>
        <div className="flex items-center justify-between gap-4 py-3">
          <span className="text-[0.9375rem] font-semibold tracking-[-0.01em]">
            ifcfast
          </span>
          <nav className="flex items-center gap-3 text-[0.8125rem] text-ink-2">
            <Suspense fallback={null}>
              <PypiBadge />
            </Suspense>
            <a className="hover:text-ink" href={AGENTS} target="_blank" rel="noreferrer">
              Agent guide
            </a>
            <a className="hover:text-ink" href={REPO} target="_blank" rel="noreferrer">
              Source
            </a>
          </nav>
        </div>
      </Shell>
    </header>
  );
}

/* ------------------------------------------------------------------ */

function Hero() {
  const arch = parse.models[0];
  return (
    <section className="border-b border-rule">
      <Shell>
        <div className="pt-12 pb-14 sm:pt-20 sm:pb-20">
          <div className="lg:flex lg:items-start lg:justify-between lg:gap-12">
            <h1 className="max-w-[16ch] text-[2rem] leading-[1.08] font-semibold tracking-[-0.03em] sm:max-w-[20ch] sm:text-[3.25rem]">
              An IFC parser that shows its working.
            </h1>
            <p className="num hidden shrink-0 text-right text-[0.6875rem] leading-[1.9] text-ink-3 lg:block">
              buildingSMART Medical-Dental Clinic
              <br />
              {parse.models.length} discipline models, {arch.schema}
              <br />
              {parse.license}
            </p>
          </div>

          <div className="mt-6 max-w-[38rem] space-y-4 text-[1rem] leading-[1.6] text-ink-2 sm:text-[1.0625rem]">
            <p>
              ifcfast reads IFC into pandas, meshes and point clouds, and writes
              surgical edits back out as valid IFC. A Rust core does the reading;
              there is no geometry kernel on the hot path.
            </p>
            <p>
              Every number on this page was measured on one real building — the
              buildingSMART Medical-Dental Clinic, all five discipline models — and
              every section carries the command that reproduces it.
            </p>
          </div>

          <div className="mt-9">
            <Figures>
              <Fig value={dec(parse.total_size_mb, 1)} unit="MB" label="IFC read" />
              <Fig value={int(parse.total_products)} label="products indexed" />
              <Fig
                value={dec(parse.total_open_cold_s, 2)}
                unit="s"
                label="to open all five, cold"
              />
              <Fig
                value={String(parse.models.length)}
                label="discipline models"
                note={`${arch.schema}, ${parse.license}`}
              />
            </Figures>
          </div>

          <Command shell>{"pip install ifcfast"}</Command>
          <Command>{parse.command}</Command>
          <Stamp generated={parse.generated} values={parse.values} file="receipts/parse.json" />
        </div>
      </Shell>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function Speed() {
  const slowest = [...parse.models].sort((a, b) => b.bundle_s - a.bundle_s)[0];
  const biggest = [...parse.models].sort((a, b) => b.size_mb - a.size_mb)[0];
  return (
    <Receipt
      id="speed"
      claim="Opening a model is not the part you wait for."
      source="five models, cold cache"
    >
      <Prose>
        <p>
          <strong>ifcfast.open()</strong> builds the tier-1 index — products, storeys,
          the spatial graph — straight from the STEP data section. The largest model
          here is {dec(biggest.size_mb, 1)} MB and opens in{" "}
          {dec(biggest.open_cold_s, 3)} s.
        </p>
        <p>
          Geometry is the cost, and it is charged separately.{" "}
          <strong>bundle()</strong> tessellates every product and writes the parquet
          substrate; on {slowest.discipline} that is {dec(slowest.bundle_s, 2)} s for{" "}
          {int(slowest.products)} products. The second open of a file reuses the cache.
        </p>
      </Prose>

      {/* phone: the two numbers that matter, per model */}
      <ul className="mt-7 border-t border-rule sm:hidden">
        {parse.models.map((m) => (
          <li
            key={m.file}
            className="grid grid-cols-2 gap-x-4 gap-y-1 border-b border-rule py-3"
          >
            <span className="col-span-2 text-[0.9375rem] font-medium">
              {m.discipline}
              <span className="num ml-2 text-[0.75rem] font-normal text-ink-3">
                {dec(m.size_mb, 1)} MB, {int(m.products)} products
              </span>
            </span>
            <span className="num text-[1.125rem]">
              {dec(m.open_cold_s, 3)}
              <span className="ml-1 text-[0.75rem] text-ink-3">s open</span>
            </span>
            <span className="num text-[1.125rem]">
              {dec(m.bundle_s, 2)}
              <span className="ml-1 text-[0.75rem] text-ink-3">s bundle</span>
            </span>
          </li>
        ))}
      </ul>

      {/* wider: the full receipt */}
      <div className="mt-7 hidden sm:block">
        <Scroller minWidth="42rem">
          <table className="w-full border-collapse text-[0.875rem]">
            <thead>
              <tr className="border-y border-rule text-left text-[0.75rem] text-ink-3">
                <th className="py-2 pr-4 font-normal">Model</th>
                <th className="py-2 pr-4 font-normal">Schema</th>
                <th className="py-2 pr-4 text-right font-normal">MB</th>
                <th className="py-2 pr-4 text-right font-normal">Products</th>
                <th className="py-2 pr-4 text-right font-normal">Storeys</th>
                <th className="py-2 pr-4 text-right font-normal">Unit</th>
                <th className="py-2 pr-4 text-right font-normal">open (s)</th>
                <th className="py-2 text-right font-normal">bundle (s)</th>
              </tr>
            </thead>
            <tbody>
              {parse.models.map((m) => (
                <tr key={m.file} className="border-b border-rule">
                  <td className="py-2.5 pr-4 font-medium">{m.discipline}</td>
                  <td className="num py-2.5 pr-4 text-ink-2">{m.schema}</td>
                  <td className="num py-2.5 pr-4 text-right">{dec(m.size_mb, 1)}</td>
                  <td className="num py-2.5 pr-4 text-right">{int(m.products)}</td>
                  <td className="num py-2.5 pr-4 text-right text-ink-2">{m.storeys}</td>
                  <td className="num py-2.5 pr-4 text-right text-ink-2">{m.unit}</td>
                  <td className="num py-2.5 pr-4 text-right">
                    {dec(m.open_cold_s, 3)}
                  </td>
                  <td className="num py-2.5 text-right">{dec(m.bundle_s, 2)}</td>
                </tr>
              ))}
              <tr>
                <td className="py-2.5 pr-4 font-medium">All five</td>
                <td />
                <td className="num py-2.5 pr-4 text-right">
                  {dec(parse.total_size_mb, 1)}
                </td>
                <td className="num py-2.5 pr-4 text-right">
                  {int(parse.total_products)}
                </td>
                <td colSpan={2} />
                <td className="num py-2.5 pr-4 text-right">
                  {dec(parse.total_open_cold_s, 2)}
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </Scroller>
      </div>

      <Command shell>{"ifcfast index Clinic_HVAC.ifc --json"}</Command>
      <Note>
        Two of these models are authored in millimetres and three in metres. ifcfast
        records the project unit as parquet metadata and converts at read time, so the
        numbers above are comparable without anyone rescaling anything first.
      </Note>
      <Stamp generated={parse.generated} values={parse.values} file="receipts/parse.json" />
    </Receipt>
  );
}

/* ------------------------------------------------------------------ */

function Federation() {
  const cats = Object.entries(clash.by_category);
  const total = cats.reduce((a, [, n]) => a + n, 0) || 1;
  const recall = clash.oracle.pair_recall;
  const found = recall.reduce((a, [f]) => a + f, 0);
  const truth = recall.reduce((a, [, t]) => a + t, 0);

  return (
    <Receipt
      id="federation"
      claim="Five discipline models, one substrate, one clash list."
      source="federate() then clash(), no re-parse"
    >
      <Prose>
        <p>
          <strong>federate()</strong> merges the five parquet bundles into one
          substrate — a columnar merge, no re-parse and no geometry work. Passing the
          list straight to <strong>clash()</strong> does it for you and caches the
          merge on content, so it is paid once.
        </p>
        <p>
          The engine reports facts and nothing else: which pairs touch, by how much,
          and which of four semantic buckets each falls in. Deciding what is
          actionable — what to hide, whom to route it to, what becomes a BCF topic — is
          the caller&apos;s job, not the parser&apos;s.
        </p>
      </Prose>

      <div className="mt-8">
        <Figures>
          <Fig value={dec(clash.federate_s, 1)} unit="s" label="to federate" />
          <Fig value={dec(clash.clash_s, 1)} unit="s" label="to clash" />
          <Fig value={int(clash.pairs_total)} label="pairs found" />
          <Fig
            value={int(clash.pairs_cross_model)}
            label="cross-discipline"
            note={`${dec((clash.pairs_cross_model / clash.pairs_total) * 100, 0)}% of the list`}
          />
        </Figures>
      </div>

      <div className="mt-8 max-w-[34rem]">
        <p className="text-[0.75rem] text-ink-3">
          category, the column that makes the list readable
        </p>
        <table className="mt-2 w-full border-collapse text-[0.875rem]">
          <tbody>
            {cats.map(([name, n]) => (
              <tr key={name} className="border-b border-rule">
                <td className="num py-2 pr-3 text-ink-2">{name}</td>
                <td className="w-[45%] py-2 pr-3">
                  <span className="block h-[6px] bg-paper-3">
                    <span
                      className="block h-full bg-ink-2"
                      style={{ width: `${(n / total) * 100}%` }}
                    />
                  </span>
                </td>
                <td className="num py-2 text-right">{int(n)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Note>
        Only the <span className="num">clash</span> bucket is a coordination problem.
        Insulation over its own pipe, a fitting meeting its own run, and hits against
        grids and spaces are all real intersections and all noise — so they are
        labelled rather than dropped.
      </Note>

      <Command>{clash.command}</Command>

      <div className="mt-9 max-w-[38rem] border-t border-rule pt-6">
        <p className="text-[0.9375rem] leading-[1.65] text-ink-2">
          Against Solibri as ground truth on {clash.oracle.rounds} version-matched
          rounds of {clash.oracle.project}, ifcfast finds{" "}
          <strong className="font-medium text-ink">
            {found} of the {truth} clash pairs
          </strong>{" "}
          Solibri reports, and both misses are attributed. The truth set is{" "}
          {clash.oracle.truth}.
        </p>
      </div>

      <Stamp generated={clash.generated} values={clash.values} file="receipts/clash.json" />

      <div className="mt-12 border-t border-rule pt-8">
        <h3 className="text-[1.125rem] font-semibold tracking-[-0.015em]">
          The same substrate, as an instrument
        </h3>
        <p className="mt-2 max-w-[38rem] text-[0.9375rem] leading-[1.65] text-ink-2">
          One floor of all five models, carved with <strong>subset()</strong> and
          exported with <strong>to_gltf()</strong>. Tap a product to pull its receipt —
          class, discipline, storey, volume, and whether that volume is trustworthy — or
          tap a storey, class or material to filter everything else. Geometry loads
          only when you ask for it, one discipline at a time.
        </p>
      </div>
      <InstrumentSection src="/receipts/model/instrument.json" />
    </Receipt>
  );
}

/* ------------------------------------------------------------------ */

function Quantities() {
  const rows = qto.classes;
  const agree = rows.filter((r) => Math.abs(r.ratio - 1) <= 0.01).length;
  return (
    <Receipt
      id="quantities"
      claim="Volumes, printed next to the kernel that checks them."
      source={`${qto.model} vs ifcopenshell ${qto.ifcopenshell_version}`}
    >
      <Prose>
        <p>
          <strong>mesh_qto()</strong> quantified {int(qto.products)} products in{" "}
          {dec(qto.mesh_qto_s, 2)} s. Every row carries a{" "}
          <strong>volume_reliable</strong> flag:{" "}
          {dec(qto.volume_reliable_share * 100, 1)}% of rows are the mesh volume and
          trustworthy; the rest fall back to a prism bound and are meant to be sent
          somewhere authoritative.
        </p>
        <p>
          Below is every class in the architectural model beside the same class
          measured by ifcopenshell. {agree} of {rows.length} classes agree within one
          percent. The ones that do not are in the table too.
        </p>
      </Prose>

      {/* phone: the comparison, two columns, nothing hidden off-screen */}
      <ul className="mt-7 border-t border-rule sm:hidden">
        {rows.map((r) => {
          const off = Math.abs(r.ratio - 1) > 0.01;
          return (
            <li
              key={r.entity}
              className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 border-b border-rule py-3"
            >
              <span className="text-[0.9375rem] font-medium">{r.entity}</span>
              <span
                className={`num text-[1.125rem] ${off ? "text-ink" : "text-ink-2"}`}
              >
                {dec(r.ratio, 4)}
              </span>
              <span className="num mt-1 text-[0.75rem] text-ink-3">
                {int(r.n)} elements
              </span>
              <span className="mt-1 text-[0.6875rem] text-ink-3">ratio</span>
              <span className="num col-span-2 mt-1.5 text-[0.75rem] text-ink-2">
                ifcfast {m3(r.ifcfast_m3)} m³ &nbsp;/&nbsp; ifcopenshell{" "}
                {m3(r.ifcopenshell_m3)} m³
              </span>
              {(r.open_shell > 0 || r.reference_exceeds_aabb > 0) && (
                <span className="num col-span-2 mt-1 text-[0.75rem] text-ink-3">
                  {r.open_shell > 0 && <>open shell {int(r.open_shell)}</>}
                  {r.open_shell > 0 && r.reference_exceeds_aabb > 0 && <> &nbsp;/&nbsp; </>}
                  {r.reference_exceeds_aabb > 0 && (
                    <>ref &gt; aabb {int(r.reference_exceeds_aabb)}</>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {/* wider: the full receipt */}
      <div className="mt-7 hidden sm:block">
        <Scroller minWidth="46rem">
          <table className="w-full border-collapse text-[0.875rem]">
            <thead>
              <tr className="border-y border-rule text-left text-[0.75rem] text-ink-3">
                <th className="py-2 pr-4 font-normal">Class</th>
                <th className="py-2 pr-4 text-right font-normal">n</th>
                <th className="py-2 pr-4 text-right font-normal">ifcfast m³</th>
                <th className="py-2 pr-4 text-right font-normal">ifcopenshell m³</th>
                <th className="py-2 pr-4 text-right font-normal">ratio</th>
                <th className="py-2 pr-4 text-right font-normal">open shell</th>
                <th className="py-2 text-right font-normal">ref &gt; aabb</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const off = Math.abs(r.ratio - 1) > 0.01;
                return (
                  <tr key={r.entity} className="border-b border-rule">
                    <td className="py-2.5 pr-4 font-medium whitespace-nowrap">
                      {r.entity}
                    </td>
                    <td className="num py-2.5 pr-4 text-right text-ink-2">
                      {int(r.n)}
                    </td>
                    <td className="num py-2.5 pr-4 text-right">{m3(r.ifcfast_m3)}</td>
                    <td className="num py-2.5 pr-4 text-right">
                      {m3(r.ifcopenshell_m3)}
                    </td>
                    <td
                      className={`num py-2.5 pr-4 text-right ${
                        off ? "font-medium text-ink" : "text-ink-2"
                      }`}
                    >
                      {dec(r.ratio, 4)}
                    </td>
                    <td className="num py-2.5 pr-4 text-right text-ink-2">
                      {r.open_shell || "—"}
                    </td>
                    <td className="num py-2.5 text-right text-ink-2">
                      {r.reference_exceeds_aabb || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Scroller>
      </div>

      <Note>
        <strong className="font-medium text-ink">open shell</strong> counts elements
        whose mesh is not watertight.{" "}
        <strong className="font-medium text-ink">ref &gt; aabb</strong>{" "}
        counts elements
        where the ifcopenshell volume is larger than the element&apos;s own bounding box
        — a volume no solid inside that box can have. Both columns are published
        because a difference is not the same thing as an error, and the table is
        regenerated on every release rather than curated.
      </Note>

      <Command>{qto.command}</Command>
      <Note>
        The flagged rows are the routing target: run ifcfast over everything, send the{" "}
        <span className="num">volume_reliable = false</span> rows to ifcopenshell or
        Solibri, and keep the speed everywhere else.{" "}
        <Link href={`${REPO}/blob/main/examples/hybrid_qto_routing.py`}>
          examples/hybrid_qto_routing.py
        </Link>{" "}
        is that loop, written out.
      </Note>
      <Stamp generated={qto.generated} values={qto.values} file="receipts/qto.json" />
    </Receipt>
  );
}

/* ------------------------------------------------------------------ */

function Writing() {
  return (
    <Receipt
      id="write"
      claim="It writes IFC back, and touches nothing you did not name."
      source={write.model}
    >
      <Prose>
        <p>
          Three write primitives. <strong>subset()</strong> carves a valid standalone
          IFC of the elements you name, pulling in their geometry, placements,
          materials, styles and the spatial spine up to IfcProject.{" "}
          <strong>hotswap()</strong>{" "}
          replaces one element&apos;s body mesh and garbage
          collects only what that element uniquely owned. <strong>mutate()</strong>{" "}
          batch-edits property values, names and placements, atomically.
        </p>
        <p>
          The invariant underneath all three: subsetting every element of a file
          reproduces that file byte for byte. Outside the records an operation actually
          changes, the output is identical to the input — which is what makes a diff of
          the result readable.
        </p>
      </Prose>

      <div className="mt-8">
        <Figures>
          <Fig
            value={int(write.subset.products_out)}
            label={`products carved from ${write.subset.storey}`}
            note={bytes(write.subset.bytes_out)}
          />
          <Fig
            value={dec(write.subset.seconds, 2)}
            unit="s"
            label="to write the subset"
          />
          <Fig
            value={dec(write.hotswap.seconds, 2)}
            unit="s"
            label="to swap one body mesh"
            note={write.hotswap.class}
          />
          <Fig
            value={String(write.mutate.ops)}
            label="attribute edits, one emit"
            note={`${write.mutate.placements_cloned} placements cloned`}
          />
        </Figures>
      </div>

      <Command>{write.command}</Command>
      <Note>
        Schema-aware on the way out: IFC4 files get an IfcTriangulatedFaceSet, IFC2x3
        files get an IfcShellBasedSurfaceModel, and either reopens in ifcopenshell with
        no dangling references. Shared property sets and placements are copied on
        write, so editing one wall does not quietly edit its siblings.
      </Note>
      <Stamp generated={write.generated} values={write.values} file="receipts/write.json" />
    </Receipt>
  );
}

/* ------------------------------------------------------------------ */

function Agents() {
  const config = JSON.stringify(mcp.config, null, 2);
  return (
    <Receipt
      id="agents"
      claim="It is an MCP server, so an agent needs no integration code."
      source={`${mcp.tools} tools`}
    >
      <Prose>
        <p>
          Point Claude Desktop, Cursor, or any MCP client at ifcfast and it can open a
          model, walk the spatial tree, and answer a property question in one round
          trip. Every tool that returns rows caps its output at{" "}
          {mcp.row_limit_default} by default, so a query against a large model returns
          a page rather than the model.
        </p>
      </Prose>

      <Command label="mcp config">{config}</Command>

      <dl className="mt-7 grid grid-cols-1 gap-x-8 border-t border-rule sm:grid-cols-2">
        {Object.entries(mcp.groups).map(([group, tools]) => (
          <div key={group} className="border-b border-rule py-3">
            <dt className="text-[0.8125rem] font-medium">{group}</dt>
            <dd className="num mt-1 text-[0.75rem] leading-[1.7] break-words text-ink-2">
              {tools.join("  ")}
            </dd>
          </div>
        ))}
      </dl>

      <Note>
        The server also publishes <span className="num">{mcp.resource}</span> — the full
        agent guide, served from the installed wheel, so a client can read the API
        contract instead of guessing at it. Its model cache holds {mcp.model_cache}{" "}
        files and re-opens any that changed on disk between calls.
      </Note>
      <Stamp generated={mcp.generated} values={mcp.values} file="receipts/mcp.json" />
    </Receipt>
  );
}

/* ------------------------------------------------------------------ */

function Status() {
  return (
    <Receipt
      id="status"
      claim="Experimental. Check it against a kernel before you trust it."
    >
      <Prose>
        <p>
          ifcfast is under active development and is not validated against established
          tools across the board. Geometric quantities are the highest-risk surface:
          open shells, non-watertight surface models and complex booleans can be
          silently wrong. Cross-check anything you are going to act on against
          ifcopenshell or Solibri.
        </p>
        <p>
          It complements ifcopenshell rather than replacing it — ifcopenshell owns the
          geometry kernels, the schema and authoring. When you find a discrepancy, the
          report worth sending names the file, the GUID, expected versus actual, and
          which tool you compared against.
        </p>
      </Prose>

      <Command shell>{"pip install ifcfast"}</Command>

      <p className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[0.9375rem]">
        <Link href={REPO}>Source on GitHub</Link>
        <Link href={PYPI}>ifcfast on PyPI</Link>
        <Link href={AGENTS}>Agent guide</Link>
        <Link href={ISSUES}>Report a discrepancy</Link>
      </p>
    </Receipt>
  );
}

/* ------------------------------------------------------------------ */

function Footer() {
  return (
    <footer className="border-t border-rule bg-paper-2">
      <Shell>
        <div className="space-y-3 py-10 text-[0.8125rem] leading-[1.65] text-ink-2">
          <p className="max-w-[46rem]">
            The building measured throughout this page is the Medical-Dental Clinic
            sample dataset published by buildingSMART International, used under{" "}
            <Link href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</Link>.
            The First Floor of each discipline model was carved with{" "}
            <span className="num">subset()</span> and exported with{" "}
            <span className="num">to_gltf()</span> for the viewer; no geometry was
            authored or edited. buildingSMART does not endorse ifcfast.
          </p>
          <p className="text-ink-3">
            ifcfast is MIT licensed. Built by Edvard Granskogen Kjorstad.
          </p>
        </div>
      </Shell>
    </footer>
  );
}
