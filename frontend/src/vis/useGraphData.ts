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
export type SmoothingAlgorithm =
  | "moving_average"
  | "exponential"
  | "gaussian";
export type InterpolationAlgorithm =
  | "linear"
  | "cubic_spline"
  | "b_spline"
  | "univariate_spline";
export type CorrelationMethod = "pearson" | "spearman" | "wavelet";

// ABIDE file info from backend
export type AbideFile = {
  path: string;
  subject_id: number;
  site: string;
  version: string;
  diagnosis: "ASD" | "HC";
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

// Nested params matching backend Pydantic models
export type SmoothingParams = {
  algorithm: SmoothingAlgorithm;
  window?: number;
  alpha?: number;
  sigma?: number;
};

export type InterpolationParams = {
  algorithm: InterpolationAlgorithm;
  factor?: number;
};

// Parameters for ABIDE data fetching
export type AbideParams = {
  filePath: string | null;
  method: CorrelationMethod | null;
  windowSize: number;
  step: number;
  smoothing: SmoothingAlgorithm | null;
  smoothingWindow: number;
  smoothingAlpha: number;
  smoothingSigma: number;
  interpolation: InterpolationAlgorithm | null;
  interpolationFactor: number;
};

const DEFAULT_ABIDE_PARAMS: AbideParams = {
  filePath: null,
  method: null,
  windowSize: 30,
  step: 1,
  smoothing: null,
  smoothingWindow: 3,
  smoothingAlpha: 0.5,
  smoothingSigma: 1.0,
  interpolation: null,
  interpolationFactor: 2,
};

// Main hook for ABIDE data
export function useAbideData(params: Partial<AbideParams> = {}) {
  const p = { ...DEFAULT_ABIDE_PARAMS, ...params };
  const [time, setTime] = useState<number>(0);

  const dataQuery = useQuery<GraphDataResponse>({
    queryKey: [
      "abideData",
      p.filePath,
      p.method,
      p.windowSize,
      p.step,
      p.smoothing,
      p.smoothingWindow,
      p.smoothingAlpha,
      p.smoothingSigma,
      p.interpolation,
      p.interpolationFactor,
    ],
    queryFn: async () => {
      if (!p.filePath) {
        throw new Error("No file selected");
      }
      if (!p.method) {
        throw new Error("No correlation method selected");
      }

      const body: Record<string, unknown> = {
        file_path: p.filePath,
        method: p.method,
        window_size: p.windowSize,
        step: p.step,
      };

      if (p.smoothing !== null) {
        body.smoothing = {
          algorithm: p.smoothing,
          window: p.smoothingWindow,
          alpha: p.smoothingAlpha,
          sigma: p.smoothingSigma,
        };
      }
      if (p.interpolation !== null) {
        body.interpolation = {
          algorithm: p.interpolation,
          factor: p.interpolationFactor,
        };
      }

      const res = await fetch(`${API_URL}/abide/data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
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
    if (meta && meta.frame_count > 0) {
      if (time < 0 || time >= meta.frame_count) {
        setTime(0);
      }
    }
  }, [meta, time]);

  const normalizedTime = useMemo(() => {
    if (!meta || meta.frame_count === 0) return 0;
    if (time < 0 || time >= meta.frame_count) return 0;
    return time;
  }, [meta, time]);

  const frame = useMemo(() => {
    if (allFrames.length === 0 || !meta) return undefined;
    return allFrames[normalizedTime];
  }, [allFrames, normalizedTime, meta]);

  return {
    frame,
    allFrames,
    meta: meta ?? {
      frame_count: 0,
      node_attributes: [],
      edge_attributes: [],
      edge_weight_min: 0,
      edge_weight_max: 0,
    },
    symmetric: dataQuery.data?.symmetric ?? true,
    time: normalizedTime,
    // Only show loading when actually fetching - not when query is disabled (no file/method selected)
    isLoading: dataQuery.isFetching,
    isFetching: dataQuery.isFetching,
    error: dataQuery.error,
    refetch: dataQuery.refetch,
    setTime,
  };
}
