## Agent signature
- **Agent**: `claude-opus-4-8[1m]` (session started on Fable, switched to Opus 4.8 mid-session)
- **Working tree**: `/home/edkjo/workspace/inbox/ifcfast-site` (+ supporting commits in `/home/edkjo/workspace/inbox/ifcfast`)
- **Branch**: site `master` @ `734b7a2` → `2bad17b`; parser `main` @ `de48b5f` → `5df793a`
- **Session scope**: audit ifcfast.com vs the real parser surface, correct the stale claims, then design an immersive replacement landing (mockups only — not yet promoted)
- **Touched paths**: site — `app/page.tsx`, `app/layout.tsx`, `app/workbench/` (from `app/dev/workbench/`), `components/{mcp-install,terminal,pypi-version,tile-chrome,type-gallery,dash-tile,viewer,findings-view}.tsx`, `next.config.ts`, `app/mockups/{a,b,c,ab}/`, `public/sample/duplex.*`, `public/sample/types/*`, `package.json`; parser — `scripts/generate_sample_sidecars.py`
- **Parallel sessions observed**: site PRs #1/#2/#3 (another session, "claude from edkjo") had merged to `origin/master` between May 29 and this session; rebased onto them cleanly
- **Supersedes / superseded by**: none

## Summary
Started from the question "is ifcfast.com showcasing the true ifcfast?" — it was frozen at ~v0.4.2x while the parser shipped v0.4.42 (write axis, clash, oracle-gated correctness). Did a full accuracy pass on the live editorial site (shipped), then attempted an immersive product-first redesign that **failed and was reverted** (reused old dashboard components in a new frame — read as a zoomed-in dashboard). Regrouped into a proper design round: three ground-up total-redesign mockups (A cinematic scene / B data instrument / C print catalogue), owner chose **A + B combined** (film that lands on the instrument), then asked to choreograph the model (explode into components, dissolve into point clouds). All four mockups live as unlisted `/mockups/*` routes; **main site remains the reverted editorial layout** pending the owner's pick. Two real bugs found and filed along the way.

## Changes
### Accuracy pass (shipped to live editorial site)
- Replaced "not yet verified against established tools" with the real oracle story (ifcopenshell class-by-class differential, Solibri clash ground truth, byte-level round-trip oracles) — kept the honest cross-check advice.
- Added Write / Clash / Viewer capability cards + API showcase snippets (subset/hotswap/mutate, bundle→clash with categories, to_gltf/diff/CLI).
- MCP section: 18→22 tools, removed false "geometry surface" + "run drift" claims (server exposes no geometry tools — that's parser GH #118).
- New `components/pypi-version.tsx` — header/footer version badge fetched live from PyPI so the site can't silently go stale again.
- Regenerated demo sidecars with released v0.4.42: corrected QTO (total demo volume 1637→453 m³ excl. spaces), spaces now their own class, glb excludes IfcSpace.

### Redesign attempt → REVERTED
- `3a99e86` full-bleed viewport-height workbench + type-gallery + fullscreen tiles → owner: "messy, zoomed-in dashboard, unusable" → reverted `3f34af6`. Lesson memorialized (see MEMORY): **structural redesign = redesign every component for its new frame; only the problem + users are holy.**

### Mockup round (unlisted, main site untouched)
- `/mockups/a` "The Scene", `/mockups/b` "The Instrument", `/mockups/c` "The Catalogue" — each built ground-up by a separate opus subagent, zero shared components.
- `/mockups/ab` — owner's pick: A's 5 film chapters + B's instrument as chapter 06 (film "boots" the instrument). One accent, one background family, WebGL handoff (film scene unmounts when instrument active), cross-filtering in the instrument via GUID materials.
- Choreographed the film scene: replaced static model-viewer with custom **three.js** scene — 01 materialize from real point cloud, 02 explode by entity class, 03 storey slabs, 04 dissolve into point cloud as storey bands, 05 reassemble. Uses `/sample/duplex.points.bin` — a real `m.point_cloud(per_m2=10)` sample (51k points, entity+storey tagged).

### Parser repo (supporting)
- `9bdf86d` fixed sidecar generator API drift (unit-suffixed drift columns were silently zeroing all quantities; container_kind; documented glb step).
- `55f85b1` type-gallery generation step; `5df793a` GH #146 material-split stopgap baked into the generator.

## Technical Details
- **The cross-filter bug (both the main viewer AND mockups):** ifcfast's surface-style pipeline (v0.4.33+) dedupes glb materials by authored colour and names them `#rrggbb`. The site viewer's ENTIRE selection mechanism maps `material.name → product GUID`. The May-era glb predated styles, so regenerating with v0.4.42 silently killed model dimming; orphaned colour materials also made model-viewer throw (`Material "#808080" has not been loaded`), taking down the whole viewer. Stopgap: post-process the glb to give every product primitive a GUID-named material clone (`<guid>` / `<guid>#N` for multi-segment), drop orphaned colour materials. Filed parser **GH #146** for the engine-side contract fix; baked the stopgap into the generator so a future regen can't re-break it.
- **Vercel git integration is DEAD** (site GH #4): no push to master had deployed since ~2026-05-29 (49-day-old prod build served the whole time). Every deploy this session was a manual `vercel deploy --prod`. Until reconnected, EVERY merge needs manual deploy.
- **three.js peer pin:** model-viewer@4.2.0 requires `three@^0.182.0`; installing 0.185 broke Vercel's clean `npm install` (ERESOLVE) even though local build passed. Pinned three + @types/three to exact 0.182.0.
- Point-cloud sidecar packed as binary: `u32 count | f32 xyz (centroid-rebased) | u8 entity_idx | u8 storey_idx (255=unplaced)`, decoded via DataView into a THREE.Points BufferGeometry.

## Next
1. **Owner reviews `/mockups/ab`** (choreographed film → instrument) and confirms/adjusts. This is the candidate for the real landing.
2. If AB is approved: **promote mockup → real landing** — per the total-redesign rule, the editorial content (MCP install, API showcase, honesty section) gets redesigned INTO the AB world, not appended below it. Old editorial page retired.
3. Reconnect Vercel git integration (site GH #4) so deploys are automatic again.
4. Parser GH #146: engine-side per-product GUID material fix so the glb stopgap can be removed.
5. Still-open from before this session (unrelated): #16 drop-your-own-IFC, and the clash/oracle backlog (#141/#144/#145).

## Notes
- Main site is SAFE (reverted editorial + accuracy fixes). Nothing immersive is promoted — mockups are unlisted routes only.
- Mockup design decisions and the "redesign is total" lesson are the durable takeaways. If the owner picks a different direction, A/B/C are still live for comparison.
- The choreographed film is also the product story: every model movement demos a real ifcfast primitive (point_cloud, per-class subset, storey split, round-trip write).
