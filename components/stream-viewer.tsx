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
  | { mode: "product"; value: string }
  | null;

const ACCENT: [number, number, number, number] = [1.0, 0.561, 0.227, 1.0];
const DIM: [number, number, number, number] = [0.3, 0.32, 0.36, 0.06];
const HIDE: [number, number, number, number] = [0, 0, 0, 0];
const GHOST_ENTITIES = new Set(["ifcspace", "ifcopeningelement"]);

const VERT = `
attribute vec4 color;
varying vec4 vColor;
varying vec3 vNormal;
void main() {
  vColor = color;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const FRAG = `
precision highp float;
varying vec4 vColor;
varying vec3 vNormal;
void main() {
  if (vColor.a <= 0.001) discard;
  // hemisphere-ish lambert: sky from above, warm bounce from below
  float up = dot(normalize(vNormal), normalize(vec3(0.35, 0.9, 0.25)));
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

function targetColor(m: ProductMeta, hl: StreamHighlight, ghost: boolean): [number, number, number, number] {
  const isGhostEntity = GHOST_ENTITIES.has(m.entity.toLowerCase());
  if (!ghost && isGhostEntity) return HIDE;
  if (!hl) return m.rgba;
  let match = false;
  if (hl.mode === "storey") match = storeyMatch(m, hl.value);
  else if (hl.mode === "entity")
    match = m.entity.toLowerCase() === hl.value.toLowerCase() && (hl.storeyScope ? storeyMatch(m, hl.storeyScope) : true);
  else if (hl.mode === "type")
    match = (m.type_name ?? "—") === hl.value && (hl.storeyScope ? storeyMatch(m, hl.storeyScope) : true);
  else if (hl.mode === "product") match = m.guid === hl.value;
  if (match) return ACCENT;
  return ghost ? DIM : HIDE;
}

export function StreamViewer({
  store,
  highlight,
  ghost,
  onPick,
}: {
  store: StreamStore;
  highlight: StreamHighlight;
  ghost: boolean;
  onPick?: (meta: ProductMeta | null) => void;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const gpuRef = useRef<BatchGpu[]>([]);
  const hlRef = useRef<{ hl: StreamHighlight; ghost: boolean }>({ hl: highlight, ghost });
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);

  // restyle on highlight / ghost change — rewrite the RGBA attribute per product range
  useEffect(() => {
    hlRef.current = { hl: highlight, ghost };
    for (const b of gpuRef.current) paint(b, highlight, ghost);
  }, [highlight, ghost]);

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

    const bbox = new THREE.Box3();
    let fitTarget: { center: THREE.Vector3; radius: number } | null = null;
    let fitLerp = 1;

    const refit = () => {
      if (bbox.isEmpty()) return;
      const wb = bbox.clone().applyMatrix4(root.matrixWorld);
      const center = wb.getCenter(new THREE.Vector3());
      const radius = Math.max(wb.getSize(new THREE.Vector3()).length() / 2, 0.5);
      fitTarget = { center, radius };
      fitLerp = 0;
    };

    const addBatch = (b: Batch) => {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.BufferAttribute(b.positions, 3));
      geom.setIndex(new THREE.BufferAttribute(b.indices, 1));
      if (b.normals) geom.setAttribute("normal", new THREE.BufferAttribute(b.normals, 3));
      else geom.computeVertexNormals();
      const color = new THREE.BufferAttribute(new Float32Array(b.positions.length / 3 * 4), 4);
      color.setUsage(THREE.DynamicDrawUsage);
      geom.setAttribute("color", color);
      const mesh = new THREE.Mesh(geom, material);
      mesh.frustumCulled = true;
      root.add(mesh);
      root.updateMatrixWorld(true);
      geom.computeBoundingBox();
      if (geom.boundingBox) bbox.union(geom.boundingBox);
      const gpu: BatchGpu = { mesh, geom, color, meta: b.meta, i0s: b.meta.map((m) => m.i0) };
      gpuRef.current.push(gpu);
      paint(gpu, hlRef.current.hl, hlRef.current.ghost);
      refit();
      // debug surface for automation: batch count + bounds + camera distance
      el.dataset.batches = String(gpuRef.current.length);
      el.dataset.bbox = bbox.isEmpty() ? "" : [bbox.min.x, bbox.min.y, bbox.min.z, bbox.max.x, bbox.max.y, bbox.max.z].map((v) => v.toFixed(2)).join(",");
    };
    const unsub = store.subscribe((b) => {
      if (disposed) return;
      if (b) addBatch(b);
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
      const hits = ray.intersectObjects(gpuRef.current.map((g) => g.mesh), false);
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
        // skip hidden / ghosted-out products so a click reaches what is visible
        const c = targetColor(m, hlRef.current.hl, hlRef.current.ghost);
        if (c[3] <= 0.001) continue;
        onPick(m);
        return;
      }
      onPick(null);
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);

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
        camera.position.lerp(want, k * 0.35);
        controls.target.lerp(fitTarget.center, k * 0.35);
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

function paint(b: BatchGpu, hl: StreamHighlight, ghost: boolean) {
  const arr = b.color.array as Float32Array;
  for (const m of b.meta) {
    const c = targetColor(m, hl, ghost);
    const end = (m.v0 + m.vn) * 4;
    for (let i = m.v0 * 4; i < end; i += 4) {
      arr[i] = c[0];
      arr[i + 1] = c[1];
      arr[i + 2] = c[2];
      arr[i + 3] = c[3];
    }
  }
  b.color.needsUpdate = true;
}
