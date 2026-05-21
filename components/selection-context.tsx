"use client";

import {
  createContext, useCallback, useContext, useMemo, useState,
  type ReactNode,
} from "react";

// `source` identifies the widget that triggered this selection. Other
// widgets check `selection.source === my-id` to decide whether they
// should filter (selection came from elsewhere) or stay full and just
// highlight the picked element (selection came from me).
//
// `instance` kind drills the cross-filter to a single product GUID
// rather than an entire entity class — fired by the spatial graph
// when a node is clicked, by the 3D viewer when an element is
// picked. Carries `entity` alongside the guid so consumers can
// surface "this instance is an IfcWall" without re-joining tables.
export type Selection =
  | ({ kind: "entity"; value: string; storey_guid?: string; storey_label?: string } & { source?: string })
  | ({ kind: "storey"; value: string; label?: string } & { source?: string })
  | ({ kind: "type"; value: string } & { source?: string })
  | ({ kind: "material"; value: string } & { source?: string })
  | ({ kind: "layer_set"; value: string } & { source?: string })
  | ({ kind: "untyped"; entity?: string } & { source?: string })
  | ({ kind: "instance"; value: string; entity?: string; storey_guid?: string; name?: string } & { source?: string })
  | null;

type Ctx = {
  selection: Selection;
  toggleEntity: (entity: string, storey_guid?: string, storey_label?: string, source?: string) => void;
  toggleStorey: (storey_guid: string, label?: string, source?: string) => void;
  toggleType: (type_name: string, source?: string) => void;
  toggleMaterial: (material: string, source?: string) => void;
  toggleLayerSet: (layer_set: string, source?: string) => void;
  toggleUntyped: (opts?: { entity?: string; source?: string }) => void;
  toggleInstance: (guid: string, opts?: { entity?: string; storey_guid?: string; name?: string; source?: string }) => void;
  clear: () => void;
};

const SelectionContext = createContext<Ctx | null>(null);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<Selection>(null);

  const toggleEntity = useCallback((entity: string, storey_guid?: string, storey_label?: string, source?: string) => {
    setSelection(cur =>
      cur && cur.kind === "entity"
        && cur.value === entity
        && (cur.storey_guid ?? null) === (storey_guid ?? null)
        ? null
        : { kind: "entity", value: entity, storey_guid, storey_label, source }
    );
  }, []);
  const toggleStorey = useCallback((storey_guid: string, label?: string, source?: string) => {
    setSelection(cur =>
      cur && cur.kind === "storey" && cur.value === storey_guid
        ? null
        : { kind: "storey", value: storey_guid, label, source }
    );
  }, []);
  const toggleType = useCallback((type_name: string, source?: string) => {
    setSelection(cur =>
      cur && cur.kind === "type" && cur.value === type_name
        ? null
        : { kind: "type", value: type_name, source }
    );
  }, []);
  const toggleMaterial = useCallback((material: string, source?: string) => {
    setSelection(cur =>
      cur && cur.kind === "material" && cur.value === material
        ? null
        : { kind: "material", value: material, source }
    );
  }, []);
  const toggleLayerSet = useCallback((layer_set: string, source?: string) => {
    setSelection(cur =>
      cur && cur.kind === "layer_set" && cur.value === layer_set
        ? null
        : { kind: "layer_set", value: layer_set, source }
    );
  }, []);
  const toggleUntyped = useCallback((opts?: { entity?: string; source?: string }) => {
    const entity = opts?.entity;
    const source = opts?.source;
    setSelection(cur =>
      cur && cur.kind === "untyped" && (cur.entity ?? null) === (entity ?? null)
        ? null
        : { kind: "untyped", entity, source }
    );
  }, []);
  const toggleInstance = useCallback(
    (guid: string, opts?: { entity?: string; storey_guid?: string; name?: string; source?: string }) => {
      setSelection((cur) =>
        cur && cur.kind === "instance" && cur.value === guid
          ? null
          : { kind: "instance", value: guid, entity: opts?.entity, storey_guid: opts?.storey_guid, name: opts?.name, source: opts?.source },
      );
    },
    [],
  );
  const clear = useCallback(() => setSelection(null), []);

  const value = useMemo(
    () => ({ selection, toggleEntity, toggleStorey, toggleType, toggleMaterial, toggleLayerSet, toggleUntyped, toggleInstance, clear }),
    [selection, toggleEntity, toggleStorey, toggleType, toggleMaterial, toggleLayerSet, toggleUntyped, toggleInstance, clear]
  );
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function useSelection() {
  const c = useContext(SelectionContext);
  if (!c) throw new Error("useSelection must be inside SelectionProvider");
  return c;
}
