"use client";

/**
 * EntityTreemap — the instrument's entity distribution as area, not bars.
 * ---------------------------------------------------------------------
 * Squarified treemap (d3-hierarchy) where a cell's AREA is the product
 * count of that IFC class inside the current scope. It replaces the bar
 * list under MATERIALS, so the viewport can take the freed width.
 *
 * Interaction contract is identical to the bar rows it replaces:
 *   hover  → onHover(entity) / onHover(null)
 *   click  → onSelect(entity)  (the caller toggles its own selection)
 * plus keyboard focus (Enter / Space) with the class name as aria-label.
 *
 * Palette is the instrument's graphite ramp (darker = fewer products),
 * amber for the hovered / selected class, and the register's `.dim`
 * opacity for everything else while a selection is pinned.
 *
 * Layout is recomputed on container resize (ResizeObserver) and on data
 * change only — no per-frame work, and geometry is not transitioned so a
 * 35 000-product rescope lands crisp instead of sliding.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { hierarchy, treemap, treemapSquarify } from "d3-hierarchy";

export type EntityTreemapDatum = {
  entity: string;
  count: number;
  m3?: number;
  /** class carries no meshable geometry (mirrors the bars' NO MESH flag) */
  noMesh?: boolean;
};

type TreeNode = {
  entity?: string;
  count?: number;
  m3?: number;
  noMesh?: boolean;
  children?: EntityTreemapDatum[];
};

/** IfcWallStandardCase → WALLSTANDARDCASE (same rule as the page's short()) */
const shortName = (e: string) => e.replace(/^Ifc/i, "").toUpperCase();

/* graphite ramp: few products → near-sheet, many → steel */
const RAMP_LO: [number, number, number] = [0x2a, 0x2f, 0x36];
const RAMP_HI: [number, number, number] = [0x5b, 0x63, 0x6d];
const ramp = (t: number) => {
  const k = Math.max(0, Math.min(1, t));
  const c = RAMP_LO.map((lo, i) => Math.round(lo + (RAMP_HI[i] - lo) * k));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
};

/* text-fit thresholds — measured against the 8.5px mono label */
const CHAR_W = 5.9; // px per glyph incl. letter-spacing
const NAME_MIN_W = 34;
const NAME_MIN_H = 15;
const COUNT_MIN_W = 26;
const COUNT_MIN_H = 30;

export default function EntityTreemap({
  data,
  hot,
  selected,
  onHover,
  onSelect,
  label = shortName,
}: {
  data: EntityTreemapDatum[];
  /** cross-highlighted entity (hover from anywhere in the instrument) */
  hot: string | null;
  /** pinned entity filter */
  selected: string | null;
  onHover: (entity: string | null) => void;
  onSelect: (entity: string) => void;
  label?: (entity: string) => string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const apply = (w: number, h: number) =>
      setSize((s) =>
        Math.abs(s.w - w) < 0.5 && Math.abs(s.h - h) < 0.5 ? s : { w, h },
      );
    apply(el.clientWidth, el.clientHeight);
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) apply(r.width, r.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const maxCount = useMemo(
    () => data.reduce((mx, d) => Math.max(mx, d.count), 1),
    [data],
  );

  const cells = useMemo(() => {
    const { w, h } = size;
    if (w < 4 || h < 4 || data.length === 0) return [];
    const root = hierarchy<TreeNode>({ children: data })
      .sum((d) => d.count ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    const laid = treemap<TreeNode>()
      .tile(treemapSquarify)
      .size([w, h])
      .paddingInner(1)
      .round(true)(root);
    return laid.leaves().map((leaf) => {
      const d = leaf.data;
      const x = leaf.x0 ?? 0;
      const y = leaf.y0 ?? 0;
      return {
        entity: d.entity ?? "",
        count: d.count ?? 0,
        m3: d.m3 ?? 0,
        noMesh: !!d.noMesh,
        x,
        y,
        w: Math.max(0, (leaf.x1 ?? 0) - x),
        h: Math.max(0, (leaf.y1 ?? 0) - y),
      };
    });
  }, [data, size]);

  return (
    <div className="tm-host" ref={hostRef} onMouseLeave={() => onHover(null)}>
      <style>{TM_CSS}</style>
      {cells.length === 0 && data.length === 0 && (
        <div className="tm-empty">NO PRODUCTS IN SCOPE</div>
      )}
      {cells.map((c) => {
        const isHot = hot === c.entity || selected === c.entity;
        const isDim = !!selected && selected !== c.entity;
        const name = label(c.entity);
        const room = Math.max(0, Math.floor((c.w - 9) / CHAR_W));
        const showName = c.w >= NAME_MIN_W && c.h >= NAME_MIN_H && room >= 3;
        const showCount = c.w >= COUNT_MIN_W && c.h >= COUNT_MIN_H;
        return (
          <div
            key={c.entity}
            role="button"
            tabIndex={0}
            aria-label={`${c.entity}, ${c.count} products`}
            aria-pressed={selected === c.entity}
            title={`${c.entity} · ${c.count} · ${c.m3.toFixed(1)} m³${c.noMesh ? " · NO MESH" : ""}`}
            className={`tm-cell${isHot ? " hot" : ""}${selected === c.entity ? " pin" : ""}${isDim ? " dim" : ""}`}
            style={{
              left: c.x,
              top: c.y,
              width: c.w,
              height: c.h,
              background: isHot ? undefined : ramp(c.count / maxCount),
            }}
            onMouseEnter={() => onHover(c.entity)}
            onFocus={() => onHover(c.entity)}
            onBlur={() => onHover(null)}
            onClick={() => onSelect(c.entity)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(c.entity);
              }
            }}
          >
            {c.noMesh && c.w >= 18 && c.h >= 13 && <span className="tm-nm" />}
            {showName && (
              <span className="tm-name">
                {name.length > room
                  ? `${name.slice(0, Math.max(1, room - 1))}…`
                  : name}
              </span>
            )}
            {showCount && <span className="tm-n">{c.count}</span>}
          </div>
        );
      })}
    </div>
  );
}

const TM_CSS = `
#inst-b .tm-host{ position:relative; flex:1 1 auto; min-height:0; overflow:hidden; }
#inst-b .tm-cell{
  position:absolute; overflow:hidden; cursor:pointer;
  display:flex; flex-direction:column; justify-content:flex-start;
  padding:3px 4px; gap:1px;
  border:1px solid rgba(11,12,14,.55);
  transition:background-color .16s linear, opacity .16s linear;
}
#inst-b .tm-cell.hot{ background:linear-gradient(150deg,var(--acc-dim),var(--acc)); border-color:var(--acc); }
#inst-b .tm-cell.pin{ box-shadow:inset 0 0 0 1px var(--acc), inset 3px 0 0 var(--acc); }
#inst-b .tm-cell.dim{ opacity:.32; }
#inst-b .tm-cell:focus-visible{ outline:1px solid var(--acc); outline-offset:-3px; }
#inst-b .tm-name{
  font-size:8.5px; letter-spacing:.08em; line-height:1.15; color:var(--fg);
  white-space:nowrap; overflow:hidden;
}
#inst-b .tm-n{
  font-size:11px; line-height:1.1; font-variant-numeric:tabular-nums;
  color:var(--fg); opacity:.72;
  white-space:nowrap; overflow:hidden;
}
#inst-b .tm-cell.hot .tm-name{ color:#0b0c0e; }
#inst-b .tm-cell.hot .tm-n{ color:#0b0c0e; opacity:.85; }
#inst-b .tm-nm{
  position:absolute; top:3px; right:3px; width:4px; height:4px; background:var(--acc);
}
#inst-b .tm-cell.hot .tm-nm{ background:#0b0c0e; }
#inst-b .tm-empty{ padding:14px 12px; font-size:9px; letter-spacing:.1em; color:var(--mut2); }
`;
