"use client";

import {
  createContext, useCallback, useContext, useMemo, useState,
  type ReactNode,
} from "react";

export type Selection =
  | { kind: "entity"; value: string; storey_guid?: string; storey_label?: string }
  | { kind: "storey"; value: string; label?: string }
  | { kind: "type"; value: string }
  | { kind: "material"; value: string }
  | { kind: "untyped" }
  | null;

type Ctx = {
  selection: Selection;
  toggleEntity: (entity: string, storey_guid?: string, storey_label?: string) => void;
  toggleStorey: (storey_guid: string, label?: string) => void;
  toggleType: (type_name: string) => void;
  toggleMaterial: (material: string) => void;
  toggleUntyped: () => void;
  clear: () => void;
};

const SelectionContext = createContext<Ctx | null>(null);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<Selection>(null);

  const toggleEntity = useCallback((entity: string, storey_guid?: string, storey_label?: string) => {
    setSelection(cur =>
      cur && cur.kind === "entity"
        && cur.value === entity
        && (cur.storey_guid ?? null) === (storey_guid ?? null)
        ? null
        : { kind: "entity", value: entity, storey_guid, storey_label }
    );
  }, []);
  const toggleStorey = useCallback((storey_guid: string, label?: string) => {
    setSelection(cur =>
      cur && cur.kind === "storey" && cur.value === storey_guid
        ? null
        : { kind: "storey", value: storey_guid, label }
    );
  }, []);
  const toggleType = useCallback((type_name: string) => {
    setSelection(cur =>
      cur && cur.kind === "type" && cur.value === type_name
        ? null
        : { kind: "type", value: type_name }
    );
  }, []);
  const toggleMaterial = useCallback((material: string) => {
    setSelection(cur =>
      cur && cur.kind === "material" && cur.value === material
        ? null
        : { kind: "material", value: material }
    );
  }, []);
  const toggleUntyped = useCallback(() => {
    setSelection(cur => (cur && cur.kind === "untyped" ? null : { kind: "untyped" }));
  }, []);
  const clear = useCallback(() => setSelection(null), []);

  const value = useMemo(
    () => ({ selection, toggleEntity, toggleStorey, toggleType, toggleMaterial, toggleUntyped, clear }),
    [selection, toggleEntity, toggleStorey, toggleType, toggleMaterial, toggleUntyped, clear]
  );
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function useSelection() {
  const c = useContext(SelectionContext);
  if (!c) throw new Error("useSelection must be inside SelectionProvider");
  return c;
}
