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
	size?: number;
};

export function SubjectCard({
	result,
	viewMode,
	dataRange,
	edgeThreshold,
	size = CARD_SIZE,
}: Props) {
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
	const large = size >= 200;

	return (
		<div
			ref={containerRef}
			className="flex flex-col items-center gap-1"
			style={{ width: size }}
		>
			<div
				className="bg-slate-800 rounded border border-border flex items-center justify-center"
				style={{ width: size, height: size }}
			>
				{!isVisible ? null : isLoading ? (
					<div className="text-muted-foreground text-xs animate-pulse">...</div>
				) : frame ? (
					viewMode === "matrix" ? (
						<MatrixHeatmap
							frame={frame}
							size={size}
							dataRange={dataRange}
							threshold={edgeThreshold}
						/>
					) : (
						<MiniGraph
							frame={frame}
							size={size}
							edgeThreshold={edgeThreshold}
							symmetric={symmetric}
						/>
					)
				) : (
					<div className="text-muted-foreground text-[10px]">No data</div>
				)}
			</div>
			<span
				className={
					large
						? "text-foreground w-full text-center whitespace-nowrap"
						: "text-[10px] text-muted-foreground truncate w-full text-center"
				}
				style={large ? { fontSize: Math.round(size * 0.055) } : undefined}
			>
				{file.subject_id} ({file.site}
				{large ? `, ${file.diagnosis}` : ""})
			</span>
		</div>
	);
}
