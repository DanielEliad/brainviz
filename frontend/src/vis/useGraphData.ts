import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { GraphFrame, GraphMeta } from "./types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

type GraphDataResponse = {
  frames: GraphFrame[];
  meta: GraphMeta;
};

export type SmoothingAlgorithm = "none" | "moving_average" | "exponential" | "gaussian";
export type InterpolationAlgorithm = "none" | "linear" | "cubic_spline" | "b_spline" | "univariate_spline";

export function useGraphData(
  smoothing: SmoothingAlgorithm = "none",
  interpolation: InterpolationAlgorithm = "none",
  interpolationFactor: number = 2
) {
  const [time, setTime] = useState<number>(0);

  const dataQuery = useQuery<GraphDataResponse>({
    queryKey: ["graphData", smoothing, interpolation, interpolationFactor],
    queryFn: async () => {
      const url = new URL(`${API_URL}/graph/data`);
      if (smoothing !== "none") {
        url.searchParams.set("smoothing", smoothing);
      }
      if (interpolation !== "none") {
        url.searchParams.set("interpolation", interpolation);
        url.searchParams.set("interpolation_factor", interpolationFactor.toString());
      }
      const res = await fetch(url.toString());
      if (!res.ok) {
        throw new Error(`Graph data fetch failed (${res.status})`);
      }
      const data = (await res.json()) as GraphDataResponse;
      return data;
    },
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
    if (!times.includes(time)) {
      return times[0];
    }
    return time;
  }, [meta, time]);

  const frame = useMemo(() => {
    if (allFrames.length === 0 || !meta) return undefined;
    return allFrames.find((f) => f.timestamp === normalizedTime);
  }, [allFrames, normalizedTime, meta]);

  const wrappedSetTime = (newTime: number) => {
    setTime(newTime);
  };

  return {
    frame,
    meta: meta ?? { available_timestamps: [], node_attributes: [], edge_attributes: [] },
    time: normalizedTime,
    isLoading: dataQuery.isLoading || dataQuery.isPending || (!dataQuery.data && !dataQuery.error),
    error: dataQuery.error,
    refetch: () => {
      dataQuery.refetch();
    },
    setTime: wrappedSetTime,
  };
}
