import { useEffect, useRef } from "react";
import type { GraphFrame } from "../vis/types";
import type { DataRange } from "../vis/drawFrame";
import { drawMatrixPanel } from "./drawPanels";

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

		drawMatrixPanel(ctx, frame, size, dataRange, threshold);
	}, [frame, size, dataRange, threshold]);

	return (
		<canvas
			ref={canvasRef}
			style={{ width: size, height: size }}
			className="rounded"
		/>
	);
}
