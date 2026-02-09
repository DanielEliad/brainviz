import { useEffect, useRef } from "react";
import type { GraphFrame } from "../vis/types";
import type { DataRange } from "../vis/drawFrame";
import { createColorScale, getAbsoluteRange } from "../vis/drawFrame";

const NUM_RSNS = 14;

type Props = {
	frame: GraphFrame;
	size: number;
	dataRange: DataRange;
	threshold: number;
};

export function MatrixHeatmap({ frame, size, dataRange, threshold }: Props) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const dpr = window.devicePixelRatio || 1;
		canvas.width = size * dpr;
		canvas.height = size * dpr;
		ctx.scale(dpr, dpr);

		const cellSize = size / NUM_RSNS;
		const colorScale = createColorScale(dataRange);
		const absRange = getAbsoluteRange(dataRange);

		// Build lookup from edges
		const nodeIds = frame.nodes.map((n) => n.id);
		const idxMap = new Map(nodeIds.map((id, i) => [id, i]));
		const matrix: number[][] = Array.from({ length: NUM_RSNS }, () =>
			Array(NUM_RSNS).fill(0),
		);
		for (const edge of frame.edges) {
			const i = idxMap.get(edge.source);
			const j = idxMap.get(edge.target);
			if (i !== undefined && j !== undefined) {
				matrix[i][j] = edge.weight;
				// For symmetric data, also fill the mirror
				if (matrix[j][i] === 0) matrix[j][i] = edge.weight;
			}
		}

		ctx.fillStyle = "#0f172a";
		ctx.fillRect(0, 0, size, size);

		for (let i = 0; i < NUM_RSNS; i++) {
			for (let j = 0; j < NUM_RSNS; j++) {
				const x = j * cellSize;
				const y = i * cellSize;

				if (i === j) {
					ctx.fillStyle = "#334155";
				} else {
					const absVal = Math.abs(matrix[i][j]);
					if (absVal === 0 || absRange.max === 0 || absVal <= threshold) {
						ctx.fillStyle = "#0f172a";
					} else {
						ctx.fillStyle = colorScale(absVal);
					}
				}
				ctx.fillRect(x, y, cellSize, cellSize);
			}
		}
	}, [frame, size, dataRange, threshold]);

	return (
		<canvas
			ref={canvasRef}
			style={{ width: size, height: size }}
			className="rounded"
		/>
	);
}
