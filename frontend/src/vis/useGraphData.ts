import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { GraphFrame, GraphMeta } from "./types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

type GraphDataResponse = {
  frames: GraphFrame[];
  meta: GraphMeta;
  symmetric: boolean;
};

// Enums matching backend
export type SmoothingAlgorithm = "none" | "moving_average" | "exponential" | "gaussian";
export type InterpolationAlgorithm = "none" | "linear" | "cubic_spline" | "b_spline" | "univariate_spline";
export type CorrelationMethod = "pearson" | "spearman" | "partial";

// ABIDE file info from backend
export type AbideFile = {
  path: string;
  subject_id: string;
  site: string;
  version: string;
};

export type CorrelationMethodInfo = {
  id: string;
  name: string;
  description: string;
  symmetric: boolean;
  params: Array<{
    name: string;
    type: string;
    default: number | null;
    min: number;
    max: number;
  }>;
};

// Hook to list available ABIDE files
export function useAbideFiles() {
  return useQuery<{ files: AbideFile[]; data_dir: string }>({
    queryKey: ["abideFiles"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/abide/files`);
      if (!res.ok) throw new Error(`Failed to list files (${res.status})`);
      return res.json();
    },
  });
}

// Hook to list available correlation methods
export function useCorrelationMethods() {
  return useQuery<{ methods: CorrelationMethodInfo[] }>({
    queryKey: ["correlationMethods"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/abide/methods`);
      if (!res.ok) throw new Error(`Failed to list methods (${res.status})`);
      return res.json();
    },
  });
}

// Parameters for ABIDE data fetching
export type AbideParams = {
  filePath: string | null;
  method: CorrelationMethod | null;
  windowSize: number;
  step: number;
  threshold: number | null;
  smoothing: SmoothingAlgorithm;
  interpolation: InterpolationAlgorithm;
  interpolationFactor: number;
};

const DEFAULT_ABIDE_PARAMS: AbideParams = {
  filePath: null,
  method: null,
  windowSize: 30,
  step: 1,
  threshold: null,
  smoothing: "none",
  interpolation: "none",
  interpolationFactor: 2,
};

// Main hook for ABIDE data
export function useAbideData(params: Partial<AbideParams> = {}) {
  const p = { ...DEFAULT_ABIDE_PARAMS, ...params };
  const [time, setTime] = useState<number>(0);

  const dataQuery = useQuery<GraphDataResponse>({
    queryKey: ["abideData", p.filePath, p.method, p.windowSize, p.step, p.threshold, p.smoothing, p.interpolation, p.interpolationFactor],
    queryFn: async () => {
      if (!p.filePath) {
        throw new Error("No file selected");
      }
      if (!p.method) {
        throw new Error("No correlation method selected");
      }

      const url = new URL(`${API_URL}/abide/data`);
      url.searchParams.set("file_path", p.filePath);
      url.searchParams.set("method", p.method);
      url.searchParams.set("window_size", p.windowSize.toString());
      url.searchParams.set("step", p.step.toString());

      if (p.threshold !== null) {
        url.searchParams.set("threshold", p.threshold.toString());
      }
      if (p.smoothing !== "none") {
        url.searchParams.set("smoothing", p.smoothing);
      }
      if (p.interpolation !== "none") {
        url.searchParams.set("interpolation", p.interpolation);
        url.searchParams.set("interpolation_factor", p.interpolationFactor.toString());
      }

      const res = await fetch(url.toString());
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Data fetch failed (${res.status}): ${text}`);
      }
      return res.json();
    },
    enabled: !!p.filePath && !!p.method,
    retry: 1,
  });

  const meta = dataQuery.data?.meta;
  const allFrames = dataQuery.data?.frames ?? [];

  useEffect(() => {
    if (meta && meta.available_timestamps.length > 0) {
      if (!meta.available_timestamps.includes(time)) {
        setTime(meta.available_timestamps[0]);
      }
    }
  }, [meta, time]);

  const normalizedTime = useMemo(() => {
    if (!meta || meta.available_timestamps.length === 0) return 0;
    const times = meta.available_timestamps;
    if (!times.includes(time)) return times[0];
    return time;
  }, [meta, time]);

  const frame = useMemo(() => {
    if (allFrames.length === 0 || !meta) return undefined;
    return allFrames.find((f) => f.timestamp === normalizedTime);
  }, [allFrames, normalizedTime, meta]);

  return {
    frame,
    allFrames,
    meta: meta ?? { available_timestamps: [], node_attributes: [], edge_attributes: [], edge_weight_min: 0, edge_weight_max: 255 },
    symmetric: dataQuery.data?.symmetric ?? true,
    time: normalizedTime,
    isLoading: dataQuery.isLoading || dataQuery.isPending,
    isFetching: dataQuery.isFetching,
    error: dataQuery.error,
    refetch: () => dataQuery.refetch(),
    setTime,
  };
}

