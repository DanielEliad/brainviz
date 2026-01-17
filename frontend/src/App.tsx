import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import GraphCanvas from "./vis/GraphCanvas";
import { Timeline } from "./ui/Timeline";
import { ControlsBar } from "./ui/ControlsBar";
import { useGraphData, SmoothingAlgorithm, InterpolationAlgorithm } from "./vis/useGraphData";
import { useVideoExport } from "./vis/useVideoExport";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

type GraphMetadata = {
  num_nodes: number;
  node_names: string[];
  description: string;
};

function App() {
  const [smoothing, setSmoothing] = useState<SmoothingAlgorithm>("none");
  const [interpolation, setInterpolation] = useState<InterpolationAlgorithm>("none");
  const [interpolationFactor, setInterpolationFactor] = useState<number>(2);
  const [factorInput, setFactorInput] = useState<string>("2");
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [edgeThreshold, setEdgeThreshold] = useState<number>(0);
  const { frame, allFrames, isLoading, error, refetch, setTime, meta, time } = useGraphData(smoothing, interpolation, interpolationFactor);
  const [isPlaying, setIsPlaying] = useState(false);
  const intervalRef = useRef<number | null>(null);
  const prevParamsRef = useRef<{ smoothing: SmoothingAlgorithm; interpolation: InterpolationAlgorithm; interpolationFactor: number } | null>(null);

  const metadataQuery = useQuery<GraphMetadata>({
    queryKey: ["graphMetadata"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/graph/metadata`);
      if (!res.ok) {
        throw new Error(`Metadata fetch failed (${res.status})`);
      }
      return res.json();
    },
  });

  const {
    state: exportState,
    progress: exportProgress,
    exportVideo,
  } = useVideoExport({
    frames: allFrames,
    playbackSpeed,
    nodeNames: metadataQuery.data?.node_names,
    edgeThreshold,
  });

  useEffect(() => {
    if (isPlaying && meta.available_timestamps.length > 0) {
      const baseInterval = 500;
      const interval = baseInterval / playbackSpeed;
      intervalRef.current = window.setInterval(() => {
        const currentIndex = meta.available_timestamps.indexOf(time);
        const nextIndex = (currentIndex + 1) % meta.available_timestamps.length;
        const nextTime = meta.available_timestamps[nextIndex];
        setTime(nextTime);
      }, interval);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, meta.available_timestamps, time, setTime, playbackSpeed]);

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.key === " ") {
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
          return;
        }
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    const prev = prevParamsRef.current;
    if (prev === null) {
      prevParamsRef.current = { smoothing, interpolation, interpolationFactor };
      return;
    }
    
    const hasChanged =
      prev.smoothing !== smoothing ||
      prev.interpolation !== interpolation ||
      prev.interpolationFactor !== interpolationFactor;
    
    if (hasChanged) {
      setTime(0);
      setIsPlaying(false);
      prevParamsRef.current = { smoothing, interpolation, interpolationFactor };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smoothing, interpolation, interpolationFactor]);

  return (
    <div className="dark h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col overflow-hidden">
      <div className="flex-shrink-0 px-4 py-2 border-b border-border">
        <h1 className="text-xl font-bold tracking-tight text-foreground">Brain Visualizer</h1>
      </div>

      <div className="flex-1 flex gap-3 px-3 py-3 min-h-0">
        <Card className="border-2 shadow-lg flex-1 min-h-0">
          <CardContent className="p-0 h-full">
            <div className="relative h-full">
              {error && (
                <div className="absolute top-4 left-4 z-10 bg-destructive text-destructive-foreground px-4 py-2 rounded-md text-sm shadow-md">
                  Failed to load data: {String(error)}
                </div>
              )}
              <GraphCanvas frame={frame} isLoading={isLoading} edgeThreshold={edgeThreshold} />
            </div>
          </CardContent>
        </Card>

        <Card className="w-64 flex-shrink-0">
          <CardContent className="p-4 space-y-4">
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Smoothing</label>
                <Select
                  value={smoothing}
                  onChange={(e) => setSmoothing(e.target.value as SmoothingAlgorithm)}
                  options={[
                    { value: "none", label: "None" },
                    { value: "moving_average", label: "Moving Average" },
                    { value: "exponential", label: "Exponential" },
                    { value: "gaussian", label: "Gaussian" },
                  ]}
                  className="w-full"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Interpolation</label>
                <Select
                  value={interpolation}
                  onChange={(e) => setInterpolation(e.target.value as InterpolationAlgorithm)}
                  options={[
                    { value: "none", label: "None" },
                    { value: "linear", label: "Linear" },
                    { value: "cubic_spline", label: "Cubic Spline" },
                    { value: "b_spline", label: "B-Spline" },
                    { value: "univariate_spline", label: "Univariate Spline" },
                  ]}
                  className="w-full"
                />
              </div>
              {interpolation !== "none" && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Factor (2-10)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={factorInput}
                    onChange={(e) => setFactorInput(e.target.value.replace(/\D/g, ""))}
                    onBlur={() => {
                      const val = parseInt(factorInput);
                      if (isNaN(val) || val < 2) {
                        setFactorInput("2");
                        setInterpolationFactor(2);
                      } else if (val > 10) {
                        setFactorInput("10");
                        setInterpolationFactor(10);
                      } else {
                        setFactorInput(String(val));
                        setInterpolationFactor(val);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
              )}
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Speed</label>
                <Select
                  value={playbackSpeed.toString()}
                  onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                  options={[
                    { value: "0.5", label: "0.5x" },
                    { value: "1", label: "1x" },
                    { value: "2", label: "2x" },
                    { value: "4", label: "4x" },
                    { value: "8", label: "8x" },
                  ]}
                  className="w-full"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">
                  Edge Threshold: {edgeThreshold.toFixed(1)}
                </label>
                <input
                  type="range"
                  min={meta.edge_weight_min}
                  max={meta.edge_weight_max}
                  step={(meta.edge_weight_max - meta.edge_weight_min) / 100}
                  value={edgeThreshold}
                  onChange={(e) => setEdgeThreshold(parseFloat(e.target.value))}
                  className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>{meta.edge_weight_min.toFixed(1)}</span>
                  <span>{meta.edge_weight_max.toFixed(1)}</span>
                </div>
              </div>
            </div>
            <div className="pt-2 border-t border-border">
              <ControlsBar
                isPlaying={isPlaying}
                onPlay={handlePlayPause}
                onRefresh={() => refetch()}
                onExportVideo={exportVideo}
                exportState={exportState}
                exportProgress={exportProgress}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex-shrink-0 px-3 pb-3">
        <Card>
          <CardContent className="py-3">
            <Timeline meta={meta} value={time} onChange={setTime} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default App;
