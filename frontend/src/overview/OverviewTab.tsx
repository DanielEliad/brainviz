import { useEffect, useMemo, useRef, useState } from "react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type { CorrelationMethod } from "../vis/useGraphData";
import { useOverviewData, type OverviewResult } from "./useOverviewData";
import { SubjectCard } from "./SubjectCard";
import { DEFAULT_OVERVIEW_ASPECT, buildOverviewSvg } from "./overviewSvgExport";
import { downloadSvg } from "../vis/svgExport";

const METHOD_OPTIONS: { value: CorrelationMethod; label: string }[] = [
	{ value: "pearson", label: "Pearson" },
	{ value: "spearman", label: "Spearman" },
	{ value: "wavelet", label: "Wavelet" },
];

const VIEW_OPTIONS: { value: "matrix" | "graph"; label: string }[] = [
	{ value: "matrix", label: "Matrix" },
	{ value: "graph", label: "Graph" },
];

type SiteGroup = {
	siteKey: string;
	hc: OverviewResult[];
	asd: OverviewResult[];
};

export function OverviewTab() {
	const [method, setMethod] = useState<CorrelationMethod>("pearson");
	const [viewMode, setViewMode] = useState<"matrix" | "graph">("matrix");
	const thresholdPerMethod = useRef<Map<CorrelationMethod, number>>(new Map());
	const [edgeThreshold, setEdgeThreshold] = useState(0);

	// Figure mode: two large panels side by side
	const [figureMode, setFigureMode] = useState(false);
	const [figureSize, setFigureSize] = useState(360);
	const [figureA, setFigureA] = useState<string | null>(null);
	const [figureB, setFigureB] = useState<string | null>(null);
	const [figureAspect, setFigureAspect] = useState(DEFAULT_OVERVIEW_ASPECT);

	const { results, dataRange, loadedCount, totalCount } = useOverviewData(method);

	const subjectOptions = useMemo(
		() =>
			results.map((r) => ({
				value: r.file.path,
				label: `${r.file.subject_id} — ${r.file.site} (${r.file.diagnosis})`,
				searchText: `${r.file.subject_id} ${r.file.site} ${r.file.diagnosis}`,
			})),
		[results],
	);

	// Default the two picks to the first HC and first ASD subject
	useEffect(() => {
		if (results.length === 0 || figureA !== null || figureB !== null) return;
		const firstHc = results.find((r) => r.file.diagnosis === "HC");
		const firstAsd = results.find((r) => r.file.diagnosis === "ASD");
		setFigureA((firstHc ?? results[0]).file.path);
		setFigureB((firstAsd ?? results[1] ?? results[0]).file.path);
	}, [results, figureA, figureB]);

	const figureResults = useMemo(
		() =>
			[figureA, figureB].map(
				(path) => results.find((r) => r.file.path === path) ?? null,
			),
		[results, figureA, figureB],
	);

	const exportPanels = useMemo(
		() =>
			figureResults.flatMap((r) => {
				const frame = r?.data?.frames[0];
				if (!r || !frame) return [];
				return [
					{
						frame,
						caption: `${r.file.subject_id} (${r.file.site}, ${r.file.diagnosis})`,
						symmetric: r.data?.symmetric ?? true,
					},
				];
			}),
		[figureResults],
	);

	const handleExportSvg = () => {
		const figure = buildOverviewSvg({
			panels: exportPanels,
			viewMode,
			dataRange,
			edgeThreshold,
			aspect: figureAspect,
			captions: true,
			fileParts: [method, ...exportPanels.map((p) => p.caption.split(" ")[0])],
		});
		if (figure) downloadSvg(figure.svg, figure.fileName);
	};

	const thresholdMax = Math.max(Math.abs(dataRange.min), Math.abs(dataRange.max));

	// Save threshold when it changes, restore when method changes
	useEffect(() => {
		thresholdPerMethod.current.set(method, edgeThreshold);
	}, [edgeThreshold, method]);

	const prevMethodRef = useRef(method);
	useEffect(() => {
		if (prevMethodRef.current !== method) {
			prevMethodRef.current = method;
			setEdgeThreshold(thresholdPerMethod.current.get(method) ?? 0);
		}
	}, [method]);

	// Group results by site, split HC/ASD, sorted by subject_id
	const { siteGroups, totalHc, totalAsd } = useMemo(() => {
		const siteMap = new Map<string, { hc: OverviewResult[]; asd: OverviewResult[] }>();
		const siteOrder: string[] = [];

		for (const r of results) {
			const key = `${r.file.version} / ${r.file.site}`;
			let group = siteMap.get(key);
			if (!group) {
				group = { hc: [], asd: [] };
				siteMap.set(key, group);
				siteOrder.push(key);
			}
			if (r.file.diagnosis === "HC") group.hc.push(r);
			else group.asd.push(r);
		}

		const byId = (a: OverviewResult, b: OverviewResult) =>
			a.file.subject_id - b.file.subject_id;

		const groups: SiteGroup[] = siteOrder.map((siteKey) => {
			const g = siteMap.get(siteKey)!;
			g.hc.sort(byId);
			g.asd.sort(byId);
			return { siteKey, hc: g.hc, asd: g.asd };
		});

		let hcCount = 0;
		let asdCount = 0;
		for (const g of groups) {
			hcCount += g.hc.length;
			asdCount += g.asd.length;
		}

		return { siteGroups: groups, totalHc: hcCount, totalAsd: asdCount };
	}, [results]);

	return (
		<div className="flex-1 flex flex-col min-h-0 px-3 py-3 gap-3">
			<div className="flex items-center gap-4 flex-shrink-0">
				<div className="flex items-center gap-2">
					<span className="text-xs text-muted-foreground">Method</span>
					<SegmentedControl<CorrelationMethod>
						options={METHOD_OPTIONS}
						value={method}
						onChange={setMethod}
						size="sm"
					/>
				</div>
				<div className="flex items-center gap-2">
					<span className="text-xs text-muted-foreground">View</span>
					<SegmentedControl<"matrix" | "graph">
						options={VIEW_OPTIONS}
						value={viewMode}
						onChange={setViewMode}
						size="sm"
					/>
				</div>
				<div className="flex items-center gap-2">
					<span className="text-xs text-muted-foreground whitespace-nowrap">
						Threshold: {edgeThreshold.toFixed(2)}
					</span>
					<Slider
						min={0}
						max={thresholdMax || 1}
						step={(thresholdMax || 1) / 100}
						value={edgeThreshold}
						onValueChange={setEdgeThreshold}
						className="w-32"
					/>
					<span className="text-xs text-muted-foreground w-12 text-right">
						{thresholdMax.toFixed(3)}
					</span>
				</div>
				<Button
					variant={figureMode ? "default" : "outline"}
					size="sm"
					onClick={() => setFigureMode((v) => !v)}
					className="ml-auto"
				>
					Figure mode
				</Button>
				<span className="text-xs text-muted-foreground">
					{loadedCount}/{totalCount} loaded
				</span>
			</div>

			{figureMode && (
				<div className="flex items-center gap-[4.5rem] flex-shrink-0 flex-wrap">
					<div className="flex items-center gap-2 flex-shrink-0">
						<span className="text-xs text-muted-foreground">Left</span>
						<SearchableSelect
							options={subjectOptions}
							value={figureA}
							onChange={setFigureA}
							placeholder="Pick subject…"
							className="w-56 flex-shrink-0"
						/>
					</div>
					<div className="flex items-center gap-2 flex-shrink-0">
						<span className="text-xs text-muted-foreground">Right</span>
						<SearchableSelect
							options={subjectOptions}
							value={figureB}
							onChange={setFigureB}
							placeholder="Pick subject…"
							className="w-56 flex-shrink-0"
						/>
					</div>
					<div className="flex items-center gap-2 flex-shrink-0">
						<span className="text-xs text-muted-foreground whitespace-nowrap">
							Size: {figureSize}px
						</span>
						<Slider
							min={200}
							max={600}
							step={10}
							value={figureSize}
							onValueChange={setFigureSize}
							className="w-32"
						/>
					</div>
					<div className="flex items-center gap-2 flex-shrink-0">
						<span className="text-xs text-muted-foreground whitespace-nowrap">
							Aspect: {figureAspect.toFixed(2)}:1
						</span>
						<Slider
							min={1}
							max={5}
							step={0.05}
							value={figureAspect}
							onValueChange={setFigureAspect}
							className="w-32"
						/>
					</div>
					<Button
						variant="outline"
						size="sm"
						onClick={handleExportSvg}
						disabled={exportPanels.length === 0}
					>
						Download SVG
					</Button>
				</div>
			)}

			{/* Figure mode: two large matrices, no columns */}
			{figureMode ? (
				<div className="flex-1 min-h-0 overflow-auto flex items-center justify-center gap-[4.5rem] py-4">
					{figureResults.map((r, i) =>
						r ? (
							<SubjectCard
								key={r.file.path}
								result={r}
								viewMode={viewMode}
								dataRange={dataRange}
								edgeThreshold={edgeThreshold}
								size={figureSize}
							/>
						) : (
							<span
								key={i}
								className="text-xs text-muted-foreground italic"
							>
								pick a subject
							</span>
						),
					)}
				</div>
			) : (
			/* Two-column layout with aligned site headers */
			<div className="flex-1 min-h-0 overflow-y-auto">
				<div className="grid grid-cols-2 gap-4 sticky top-0 z-20 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 py-1">
					<h3 className="text-sm font-medium text-foreground">
						HC ({totalHc})
					</h3>
					<h3 className="text-sm font-medium text-foreground">
						ASD ({totalAsd})
					</h3>
				</div>

				{siteGroups.map((group) => (
					<div key={group.siteKey} className="mb-4">
						{/* Site header spans both columns */}
						<div className="grid grid-cols-2 gap-4 mt-3 mb-2">
							<div className="text-xs font-semibold text-foreground bg-slate-800/80 border border-border rounded px-2 py-1">
								{group.siteKey}
							</div>
							<div className="text-xs font-semibold text-foreground bg-slate-800/80 border border-border rounded px-2 py-1">
								{group.siteKey}
							</div>
						</div>

						{/* HC / ASD side by side for this site */}
						<div className="grid grid-cols-2 gap-4">
							<div className="flex flex-wrap gap-2 content-start">
								{group.hc.map((r) => (
									<SubjectCard
										key={r.file.path}
										result={r}
										viewMode={viewMode}
										dataRange={dataRange}
										edgeThreshold={edgeThreshold}
									/>
								))}
								{group.hc.length === 0 && (
									<span className="text-[10px] text-muted-foreground italic">none</span>
								)}
							</div>
							<div className="flex flex-wrap gap-2 content-start">
								{group.asd.map((r) => (
									<SubjectCard
										key={r.file.path}
										result={r}
										viewMode={viewMode}
										dataRange={dataRange}
										edgeThreshold={edgeThreshold}
									/>
								))}
								{group.asd.length === 0 && (
									<span className="text-[10px] text-muted-foreground italic">none</span>
								)}
							</div>
						</div>
					</div>
				))}
			</div>
			)}
		</div>
	);
}
