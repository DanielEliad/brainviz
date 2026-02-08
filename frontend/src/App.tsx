import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { SegmentedControl } from "@/components/ui/segmented-control";
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
} from "./vis/useGraphData";
import { useVideoExport } from "./vis/useVideoExport";

function App() {
	// ABIDE file selection
	const [selectedSite, setSelectedSite] = useState<string | null>(null);
	const [selectedFile, setSelectedFile] = useState<string | null>(null);
	const filesQuery = useAbideFiles();
	const methodsQuery = useCorrelationMethods();

	// Correlation parameters
	const [method, setMethod] = useState<CorrelationMethod | null>(null);
	const [windowSize, setWindowSize] = useState<number>(30);
	const [windowSizeInput, setWindowSizeInput] = useState<string>("30");
	const [step, setStep] = useState<number>(1);
	const [stepInput, setStepInput] = useState<string>("1");

	// Processing parameters
	const [smoothing, setSmoothing] = useState<SmoothingAlgorithm | null>(null);
	const [smoothingWindow, setSmoothingWindow] = useState<number>(3);
	const [smoothingAlpha, setSmoothingAlpha] = useState<number>(0.5);
	const [smoothingSigma, setSmoothingSigma] = useState<number>(1.0);
	const [interpolation, setInterpolation] = useState<InterpolationAlgorithm | null>(null);
	const [interpolationFactor, setInterpolationFactor] = useState<number>(2);

	// Playback
	const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
	const [edgeThreshold, setEdgeThreshold] = useState<number>(0);
	const [waveletEdgeMode, setWaveletEdgeMode] = useState<"both" | "dominant">("both");
	const [hiddenNodes, setHiddenNodes] = useState<Set<string>>(new Set());
	const [isPlaying, setIsPlaying] = useState(false);
	const intervalRef = useRef<number | null>(null);

	// Accordion state - multiple sections can be open
	const [openSections, setOpenSections] = useState<Set<string>>(new Set(["data"]));

	// Data fetching
	const { frame, allFrames, isLoading, isFetching, error, refetch, setTime, meta, time, symmetric } = useAbideData({
		filePath: selectedFile,
		method,
		windowSize,
		step,
		smoothing,
		smoothingWindow,
		smoothingAlpha,
		smoothingSigma,
		interpolation,
		interpolationFactor,
	});

	// Get node names from frame data
	const nodeNames = useMemo(() => {
		if (!frame?.nodes) return [];
		return frame.nodes.map((n) => n.label || n.id);
	}, [frame]);

	// Track selected file info (guaranteed to have diagnosis for all subjects)
	const selectedSubjectInfo = useMemo(() => {
		if (!selectedFile || !filesQuery.data?.files) return null;
		return filesQuery.data.files.find((f) => f.path === selectedFile) ?? null;
	}, [selectedFile, filesQuery.data]);

	// Summary strings for collapsed accordion sections
	const dataSummary = selectedSubjectInfo
		? selectedSubjectInfo.diagnosis
		: "Not configured";
	const corrSummary = method ? `${method} | w:${windowSize} | s:${step}` : "Not configured";
	const interpolationLabels: Record<InterpolationAlgorithm, string> = {
		linear: "linear",
		cubic_spline: "cubic",
		b_spline: "b-spline",
		univariate_spline: "univariate",
	};
	const smoothingLabels: Record<SmoothingAlgorithm, string> = {
		moving_average: "moving avg",
		exponential: "exp",
		gaussian: "gaussian",
	};
	const getSmoothingSummary = () => {
		if (!smoothing) return null;
		const label = smoothingLabels[smoothing];
		if (smoothing === "moving_average") return `${label}(${smoothingWindow})`;
		if (smoothing === "exponential") return `${label}(${smoothingAlpha.toFixed(1)})`;
		if (smoothing === "gaussian") return `${label}(σ${smoothingSigma.toFixed(1)})`;
		return label;
	};
	const procSummary =
		[
			interpolation ? `${interpolationLabels[interpolation]} x${interpolationFactor}` : null,
			getSmoothingSummary(),
		]
			.filter(Boolean)
			.join(" | ") || "none";
	const playSummary = `${playbackSpeed}x | thresh: ${edgeThreshold.toFixed(2)}`;
	const nodesSummary = `${nodeNames.length - hiddenNodes.size}/${nodeNames.length} visible`;

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
		subjectInfo: selectedSubjectInfo,
		symmetric: symmetric || (method === "wavelet" && waveletEdgeMode === "dominant"),
		dataRange: { min: meta.edge_weight_min, max: meta.edge_weight_max },
		qualityScale: 2, // 4K output
	});

	// Playback loop
	useEffect(() => {
		if (isPlaying && meta.frame_count > 0) {
			const baseInterval = 500;
			const interval = baseInterval / playbackSpeed;
			intervalRef.current = window.setInterval(() => {
				setTime((time + 1) % meta.frame_count);
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
	}, [isPlaying, meta.frame_count, time, setTime, playbackSpeed]);

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

	// Reset time when any data parameter changes
	useEffect(() => {
		setTime(0);
		setIsPlaying(false);
	}, [selectedFile, method, windowSize, step, smoothing, smoothingWindow, smoothingAlpha, smoothingSigma, interpolation, interpolationFactor, setTime]);

	// Reset threshold only when correlation method changes (value range differs)
	useEffect(() => {
		setEdgeThreshold(0);
	}, [method]);

	// Site options for searchable dropdown
	const siteOptions = useMemo(() => {
		if (!filesQuery.data?.files) return [];
		const sites = new Set<string>();
		for (const file of filesQuery.data.files) {
			sites.add(`${file.version}/${file.site}`);
		}
		return Array.from(sites)
			.sort()
			.map((site) => ({ value: site, label: site }));
	}, [filesQuery.data]);

	// Subject options filtered by selected site
	const subjectOptions = useMemo(() => {
		if (!filesQuery.data?.files || !selectedSite) return [];
		return filesQuery.data.files
			.filter((file) => `${file.version}/${file.site}` === selectedSite)
			.map((file) => ({
				value: file.path,
				label: `${file.subject_id} (${file.diagnosis})`,
			}))
			.sort((a, b) => a.label.localeCompare(b.label));
	}, [filesQuery.data, selectedSite]);

	// Reset subject when site changes
	useEffect(() => {
		setSelectedFile(null);
	}, [selectedSite]);

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
									{!selectedFile && "Select a subject and correlation method to begin"}
									{selectedFile && !method && "Select a correlation method to begin"}
								</div>
							)}
							<GraphCanvas
								frame={frame}
								isLoading={isFetching}
								edgeThreshold={edgeThreshold}
								hiddenNodes={hiddenNodes}
								symmetric={symmetric || (method === "wavelet" && waveletEdgeMode === "dominant")}
								dataRange={{ min: meta.edge_weight_min, max: meta.edge_weight_max }}
								diagnosis={selectedSubjectInfo?.diagnosis}
							/>
						</div>
					</CardContent>
				</Card>

				<Card className="w-72 flex-shrink-0 overflow-y-auto">
					<CardContent className="p-3">
						{/* Data Source Section */}
						<CollapsibleSection
							title="Data Source"
							summary={dataSummary}
							isOpen={openSections.has("data")}
							onToggle={() => setOpenSections((prev) => {
								const next = new Set(prev);
								if (next.has("data")) next.delete("data");
								else next.add("data");
								return next;
							})}
						>
							<div className="space-y-1">
								<label className="text-xs font-medium text-foreground">Site</label>
								<SearchableSelect
									options={siteOptions}
									value={selectedSite}
									onChange={setSelectedSite}
									placeholder="Search sites..."
								/>
							</div>
							<div className="space-y-1">
								<label className="text-xs font-medium text-foreground">Subject</label>
								<SearchableSelect
									options={subjectOptions}
									value={selectedFile}
									onChange={setSelectedFile}
									placeholder="Search subjects..."
									disabled={!selectedSite}
								/>
							</div>
						</CollapsibleSection>

						{/* Correlation Section */}
						<CollapsibleSection
							title="Correlation"
							summary={corrSummary}
							isOpen={openSections.has("correlation")}
							onToggle={() => setOpenSections((prev) => {
								const next = new Set(prev);
								if (next.has("correlation")) next.delete("correlation");
								else next.add("correlation");
								return next;
							})}
						>
							<div className="space-y-1">
								<label className="text-xs font-medium text-foreground">Method</label>
								<SegmentedControl<CorrelationMethod>
									options={[
										{ value: "pearson", label: "Pearson" },
										{ value: "spearman", label: "Spearman" },
										{ value: "wavelet", label: "Wavelet" },
									]}
									value={method}
									onChange={(v) => setMethod(v)}
								/>
							</div>
							<div className="grid grid-cols-2 gap-2">
								<div className="space-y-1">
									<label className="text-xs font-medium text-foreground">Window</label>
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
											} else if (val > 100) {
												setStepInput("100");
												setStep(100);
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
						</CollapsibleSection>

						{/* Processing Section */}
						<CollapsibleSection
							title="Processing"
							summary={procSummary}
							isOpen={openSections.has("processing")}
							onToggle={() => setOpenSections((prev) => {
								const next = new Set(prev);
								if (next.has("processing")) next.delete("processing");
								else next.add("processing");
								return next;
							})}
						>
							<div className="space-y-1">
								<label className="text-xs font-medium text-foreground">Interpolation</label>
								<SegmentedControl<InterpolationAlgorithm | null>
									options={[
										{ value: null, label: "None" },
										{ value: "linear", label: "Linear" },
										{ value: "cubic_spline", label: "Cubic" },
										{ value: "b_spline", label: "B-Spl" },
									]}
									value={interpolation}
									onChange={(v) => setInterpolation(v)}
									size="sm"
								/>
							</div>
							{interpolation !== null && (
								<div className="space-y-1">
									<label className="text-xs font-medium text-foreground">Factor (2-10)</label>
									<input
										type="range"
										min={2}
										max={10}
										value={interpolationFactor}
										onChange={(e) => setInterpolationFactor(parseInt(e.target.value))}
										className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer"
									/>
									<div className="text-xs text-muted-foreground text-center">{interpolationFactor}x</div>
								</div>
							)}
							<div className="space-y-1">
								<label className="text-xs font-medium text-foreground">Smoothing</label>
								<SegmentedControl<SmoothingAlgorithm | null>
									options={[
										{ value: null, label: "None" },
										{ value: "moving_average", label: "MovAvg" },
										{ value: "exponential", label: "Exp" },
										{ value: "gaussian", label: "Gauss" },
									]}
									value={smoothing}
									onChange={(v) => setSmoothing(v)}
									size="sm"
								/>
							</div>
							{smoothing === "moving_average" && (
								<div className="space-y-1">
									<label className="text-xs font-medium text-foreground">Window (2-10)</label>
									<input
										type="range"
										min={2}
										max={10}
										value={smoothingWindow}
										onChange={(e) => setSmoothingWindow(parseInt(e.target.value))}
										className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer"
									/>
									<div className="text-xs text-muted-foreground text-center">{smoothingWindow}</div>
								</div>
							)}
							{smoothing === "exponential" && (
								<div className="space-y-1">
									<label className="text-xs font-medium text-foreground">Alpha (0-1)</label>
									<input
										type="range"
										min={0}
										max={1}
										step={0.05}
										value={smoothingAlpha}
										onChange={(e) => setSmoothingAlpha(parseFloat(e.target.value))}
										className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer"
									/>
									<div className="text-xs text-muted-foreground text-center">{smoothingAlpha.toFixed(2)}</div>
								</div>
							)}
							{smoothing === "gaussian" && (
								<div className="space-y-1">
									<label className="text-xs font-medium text-foreground">Sigma (0.1-5)</label>
									<input
										type="range"
										min={0.1}
										max={5}
										step={0.1}
										value={smoothingSigma}
										onChange={(e) => setSmoothingSigma(parseFloat(e.target.value))}
										className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer"
									/>
									<div className="text-xs text-muted-foreground text-center">{smoothingSigma.toFixed(1)}</div>
								</div>
							)}
						</CollapsibleSection>

						{/* Playback Section */}
						<CollapsibleSection
							title="Playback"
							summary={playSummary}
							isOpen={openSections.has("playback")}
							onToggle={() => setOpenSections((prev) => {
								const next = new Set(prev);
								if (next.has("playback")) next.delete("playback");
								else next.add("playback");
								return next;
							})}
						>
							<div className="space-y-1">
								<label className="text-xs font-medium text-foreground">Speed</label>
								<SegmentedControl<number>
									options={[
										{ value: 0.5, label: "0.5x" },
										{ value: 1, label: "1x" },
										{ value: 2, label: "2x" },
										{ value: 4, label: "4x" },
										{ value: 8, label: "8x" },
									]}
									value={playbackSpeed}
									onChange={(v) => setPlaybackSpeed(v)}
									size="sm"
								/>
							</div>
							{(() => {
								const thresholdMax = Math.max(Math.abs(meta.edge_weight_min), Math.abs(meta.edge_weight_max));
								return (
									<div className="space-y-1">
										<label className="text-xs font-medium text-foreground">
											Edge Threshold: {edgeThreshold.toFixed(2)}
										</label>
										<input
											type="range"
											min={0}
											max={thresholdMax}
											step={thresholdMax / 100}
											value={edgeThreshold}
											onChange={(e) => setEdgeThreshold(parseFloat(e.target.value))}
											className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer"
										/>
										<div className="flex justify-between text-[10px] text-muted-foreground">
											<span>0</span>
											<span>{thresholdMax.toFixed(3)}</span>
										</div>
									</div>
								);
							})()}
							{method === "wavelet" && (
								<div className="space-y-1">
									<label className="text-xs font-medium text-foreground">Edge Display</label>
									<SegmentedControl<"both" | "dominant">
										options={[
											{ value: "both", label: "Both" },
											{ value: "dominant", label: "Dominant" },
										]}
										value={waveletEdgeMode}
										onChange={(v) => setWaveletEdgeMode(v)}
										size="sm"
									/>
								</div>
							)}
						</CollapsibleSection>

						{/* Nodes Section */}
						<CollapsibleSection
							title="Nodes"
							summary={nodesSummary}
							isOpen={openSections.has("nodes")}
							onToggle={() => setOpenSections((prev) => {
								const next = new Set(prev);
								if (next.has("nodes")) next.delete("nodes");
								else next.add("nodes");
								return next;
							})}
							action={
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
							}
						>
							<div className="space-y-1">
								{frame?.nodes?.map((node, idx) => {
									const nodeId = node.id;
									const isHidden = hiddenNodes.has(nodeId);
									const colors = [
										"#4e79a7", "#f28e2c", "#e15759", "#76b7b2", "#59a14f",
										"#edc949", "#af7aa1", "#ff9da7", "#9c755f", "#bab0ab",
										"#8cd17d", "#b6992d", "#499894", "#e15759",
									];
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
											<span
												className={`text-xs truncate ${isHidden ? "line-through text-muted-foreground" : "text-foreground"
													}`}
											>
												{node.label || nodeId}
											</span>
										</button>
									);
								})}
							</div>
						</CollapsibleSection>

						<div className="pt-3 mt-2 border-t border-border">
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
