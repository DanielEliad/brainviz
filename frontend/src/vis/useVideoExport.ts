import { useState, useCallback, useRef } from "react";
import { GraphFrame } from "./types";
import { DataRange, ScaleType } from "./drawFrame";
import { AbideFile } from "./useGraphData";

type ExportState = "idle" | "exporting" | "done" | "error";

type VideoQuality = 1 | 2 | 4;

type UseVideoExportOptions = {
  frames: GraphFrame[];
  playbackSpeed: number;
  symmetric: boolean;
  showArrows?: boolean;
  dataRange: DataRange;  // Required - from meta.edge_weight_min/max
  scaleType?: ScaleType;
  exponent?: number;
  nodeNames?: string[];
  edgeThreshold?: number;
  hiddenNodes?: Set<string>;
  method?: string | null;
  windowSize?: number;
  step?: number;
  smoothing?: string | null;
  smoothingWindow?: number;
  smoothingAlpha?: number;
  smoothingSigma?: number;
  interpolation?: string | null;
  interpolationFactor?: number;
  subjectInfo?: AbideFile | null;
  qualityScale?: VideoQuality;
  width?: number;
  height?: number;
};

export function useVideoExport({
  frames,
  playbackSpeed,
  symmetric,
  showArrows = false,
  dataRange,
  scaleType = "exponential",
  exponent = 1.5,
  nodeNames,
  edgeThreshold = 0,
  hiddenNodes,
  method = null,
  windowSize = 30,
  step = 1,
  smoothing = null,
  smoothingWindow = 3,
  smoothingAlpha = 0.5,
  smoothingSigma = 1.0,
  interpolation = null,
  interpolationFactor = 2,
  subjectInfo,
  qualityScale = 1,
  width = 1920,
  height = 1080,
}: UseVideoExportOptions) {
  const [state, setState] = useState<ExportState>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);

  const exportVideo = useCallback(async () => {
    if (frames.length === 0) {
      setError("No frames to export");
      setState("error");
      return;
    }

    setState("exporting");
    setProgress(0);
    setError(null);

    // Create worker
    const worker = new Worker(
      new URL("./videoExportWorker.ts", import.meta.url),
      { type: "module" }
    );
    workerRef.current = worker;

    worker.onmessage = (e) => {
      const data = e.data;

      if (data.type === "progress") {
        setProgress(data.progress);
      } else if (data.type === "done") {
        const blob = new Blob([data.buffer], { type: "video/mp4" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `brain-visualization-4K-${Date.now()}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        setState("done");
        worker.terminate();
        workerRef.current = null;
      } else if (data.type === "error") {
        setError(data.error);
        setState("error");
        worker.terminate();
        workerRef.current = null;
      }
    };

    worker.onerror = (e) => {
      setError(e.message || "Worker error");
      setState("error");
      worker.terminate();
      workerRef.current = null;
    };

    // Start encoding - pass scaled dimensions to worker
    const scaledWidth = width * qualityScale;
    const scaledHeight = height * qualityScale;

    worker.postMessage({
      type: "start",
      frames,
      playbackSpeed,
      nodeNames,
      edgeThreshold,
      hiddenNodes: hiddenNodes ? Array.from(hiddenNodes) : [],
      method: method ?? "unknown",
      windowSize,
      step,
      smoothing: smoothing ?? "none",
      smoothingWindow,
      smoothingAlpha,
      smoothingSigma,
      interpolation: interpolation ?? "none",
      interpolationFactor,
      subjectInfo: subjectInfo ?? undefined,
      symmetric,
      showArrows,
      dataRange,
      scaleType,
      exponent,
      width: scaledWidth,
      height: scaledHeight,
    });
  }, [frames, playbackSpeed, nodeNames, edgeThreshold, hiddenNodes, method, windowSize, step, smoothing, smoothingWindow, smoothingAlpha, smoothingSigma, interpolation, interpolationFactor, subjectInfo, symmetric, showArrows, dataRange, scaleType, exponent, qualityScale, width, height]);

  const cancel = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
      setState("idle");
      setProgress(0);
    }
  }, []);

  const reset = useCallback(() => {
    setState("idle");
    setProgress(0);
    setError(null);
  }, []);

  return {
    state,
    progress,
    error,
    exportVideo,
    cancel,
    reset,
  };
}
