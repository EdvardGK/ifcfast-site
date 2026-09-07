"use client";
/**
 * LoadingShapes — the instrument's "parsing in this tab" interlude.
 *
 * A solid rests. It explodes into a rounded blob of points — every point
 * flies radially outward from the shape — and the moment it is fully
 * expanded it contracts into the next shape, and the next solid crossfades in DURING
 * the last stretch of the gather, so the moment the points arrive the
 * body is already there and the points are gone. The cloud is ONE fixed
 * set of points for the whole run; at each gather every point is
 * assigned the nearest still-free spot on the next shape (grid-hashed
 * greedy), so it flows rather than scrambles. Points are never visible
 * while the solid is. Off-white solid, amber points, three only.
 */
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

const N = 900; // points in the cloud — fixed for the whole run (smooth > dense)
const HOLD = 1.1; // s the solid rests
const DISSOLVE = 0.7; // s solid → blob (points explode radially outward)
const DRIFT = 0.0; // no hang: the blob contracts the instant it has fully expanded
const GATHER = 0.9; // s cloud → next shape
const POINTS_OUT = 0.5; // s before the gather ends the points are fully hidden
const SOLID_IN = 0.6; // s before the gather ends the next solid starts fading in
const PERIOD = HOLD + DISSOLVE + DRIFT + GATHER;

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

/** N area-weighted surface samples of a geometry. */
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
  const out = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    let r = rng() * total, t = 0;
    while (t < tris - 1 && r > areas[t]) r -= areas[t++];
    a.fromBufferAttribute(pos, 3 * t);
    b.fromBufferAttribute(pos, 3 * t + 1);
    c.fromBufferAttribute(pos, 3 * t + 2);
    let u = rng(), v = rng();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    out[3 * i] = a.x + u * (b.x - a.x) + v * (c.x - a.x);
    out[3 * i + 1] = a.y + u * (b.y - a.y) + v * (c.y - a.y);
    out[3 * i + 2] = a.z + u * (b.z - a.z) + v * (c.z - a.z);
  }
  if (g !== geom) g.dispose();
  return out;
}

/** For each point in `from` pick the nearest still-unclaimed point of
 * `to` (grid-hashed, expanding search). Returns `to` reordered so index i
 * is where point i travels — short paths, no scramble. */
function assign(from: Float32Array, to: Float32Array, seed: number): Float32Array {
  const cell = 0.2;
  const OFF = 64; // grid coordinates are offset into [0, 128) and packed into one integer key
  const key = (x: number, y: number, z: number) =>
    ((Math.floor(x / cell) + OFF) << 14) | ((Math.floor(y / cell) + OFF) << 7) | (Math.floor(z / cell) + OFF);
  const grid = new Map<number, number[]>();
  for (let j = 0; j < N; j++) {
    const k = key(to[3 * j], to[3 * j + 1], to[3 * j + 2]);
    (grid.get(k) ?? grid.set(k, []).get(k)!).push(j);
  }
  const claimed = new Uint8Array(N);
  const out = new Float32Array(N * 3);
  // visit points in a shuffled order so early claims are not spatially biased
  const order = Array.from({ length: N }, (_, i) => i);
  const rng = mulberry32(seed);
  for (let i = N - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  let unclaimedLeft = N;
  for (const i of order) {
    const x = from[3 * i], y = from[3 * i + 1], z = from[3 * i + 2];
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
    let best = -1, bestD = Infinity;
    for (let r = 0; r <= 12 && best < 0; r++) {
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== r) continue; // shell only
        const bucket = grid.get(((cx + dx + OFF) << 14) | ((cy + dy + OFF) << 7) | (cz + dz + OFF));
        if (!bucket) continue;
        for (const j of bucket) {
          if (claimed[j]) continue;
          const d = (to[3 * j] - x) ** 2 + (to[3 * j + 1] - y) ** 2 + (to[3 * j + 2] - z) ** 2;
          if (d < bestD) { bestD = d; best = j; }
        }
      }
    }
    if (best < 0) { // exhausted the search radius: take any unclaimed
      for (let j = 0; j < N; j++) if (!claimed[j]) { best = j; break; }
    }
    claimed[best] = 1;
    unclaimedLeft--;
    out[3 * i] = to[3 * best]; out[3 * i + 1] = to[3 * best + 1]; out[3 * i + 2] = to[3 * best + 2];
  }
  void unclaimedLeft;
  return out;
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Elapsed stopwatch, 10 Hz — "3.2 s" — from a performance.now() origin. */
export function LiveTimer({ since, done }: { since: number; done?: number }) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (done != null) return;
    const iv = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(iv);
  }, [done]);
  const s = ((done ?? now) - since) / 1000;
  return <span className="ls-timer">{s < 10 ? s.toFixed(1) : s.toFixed(0)} s</span>;
}

export function LoadingShapes({ caption, since }: { caption?: string; since?: number }) {
  const host = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let raf = 0;
    let disposed = false;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); // smooth > crisp
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
    // frame the blob (radius ≤ 1.85 + jitter) with margin whatever the
    // viewport's aspect — the desktop instrument cell is portrait
    const FRAME_R = 2.05;
    const frameCamera = () => {
      const half = Math.tan((camera.fov * Math.PI) / 360);
      const dist = (FRAME_R / half / Math.min(1, camera.aspect)) * 1.04;
      camera.position.set(0, dist * 0.16, dist);
      camera.lookAt(0, 0, 0);
    };
    scene.add(new THREE.HemisphereLight(0xfff4e6, 0x1a1c20, 0.8));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(2.5, 3.5, 2.0);
    scene.add(keyLight);

    const geoms = [
      new THREE.SphereGeometry(1.0, 32, 20),
      new THREE.ConeGeometry(1.15, 1.7, 4, 1), // square pyramid
      new THREE.TetrahedronGeometry(1.25),
      new THREE.TorusGeometry(0.8, 0.32, 16, 40),
      new THREE.BoxGeometry(1.45, 1.45, 1.45),
      new THREE.ConeGeometry(0.95, 1.8, 28, 1),
    ];
    const samples = geoms.map((g, i) => surfacePoints(g, 700 + i));
    const solids = geoms.map((g) => {
      const m = new THREE.Mesh(
        g,
        new THREE.MeshLambertMaterial({ color: 0xe9e7e1, transparent: true, opacity: 0, flatShading: true }),
      );
      m.visible = false;
      return m;
    });

    // the one cloud: current resting positions, and the assigned targets for the flight in progress
    let rest: Float32Array = new Float32Array(samples[0]);
    let target: Float32Array = rest;
    const pointPos = new Float32Array(rest);
    const pointGeom = new THREE.BufferGeometry();
    pointGeom.setAttribute("position", new THREE.BufferAttribute(pointPos, 3));
    const pointMat = new THREE.PointsMaterial({ color: 0xff8f3a, size: 0.034, sizeAttenuation: true, transparent: true, opacity: 0 });
    const points = new THREE.Points(pointGeom, pointMat);
    const pivot = new THREE.Group();
    pivot.add(points, ...solids);
    scene.add(pivot);

    const resize = () => {
      const w = el.clientWidth || 300, h = el.clientHeight || 200;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      frameCamera();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    // the blob: where each point goes when the shape explodes — radially out
    // from the centre along its own direction (with a little jitter) to a
    // shell of radius 1.55–2.1, so the cloud reads as a round body of points
    const brng = mulberry32(42);
    const jitter = new Float32Array(N * 3);
    const shell = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      jitter[3 * i] = (brng() - 0.5) * 0.5;
      jitter[3 * i + 1] = (brng() - 0.5) * 0.5;
      jitter[3 * i + 2] = (brng() - 0.5) * 0.5;
      shell[i] = 1.4 + brng() * 0.45;
    }
    const blob = new Float32Array(N * 3);
    const buildBlob = (from: Float32Array) => {
      for (let i = 0; i < N; i++) {
        const o = 3 * i;
        const dx = from[o] + jitter[o], dy = from[o + 1] + jitter[o + 1], dz = from[o + 2] + jitter[o + 2];
        const len = Math.hypot(dx, dy, dz) || 1;
        blob[o] = (dx / len) * shell[i];
        blob[o + 1] = (dy / len) * shell[i];
        blob[o + 2] = (dz / len) * shell[i];
      }
    };
    buildBlob(rest);
    // Precompute one full lap — rest / blob / target per shape — so no
    // frame ever pays for an assignment. The lap repeats identically.
    const lap: { rest: Float32Array; blob: Float32Array; target: Float32Array }[] = [];
    {
      let r: Float32Array = new Float32Array(samples[0]);
      for (let k = 0; k < geoms.length; k++) {
        buildBlob(r);
        const b = new Float32Array(blob);
        const tgt = assign(b, samples[(k + 1) % geoms.length], 1000 + k);
        lap.push({ rest: r, blob: b, target: tgt });
        r = tgt;
      }
    }
    const smooth = (x: number) => x * x * (3 - 2 * x);
    const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);

    const t0 = performance.now();
    let lastCycle = -1;
    const frame = (now: number) => {
      if (disposed) return;
      const t = Math.max(0, now - t0) / 1000;
      const cycle = Math.floor(t / PERIOD);
      const k = cycle % geoms.length;
      const next = (k + 1) % geoms.length;
      const ph = t % PERIOD;
      if (cycle !== lastCycle) {
        lastCycle = cycle;
        const L = lap[k];
        rest = L.rest;
        target = L.target;
        blob.set(L.blob);
      }

      // e: 0 = on the shape, 1 = in the blob; g: 0 = blob, 1 = next shape
      let solidIdx = k, solidOpacity = 1, cloudOpacity = 0, e = 0, g = 0, breathe = 0;
      if (ph < HOLD) {
        // solid rests; no points
      } else if (ph < HOLD + DISSOLVE) {
        const u = (ph - HOLD) / DISSOLVE;
        solidOpacity = 1 - Math.min(1, u / 0.3); // gone in the first third of the explosion
        cloudOpacity = Math.min(1, u / 0.15);
        e = easeOut(u);
      } else if (ph < HOLD + DISSOLVE + DRIFT) {
        const u = (ph - HOLD - DISSOLVE) / DRIFT;
        solidOpacity = 0;
        cloudOpacity = 1;
        e = 1;
        void u; // the blob simply hangs — no pulse (Ed: it read as a wobble)
      } else {
        const tg = ph - HOLD - DISSOLVE - DRIFT; // seconds into the gather
        const u = easeInOut(tg / GATHER);
        e = 1;
        g = u;
        solidIdx = next;
        // points are fully hidden POINTS_OUT s before the end (fade over 0.25 s);
        // the solid fades in over the last SOLID_IN s and is complete at the end
        const pointsEnd = GATHER - POINTS_OUT;
        cloudOpacity = 1 - Math.min(1, Math.max(0, (tg - (pointsEnd - 0.25)) / 0.25));
        solidOpacity = smooth(Math.min(1, Math.max(0, (tg - (GATHER - SOLID_IN)) / SOLID_IN)));
      }
      for (let i = 0; i < N; i++) {
        const o = 3 * i;
        for (let c = 0; c < 3; c++) {
          const onShape = rest[o + c];
          const inBlob = blob[o + c] * (1 + breathe);
          const p0 = onShape + (inBlob - onShape) * e; // explode
          pointPos[o + c] = p0 + (target[o + c] - p0) * g; // gather
        }
      }
      (pointGeom.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
      pointMat.opacity = cloudOpacity;
      points.visible = cloudOpacity > 0.01;
      solids.forEach((sMesh, i) => {
        const on = i === solidIdx && solidOpacity > 0.01;
        sMesh.visible = on;
        if (on) (sMesh.material as THREE.MeshLambertMaterial).opacity = solidOpacity;
      });
      pivot.rotation.y = t * 0.35;
      pivot.rotation.x = -0.28 + Math.sin(t * 0.25) * 0.12;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      pointGeom.dispose();
      pointMat.dispose();
      solids.forEach((s) => (s.material as THREE.Material).dispose());
      geoms.forEach((g) => g.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);
  return (
    <div className="ls-host" ref={host} aria-hidden>
      {caption ? (
        <div className="ls-cap">
          {caption}
          {since != null ? <> · <LiveTimer since={since} /></> : null}
        </div>
      ) : null}
    </div>
  );
}
