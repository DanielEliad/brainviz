import { useEffect, useRef } from "react";
import type { GraphFrame } from "../vis/types";
import type { DataRange } from "../vis/drawFrame";
import {
	computeNodePositions,
	createColorScale,
	createThicknessScale,
	filterEdgesForDisplay,
	palette,
} from "../vis/drawFrame";

type Props = {
	frame: GraphFrame;
	size: number;
	dataRange: DataRange;
	edgeThreshold: number;
	symmetric: boolean;
};

export function MiniGraph({ frame, size, dataRange, edgeThreshold, symmetric }: Props) {
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

		ctx.fillStyle = "#0f172a";
		ctx.fillRect(0, 0, size, size);

		const positions = computeNodePositions(frame.nodes.length, size, size);
		const nodePositions = new Map<string, { x: number; y: number }>();
		frame.nodes.forEach((node, i) => {
			nodePositions.set(node.id, positions[i]);
		});

		const colorScale = createColorScale(dataRange);
		// Scale thickness for thumbnail: thinner edges
		const thicknessScale = createThicknessScale(dataRange);

		const edges = filterEdgesForDisplay(frame.edges, edgeThreshold, symmetric);

		for (const edge of edges) {
			const source = nodePositions.get(edge.source);
			const target = nodePositions.get(edge.target);
			if (!source || !target) continue;

			const absWeight = Math.abs(edge.weight);
			ctx.beginPath();
			ctx.moveTo(source.x, source.y);
			ctx.lineTo(target.x, target.y);
			ctx.strokeStyle = colorScale(absWeight);
			// Scale thickness to thumbnail size (120px vs 1920px base)
			const rawThickness = thicknessScale(absWeight);
			ctx.lineWidth = Math.max(0.5, rawThickness * (size / 1920));
			ctx.stroke();
		}

		// Draw nodes
		const nodeRadius = Math.max(2, size / 60);
		frame.nodes.forEach((node, idx) => {
			const pos = nodePositions.get(node.id);
			if (!pos) return;

			ctx.beginPath();
			ctx.arc(pos.x, pos.y, nodeRadius, 0, Math.PI * 2);
			ctx.fillStyle = palette[idx % palette.length];
			ctx.fill();
			ctx.strokeStyle = "white";
			ctx.lineWidth = 0.5;
			ctx.stroke();
		});
	}, [frame, size, dataRange, edgeThreshold, symmetric]);

	return (
		<canvas
			ref={canvasRef}
			style={{ width: size, height: size }}
			className="rounded"
		/>
	);
}
