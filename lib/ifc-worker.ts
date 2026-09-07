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

/** Area-weighted vertex normals (what three's computeVertexNormals does),
 * computed off the main thread. */
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
  const { bytes, name, batch = 200 } = ev.data;
  let model: IfcModelT | null = null;
  try {
    const { IfcModel } = await load();
    postMessage({ progress: "parsing" });
    const t0 = performance.now();
    model = IfcModel.fromBytes(new Uint8Array(bytes), name);
    const parse = performance.now() - t0;
    const canStream = typeof (model as unknown as { streamMeshes?: unknown }).streamMeshes === "function";

    if (canStream) {
      postMessage({
        phase: "indexed",
        summary: model.summaryJson(),
        graph: model.graphJson(),
        types: model.typesJson(),
        ms: { parse },
      });
      const t1 = performance.now();
      let nBatches = 0;
      model.streamMeshes(batch, (metaJson: string, positions: Float32Array, indices: Uint32Array, progressJson: string) => {
        // copy out of wasm memory — the views alias the linear memory, which
        // may grow (and relocate) during the pass. Parse the meta and compute
        // the normals HERE so the main thread only uploads to the GPU.
        const p = positions.slice();
        const i = indices.slice();
        const n = vertexNormals(p, i);
        nBatches++;
        postMessage(
          { phase: "batch", meta: JSON.parse(metaJson), positions: p, indices: i, normals: n, progress: JSON.parse(progressJson) },
          [p.buffer, i.buffer, n.buffer],
        );
      });
      const mesh = performance.now() - t1;
      postMessage({
        phase: "done",
        graph: model.graphJson(),
        qto: model.qtoJson(),
        bySource: model.bySourceJson(),
        stats: model.statsJson(),
        shift: model.streamShiftJson(),
        ms: { parse, mesh, batches: nBatches },
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
        { phase: "glb", summary, graph, qto, types, bySource, stats, glb, ms: { parse, glb: performance.now() - t1 } },
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
