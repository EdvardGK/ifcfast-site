/// <reference lib="webworker" />
/**
 * Web Worker: parse a dropped IFC with the ifcfast wasm core. The file
 * bytes arrive as a transferred ArrayBuffer; nothing is fetched or
 * posted anywhere — the model stays in this tab (ifcfast GH #172).
 *
 * v2 protocol (streaming):
 *   → {progress: "reading" | "parsing"}
 *   → {phase: "indexed", summary, graph, types}            // panels populate now
 *   → {phase: "batch", meta, positions, indices, progress} // geometry as it is tessellated
 *   → {phase: "done", graph, qto, bySource, stats, shift, ms}
 *   → {ok: false, error}
 * If the wasm package predates streamMeshes, falls back to the v1 glb path:
 *   → {phase: "glb", ...v1 payload}
 *
 * The wasm package is served as static files from /wasm/ (not bundled),
 * so the import below is a plain runtime URL and Turbopack leaves it alone.
 */
import type { IfcModel as IfcModelT } from "./ifcfast-wasm";

type Req = { bytes: ArrayBuffer; name: string; batch?: number };

let modPromise: Promise<{ IfcModel: typeof IfcModelT }> | null = null;

/** Ship vertex normals? No: the viewer flat-shades from screen-space
 * derivatives of the view position (GH #172 v2 perf pass), which removes both
 * this O(indices) pass from the worker's critical path and 12 bytes/vertex from
 * the transfer. Flip to `true` to A/B the old path. */
const NORMALS: boolean = false;

/** Area-weighted vertex normals (what three's computeVertexNormals does),
 * computed off the main thread. Unused while NORMALS is false. */
function vertexNormals(pos: Float32Array, idx: Uint32Array): Float32Array {
  const n = new Float32Array(pos.length);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const abx = pos[b] - pos[a], aby = pos[b + 1] - pos[a + 1], abz = pos[b + 2] - pos[a + 2];
    const acx = pos[c] - pos[a], acy = pos[c + 1] - pos[a + 1], acz = pos[c + 2] - pos[a + 2];
    const nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
    n[a] += nx; n[a + 1] += ny; n[a + 2] += nz;
    n[b] += nx; n[b + 1] += ny; n[b + 2] += nz;
    n[c] += nx; n[c + 1] += ny; n[c + 2] += nz;
  }
  for (let v = 0; v < n.length; v += 3) {
    const l = Math.hypot(n[v], n[v + 1], n[v + 2]) || 1;
    n[v] /= l; n[v + 1] /= l; n[v + 2] /= l;
  }
  return n;
}

function load() {
  if (!modPromise) {
    modPromise = (async () => {
      const base = new URL("/wasm/", self.location.origin);
      // version.json is fetched uncached and its hash pins BOTH files, so a
      // cached glue can never be paired with a newer .wasm (that mismatch
      // surfaces as "function import requires a callable").
      let v = "";
      try {
        const r = await fetch(new URL("version.json", base).href, { cache: "no-store" });
        if (r.ok) v = String((await r.json()).v ?? "");
      } catch {
        /* fall through: unpinned load */
      }
      const q = v ? `?v=${v}` : "";
      const mod = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ new URL(`ifcfast_wasm.js${q}`, base).href)) as {
        default: (o: { module_or_path: string }) => Promise<unknown>;
        IfcModel: typeof IfcModelT;
      };
      await mod.default({ module_or_path: new URL(`ifcfast_wasm_bg.wasm${q}`, base).href });
      return { IfcModel: mod.IfcModel };
    })();
  }
  return modPromise;
}

self.onmessage = async (ev: MessageEvent<Req>) => {
  const recvAt = performance.timeOrigin + performance.now();
  const { bytes, name, batch = 200 } = ev.data;
  let model: IfcModelT | null = null;
  try {
    const l0 = performance.now();
    const { IfcModel } = await load();
    const loadMs = performance.now() - l0;
    postMessage({ progress: "parsing" });
    const t0 = performance.now();
    model = IfcModel.fromBytes(new Uint8Array(bytes), name);
    const parse = performance.now() - t0;
    const canStream = typeof (model as unknown as { streamMeshes?: unknown }).streamMeshes === "function";

    if (canStream) {
      // Only the cheap extractors run before the stream. graphJson() is NOT
      // one of them: on a 35 789-product model the first call costs ~8.8 s
      // (it forces the whole product graph eagerly), and it costs a fraction
      // of that once the mesh pass has run — so it belongs after the stream,
      // where the mesh-derived quantities are ready anyway. Nothing in the
      // instrument needs the graph before geometry appears.
      const s0 = performance.now();
      const summary = model.summaryJson();
      const s1 = performance.now();
      const types = model.typesJson();
      const s2 = performance.now();
      postMessage({
        phase: "indexed",
        summary,
        types,
        ms: { parse, w: { recvAt, load: loadMs } },
      });
      const s3 = performance.now();
      const idx = { summaryJson: s1 - s0, graphJson: 0, typesJson: s2 - s1, post: s3 - s2 };
      const t1 = performance.now();
      let nBatches = 0;
      // per-phase budget — the pill's tooltip is the only place this surfaces,
      // and it is the difference between "the wasm is slow" and "we are slow"
      let cbTotal = 0, copyMs = 0, normalsMs = 0, metaMs = 0, postMs = 0;
      let vertices = 0, triangles = 0;
      model.streamMeshes(batch, (metaJson: string, positions: Float32Array, indices: Uint32Array, progressJson: string) => {
        const c0 = performance.now();
        // copy out of wasm memory — the views alias the linear memory, which
        // may grow (and relocate) during the pass.
        const p = positions.slice();
        const i = indices.slice();
        const c1 = performance.now();
        copyMs += c1 - c0;
        const n = NORMALS ? vertexNormals(p, i) : null;
        const c2 = performance.now();
        normalsMs += c2 - c1;
        const meta = JSON.parse(metaJson);
        const prog = JSON.parse(progressJson);
        const c3 = performance.now();
        metaMs += c3 - c2;
        nBatches++;
        vertices += p.length / 3;
        triangles += i.length / 3;
        const transfer = (n ? [p.buffer, i.buffer, n.buffer] : [p.buffer, i.buffer]) as ArrayBuffer[];
        postMessage({ phase: "batch", meta, positions: p, indices: i, normals: n ?? undefined, progress: prog }, transfer);
        const c4 = performance.now();
        postMs += c4 - c3;
        cbTotal += c4 - c0;
      });
      const mesh = performance.now() - t1;
      const t2 = performance.now();
      const graph = model.graphJson();
      const t3 = performance.now();
      const qto = model.qtoJson();
      const bySource = model.bySourceJson();
      const stats = model.statsJson();
      const shift = model.streamShiftJson();
      const finalMs = performance.now() - t2;
      const finalGraphMs = t3 - t2;
      postMessage({
        phase: "done",
        graph,
        qto,
        bySource,
        stats,
        shift,
        // absolute epoch ms: a dedicated worker's timeOrigin is its own creation
        // time, so raw performance.now() is NOT comparable across the boundary
        sentAt: performance.timeOrigin + performance.now(),
        ms: {
          parse,
          mesh,
          batches: nBatches,
          w: {
            recvAt,
            load: loadMs,
            idxSummary: idx.summaryJson,
            idxGraph: idx.graphJson,
            idxTypes: idx.typesJson,
            idxPost: idx.post,
            wasm: mesh - cbTotal,
            copy: copyMs,
            normals: normalsMs,
            meta: metaMs,
            post: postMs,
            final: finalMs,
            finalGraph: finalGraphMs,
            vertices,
            triangles,
          },
        },
      });
    } else {
      // v1 package: one glb for the whole model
      const summary = model.summaryJson();
      const graph = model.graphJson();
      const qto = model.qtoJson();
      const types = model.typesJson();
      const bySource = model.bySourceJson();
      const stats = model.statsJson();
      postMessage({ progress: "tessellating" });
      const t1 = performance.now();
      const glb = model.toGlb(true, false).slice().buffer;
      postMessage(
        { phase: "glb", summary, graph, qto, types, bySource, stats, glb, ms: { parse, glb: performance.now() - t1, w: { recvAt, load: loadMs } } },
        [glb],
      );
    }
  } catch (e) {
    let msg = e instanceof Error ? e.message : String(e);
    if (/requires a callable|WebAssembly\.instantiate|import #\d+/i.test(msg)) {
      msg = "stale wasm in the browser cache — reload the page and drop the file again";
      modPromise = null; // force a fresh, version-pinned load next time
    }
    postMessage({ ok: false, error: msg });
  } finally {
    try {
      model?.free();
    } catch {
      /* already freed */
    }
  }
};
