import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import GraphCanvas from "./vis/GraphCanvas";
import { Timeline } from "./ui/Timeline";
import { ControlPanel } from "./ui/ControlPanel";
import {
	useAbideData,
	useAbideFiles,
	SmoothingAlgorithm,
	InterpolationAlgorithm,
	CorrelationMethod,
} from "./vis/useGraphData";
import { useVideoExport } from "./vis/useVideoExport";
import { OverviewTab } from "./overview/OverviewTab";

type TabId = "player" | "overview";

const TAB_OPTIONS: { value: TabId; label: string }[] = [
	{ value: "player", label: "Player" },
	{ value: "overview", label: "Overview" },
];

function App() {
	const [activeTab, setActiveTab] = useState<TabId>("player");

	// ABIDE file selection
	const [selectedSite, setSelectedSite] = useState<string | null>(null);
	const [selectedFile, setSelectedFile] = useState<string | null>(null);
	const filesQuery = useAbideFiles();

	// Correlation parameters
	const [method, setMethod] = useState<CorrelationMethod | null>(null);
	const [windowSize, setWindowSize] = useState<number>(30);
	const [step, setStep] = useState<number>(1);

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

	// Data fetching
	const { frame, allFrames, isFetching, error, refetch, setTime, meta, time, symmetric } = useAbideData({
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

	// Stable node info from first frame (nodes are constant across frames)
	const nodes = useMemo(() => {
		const firstFrame = allFrames[0];
		if (!firstFrame?.nodes) return [];
		return firstFrame.nodes.map((n) => ({ id: n.id, label: n.label || n.id }));
	}, [allFrames]);

	// Node names for video export (stable - derived from nodes)
	const nodeNames = useMemo(() => nodes.map((n) => n.label), [nodes]);

	// Track selected file info (guaranteed to have diagnosis for all subjects)
	const selectedSubjectInfo = useMemo(() => {
		if (!selectedFile || !filesQuery.data?.files) return null;
		return filesQuery.data.files.find((f) => f.path === selectedFile) ?? null;
	}, [selectedFile, filesQuery.data]);

	// Stable data range for video export
	const dataRange = useMemo(
		() => ({ min: meta.edge_weight_min, max: meta.edge_weight_max }),
		[meta.edge_weight_min, meta.edge_weight_max],
	);

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
		dataRange,
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

	// Reset subject when site changes
	useEffect(() => {
		setSelectedFile(null);
	}, [selectedSite]);

	const handlePlayPause = useCallback(() => setIsPlaying((prev) => !prev), []);
	const handleRefresh = useCallback(() => { refetch(); }, [refetch]);

	return (
		<div className="dark h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col overflow-hidden">
			<div className="flex-shrink-0 px-3 py-1.5 border-b border-border flex items-center gap-3">
				<h1 className="text-sm font-bold tracking-tight text-foreground">Brain Visualizer</h1>
				<SegmentedControl<TabId>
					options={TAB_OPTIONS}
					value={activeTab}
					onChange={setActiveTab}
					size="sm"
				/>
			</div>

			{/* Player tab — hidden via display:none to preserve state */}
			<div style={{ display: activeTab === "player" ? "flex" : "none" }} className="flex-1 flex flex-col min-h-0">
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
									dataRange={dataRange}
									diagnosis={selectedSubjectInfo?.diagnosis}
								/>
							</div>
						</CardContent>
					</Card>

					<Card className="w-64 flex-shrink-0 overflow-y-auto">
						<CardContent className="p-2">
							<ControlPanel
								selectedSite={selectedSite}
								setSelectedSite={setSelectedSite}
								selectedFile={selectedFile}
								setSelectedFile={setSelectedFile}
								method={method}
								setMethod={setMethod}
								windowSize={windowSize}
								setWindowSize={setWindowSize}
								step={step}
								setStep={setStep}
								smoothing={smoothing}
								setSmoothing={setSmoothing}
								smoothingWindow={smoothingWindow}
								setSmoothingWindow={setSmoothingWindow}
								smoothingAlpha={smoothingAlpha}
								setSmoothingAlpha={setSmoothingAlpha}
								smoothingSigma={smoothingSigma}
								setSmoothingSigma={setSmoothingSigma}
								interpolation={interpolation}
								setInterpolation={setInterpolation}
								interpolationFactor={interpolationFactor}
								setInterpolationFactor={setInterpolationFactor}
								playbackSpeed={playbackSpeed}
								setPlaybackSpeed={setPlaybackSpeed}
								edgeThreshold={edgeThreshold}
								setEdgeThreshold={setEdgeThreshold}
								waveletEdgeMode={waveletEdgeMode}
								setWaveletEdgeMode={setWaveletEdgeMode}
								meta={meta}
								nodes={nodes}
								hiddenNodes={hiddenNodes}
								setHiddenNodes={setHiddenNodes}
								isPlaying={isPlaying}
								onPlayPause={handlePlayPause}
								onRefresh={handleRefresh}
								exportVideo={exportVideo}
								exportState={exportState}
								exportProgress={exportProgress}
							/>
						</CardContent>
					</Card>
				</div>

				<div className="flex-shrink-0 px-3 pb-2">
					<Card>
						<CardContent className="py-2">
							<Timeline meta={meta} value={time} onChange={setTime} />
						</CardContent>
					</Card>
				</div>
			</div>

			{/* Overview tab */}
			{activeTab === "overview" && <OverviewTab />}
		</div>
	);
}

export default App;
