/**
 * Theme-aligned palette derivation for IFC visualizations.
 *
 * Principle: the main app colors are fixed (theme tokens in
 * app/globals.css — bg, fg, muted, accent, accent-soft, line, card).
 * Everything else is *derived* from a formula that subdivides a
 * fixed range based on the number of components being rendered.
 *
 * No hand-coded class → color map. Add a new IFC class to a model
 * and the visualization assigns it a slot in the range automatically.
 *
 * Two ranges, both anchored on the rust accent so nothing reads as
 * a foreign hue:
 *
 *   RANGE_ORANGE_TO_BLACK  — rust → warm near-black  (heavy / dense)
 *   RANGE_ORANGE_TO_WHITE  — rust → warm near-white  (light / soft)
 *
 * Usage:
 *   const colors = rangePalette(RANGE_ORANGE_TO_BLACK, items.length);
 *   tiles.sort((a, b) => b.value - a.value).forEach((t, i) => {
 *     t.color = colors[i];
 *   });
 *
 * Sort order owns the meaning: biggest tile gets the first color in
 * the range, smallest tile gets the last. Reverse the range if you
 * want the inverse.
 */

// ── Theme waypoints (fixed, sourced from app/globals.css) ──────────
export const COLOR_ACCENT = "#e07c2f";      // rust
export const COLOR_ACCENT_SOFT = "#fce8d4"; // pale rust
export const COLOR_FG = "#0d0d0c";          // near-black
export const COLOR_BG = "#fafaf7";          // warm cream
export const COLOR_LINE = "#e6e5df";        // very light warm gray
export const COLOR_MUTED = "#686766";       // warm mid-gray

// ── Single complementary callout color ─────────────────────────────
// Direct complement to the rust accent on the color wheel — sits at
// the opposite hue (rust ≈ 25°, this ≈ 205°). Reserved exclusively
// for the active selection / focus state across every surface: the
// 3D viewer highlights the picked element with it, the spatial graph
// strokes the picked node with it, the table accents the picked row
// with it. Anywhere a user sees this color, it means "you focused
// this; everything else is responding."
export const COLOR_CALLOUT = "#1d8a8a";      // deep teal
export const COLOR_CALLOUT_SOFT = "#d4ecec"; // pale teal (background tint)

// ── Derived range endpoints ────────────────────────────────────────
// Slightly off the pure theme colors so the visualization range
// doesn't collide with chrome (e.g. the accent itself stays
// reserved for selection state).
export const RANGE_ORANGE_TO_BLACK: [string, string] = [
  "#c66a25", // rust-mid (one step softer than accent)
  "#1a1816", // warm near-black
];

export const RANGE_ORANGE_TO_WHITE: [string, string] = [
  COLOR_ACCENT_SOFT, // #fce8d4
  "#874613",         // deep rust
];

// Default range used by treemaps + bars when not specified. Sorted
// by value desc, so the biggest tile gets the darkest color and the
// smallest gets the lightest — heaviest entity reads as the most
// visually present.
export const DEFAULT_RANGE: [string, string] = [
  "#1a1816", // warm near-black (biggest = darkest)
  "#f5cda5", // light rust (smallest = lightest)
];

// ─── Color interpolation ──────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return (
    "#" +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
  );
}

/** Linear interpolation between two hex colors. t in [0, 1]. */
export function interpolateHex(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(
    r1 + (r2 - r1) * t,
    g1 + (g2 - g1) * t,
    b1 + (b2 - b1) * t,
  );
}

/**
 * Return n hex colors evenly spaced across a range. n === 1 returns
 * the midpoint; n === 0 returns [].
 *
 * Memoized — callers can request rangePalette(RANGE, N) repeatedly
 * (e.g. once per render of a treemap with N tiles) without paying
 * the interpolation cost beyond the first call for that (range, N).
 * Cache key is the joined range + n so different ranges don't
 * collide.
 */
const _paletteCache = new Map<string, string[]>();
export function rangePalette(range: [string, string], n: number): string[] {
  if (n <= 0) return [];
  const key = `${range[0]}|${range[1]}|${n}`;
  const hit = _paletteCache.get(key);
  if (hit) return hit;
  let out: string[];
  if (n === 1) {
    out = [interpolateHex(range[0], range[1], 0.5)];
  } else {
    out = [];
    for (let i = 0; i < n; i++) {
      out.push(interpolateHex(range[0], range[1], i / (n - 1)));
    }
  }
  _paletteCache.set(key, out);
  return out;
}

/**
 * Stable per-entity color for a fixed alphabetical ordering of
 * known IFC entity classes. Same entity always gets the same color
 * across visualizations. Useful when consistency between views
 * matters more than within-view value-ordered shading.
 *
 * Cached — first call for each (entities, range) joinkey is the only
 * one that does work; subsequent calls reuse the map.
 */
const _stableCache = new Map<string, Map<string, string>>();
export function stableEntityPalette(
  entities: string[],
  range: [string, string] = DEFAULT_RANGE,
): Map<string, string> {
  const sorted = [...new Set(entities)].sort();
  const key = `${range[0]}|${range[1]}|${sorted.join(",")}`;
  const hit = _stableCache.get(key);
  if (hit) return hit;
  const palette = rangePalette(range, sorted.length);
  const m = new Map<string, string>();
  sorted.forEach((e, i) => m.set(e, palette[i]));
  _stableCache.set(key, m);
  return m;
}

// ─── Severity palette (also derived, also in-range) ────────────────
// error / warn / info pulled from the same orange family — no
// red/amber/blue traffic-light conventions.
export const SEVERITY_COLOR = {
  error: "#874613", // deep rust
  warn: COLOR_ACCENT, // accent rust
  info: COLOR_MUTED, // warm gray
} as const;
