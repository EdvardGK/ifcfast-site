/// <reference lib="webworker" />
/**
 * Web Worker: parse a dropped IFC with the ifcfast wasm core. The file
 * bytes arrive as a transferred ArrayBuffer; nothing is fetched or
 * posted anywhere — the model stays in this tab (ifcfast GH #172).
 *
 * The wasm package is served as static files from /wasm/ (not bundled),
 * so the import below is a plain runtime URL and Turbopack leaves it alone.
 */
import type { IfcModel as IfcModelT } from "./ifcfast-wasm";

type Req = { bytes: ArrayBuffer; name: string };
type Ok = {
  ok: true;
  summary: string;
  graph: string;
  qto: string;
  types: string;
  bySource: string;
  stats: string;
  glb: ArrayBuffer;
  ms: { parse: number; glb: number };
};
type Fail = { ok: false; error: string };

let modPromise: Promise<{ IfcModel: typeof IfcModelT }> | null = null;

function load() {
  if (!modPromise) {
    modPromise = (async () => {
      const base = new URL("/wasm/", self.location.origin);
      // Runtime import of the wasm-bindgen glue; Turbopack must not resolve it.
      const mod = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ new URL("ifcfast_wasm.js", base).href)) as {
        default: (o: { module_or_path: string }) => Promise<unknown>;
        IfcModel: typeof IfcModelT;
      };
      await mod.default({ module_or_path: new URL("ifcfast_wasm_bg.wasm", base).href });
      return { IfcModel: mod.IfcModel };
    })();
  }
  return modPromise;
}

self.onmessage = async (ev: MessageEvent<Req>) => {
  const { bytes, name } = ev.data;
  let model: IfcModelT | null = null;
  try {
    const { IfcModel } = await load();
    postMessage({ progress: "parsing" });
    const t0 = performance.now();
    model = IfcModel.fromBytes(new Uint8Array(bytes), name);
    const summary = model.summaryJson();
    const graph = model.graphJson();
    const qto = model.qtoJson();
    const types = model.typesJson();
    const bySource = model.bySourceJson();
    const stats = model.statsJson();
    const parse = performance.now() - t0;
    postMessage({ progress: "tessellating" });
    const t1 = performance.now();
    // Baked nodes only (instancing off): model-viewer's scene-graph API
    // cannot address primitives on EXT_mesh_gpu_instancing meshes ("Mesh
    // is missing primitive index association"), and the instrument's
    // cross-filter keys on per-product GUID materials — which instanced
    // groups by design do not carry. Bigger glb, every product pickable.
    const glbView = model.toGlb(true, false);
    // copy out of wasm memory before free()
    const glb = glbView.slice().buffer;
    const glbMs = performance.now() - t1;
    const msg: Ok = { ok: true, summary, graph, qto, types, bySource, stats, glb, ms: { parse, glb: glbMs } };
    postMessage(msg, [glb]);
  } catch (e) {
    const msg: Fail = { ok: false, error: e instanceof Error ? e.message : String(e) };
    postMessage(msg);
  } finally {
    try {
      model?.free();
    } catch {
      /* already freed */
    }
  }
};
