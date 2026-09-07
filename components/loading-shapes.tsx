"use client";
/**
 * LoadingShapes — the instrument's "parsing in this tab" interlude.
 *
 * A Fibonacci-count point cloud (610 points) flows between the Platonic
 * solids whose coordinates are built on the golden ratio — icosahedron
 * (0, ±1, ±φ), dodecahedron (±1/φ, ±φ) — with tetrahedron, cube and
 * octahedron in between, then dissolves into a sphere and starts over.
 * Inside it the three mutually perpendicular golden rectangles (1 × φ)
 * that construct the icosahedron turn slowly, so the proportion is
 * literally on screen. Same amber as the film; no textures, no deps
 * beyond three (already loaded for the film).
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";

const PHI = (1 + Math.sqrt(5)) / 2;
const N = 610; // Fibonacci
const HOLD = 1.6; // seconds a shape rests before flowing on
const FLOW = 1.1; // seconds of flow between shapes

/** Deterministic RNG so the same index always lands in the same region. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sample N points on a geometry's surface, area-weighted, then order
 * them by direction so index i is spatially coherent across shapes —
 * that ordering is what makes the morph *flow* instead of scramble. */
function surfacePoints(geom: THREE.BufferGeometry, seed: number): Float32Array {
  const g = geom.index ? geom.toNonIndexed() : geom;
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const tris = pos.count / 3;
  const areas = new Float32Array(tris);
  let total = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < tris; t++) {
    a.fromBufferAttribute(pos, 3 * t);
    b.fromBufferAttribute(pos, 3 * t + 1);
    c.fromBufferAttribute(pos, 3 * t + 2);
    areas[t] = b.sub(a).cross(c.sub(a)).length() / 2;
    total += areas[t];
  }
  const rng = mulberry32(seed);
  const pts: { x: number; y: number; z: number; key: number }[] = [];
  for (let i = 0; i < N; i++) {
    let r = rng() * total, t = 0;
    while (t < tris - 1 && r > areas[t]) r -= areas[t++];
    a.fromBufferAttribute(pos, 3 * t);
    b.fromBufferAttribute(pos, 3 * t + 1);
    c.fromBufferAttribute(pos, 3 * t + 2);
    let u = rng(), v = rng();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const x = a.x + u * (b.x - a.x) + v * (c.x - a.x);
    const y = a.y + u * (b.y - a.y) + v * (c.y - a.y);
    const z = a.z + u * (b.z - a.z) + v * (c.z - a.z);
    // order key: latitude bands, then longitude — coherent neighbourhoods
    const lat = Math.atan2(y, Math.hypot(x, z));
    const lon = Math.atan2(z, x);
    pts.push({ x, y, z, key: Math.round((lat + Math.PI / 2) * 6) * 10 + (lon + Math.PI) / (2 * Math.PI) });
  }
  pts.sort((p, q) => p.key - q.key);
  const out = new Float32Array(N * 3);
  pts.forEach((p, i) => { out[3 * i] = p.x; out[3 * i + 1] = p.y; out[3 * i + 2] = p.z; });
  if (g !== geom) g.dispose();
  return out;
}

function goldenRectangles(): THREE.LineSegments {
  // The icosahedron's three golden rectangles: 1 × φ, mutually perpendicular.
  const s = 0.62;
  const h = s, w = s * PHI;
  const v: number[] = [];
  const rect = (f: (u: number, t: number) => [number, number, number]) => {
    const corners = [f(-w, -h), f(w, -h), f(w, h), f(-w, h)];
    for (let i = 0; i < 4; i++) v.push(...corners[i], ...corners[(i + 1) % 4]);
  };
  rect((u, t) => [u, t, 0]);
  rect((u, t) => [0, u, t]);
  rect((u, t) => [t, 0, u]);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xff8f3a, transparent: true, opacity: 0.55 });
  return new THREE.LineSegments(geom, mat);
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function LoadingShapes({ caption }: { caption?: string }) {
  const host = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let raf = 0;
    let disposed = false;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    camera.position.set(0, 0.6, 4.2);
    camera.lookAt(0, 0, 0);

    // shapes, in the order they flow — all scaled to a unit-ish radius
    const shapes = [
      new THREE.TetrahedronGeometry(1.15),
      new THREE.BoxGeometry(1.35, 1.35, 1.35),
      new THREE.OctahedronGeometry(1.2),
      new THREE.DodecahedronGeometry(1.05),
      new THREE.IcosahedronGeometry(1.05),
      new THREE.IcosahedronGeometry(1.05, 3), // ≈ sphere, the dissolve
    ].map((g, i) => surfacePoints(g, 1000 + i));
    const cur = new Float32Array(shapes[0]);
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(cur, 3));
    const points = new THREE.Points(
      geom,
      new THREE.PointsMaterial({ color: 0xf6f3ee, size: 0.028, sizeAttenuation: true, transparent: true, opacity: 0.9 }),
    );
    const rects = goldenRectangles();
    const pivot = new THREE.Group();
    pivot.add(points, rects);
    scene.add(pivot);

    const resize = () => {
      const w = el.clientWidth || 300, h = el.clientHeight || 200;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    const t0 = performance.now();
    const period = HOLD + FLOW;
    const frame = (now: number) => {
      if (disposed) return;
      // rAF timestamps can precede the performance.now() captured above — never go negative
      const t = Math.max(0, now - t0) / 1000;
      const k = Math.floor(t / period) % shapes.length;
      const phase = (t % period);
      const from = shapes[k], to = shapes[(k + 1) % shapes.length];
      const f = phase < HOLD ? 0 : easeInOut((phase - HOLD) / FLOW);
      for (let i = 0; i < N * 3; i++) cur[i] = from[i] + (to[i] - from[i]) * f;
      (geom.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
      pivot.rotation.y = t * 0.45;
      pivot.rotation.x = Math.sin(t * 0.31) * 0.35;
      rects.rotation.z = t * 0.2;
      rects.rotation.x = -t * 0.13;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      geom.dispose();
      (points.material as THREE.Material).dispose();
      rects.geometry.dispose();
      (rects.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);
  return (
    <div className="ls-host" ref={host} aria-hidden>
      {caption ? <div className="ls-cap">{caption}</div> : null}
    </div>
  );
}
