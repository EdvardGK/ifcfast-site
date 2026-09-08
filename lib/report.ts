/**
 * lib/report.ts — the instrument's REPORT export (CSV half).
 * ==================================================================
 * ONE snapshot type. The instrument builds a `ReportSnapshot` from the
 * SAME derived data its panels render (`scoped` → `dist` / `materials`,
 * `storeys` + `storeyCount`, `manifest.types`, `q`), so a report can
 * never disagree with what is on screen — the numbers are not recomputed
 * here, only formatted.
 *
 * The selection is captured PINNED (storey / entity / type / product),
 * never `sel.hover`: a hover previews an isolation for as long as the
 * pointer is on a row and must not leak into a file. Ghost state is a
 * viewer treatment, not a filter, so it is irrelevant to the report.
 *
 * CSV conventions (fixed, so a consumer can rely on them):
 *   • UTF-8 with BOM — Excel reads æøå correctly without an import wizard.
 *   • CRLF line endings, RFC 4180 quoting (`"` doubled inside quotes).
 *   • Numbers raw: no thousands separators, `.` decimal point, m³/m² at
 *     3 decimals. A locale-formatted number is not data.
 *   • Line 1 is a `# ifcfast report …` comment carrying model, schema,
 *     the filter in force, the timestamp and the provenance line. Line 2
 *     is the column header. Excel and LibreOffice both import this
 *     (the comment lands as a single-cell first row).
 *   • Missing values are empty, never 0 and never "N/A".
 *
 * The PDF half lives in lib/report-pdf.ts and is loaded with
 * `await import()` so jspdf never enters the landing's first-load JS.
 */

export type ReportTable = "quantities-by-class" | "storeys" | "type-register" | "materials";

export const REPORT_TABLES: { key: ReportTable; label: string }[] = [
  { key: "quantities-by-class", label: "QUANTITIES BY CLASS" },
  { key: "storeys", label: "STOREYS" },
  { key: "type-register", label: "TYPE REGISTER" },
  { key: "materials", label: "MATERIALS" },
];

export type ReportSnapshot = {
  model: {
    /** file name as the header reports it */
    name: string;
    /** file name without extension — the filename stem of every export */
    stem: string;
    schema: string;
    project: string;
    authoringApp: string;
    lengthUnit: string;
    unitScale: number;
    sizeBytes: number;
    parseMs: number;
    entities: number;
    cacheKey: string;
  };
  /** ifcfast version that produced the substrate (manifest.generated_with) */
  version: string;
  generatedAt: Date;
  /** the pinned selection, spelled out — "whole model" when nothing is pinned */
  filterLabel: string;
  filter: {
    storey: string | null;
    entity: string | null;
    type: string | null;
    product: string | null;
  };
  quantities: {
    products: number;
    m3: number;
    m2: number;
    materials: number | null;
    meshedPct: number | null;
  };
  /** the treemap's rows: storey-scoped, ranked by count */
  classes: {
    entity: string;
    count: number;
    m3: number;
    m2: number;
    noMesh: boolean;
    /** false where the panel dims the row (outside an entity / type isolation) */
    inFilter: boolean;
  }[];
  /** the storey stack's rows, top elevation first, UNPLACED last */
  storeys: {
    guid: string;
    name: string;
    /** null for the UNPLACED bucket */
    elevation: number | null;
    products: number;
    /** true when this storey is the pinned scope (or nothing is pinned) */
    inFilter: boolean;
  }[];
  /** the type register's rows — every type, with the panel's dim state */
  types: {
    entity: string;
    typeName: string;
    count: number;
    bytes: number;
    inFilter: boolean;
  }[];
  /** materials in scope, ranked by count */
  materials: { name: string; count: number }[];
  /**
   * A PNG of the live viewport, captured at report time from the very
   * canvas on screen (StreamViewer's WebGL buffer, model-viewer's
   * `toDataURL()`, or the graph pane's SVG serialised) — never re-rendered
   * off-screen, so the picture and the numbers describe the same moment.
   * PDF only; null when the capture is unavailable.
   */
  viewport: { dataUrl: string; width: number; height: number; label: string } | null;
  /** true while geometry is still streaming: materials / mesh coverage are
   *  not yet known, and the report says so instead of exporting zeroes */
  provisional: boolean;
};

/* ------------------------------------------------------------------ */
/* the provenance line — one string, used by BOTH halves               */
/* ------------------------------------------------------------------ */

export const REPORT_PROVENANCE = "generated in the browser, nothing uploaded";

export function isoStamp(d: Date): string {
  // local wall-clock, second precision, no timezone gymnastics in a filename
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(
    d.getMinutes(),
  )}:${p(d.getSeconds())}`;
}

export function dateStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** the one header line every export carries, PDF and CSV alike */
export function reportHeaderLine(s: ReportSnapshot, table?: ReportTable): string {
  const bits = [
    "ifcfast report",
    s.model.name,
    s.model.schema,
    table ? `table: ${table}` : null,
    `filter: ${s.filterLabel}`,
    `generated ${isoStamp(s.generatedAt)}`,
    `ifcfast ${s.version}`,
    REPORT_PROVENANCE,
  ].filter(Boolean);
  return bits.join(" · ");
}

/* ------------------------------------------------------------------ */
/* CSV primitives                                                      */
/* ------------------------------------------------------------------ */

const CRLF = "\r\n";

/** RFC 4180: quote when the field carries a delimiter, a quote, a newline
 *  or edge whitespace; a literal quote is doubled. */
export function csvField(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "boolean" ? (v ? "true" : "false") : String(v);
  if (s === "") return "";
  if (/[",\r\n]/.test(s) || s !== s.trim()) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** raw number, `.` decimal point, no grouping — data, not presentation */
export function num(v: number | null | undefined, d = 3): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "";
  return v.toFixed(d);
}

function rowsToCsv(header: string[], rows: (string | number | boolean | null)[][]): string {
  const out = [header.map(csvField).join(",")];
  for (const r of rows) out.push(r.map(csvField).join(","));
  return out.join(CRLF);
}

/* ------------------------------------------------------------------ */
/* the four tables                                                     */
/* ------------------------------------------------------------------ */

type Table = { header: string[]; rows: (string | number | boolean | null)[][] };

function tableOf(s: ReportSnapshot, table: ReportTable): Table {
  switch (table) {
    case "quantities-by-class":
      return {
        header: ["entity", "products", "volume_m3", "area_m2", "has_mesh", "in_filter"],
        rows: s.classes.map((c) => [c.entity, c.count, num(c.m3), num(c.m2), !c.noMesh, c.inFilter]),
      };
    case "storeys":
      return {
        header: ["storey", "elevation_m", "products", "storey_guid", "in_filter"],
        rows: s.storeys.map((st) => [
          st.name,
          st.elevation === null ? "" : num(st.elevation),
          st.products,
          st.guid,
          st.inFilter,
        ]),
      };
    case "type-register":
      return {
        header: ["entity", "type_name", "products", "glb_bytes", "in_filter"],
        rows: s.types.map((t) => [t.entity, t.typeName, t.count, t.bytes || "", t.inFilter]),
      };
    case "materials":
      return {
        header: ["material", "products"],
        rows: s.materials.map((m) => [m.name, m.count]),
      };
  }
}

/** the file body for one table, comment line first. No BOM (see `csvBlob`). */
export function buildCsv(s: ReportSnapshot, table: ReportTable): string {
  const t = tableOf(s, table);
  return [`# ${reportHeaderLine(s, table)}`, rowsToCsv(t.header, t.rows)].join(CRLF) + CRLF;
}

/**
 * All four tables in ONE file — the fallback for a browser that refuses a
 * burst of programmatic downloads from a single gesture. Sections are
 * separated by a blank line and a `# table: <name>` marker, which is the
 * same comment convention as the single-table files.
 */
export function buildCombinedCsv(s: ReportSnapshot): string {
  const parts: string[] = [`# ${reportHeaderLine(s)}`];
  for (const { key } of REPORT_TABLES) {
    const t = tableOf(s, key);
    parts.push("", `# table: ${key}`, rowsToCsv(t.header, t.rows));
  }
  return parts.join(CRLF) + CRLF;
}

/** how many data rows a table carries — what a caller (or a test) counts */
export function csvRowCount(s: ReportSnapshot, table: ReportTable): number {
  return tableOf(s, table).rows.length;
}

/* ------------------------------------------------------------------ */
/* blobs + filenames + the download gesture                            */
/* ------------------------------------------------------------------ */

/** UTF-8 **with BOM** — without it Excel mangles æøå on a double-click */
export function csvBlob(body: string): Blob {
  return new Blob(["﻿", body], { type: "text/csv;charset=utf-8" });
}

const SAFE = /[^A-Za-z0-9._-]+/g;

export function reportFileName(s: ReportSnapshot, part: string, ext: string): string {
  const stem = (s.model.stem || "model").replace(SAFE, "-").replace(/^-+|-+$/g, "") || "model";
  return `${stem}_${part}_${dateStamp(s.generatedAt)}.${ext}`;
}

/**
 * Hand a blob to the browser as a download. `blob:` object URLs are what
 * the site's CSP allows (`connect-src 'self' blob:`); nothing here touches
 * the network, so no request is made at all.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Chrome needs the URL alive until the download has actually started
  setTimeout(() => URL.revokeObjectURL(url), 20_000);
}

export function downloadCsvTable(s: ReportSnapshot, table: ReportTable): void {
  downloadBlob(csvBlob(buildCsv(s, table)), reportFileName(s, table, "csv"));
}

/**
 * All four tables, one click. Chrome (and Firefox) allow a burst of
 * programmatic downloads from one user gesture; the small stagger is what
 * keeps Chrome from folding them into a single "download multiple files"
 * prompt race. If a browser ever refuses, `buildCombinedCsv` is the
 * one-file fallback and is a menu entry of its own.
 */
export async function downloadAllCsvTables(s: ReportSnapshot): Promise<void> {
  for (const { key } of REPORT_TABLES) {
    downloadCsvTable(s, key);
    await new Promise((r) => setTimeout(r, 180));
  }
}

export function downloadCombinedCsv(s: ReportSnapshot): void {
  downloadBlob(csvBlob(buildCombinedCsv(s)), reportFileName(s, "all-tables", "csv"));
}
