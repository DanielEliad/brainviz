import { useEffect, useRef } from "react";
import type { GraphFrame } from "../vis/types";
import { drawMiniGraphPanel } from "./drawPanels";

type Props = {
	frame: GraphFrame;
	size: number;
	edgeThreshold: number;
	symmetric: boolean;
};

export function MiniGraph({ frame, size, edgeThreshold, symmetric }: Props) {
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

		drawMiniGraphPanel(ctx, frame, size, edgeThreshold, symmetric);
	}, [frame, size, edgeThreshold, symmetric]);

	return (
		<canvas
			ref={canvasRef}
			style={{ width: size, height: size }}
			className="rounded"
		/>
	);
}
