/**
 * lib/report-pdf.ts — the instrument's REPORT export (PDF half).
 * ==================================================================
 * Loaded ONLY through `await import("@/lib/report-pdf")` from the
 * instrument's REPORT menu, so jspdf + jspdf-autotable (~370 kB raw)
 * land in their own chunk and never enter the landing's first-load JS.
 * A visitor who never exports never downloads a byte of it.
 *
 * Layout: A4 portrait, graphite-on-white, Helvetica (a jsPDF built-in —
 * nothing is fetched at runtime, which the site's CSP would block
 * anyway). One page for the sample; autoTable spills to a second when a
 * real model's tables are long, and the footer numbers every page.
 *
 *   title block ── model / schema / source app / units / size / parse
 *   filter line ── the pinned selection, spelled out
 *   QUANTITIES  ── the same five readouts the strip shows
 *   VIEWPORT    ── a PNG snapshot of the live viewport (never refetched)
 *   STOREYS · CLASS DISTRIBUTION · TOP MATERIALS
 *
 * Every number comes from the `ReportSnapshot` the instrument built from
 * its own panel data — nothing is recomputed here.
 */

import { jsPDF } from "jspdf";
import autoTable, { type UserOptions } from "jspdf-autotable";
import {
  REPORT_PROVENANCE,
  dateStamp,
  isoStamp,
  reportFileName,
  type ReportSnapshot,
} from "./report";

/* graphite-on-white print palette (RGB triples) */
const INK: [number, number, number] = [26, 29, 33];
const MUT: [number, number, number] = [110, 116, 124];
const RULE: [number, number, number] = [200, 205, 212];
const ACC: [number, number, number] = [193, 96, 20]; // the amber, darkened for paper
const PANEL: [number, number, number] = [246, 246, 244];

const M = 14; // page margin, mm
const W = 210;
const H = 297;
const CW = W - M * 2; // content width

const nf = (v: number, d = 0) =>
  v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

type Doc = jsPDF & { lastAutoTable?: { finalY?: number } };

/** the whole report, as a Blob. Never touches the network. */
export function buildReportPdf(s: ReportSnapshot): Blob {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" }) as Doc;
  doc.setFont("helvetica", "normal");

  let y = M;

  /* ── title block ─────────────────────────────────────────────── */
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("IFCFAST REPORT", M, y + 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUT);
  doc.text(`ifcfast ${s.version} · ${REPORT_PROVENANCE}`, W - M, y + 4, { align: "right" });
  y += 7;
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.4);
  doc.line(M, y, W - M, y);
  y += 5;

  /* model identity — a 3-column key/value grid */
  const fields: [string, string][] = [
    ["MODEL", s.model.name],
    ["SCHEMA", s.model.schema],
    ["PROJECT", s.model.project || "—"],
    ["SOURCE APP", s.model.authoringApp || "—"],
    ["UNITS", `${s.model.lengthUnit} · ×${s.model.unitScale}`],
    ["SIZE", `${nf(s.model.sizeBytes / 1e6, 2)} MB`],
    ["PARSE", `${nf(s.model.parseMs, 1)} ms`],
    ["ENTITIES", nf(s.model.entities)],
    ["CACHE", s.model.cacheKey || "—"],
  ];
  const colW = CW / 3;
  fields.forEach(([k, v], i) => {
    const cx = M + (i % 3) * colW;
    const cy = y + Math.floor(i / 3) * 8;
    doc.setFontSize(6);
    doc.setTextColor(...MUT);
    doc.text(k, cx, cy);
    doc.setFontSize(8.5);
    doc.setTextColor(...INK);
    doc.text(fit(doc, v, colW - 3, 8.5), cx, cy + 4);
  });
  y += Math.ceil(fields.length / 3) * 8 + 1;

  /* ── the filter line — what this report actually covers ──────── */
  doc.setFillColor(...PANEL);
  doc.rect(M, y, CW, 9, "F");
  doc.setFontSize(6);
  doc.setTextColor(...MUT);
  doc.text("FILTER", M + 2.5, y + 3.4);
  doc.setFontSize(9);
  doc.setTextColor(...ACC);
  doc.setFont("helvetica", "bold");
  doc.text(fit(doc, s.filterLabel, CW - 60, 9), M + 2.5, y + 7.4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...MUT);
  doc.text(`generated ${isoStamp(s.generatedAt)}`, W - M - 2.5, y + 7.4, { align: "right" });
  y += 13;

  /* ── QUANTITIES strip ────────────────────────────────────────── */
  const cells: [string, string, string][] = [
    ["PRODUCTS", nf(s.quantities.products), "in scope"],
    ["SOLID VOL", nf(s.quantities.m3, 1), "m³"],
    ["SURFACE", nf(s.quantities.m2, 0), "m²"],
    ["MATERIALS", s.quantities.materials === null ? "—" : nf(s.quantities.materials), "distinct"],
    ["MESHED", s.quantities.meshedPct === null ? "—" : nf(s.quantities.meshedPct, 1), "%"],
  ];
  const qw = CW / cells.length;
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.2);
  cells.forEach(([k, v, u], i) => {
    const cx = M + i * qw;
    doc.rect(cx, y, qw, 14);
    doc.setFontSize(6);
    doc.setTextColor(...MUT);
    doc.text(k, cx + 2.5, y + 4);
    doc.setFontSize(13);
    doc.setTextColor(...INK);
    doc.text(v, cx + 2.5, y + 10.5);
    doc.setFontSize(6);
    doc.setTextColor(...MUT);
    doc.text(u, cx + qw - 2.5, y + 10.5, { align: "right" });
  });
  y += 18;

  /* ── VIEWPORT snapshot ───────────────────────────────────────── */
  if (s.viewport) {
    const maxH = 62;
    const ar = s.viewport.width / s.viewport.height || 16 / 9;
    let iw = CW;
    let ih = iw / ar;
    if (ih > maxH) {
      ih = maxH;
      iw = ih * ar;
    }
    // a very wide viewport (the instrument's pane is ~4:1) would otherwise
    // reach full bleed and push the tables onto a second page for nothing
    if (iw > CW) {
      iw = CW;
      ih = iw / ar;
    }
    const ix = M + (CW - iw) / 2;
    doc.addImage(s.viewport.dataUrl, "PNG", ix, y, iw, ih, undefined, "FAST");
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.2);
    doc.rect(ix, y, iw, ih);
    doc.setFontSize(6);
    doc.setTextColor(...MUT);
    doc.text(s.viewport.label, M, y + ih + 3.5);
    y += ih + 7;
  }

  /* ── tables ──────────────────────────────────────────────────── */
  const head = (title: string, note: string, box?: { left: number; right: number }) => {
    doc.setFontSize(7);
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.text(title, box?.left ?? M, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUT);
    doc.setFontSize(6.5);
    doc.text(note, box ? W - box.right : W - M, y, { align: "right" });
    y += 1.5;
  };

  const table = (
    columns: string[],
    body: (string | number)[][],
    widths?: UserOptions["columnStyles"],
    box?: { left: number; right: number; startY?: number },
  ): number => {
    autoTable(doc, {
      startY: box?.startY ?? y,
      head: [columns],
      body,
      margin: { left: box?.left ?? M, right: box?.right ?? M, top: M, bottom: 16 },
      theme: "plain",
      styles: {
        font: "helvetica",
        fontSize: 7.5,
        cellPadding: { top: 0.95, bottom: 0.95, left: 1.4, right: 1.4 },
        textColor: INK,
        lineColor: RULE,
        lineWidth: 0,
      },
      headStyles: {
        fontStyle: "bold",
        fontSize: 6.5,
        textColor: MUT,
        lineWidth: { bottom: 0.3 },
        lineColor: RULE,
      },
      alternateRowStyles: { fillColor: PANEL },
      columnStyles: widths ?? {},
    });
    const end = doc.lastAutoTable?.finalY ?? y;
    if (!box) y = end + 5;
    return end;
  };

  head("STOREY SECTION", `${s.storeys.length} rows`);
  table(
    ["STOREY", "ELEVATION m", "PRODUCTS"],
    s.storeys.map((st) => [
      st.name,
      st.elevation === null ? "—" : nf(st.elevation, 2),
      nf(st.products),
    ]),
    { 1: { halign: "right", cellWidth: 30 }, 2: { halign: "right", cellWidth: 26 } },
  );

  /* the two ranked distributions sit side by side: they are read against
     each other, and stacking them cost a whole page for five rows. */
  const gap = 6;
  const halfW = (CW - gap) / 2;
  const leftBox = { left: M, right: M + halfW + gap };
  const rightBox = { left: M + halfW + gap, right: M };
  const topMats = s.materials.slice(0, 24);
  const rowY = y;

  head("ENTITY DISTRIBUTION", `${s.classes.length} classes`, leftBox);
  head("MATERIALS", s.provisional ? "pending" : `${s.materials.length} distinct`, rightBox);
  y = rowY + 1.5;

  const endL = table(
    ["CLASS", "N", "VOLUME m³", "AREA m²"],
    s.classes.map((c) => [c.entity, nf(c.count), nf(c.m3, 3), nf(c.m2, 3)]),
    {
      1: { halign: "right", cellWidth: 10 },
      2: { halign: "right", cellWidth: 20 },
      3: { halign: "right", cellWidth: 20 },
    },
    { ...leftBox, startY: y },
  );

  let endR = y;
  if (topMats.length) {
    endR = table(
      ["MATERIAL", "N"],
      topMats.map((m) => [m.name, nf(m.count)]),
      { 1: { halign: "right", cellWidth: 12 } },
      { ...rightBox, startY: y },
    );
  } else {
    doc.setFontSize(7.5);
    doc.setTextColor(...MUT);
    doc.text(
      s.provisional ? "not yet known" : "no material assignments in scope",
      rightBox.left,
      y + 4,
    );
    endR = y + 5;
  }
  y = Math.max(endL, endR) + 5;

  /* ── footer on every page ────────────────────────────────────── */
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.2);
    doc.line(M, H - 11, W - M, H - 11);
    doc.setFontSize(6.5);
    doc.setTextColor(...MUT);
    doc.setFont("helvetica", "normal");
    doc.text(
      `${s.model.name} · ${s.model.schema} · filter: ${s.filterLabel} · ${dateStamp(s.generatedAt)}`,
      M,
      H - 7,
    );
    doc.text(`${p} / ${pages}`, W - M, H - 7, { align: "right" });
  }

  return doc.output("blob");
}

export function reportPdfFileName(s: ReportSnapshot): string {
  return reportFileName(s, "report", "pdf");
}

/** shrink a string until it fits `w` mm at `size` pt, ellipsising the tail */
function fit(doc: jsPDF, text: string, w: number, size: number): string {
  doc.setFontSize(size);
  if (doc.getTextWidth(text) <= w) return text;
  let t = text;
  while (t.length > 3 && doc.getTextWidth(`${t}…`) > w) t = t.slice(0, -1);
  return `${t}…`;
}
