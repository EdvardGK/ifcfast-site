## Agent signature
- **Agent**: `claude-fable-5-1`
- **Working tree**: `/home/edkjo/workspace/inbox/ifcfast-site`
- **Branch**: `master` @ `5ddb42b` → `66b0bd6` (+ this follow-up)
- **Session scope**: "drop your IFC" on the landing's instrument, parsed client-side by the ifcfast wasm core (ifcfast GH #172)
- **Touched paths**: app/mockups/ab/page.tsx, lib/{ifc-worker.ts, use-ifc-drop.ts, ifcfast-wasm.d.ts}, scripts/sync-wasm.sh, public/wasm/
- **Parallel sessions observed**: none
- **Supersedes / superseded by**: none

## Summary
Ed: client-side only, no backend. The instrument (chapter 06) now takes a
dropped .ifc/.ifczip → Web Worker → `IfcModel.fromBytes` (wasm from
/wasm/, ~1 MB) → the same summary/graph/qto/types JSON + glb the sample
sidecars provide → every instrument panel and the viewport switch to
the dropped model; the film keeps the Duplex. Verified with Playwright:
Clinic_Architectural (13 MB) ~730 ms in-browser, cross-filter works on
3 439 GUID-named materials, zero console errors.

Gotchas: glb must be baked (instancing off) for model-viewer's
material API; model-viewer only loads when in view (`loading="auto"`);
the wasm glue is loaded by runtime URL from public/ (webpackIgnore +
turbopackIgnore) so Turbopack never tries to bundle it. Sync the package
with `scripts/sync-wasm.sh` after every parser wasm rebuild.

## Next
- Progress UI is text-only (reading / parsing / tessellating); a real
  progress bar needs a streaming core API.
- Per-type mini-glbs (register hover preview) are absent for dropped
  models by design (v1).

## Evening: streaming viewer, interlude v2, cache pinning (`dc57330`, `95dce5d`)
- Streaming: see the parser worklog addendum (RIV 130 MB: 5.5 s, 105 MB heap).
- Interlude v2 after Ed's "really bad" on v1: one flat-shaded solid at a
  time dissolving into an amber cloud that reforms as the next shape
  (sphere → pyramid → tetrahedron → torus → cube → cone). `?interlude`
  keeps it on screen. Frames verified in DevTools Chrome.
- Ed's Windows PC: "WebAssembly.instantiate(): Import #0 … requires a
  callable" = cached v1 glue + v2 wasm. `sync-wasm.sh` now writes
  `public/wasm/version.json` (wasm content hash); the worker fetches it
  `no-store` and loads glue + wasm with `?v=<hash>` — the pair is atomic.
  Rerun `scripts/sync-wasm.sh` after every parser wasm rebuild or the
  hash goes stale (the worker still works, just unpinned).
- Interlude v3 (`27889df`) after Ed's second pass ("way too slow", "points
  change from shape to shape"): one fixed 1 600-point cloud, nearest-
  target assignment per transition (grid-hashed greedy), 1.0 s rest /
  0.55 s flight, faint solid under the resting cloud. v2's per-shape
  resampling matched by index was the scramble.
- Interlude v4 (final for tonight): Ed clarified — keep the v2 cadence,
  fixed point set, points hidden whenever the mesh shows, and NO pause
  between "points formed" and "mesh appears" (crossfade during the last
  38 % of the gather); plus "explode into a blob between each shape"
  (radial shell 1.4–1.85) and "zoom out" (camera distance from viewport
  aspect so the blob fits the portrait desktop cell).
- Smoothness pass after "laggy and choppy": interlude lap precomputed
  (the per-transition assignment was the stall), 900 points, dpr ≤ 1.5,
  Lambert; stream path: meta parsed + normals computed in the worker,
  batches never touch React state (StreamingPill polls the store).
  Measured: preview 60.3 fps / max 16.8 ms; RIV parse+stream 58.6 fps,
  p99 16.8 ms, one 267 ms hitch at the "indexed" graph parse.
- Interlude tuning with Ed live: no pulse, no hang (explode → immediate
  contraction), points hidden 0.5 s before the gather ends, solid in over
  the last 0.6 s. Live parsing timer (10 Hz) in the pill, the interlude
  caption and the title-block PARSE cell; final elapsed kept in the pill.
  Verified on G55_RIE: all three tick together, PARSE settles on the
  engine's own number (1 267 ms) once indexed. The model itself starts
  rendering at the first geometry batch, ~150 ms after "indexed".
- Pick semantics (`458e760`), Ed: "click in the viewer highlights; the
  cross-filter UI isolates. We don't hide the thing we're interfacing
  with." A pick is now a separate selection drawn in a brighter accent on
  top of the filters (both viewers); nothing is hidden by a pick; the
  raycast prefers the first product INSIDE the active filter along the
  ray, falling back to a ghosted one. Verified with a `__debugPick`
  hook: batch index offsets sorted, binary-search product == brute
  force, projected-vertex ray hits (6), no-filter pick == nearest hit,
  filter survives a pick. Lesson: MEP models are mostly air — a ray
  through the model centre often hits nothing; that is not a bug.
  Note: a stale canvas rect after the filter button appears shifted a
  synthetic click; real clicks read the live rect.

## Late evening — two agents in parallel (Fable coordinating, per Ed)
- **Perf (opus, main tree, `01a3eb3`)**: the 20 s RIV was NOT the
  normals — `graphJson()` called before the mesh pass to build the
  "indexed" message cost 6.6–8.8 s (eager graph build the mesh pass
  repeats); after the stream it costs 342 ms. Graph now built once,
  after the stream; normals dropped in favour of dFdx/dFdy flat
  shading; Uint8 colours; converging camera fit; root matrix baked once.
  RIV 20.3 → 10.8 s wall, first triangle 13.2 → 6.1 s, 60 fps streaming;
  Clinic ARK 2.43 → 1.44 s. Open: panels empty while streaming (~4 s on
  RIV, graph lands at "done"); ~830 ms React hitch rendering 35 789 rows
  after "done".
- **Treemap (opus, isolated worktree `agent/entity-treemap`, `db76567`,
  merged `24fb9c5`)**: MATERIALS on top, entity distribution as a
  d3-hierarchy squarified treemap under it; column 0.72fr, viewport
  1.6fr (+132 px at 1440); hover/click/keyboard like the bars.
- Coordinator: spaces / openings are never pick targets on either
  viewer (the translucent room volume won every click — a big part of
  "picks random things").
- Ed's rule, recorded in memory: Fable plans and coordinates, opus /
  sonnet write the code.
- **Third agent (opus, `e6caabf`)** found the two real problems: (1) the
  instrument grid required `qto && graph`, which a streaming model lacks
  until "done" → the whole grid UNMOUNTED for the entire stream (6.75 s
  blank on RIV; the viewer mounted at done and replayed 179 batches in
  one 983 ms frame) — so every earlier "streams on screen" claim was the
  replay; (2) the ~830 ms hitch was chapter 04's Constellation SVG fed
  the dropped graph (71 629 DOM nodes). Fixes: provisional graph from
  batch meta at 4 Hz, `ready` without qto, Constellation pinned to the
  Duplex + memo, lazy guid lookup, memoised TypeRegister, useCountUp
  freeze bug. RIV: first numbers 10.9 → 3.3 s, first geometry 11.9 →
  4.9 s, worst frame after done 983 → 33 ms, 60 fps during the stream.
  Note: the box was swapping (3/3 GB) during these runs — two Chrome
  instances with RIV loaded + an agent worktree; cleaned up after.
- Header band (`0b2550e`, sonnet agent): `--hud-h` 96px desktop / 72px
  phone; the instrument grid is `calc(100svh - var(--hud-h))` under a
  graphite band so the fixed brand + install tab never overlap the title
  block; scroll-end still lands exactly (measured grid top 96, bottom
  900 at 1440×900). Film badge retires on the instrument (overlapped
  the storey stack).

## 2026-09-08 morning (Fable coordinating, opus agents coding)
- Pick cross-highlights the panels (`5c01481`): storey row / treemap
  cell / register row / material rows get a cream `pick` class; never a
  filter. Gotcha: `scrollIntoView` walks every scrollable ancestor and
  moved the film 730 px — panels scroll their own box only.
- MODEL | GRAPH tabs with a live inset: `components/instrument-graph.tsx`
  is a props-driven fork of the workbench vector graph (class tier,
  900-product cap, synchronous layout, simulation stopped); StreamViewer
  `active` prop (dpr 1, ≤15 fps as inset); QUANTITIES container-query
  wrap. 60 fps on RIV with both views live. Wart fixed: a pick now
  clears when another model lands.
- Unreproduced once: `NotFoundError: removeChild` on a first drop after
  the agent had injected style on the React-rendered file input; five
  clean replays after. Watch for it.

## 2026-09-08 afternoon (Fable coordinating; opus/sonnet coding)
- FRAME (`2a712fa`): graph frames the non-dimmed nodes (34 vb padding,
  350 ms), StreamViewer frames the products the eye sees (per-product
  AABBs, lazy), model-viewer whole model (pose → updateFraming → pose);
  button + middle-button double-click counted from two pointerdowns
  (Chrome emits no dblclick for the wheel button).
- ONE cross-filter (`7433214`): `lib/crossfilter.ts` — one `Sel`
  {storey, entity, type, product, hover}, `lookOf` decides every colour
  for both viewers, graph, treemap, stack, register, materials. Pick =
  product facet: highlights + cross-highlights, never dims, auto-clears
  when an isolation excludes it. One amber (cream fill gone; the picked
  product is amber lit hotter + 1 px cream edge ring). One CLEAR in the
  title bar (badge, Esc); `.stk-reset` removed. Bugs found: a TDZ crash
  unmounting the instrument on every drop; register pick highlight
  failing on 2x3 walls (IfcWall vs IfcWallStandardCase naming).
- Security (`7a1d641` headers, parser `23fde2d`, site `cbebd3d`): CSP
  proven against the worker+wasm path (browser contacts no third-party
  host); bounded .ifczip decompression on Rust, wasm AND the wheel's
  Python inflate (4 GiB / 1 GiB wasm, 200× ratio, 8 MiB floor, 4096
  members). Posture recorded in memory `site-security-posture`.
- Drop pill polish (`dc99bd9`): amber upload CTA; the file-size limit is a
  visible control (300 MB · 600 MB · 1 GB · no limit, remembered in
  localStorage `ifcfast.dropLimit`); soft "large for this device" warning
  from `navigator.deviceMemory`; privacy line under the pill.
- MEP demo for Ed (Ifc4_Revit_MEP.ifc, 29 MB, IFC4, Revit 2021): on live
  ifcfast.com the interlude runs 2.8 s (sphere → cloud → pyramid → cloud),
  first geometry at 2.9 s, done at 4.4 s. Capture lesson: DevTools
  screenshot bursts (≈1.5 s each, and `upload_file` itself blocks ~25 s
  on a throttled page) always land after the parse — even CPU throttle
  6–8× barely slows the wasm worker. What works: hold the file input's
  `change` in a capture-phase listener, re-fire it from `evaluate_script`,
  and record each viewport canvas from inside the page with
  `canvas.captureStream(30)` + `MediaRecorder` (a MutationObserver on
  `#inst-b` starts one per canvas: `.ls-host` interlude, `.sv-host`
  stream viewer), pull the blobs out as base64, `ffmpeg` concat → GIF.
  `toDataURL` on the WebGL canvases is black (buffer not preserved);
  captureStream is not.
- REPORT (`191c34a`, opus agent coded, Fable verified on the production
  build after the agent died on its session limit): title-bar control
  next to CLEAR; one `ReportSnapshot` (`lib/report.ts`) from the panels'
  own derived data, pinned selection only. CSV per table / four-file
  burst / one combined file (UTF-8 BOM, CRLF, RFC 4180, raw numbers,
  `# ifcfast report …` comment line). PDF (`lib/report-pdf.ts`, jspdf +
  autotable, lazy chunk): A4 graphite on white with a still of the live
  viewport — StreamViewer renders + reads its buffer in the same task
  (`captureRef`), model-viewer `toDataURL` composited on the dark
  ground, graph pane serialised from SVG. Verified: 6 CSV downloads +
  98 KB PDF on the Duplex sample, `next build` clean.
