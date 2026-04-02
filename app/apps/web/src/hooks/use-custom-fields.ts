"use client";

import { useState, useEffect } from "react";
import type { CustomFieldDef, PipelineStageDef } from "@/lib/custom-fields";

/** Load custom field definitions from settings API */
export function useCustomFields(entityType?: "company" | "contact" | "deal") {
  const [fields, setFields] = useState<CustomFieldDef[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/settings/data-model")
      .then((r) => (r.ok ? r.json() : { fields: [] }))
      .then((data) => {
        const all = (data.fields || []) as CustomFieldDef[];
        setFields(entityType ? all.filter((f) => f.entityType === entityType) : all);
      })
      .catch(() => setFields([]))
      .finally(() => setLoading(false));
  }, [entityType]);

  return { fields, loading };
}

/** Load pipeline stage definitions from settings API */
export function usePipelineStages() {
  const [stages, setStages] = useState<PipelineStageDef[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/settings/stages")
      .then((r) => (r.ok ? r.json() : { stages: [] }))
      .then((data) => setStages(data.stages || []))
      .catch(() => setStages([]))
      .finally(() => setLoading(false));
  }, []);

  return { stages, loading };
}
