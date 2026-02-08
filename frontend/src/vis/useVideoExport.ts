import { useState, useCallback, useRef } from "react";
import { GraphFrame } from "./types";
import { DataRange } from "./drawFrame";
import { AbideFile } from "./useGraphData";

type ExportState = "idle" | "exporting" | "done" | "error";

type VideoQuality = 1 | 2 | 4;

type UseVideoExportOptions = {
  frames: GraphFrame[];
  playbackSpeed: number;
  symmetric: boolean;
  dataRange: DataRange;  // Required - from meta.edge_weight_min/max
  nodeNames?: string[];
  edgeThreshold?: number;
  hiddenNodes?: Set<string>;
  smoothing?: string | null;
  interpolation?: string | null;
  subjectInfo?: AbideFile | null;
  qualityScale?: VideoQuality;
  width?: number;
  height?: number;
};

export function useVideoExport({
  frames,
  playbackSpeed,
  symmetric,
  dataRange,
  nodeNames,
  edgeThreshold = 0,
  hiddenNodes,
  smoothing = null,
  interpolation = null,
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
      smoothing: smoothing ?? "none",
      interpolation: interpolation ?? "none",
      subjectInfo: subjectInfo ?? undefined,
      symmetric,
      dataRange,
      width: scaledWidth,
      height: scaledHeight,
    });
  }, [frames, playbackSpeed, nodeNames, edgeThreshold, hiddenNodes, smoothing, interpolation, subjectInfo, symmetric, dataRange, qualityScale, width, height]);

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
