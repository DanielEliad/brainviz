import { useEffect, useMemo, useState } from "react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Slider } from "@/components/ui/slider";
import { useAbideFiles, type CorrelationMethod } from "../vis/useGraphData";
import { useOverviewData, type OverviewResult } from "./useOverviewData";
import { SubjectCard } from "./SubjectCard";

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
	const [edgeThreshold, setEdgeThreshold] = useState(0);

	const filesQuery = useAbideFiles();
	const files = filesQuery.data?.files ?? [];

	const { results, dataRange, loadedCount } = useOverviewData(files, method);

	const thresholdMax = Math.max(Math.abs(dataRange.min), Math.abs(dataRange.max));

	// Reset threshold when method changes (value range differs)
	useEffect(() => {
		setEdgeThreshold(0);
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
			{/* Controls bar */}
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
				<span className="text-xs text-muted-foreground ml-auto">
					{loadedCount}/{files.length} loaded
				</span>
			</div>

			{/* Two-column layout with aligned site headers */}
			<div className="flex-1 min-h-0 overflow-y-auto">
				{/* Column headers */}
				<div className="grid grid-cols-2 gap-4 sticky top-0 z-20 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 py-1">
					<h3 className="text-sm font-medium text-foreground">
						HC ({totalHc})
					</h3>
					<h3 className="text-sm font-medium text-foreground">
						ASD ({totalAsd})
					</h3>
				</div>

				{/* Site groups */}
				{siteGroups.map((group) => (
					<div key={group.siteKey} className="mb-4">
						{/* Site header — in both columns */}
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
		</div>
	);
}
