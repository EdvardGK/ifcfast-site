"use client";

/**
 * FindingsView — the QC tab inside QtoPanel.
 *
 * Principle: expose every measure ifcfast can compute. Don't curate,
 * don't pick a "primary" unit per class. Findings here are limited to
 * actual structural problems with the IFC and to silent inconsistencies
 * within ifcfast's own output bundle — never to value judgments like
 * "this volume disagrees with another tool's interpretation".
 *
 * Two finding sources, unified:
 *
 *   1. **Structural findings** — derived from graph + qto JSON.
 *      computeFindings(): untyped products, storeyless products,
 *      spatial orphans, classes with no body representation, unused
 *      layer sets.
 *
 *   2. **Parser capability gaps** — derived from observable graph
 *      signals via buildCapabilityGaps(). When the parser closes a
 *      gap (e.g. ships IfcRelDefinesByType natively, promotes
 *      IfcSpace to a product), the corresponding row disappears the
 *      next time the sidecars regenerate — no site code change
 *      needed.
 *
 * Click semantics: every row with `entity` cross-filters via
 * SelectionProvider, same as Types / Materials rows.
 *
 * Performance note: if QTO becomes too slow on a given product class
 * (e.g. fixtures where you only need count × manufacturer catalog data
 * anyway), the right answer is to make ifcfast faster, not to skip the
 * class. That's a parser issue, not a UX one.
 *
 * Epistemic note: ifcfast is a data provider, not an interpreter. The
 * volume of a lightbulb's mesh is the bulb envelope, not the glass
 * mass. The volume of a "kombibaffel" is its outer hull, not the metal.
 * Consumers who multiply mesh volume × material density and get garbage
 * are mis-using the data — that's not a finding ifcfast should hide
 * the numbers to prevent. We ship what's computable. The consumer
 * brings the domain head to know when to trust which number.
 */

import { useMemo } from "react";
import {
  buildCapabilityGaps,
  computeFindings,
  type Finding,
  type GraphLike,
  type QtoLike,
} from "@/app/dev/workbench/findings";
import type { Selection } from "./selection-context";

import { SEVERITY_COLOR, COLOR_CALLOUT, COLOR_CALLOUT_SOFT } from "./ifc-palette";

const SEVERITY_DOT: Record<Finding["severity"], string> = SEVERITY_COLOR;

const SEVERITY_LABEL: Record<Finding["severity"], string> = {
  error: "ERR",
  warn: "WARN",
  info: "INFO",
};

interface Props {
  qto: QtoLike | null;
  graph: GraphLike | null;
  toggleEntity: (entity: string, storey_guid?: string, storey_label?: string) => void;
  selection: Selection;
}

export function FindingsView({ qto, graph, toggleEntity, selection }: Props) {
  const findings = useMemo<Finding[]>(() => {
    if (!qto || !graph) return [];
    // Capability-gap rows derive from live graph signals — they
    // self-disable when the parser closes the underlying gap and the
    // sidecar regenerates. No code change needed here when ifcfast
    // ships IfcRelDefinesByType, IfcSpace promotion, etc.
    return [...buildCapabilityGaps(graph), ...computeFindings(qto, graph)];
  }, [qto, graph]);

  const counts = useMemo(() => {
    const c = { error: 0, warn: 0, info: 0 };
    for (const f of findings) c[f.severity]++;
    return c;
  }, [findings]);

  const selectedEntity = selection?.kind === "entity" ? selection.value : null;

  if (!qto || !graph) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs font-mono text-muted">
        loading…
      </div>
    );
  }

  return (
    <>
      {/* Severity strip */}
      <div className="flex items-center gap-3 px-5 py-2 border-b border-line bg-bg/30 text-[11px] font-mono flex-shrink-0">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: SEVERITY_COLOR.error }} />
          <span className="text-fg font-medium tabular-nums">{counts.error}</span>
          <span className="text-muted">err</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: SEVERITY_COLOR.warn }} />
          <span className="text-fg font-medium tabular-nums">{counts.warn}</span>
          <span className="text-muted">warn</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: SEVERITY_COLOR.info }} />
          <span className="text-fg font-medium tabular-nums">{counts.info}</span>
          <span className="text-muted">info</span>
        </span>
        <span className="ml-auto text-muted text-[10px] truncate">
          IFC structure + ifcfast output consistency · no workflow opinions
        </span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto scroll-thin">
        {findings.length === 0 && (
          <div className="px-5 py-8 text-center text-muted text-[12px] font-mono">
            no findings
          </div>
        )}
        <ul>
          {findings.map((f) => {
            const isSel = !!f.entity && selectedEntity === f.entity;
            const clickable = !!f.entity;
            return (
              <li
                key={f.id}
                onClick={() => f.entity && toggleEntity(f.entity)}
                className={`px-5 py-2.5 border-b border-line/60 transition-colors ${
                  clickable ? "cursor-pointer" : ""
                } ${isSel ? "" : "hover:bg-bg/60"}`}
                style={isSel ? { background: COLOR_CALLOUT_SOFT } : undefined}
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className="mt-1.5 h-2 w-2 rounded-full shrink-0"
                    style={{ background: SEVERITY_DOT[f.severity] }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span
                        className="text-[10px] font-mono uppercase tracking-wider"
                        style={{ color: SEVERITY_COLOR[f.severity] }}
                      >
                        {SEVERITY_LABEL[f.severity]}
                      </span>
                      <span className="text-[10px] font-mono text-muted uppercase tracking-wider">
                        {f.category}
                      </span>
                      <span
                        className="text-[12px] font-medium"
                        style={isSel ? { color: COLOR_CALLOUT } : { color: "var(--color-fg)" }}
                      >
                        {f.title}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-muted leading-snug">
                      {f.detail}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
