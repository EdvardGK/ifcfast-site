"use client";
/**
 * StreamViewer — the instrument's viewport for a dropped model (ifcfast
 * GH #172 v2). Geometry arrives from the worker in batches while the
 * wasm core is still tessellating; each batch becomes ONE draw call
 * (merged positions + a per-vertex RGBA attribute), so a 17 000-product
 * MEP model is ~90 draw calls instead of 17 000. Every product keeps a
 * (batch, vertex range, index range) entry, which is what highlighting,
 * ghosting and click-to-select key on — no material names involved.
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Batch, ProductMeta, StreamStore } from "@/lib/stream-store";

export type StreamHighlight =
  | { mode: "storey"; value: string }
  | { mode: "entity"; value: string; storeyScope?: string }
  | { mode: "type"; value: string; storeyScope?: string }
  | null;

const ACCENT: [number, number, number, number] = [1.0, 0.561, 0.227, 1.0];
/** the tapped product — brighter than the filter accent, on top of whatever filter is active */
const PICK: [number, number, number, number] = [1.0, 0.92, 0.72, 1.0];
const DIM: [number, number, number, number] = [0.3, 0.32, 0.36, 0.06];
const HIDE: [number, number, number, number] = [0, 0, 0, 0];
const GHOST_ENTITIES = new Set(["ifcspace", "ifcopeningelement"]);

// No normal attribute: the face normal is recovered per-fragment from the
// screen-space derivatives of the view-space position (WebGL2 core). That
// removes the worker's O(indices) vertex-normal pass from the critical path
// AND 12 bytes/vertex from both the postMessage transfer and the GPU upload.
// The lighting term is byte-for-byte the one the smooth path used, evaluated
// on the flat face normal — same hemisphere-ish lambert, same amber palette.
const VERT = `
attribute vec4 color;
varying vec4 vColor;
varying vec3 vView;
void main() {
  vColor = color;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
precision highp float;
varying vec4 vColor;
varying vec3 vView;
void main() {
  if (vColor.a <= 0.001) discard;
  // cross(dFdx, dFdy) of the view position always points back at the eye, so
  // this is inherently two-sided — which is what DoubleSide geometry wants.
  vec3 n = normalize(cross(dFdx(vView), dFdy(vView)));
  // hemisphere-ish lambert: sky from above, warm bounce from below
  float up = dot(n, normalize(vec3(0.35, 0.9, 0.25)));
  float light = 0.55 + 0.45 * clamp(up, -1.0, 1.0) * 0.5 + 0.25;
  gl_FragColor = vec4(vColor.rgb * light, vColor.a);
}`;

type BatchGpu = {
  mesh: THREE.Mesh;
  geom: THREE.BufferGeometry;
  color: THREE.BufferAttribute;
  meta: ProductMeta[];
  i0s: number[]; // sorted index offsets for pick lookup
};

function storeyMatch(m: ProductMeta, value: string) {
  return value === "UNPLACED" ? m.storey_guid == null : m.storey_guid === value;
}

/** true when the product is inside the active filter (or there is no filter) */
function inFilter(m: ProductMeta, hl: StreamHighlight): boolean {
  if (!hl) return true;
  if (hl.mode === "storey") return storeyMatch(m, hl.value);
  if (hl.mode === "entity")
    return m.entity.toLowerCase() === hl.value.toLowerCase() && (hl.storeyScope ? storeyMatch(m, hl.storeyScope) : true);
  return (m.type_name ?? "—") === hl.value && (hl.storeyScope ? storeyMatch(m, hl.storeyScope) : true);
}

function targetColor(m: ProductMeta, hl: StreamHighlight, ghost: boolean, picked: string | null): [number, number, number, number] {
  const isGhostEntity = GHOST_ENTITIES.has(m.entity.toLowerCase());
  if (!ghost && isGhostEntity) return HIDE;
  if (picked && m.guid === picked) return PICK; // a pick sits on top of the filter, never replaces it
  if (!hl) return m.rgba;
  if (inFilter(m, hl)) return ACCENT;
  return ghost ? DIM : HIDE;
}

export function StreamViewer({
  store,
  highlight,
  ghost,
  picked = null,
  onPick,
}: {
  store: StreamStore;
  highlight: StreamHighlight;
  ghost: boolean;
  /** guid of the tapped product (selection within the filter) */
  picked?: string | null;
  onPick?: (meta: ProductMeta | null) => void;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const gpuRef = useRef<BatchGpu[]>([]);
  const hlRef = useRef<{ hl: StreamHighlight; ghost: boolean; picked: string | null }>({ hl: highlight, ghost, picked });
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);

  // restyle on highlight / ghost / pick change — rewrite the RGBA attribute per product range
  useEffect(() => {
    hlRef.current = { hl: highlight, ghost, picked };
    for (const b of gpuRef.current) paint(b, highlight, ghost, picked);
  }, [highlight, ghost, picked]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 5000);
    camera.position.set(30, 25, 30);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: true,
    });
    materialRef.current = material;
    // Z-up IFC → Y-up three
    const root = new THREE.Group();
    root.rotation.x = -Math.PI / 2;
    scene.add(root);
    // root never moves again: bake its world matrix once, while it is childless,
    // so a batch can derive its own without re-walking the group
    root.updateMatrixWorld(true);
    root.matrixAutoUpdate = false;

    const bbox = new THREE.Box3();
    let fitTarget: { center: THREE.Vector3; radius: number } | null = null;
    // where the camera was when the fit started — the animation interpolates
    // from here to the wanted pose so it CONVERGES, whatever the refit rate
    const fitFrom = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
    let fitLerp = 1;

    let lastRefit = 0;
    const refit = (force = false) => {
      if (bbox.isEmpty()) return;
      // the camera fit is an animation, not a per-batch duty: re-aiming it
      // 179 times in 8 s is both wasted work and visible jitter
      const now = performance.now();
      if (!force && now - lastRefit < 120) return;
      lastRefit = now;
      const wb = bbox.clone().applyMatrix4(root.matrixWorld);
      const center = wb.getCenter(new THREE.Vector3());
      const radius = Math.max(wb.getSize(new THREE.Vector3()).length() / 2, 0.5);
      fitTarget = { center, radius };
      fitFrom.pos.copy(camera.position);
      fitFrom.target.copy(controls.target);
      fitLerp = 0;
    };

    const addBatch = (b: Batch) => {
      const a0 = performance.now();
      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.BufferAttribute(b.positions, 3));
      geom.setIndex(new THREE.BufferAttribute(b.indices, 1));
      // colour is a normalized Uint8 RGBA: 4 bytes/vertex instead of 16, and
      // paint() writes bytes. It is re-uploaded on every filter change, so its
      // size matters more than the position buffer's.
      const color = new THREE.BufferAttribute(new Uint8Array((b.positions.length / 3) * 4), 4, true);
      color.setUsage(THREE.DynamicDrawUsage);
      geom.setAttribute("color", color);
      const mesh = new THREE.Mesh(geom, material);
      mesh.frustumCulled = true;
      mesh.matrixAutoUpdate = false; // batches are static once uploaded
      root.add(mesh);
      // root's world matrix is already baked; root.updateMatrixWorld(true) here
      // would re-walk every earlier batch, which is O(n²) across the stream
      mesh.updateMatrixWorld(true);
      geom.computeBoundingBox();
      if (geom.boundingBox) bbox.union(geom.boundingBox);
      const gpu: BatchGpu = { mesh, geom, color, meta: b.meta, i0s: b.meta.map((m) => m.i0) };
      gpuRef.current.push(gpu);
      const a1 = performance.now();
      paint(gpu, hlRef.current.hl, hlRef.current.ghost, hlRef.current.picked);
      const a2 = performance.now();
      refit();
      const a3 = performance.now();
      store.stats.upload += a1 - a0;
      store.stats.paint += a2 - a1;
      store.stats.refit += a3 - a2;
      // debug surface for automation: batch count + bounds + camera distance
      el.dataset.batches = String(gpuRef.current.length);
      el.dataset.bbox = bbox.isEmpty() ? "" : [bbox.min.x, bbox.min.y, bbox.min.z, bbox.max.x, bbox.max.y, bbox.max.z].map((v) => v.toFixed(2)).join(",");
    };
    const unsub = store.subscribe((b) => {
      if (disposed) return;
      if (b) addBatch(b);
      else refit(true); // last batch in: one final, unthrottled fit
    });

    // click-to-select: a click is a pointerdown/up pair that did not drag
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let downAt: [number, number] | null = null;
    const onDown = (e: PointerEvent) => {
      downAt = [e.clientX, e.clientY];
    };
    const onUp = (e: PointerEvent) => {
      if (!downAt) return;
      const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
      downAt = null;
      if (moved > 4 || !onPick) return;
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hits = ray.intersectObjects(gpuRef.current.map((g) => g.mesh), false); // nearest first
      const { hl, ghost: gh } = hlRef.current;
      let fallback: ProductMeta | null = null;
      for (const h of hits) {
        const gpu = gpuRef.current.find((g) => g.mesh === h.object);
        if (!gpu || h.faceIndex == null) continue;
        const idx = h.faceIndex * 3;
        // binary search the product whose index range holds this face
        let lo = 0, hi = gpu.i0s.length - 1;
        while (lo < hi) {
          const mid = (lo + hi + 1) >> 1;
          if (gpu.i0s[mid] <= idx) lo = mid;
          else hi = mid - 1;
        }
        const m = gpu.meta[lo];
        // spaces / openings are context, never a pick target — the translucent room
        // volume around everything would otherwise win every click
        if (GHOST_ENTITIES.has(m.entity.toLowerCase())) continue;
        // With a filter active, the first product INSIDE the filter along the
        // ray wins — ghosted ones in front are see-through and must not steal
        // the click. Without a filter, the nearest product wins.
        if (inFilter(m, hl)) {
          onPick(m);
          return;
        }
        if (!fallback && gh) fallback = m; // a ghosted product, only if nothing in-filter is behind it
      }
      onPick(fallback);
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);
    // debug surface for automation: raw raycast at a canvas fraction
    (el as unknown as { __debugPick?: (fx: number, fy: number) => unknown }).__debugPick = (fx, fy) => {
      ndc.set(fx * 2 - 1, -(fy * 2) + 1);
      ray.setFromCamera(ndc, camera);
      const meshes = gpuRef.current.map((g) => g.mesh);
      const hits = ray.intersectObjects(meshes, false);
      const m0 = meshes[0];
      return {
        meshes: meshes.length,
        hits: hits.length,
        first: hits[0] ? { dist: hits[0].distance, face: hits[0].faceIndex } : null,
        camPos: camera.position.toArray().map((v) => +v.toFixed(1)),
        target: controls.target.toArray().map((v) => +v.toFixed(1)),
        near: camera.near,
        far: camera.far,
        rayDir: ray.ray.direction.toArray().map((v) => +v.toFixed(3)),
        m0: m0 ? { bs: m0.geometry.boundingSphere ? [m0.geometry.boundingSphere.radius, ...m0.geometry.boundingSphere.center.toArray().map((v) => +v.toFixed(1))] : null, worldPos: m0.getWorldPosition(new THREE.Vector3()).toArray().map((v) => +v.toFixed(1)), side: (m0.material as THREE.Material).side } : null,
        probe: m0 ? probeMesh(m0) : null,
        i0sSorted: gpuRef.current.every((g) => g.i0s.every((v, i, a) => i === 0 || a[i - 1] <= v)),
        i0sSample: gpuRef.current[0]?.i0s.slice(0, 8),
        vnSample: gpuRef.current[0]?.meta.slice(0, 8).map((m) => [m.v0, m.vn, m.i0, m.in]),
        // what the click handler would resolve for the nearest hit at this ray
        resolve: (() => {
          for (const h of hits) {
            const gpu = gpuRef.current.find((g) => g.mesh === h.object);
            if (!gpu || h.faceIndex == null) continue;
            const idx = h.faceIndex * 3;
            let lo = 0, hi = gpu.i0s.length - 1;
            while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (gpu.i0s[mid] <= idx) lo = mid; else hi = mid - 1; }
            const m = gpu.meta[lo];
            // brute-force check: which product's [i0, i0+in) actually contains idx?
            const truth = gpu.meta.find((x) => idx >= x.i0 && idx < x.i0 + x.in);
            return { faceIdx: idx, bs: m.guid, bsEntity: m.entity, truth: truth?.guid ?? null, truthEntity: truth?.entity ?? null, same: truth?.guid === m.guid };
          }
          return null;
        })(),
      };
    };
    // deeper probe: world sphere/box tests + a vertex projected to screen + a direct hit test on that vertex
    const probeMesh = (m: THREE.Mesh) => {
      const g = m.geometry;
      if (!g.boundingSphere) g.computeBoundingSphere();
      if (!g.boundingBox) g.computeBoundingBox();
      const ws = g.boundingSphere!.clone().applyMatrix4(m.matrixWorld);
      const wb = g.boundingBox!.clone().applyMatrix4(m.matrixWorld);
      const pos = g.getAttribute("position") as THREE.BufferAttribute;
      const v = new THREE.Vector3().fromBufferAttribute(pos, Math.floor(pos.count / 2)).applyMatrix4(m.matrixWorld);
      const p = v.clone().project(camera);
      const fx = (p.x + 1) / 2, fy = (1 - p.y) / 2;
      const r2 = new THREE.Raycaster();
      r2.setFromCamera(new THREE.Vector2(p.x, p.y), camera);
      const direct = r2.intersectObject(m, false);
      const anyMesh = r2.intersectObjects(gpuRef.current.map((x) => x.mesh), false);
      return {
        sphereHit: ray.ray.intersectsSphere(ws),
        boxHit: ray.ray.intersectsBox(wb),
        wsCenter: ws.center.toArray().map((x) => +x.toFixed(1)),
        wsRadius: +ws.radius.toFixed(1),
        vertexWorld: v.toArray().map((x) => +x.toFixed(2)),
        vertexScreen: [+fx.toFixed(3), +fy.toFixed(3)],
        matrixWorld: m.matrixWorld.toArray().map((x) => +x.toFixed(2)),
        directHits: direct.length,
        anyHitsAtVertex: anyMesh.length,
        posCount: pos.count,
        indexCount: g.index?.count ?? null,
        idxType: g.index ? g.index.array.constructor.name : null,
        nanPos: (() => { const a = pos.array as Float32Array; let n = 0; for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) n++; return n; })(),
      };
    };

    const resize = () => {
      const w = el.clientWidth || 300, h = el.clientHeight || 200;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    let raf = 0;
    let frameNo = 0;
    const tmp = new THREE.Vector3();
    const frame = () => {
      if (disposed) return;
      if (fitTarget && fitLerp < 1) {
        fitLerp = Math.min(1, fitLerp + 0.06);
        const k = 1 - Math.pow(1 - fitLerp, 3);
        const dist = fitTarget.radius / Math.sin((camera.fov * Math.PI) / 360);
        const dir = tmp.set(0.9, 0.75, 1).normalize();
        const want = fitTarget.center.clone().addScaledVector(dir, dist * 1.05);
        camera.position.copy(fitFrom.pos).lerp(want, k);
        controls.target.copy(fitFrom.target).lerp(fitTarget.center, k);
        camera.near = Math.max(0.05, dist / 500);
        camera.far = dist * 20;
        camera.updateProjectionMatrix();
      }
      controls.update();
      renderer.render(scene, camera);
      if ((frameNo++ & 31) === 0) el.dataset.cam = `${camera.position.length().toFixed(1)}|${controls.target.length().toFixed(1)}|${renderer.info.render.triangles}`;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      unsub();
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      controls.dispose();
      for (const g of gpuRef.current) g.geom.dispose();
      gpuRef.current = [];
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  return <div className="sv-host" ref={host} />;
}

function paint(b: BatchGpu, hl: StreamHighlight, ghost: boolean, picked: string | null) {
  const arr = b.color.array as Uint8Array;
  for (const m of b.meta) {
    const c = targetColor(m, hl, ghost, picked);
    const r = (c[0] * 255) | 0, g = (c[1] * 255) | 0, bl = (c[2] * 255) | 0, a = (c[3] * 255) | 0;
    const end = (m.v0 + m.vn) * 4;
    for (let i = m.v0 * 4; i < end; i += 4) {
      arr[i] = r;
      arr[i + 1] = g;
      arr[i + 2] = bl;
      arr[i + 3] = a;
    }
  }
  b.color.needsUpdate = true;
}
