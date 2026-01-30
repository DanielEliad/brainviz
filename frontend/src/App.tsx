import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import GraphCanvas from "./vis/GraphCanvas";
import { Timeline } from "./ui/Timeline";
import { ControlsBar } from "./ui/ControlsBar";
import {
  useAbideData,
  useAbideFiles,
  useCorrelationMethods,
  SmoothingAlgorithm,
  InterpolationAlgorithm,
  CorrelationMethod,
  AbideFile,
} from "./vis/useGraphData";
import { useVideoExport } from "./vis/useVideoExport";

function App() {
  // ABIDE file selection
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const filesQuery = useAbideFiles();
  const methodsQuery = useCorrelationMethods();

  // Correlation parameters
  const [method, setMethod] = useState<CorrelationMethod | null>(null);
  const [windowSize, setWindowSize] = useState<number>(30);
  const [windowSizeInput, setWindowSizeInput] = useState<string>("30");
  const [step, setStep] = useState<number>(1);
  const [stepInput, setStepInput] = useState<string>("1");
  const [threshold, setThreshold] = useState<number | null>(null);
  const [thresholdInput, setThresholdInput] = useState<string>("");

  // Processing parameters
  const [smoothing, setSmoothing] = useState<SmoothingAlgorithm>("none");
  const [interpolation, setInterpolation] = useState<InterpolationAlgorithm>("none");
  const [interpolationFactor, setInterpolationFactor] = useState<number>(2);
  const [factorInput, setFactorInput] = useState<string>("2");

  // Playback
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [edgeThreshold, setEdgeThreshold] = useState<number>(0);
  const [hiddenNodes, setHiddenNodes] = useState<Set<string>>(new Set());
  const [isPlaying, setIsPlaying] = useState(false);
  const intervalRef = useRef<number | null>(null);

  // Data fetching
  const { frame, allFrames, isLoading, isFetching, error, refetch, setTime, meta, time, symmetric } = useAbideData({
    filePath: selectedFile,
    method,
    windowSize,
    step,
    threshold,
    smoothing,
    interpolation,
    interpolationFactor,
  });

  // Get node names from frame data
  const nodeNames = useMemo(() => {
    if (!frame?.nodes) return [];
    return frame.nodes.map((n) => n.label || n.id);
  }, [frame]);

  const {
    state: exportState,
    progress: exportProgress,
    exportVideo,
  } = useVideoExport({
    frames: allFrames,
    playbackSpeed,
    nodeNames,
    edgeThreshold,
    hiddenNodes,
    smoothing,
    interpolation,
    symmetric,
  });

  // Playback loop
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

  // Keyboard shortcuts
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
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Reset playback when parameters change
  useEffect(() => {
    setTime(0);
    setIsPlaying(false);
  }, [selectedFile, method, windowSize, step, threshold, smoothing, interpolation, interpolationFactor, setTime]);

  // Group files by site for better display
  const groupedFiles = useMemo(() => {
    if (!filesQuery.data?.files) return {};
    const grouped: Record<string, AbideFile[]> = {};
    for (const file of filesQuery.data.files) {
      const key = `${file.version}/${file.site}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(file);
    }
    return grouped;
  }, [filesQuery.data]);

  const handlePlayPause = () => setIsPlaying(!isPlaying);

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
                <div className="absolute top-4 left-4 z-10 bg-destructive text-destructive-foreground px-4 py-2 rounded-md text-sm shadow-md max-w-md">
                  {String(error)}
                </div>
              )}
              {(!selectedFile || !method) && !error && (
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                  {!selectedFile && !method && "Select a subject file and correlation method to begin"}
                  {!selectedFile && method && "Select a subject file to begin"}
                  {selectedFile && !method && "Select a correlation method to begin"}
                </div>
              )}
              <GraphCanvas frame={frame} isLoading={isLoading || isFetching} edgeThreshold={edgeThreshold} hiddenNodes={hiddenNodes} symmetric={symmetric} />
            </div>
          </CardContent>
        </Card>

        <Card className="w-72 flex-shrink-0 overflow-y-auto">
          <CardContent className="p-4 space-y-4">
            {/* Data Source Section */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground border-b border-border pb-1">Data Source</h3>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Subject File</label>
                <select
                  value={selectedFile ?? ""}
                  onChange={(e) => setSelectedFile(e.target.value || null)}
                  className="w-full h-9 rounded-md border border-input bg-background px-2 py-1 text-sm"
                >
                  <option value="">-- Select Subject --</option>
                  {Object.entries(groupedFiles).map(([group, files]) => (
                    <optgroup key={group} label={group}>
                      {files.map((f) => (
                        <option key={f.path} value={f.path}>
                          {f.subject_id}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {selectedFile && (
                  <div className="text-[10px] text-muted-foreground truncate">
                    {selectedFile}
                  </div>
                )}
              </div>
            </div>

            {/* Correlation Section */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground border-b border-border pb-1">Correlation</h3>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Method</label>
                <select
                  value={method ?? ""}
                  onChange={(e) => setMethod(e.target.value ? e.target.value as CorrelationMethod : null)}
                  className="w-full h-9 rounded-md border border-input bg-background px-2 py-1 text-sm"
                >
                  <option value="">-- Select Method --</option>
                  {(methodsQuery.data?.methods ?? [
                    { id: "pearson", name: "Pearson" },
                    { id: "spearman", name: "Spearman" },
                    { id: "partial", name: "Partial" },
                  ]).map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                {method && methodsQuery.data?.methods.find((m) => m.id === method)?.description && (
                  <div className="text-[10px] text-muted-foreground">
                    {methodsQuery.data.methods.find((m) => m.id === method)?.description}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Window Size</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={windowSizeInput}
                    onChange={(e) => setWindowSizeInput(e.target.value.replace(/\D/g, ""))}
                    onBlur={() => {
                      const val = parseInt(windowSizeInput);
                      if (isNaN(val) || val < 5) {
                        setWindowSizeInput("5");
                        setWindowSize(5);
                      } else if (val > 100) {
                        setWindowSizeInput("100");
                        setWindowSize(100);
                      } else {
                        setWindowSizeInput(String(val));
                        setWindowSize(val);
                      }
                    }}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    className="w-full h-8 rounded-md border border-input bg-background px-2 py-1 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Step</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={stepInput}
                    onChange={(e) => setStepInput(e.target.value.replace(/\D/g, ""))}
                    onBlur={() => {
                      const val = parseInt(stepInput);
                      if (isNaN(val) || val < 1) {
                        setStepInput("1");
                        setStep(1);
                      } else if (val > 10) {
                        setStepInput("10");
                        setStep(10);
                      } else {
                        setStepInput(String(val));
                        setStep(val);
                      }
                    }}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    className="w-full h-8 rounded-md border border-input bg-background px-2 py-1 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Threshold (0-1, empty = none)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={thresholdInput}
                  placeholder="e.g. 0.2"
                  onChange={(e) => setThresholdInput(e.target.value)}
                  onBlur={() => {
                    if (thresholdInput.trim() === "") {
                      setThreshold(null);
                      return;
                    }
                    const val = parseFloat(thresholdInput);
                    if (isNaN(val)) {
                      setThresholdInput("");
                      setThreshold(null);
                    } else if (val < 0) {
                      setThresholdInput("0");
                      setThreshold(0);
                    } else if (val > 1) {
                      setThresholdInput("1");
                      setThreshold(1);
                    } else {
                      setThresholdInput(val.toString());
                      setThreshold(val);
                    }
                  }}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  className="w-full h-8 rounded-md border border-input bg-background px-2 py-1 text-sm"
                />
              </div>
            </div>

            {/* Processing Section */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground border-b border-border pb-1">Processing</h3>

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
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    className="w-full h-8 rounded-md border border-input bg-background px-2 py-1 text-sm"
                  />
                </div>
              )}

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
            </div>

            {/* Playback Section */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground border-b border-border pb-1">Playback</h3>

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

            {/* Nodes Section */}
            {nodeNames.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground border-b border-border pb-1">Nodes</h3>
                  <button
                    onClick={() => {
                      if (hiddenNodes.size === 0) {
                        setHiddenNodes(new Set(frame?.nodes?.map((n) => n.id) ?? []));
                      } else {
                        setHiddenNodes(new Set());
                      }
                    }}
                    className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {hiddenNodes.size === 0 ? "Hide All" : "Show All"}
                  </button>
                </div>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {frame?.nodes?.map((node, idx) => {
                    const nodeId = node.id;
                    const isHidden = hiddenNodes.has(nodeId);
                    const colors = ["#4e79a7", "#f28e2c", "#e15759", "#76b7b2", "#59a14f", "#edc949", "#af7aa1", "#ff9da7", "#9c755f", "#bab0ab", "#8cd17d", "#b6992d", "#499894", "#e15759"];
                    const color = colors[idx % colors.length];
                    return (
                      <button
                        key={nodeId}
                        onClick={() => {
                          setHiddenNodes((prev) => {
                            const next = new Set(prev);
                            if (isHidden) next.delete(nodeId);
                            else next.add(nodeId);
                            return next;
                          });
                        }}
                        className="w-full flex items-center gap-2 px-2 py-1 rounded text-left transition-all hover:bg-white/10"
                      >
                        <span
                          className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isHidden ? "grayscale" : ""}`}
                          style={{ backgroundColor: color }}
                        />
                        <span className={`text-xs truncate ${isHidden ? "line-through text-muted-foreground" : "text-foreground"}`}>
                          {node.label || nodeId}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

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
