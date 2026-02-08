import { memo, useState } from "react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ControlsBar } from "./ControlsBar";
import {
	useAbideFiles,
	SmoothingAlgorithm,
	InterpolationAlgorithm,
	CorrelationMethod,
	AbideFile,
} from "../vis/useGraphData";
import { GraphMeta } from "../vis/types";
import { palette } from "../vis/drawFrame";

type ExportState = "idle" | "exporting" | "done" | "error";

type NodeInfo = { id: string; label: string };

type ControlPanelProps = {
	// Data source
	selectedSite: string | null;
	setSelectedSite: (site: string | null) => void;
	selectedFile: string | null;
	setSelectedFile: (file: string | null) => void;

	// Correlation
	method: CorrelationMethod | null;
	setMethod: (method: CorrelationMethod | null) => void;
	windowSize: number;
	setWindowSize: (size: number) => void;
	step: number;
	setStep: (step: number) => void;

	// Processing
	smoothing: SmoothingAlgorithm | null;
	setSmoothing: (s: SmoothingAlgorithm | null) => void;
	smoothingWindow: number;
	setSmoothingWindow: (n: number) => void;
	smoothingAlpha: number;
	setSmoothingAlpha: (n: number) => void;
	smoothingSigma: number;
	setSmoothingSigma: (n: number) => void;
	interpolation: InterpolationAlgorithm | null;
	setInterpolation: (i: InterpolationAlgorithm | null) => void;
	interpolationFactor: number;
	setInterpolationFactor: (n: number) => void;

	// Playback
	playbackSpeed: number;
	setPlaybackSpeed: (speed: number) => void;
	edgeThreshold: number;
	setEdgeThreshold: (threshold: number) => void;
	waveletEdgeMode: "both" | "dominant";
	setWaveletEdgeMode: (mode: "both" | "dominant") => void;
	meta: GraphMeta;

	// Nodes
	nodes: NodeInfo[];
	hiddenNodes: Set<string>;
	setHiddenNodes: React.Dispatch<React.SetStateAction<Set<string>>>;

	// Controls
	isPlaying: boolean;
	onPlayPause: () => void;
	onRefresh: () => void;
	exportVideo: () => void;
	exportState: ExportState;
	exportProgress: number;
};

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


export const ControlPanel = memo(function ControlPanel(props: ControlPanelProps) {
	const {
		selectedSite, setSelectedSite,
		selectedFile, setSelectedFile,
		method, setMethod,
		windowSize, setWindowSize,
		step, setStep,
		smoothing, setSmoothing,
		smoothingWindow, setSmoothingWindow,
		smoothingAlpha, setSmoothingAlpha,
		smoothingSigma, setSmoothingSigma,
		interpolation, setInterpolation,
		interpolationFactor, setInterpolationFactor,
		playbackSpeed, setPlaybackSpeed,
		edgeThreshold, setEdgeThreshold,
		waveletEdgeMode, setWaveletEdgeMode,
		meta,
		nodes, hiddenNodes, setHiddenNodes,
		isPlaying, onPlayPause, onRefresh,
		exportVideo, exportState, exportProgress,
	} = props;

	// Sidebar-only state
	const [openSections, setOpenSections] = useState<Set<string>>(new Set(["data"]));
	const [windowSizeInput, setWindowSizeInput] = useState<string>(String(windowSize));
	const [stepInput, setStepInput] = useState<string>(String(step));

	// React Query hooks (deduplicated by TanStack)
	const filesQuery = useAbideFiles();

	// Derived data
	const selectedSubjectInfo = (() => {
		if (!selectedFile || !filesQuery.data?.files) return null;
		return filesQuery.data.files.find((f: AbideFile) => f.path === selectedFile) ?? null;
	})();

	const siteOptions = (() => {
		if (!filesQuery.data?.files) return [];
		const sites = new Set<string>();
		for (const file of filesQuery.data.files) {
			sites.add(`${file.version}/${file.site}`);
		}
		return Array.from(sites)
			.sort()
			.map((site) => ({ value: site, label: site }));
	})();

	const subjectOptions = (() => {
		if (!filesQuery.data?.files || !selectedSite) return [];
		return filesQuery.data.files
			.filter((file: AbideFile) => `${file.version}/${file.site}` === selectedSite)
			.map((file: AbideFile) => ({
				value: file.path,
				label: `${file.subject_id} (${file.diagnosis})`,
			}))
			.sort((a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label));
	})();

	// Summaries
	const dataSummary = selectedSubjectInfo ? selectedSubjectInfo.diagnosis : "Not configured";
	const corrSummary = method ? `${method} | w:${windowSize} | s:${step}` : "Not configured";

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
	const nodesSummary = `${nodes.length - hiddenNodes.size}/${nodes.length} visible`;

	const toggleSection = (key: string) => {
		setOpenSections((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	};

	const thresholdMax = Math.max(Math.abs(meta.edge_weight_min), Math.abs(meta.edge_weight_max));

	return (
		<>
			{/* Data Source Section */}
			<CollapsibleSection
				title="Data Source"
				summary={dataSummary}
				isOpen={openSections.has("data")}
				onToggle={() => toggleSection("data")}
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
				onToggle={() => toggleSection("correlation")}
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
				onToggle={() => toggleSection("processing")}
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
				onToggle={() => toggleSection("playback")}
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
				<div className="space-y-1">
					<label className="text-xs font-medium text-foreground">
						Edge Threshold: {edgeThreshold.toFixed(2)}
					</label>
					<input
						type="range"
						min={0}
						max={thresholdMax || 1}
						step={(thresholdMax || 1) / 100}
						value={edgeThreshold}
						onChange={(e) => setEdgeThreshold(parseFloat(e.target.value))}
						className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer"
					/>
					<div className="flex justify-between text-[10px] text-muted-foreground">
						<span>0</span>
						<span>{thresholdMax.toFixed(3)}</span>
					</div>
				</div>
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
				onToggle={() => toggleSection("nodes")}
				action={
					<button
						onClick={() => {
							if (hiddenNodes.size === 0) {
								setHiddenNodes(new Set(nodes.map((n) => n.id)));
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
					{nodes.map((node, idx) => {
						const isHidden = hiddenNodes.has(node.id);
						const color = palette[idx % palette.length];
						return (
							<button
								key={node.id}
								onClick={() => {
									setHiddenNodes((prev) => {
										const next = new Set(prev);
										if (isHidden) next.delete(node.id);
										else next.add(node.id);
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
									className={`text-xs truncate ${isHidden ? "line-through text-muted-foreground" : "text-foreground"}`}
								>
									{node.label}
								</span>
							</button>
						);
					})}
				</div>
			</CollapsibleSection>

			<div className="pt-3 mt-2 border-t border-border">
				<ControlsBar
					isPlaying={isPlaying}
					onPlay={onPlayPause}
					onRefresh={onRefresh}
					onExportVideo={exportVideo}
					exportState={exportState}
					exportProgress={exportProgress}
				/>
			</div>
		</>
	);
});
