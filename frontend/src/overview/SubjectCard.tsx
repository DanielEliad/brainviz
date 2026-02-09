import { useEffect, useRef, useState } from "react";
import type { DataRange } from "../vis/drawFrame";
import type { OverviewResult } from "./useOverviewData";
import { MatrixHeatmap } from "./MatrixHeatmap";
import { MiniGraph } from "./MiniGraph";

const CARD_SIZE = 120;

type Props = {
	result: OverviewResult;
	viewMode: "matrix" | "graph";
	dataRange: DataRange;
	edgeThreshold: number;
};

export function SubjectCard({ result, viewMode, dataRange, edgeThreshold }: Props) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [isVisible, setIsVisible] = useState(false);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;

		const observer = new IntersectionObserver(
			([entry]) => setIsVisible(entry.isIntersecting),
			{ rootMargin: "200px" },
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	const { file, data, isLoading } = result;
	const frame = data?.frames[0];
	const symmetric = data?.symmetric ?? true;

	return (
		<div
			ref={containerRef}
			className="flex flex-col items-center gap-1"
			style={{ width: CARD_SIZE }}
		>
			<div
				className="bg-slate-800 rounded border border-border flex items-center justify-center"
				style={{ width: CARD_SIZE, height: CARD_SIZE }}
			>
				{!isVisible ? null : isLoading ? (
					<div className="text-muted-foreground text-xs animate-pulse">...</div>
				) : frame ? (
					viewMode === "matrix" ? (
						<MatrixHeatmap
							frame={frame}
							size={CARD_SIZE}
							dataRange={dataRange}
							threshold={edgeThreshold}
						/>
					) : (
						<MiniGraph
							frame={frame}
							size={CARD_SIZE}
							dataRange={dataRange}
							edgeThreshold={edgeThreshold}
							symmetric={symmetric}
						/>
					)
				) : (
					<div className="text-muted-foreground text-[10px]">No data</div>
				)}
			</div>
			<span className="text-[10px] text-muted-foreground truncate w-full text-center">
				{file.subject_id} ({file.site})
			</span>
		</div>
	);
}
