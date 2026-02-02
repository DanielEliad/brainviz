import * as d3 from "d3";
import { GraphFrame } from "./types";

export type Point = { x: number; y: number };

export const palette = d3.schemeTableau10;
export const PADDING_RATIO = 0.08; // 8% of smaller dimension

// Data range type - must be provided from actual data, never hardcoded
export type DataRange = {
  min: number;
  max: number;
};

export function getAbsoluteRange(range: DataRange): {
  min: number;
  max: number;
} {
  return { min: Math.max(0, range.min), max: Math.max(range.max, 0) };
}

// Scale factory functions - create scales based on absolute value range
// These expect |correlation| as input, not raw correlation
export function createColorScale(range: DataRange) {
  const absRange = getAbsoluteRange(range);
  return d3
    .scaleLinear<string>()
    .domain([absRange.min, absRange.max])
    .range(["rgb(59, 130, 246)", "rgb(220, 38, 38)"]);
}

export function createThicknessScale(range: DataRange) {
  const absRange = getAbsoluteRange(range);
  return d3.scaleLinear().domain([absRange.min, absRange.max]).range([0.5, 8]);
}

export function computeNodePositions(
  nodesLength: number,
  width: number,
  height: number,
): Point[] {
  const cx = width / 2;
  const cy = height / 2;
  const padding = Math.min(width, height) * PADDING_RATIO;
  const rx = width / 2 - padding;
  const ry = height / 2 - padding;
  const positions: Point[] = [];

  for (let i = 0; i < nodesLength; i += 1) {
    const angle = (i / Math.max(nodesLength, 1)) * Math.PI * 2 - Math.PI / 2;
    positions.push({
      x: cx + rx * Math.cos(angle),
      y: cy + ry * Math.sin(angle),
    });
  }
  return positions;
}

export type DrawOptions = {
  symmetric: boolean;
  dataRange: DataRange; // Required - must come from actual data (meta.edge_weight_min/max)
  edgeThreshold?: number;
  activeNodeId?: string | null;
  connectedNodes?: Set<string>;
  selectedNode?: string | null;
  infoBox?: {
    smoothing: string;
    interpolation: string;
    speed: number;
    edgeThreshold: number;
  };
};

type AnyCanvasContext =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

export function drawFrame(
  ctx: AnyCanvasContext,
  frame: GraphFrame,
  width: number,
  height: number,
  options: DrawOptions,
): void {
  const {
    symmetric,
    dataRange,
    edgeThreshold = 0,
    activeNodeId,
    connectedNodes,
    selectedNode,
    infoBox,
  } = options;

  // Create scales based on actual data range - never use hardcoded values
  const colorScale = createColorScale(dataRange);
  const thicknessScale = createThicknessScale(dataRange);

  const positions = computeNodePositions(frame.nodes.length, width, height);
  const nodePositions = new Map<string, Point>();
  frame.nodes.forEach((node, i) => {
    nodePositions.set(node.id, positions[i]);
  });

  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, width, height);

  const isEdgeConnected = (edge: { source: string; target: string }) => {
    if (!activeNodeId) return true;
    return edge.source === activeNodeId || edge.target === activeNodeId;
  };

  // For symmetric correlations, deduplicate edges (only draw once per pair)
  const edgesToDraw = symmetric
    ? frame.edges.filter((edge) => edge.source < edge.target)
    : frame.edges;

  edgesToDraw.forEach((edge) => {
    const source = nodePositions.get(edge.source);
    const target = nodePositions.get(edge.target);
    // Use absolute value for threshold comparison and visualization
    const absWeight = Math.abs(edge.weight);
    if (!source || !target || absWeight === 0 || absWeight <= edgeThreshold)
      return;

    // Use absolute value for color/thickness - scales expect |correlation|
    const baseColor = colorScale(absWeight);
    const edgeIsConnected = isEdgeConnected(edge);
    const opacity = edgeIsConnected ? 1 : 0.15;

    const rgbMatch = baseColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    const color = rgbMatch
      ? `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${opacity})`
      : baseColor;
    const thickness = thicknessScale(absWeight);

    // Calculate direction vector for arrows
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (symmetric) {
      // Symmetric: draw straight line with arrow to show correlation direction
      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = thickness;
      ctx.stroke();

      // Add arrow at midpoint to show direction
      const arrowSize = Math.max(4, thickness * 2.2);
      const midX = (source.x + target.x) / 2;
      const midY = (source.y + target.y) / 2;
      const arrowAngle = Math.atan2(dy, dx);

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(midX, midY);
      ctx.lineTo(
        midX - arrowSize * Math.cos(arrowAngle - Math.PI / 6),
        midY - arrowSize * Math.sin(arrowAngle - Math.PI / 6),
      );
      ctx.lineTo(
        midX - arrowSize * Math.cos(arrowAngle + Math.PI / 6),
        midY - arrowSize * Math.sin(arrowAngle + Math.PI / 6),
      );
      ctx.closePath();
      ctx.fill();
    } else {
      // Asymmetric: draw curved line with directional arrows
      const pair = [edge.source, edge.target].sort();
      const [sourceId, targetId] = pair;
      const curveDirection = edge.source === sourceId ? 1 : -1;

      const sourcePos = nodePositions.get(sourceId)!;
      const targetPos = nodePositions.get(targetId)!;
      const dx = targetPos.x - sourcePos.x;
      const dy = targetPos.y - sourcePos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const perpX = -dy / dist;
      const perpY = dx / dist;

      const curveOffset = curveDirection * 30;
      const midX = (source.x + target.x) / 2 + perpX * curveOffset;
      const midY = (source.y + target.y) / 2 + perpY * curveOffset;

      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.quadraticCurveTo(midX, midY, target.x, target.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = thickness;
      ctx.stroke();

      const arrowSize = Math.max(4, thickness * 2.2);
      const arrowSpacing = 40;
      const numArrows = Math.max(1, Math.floor(dist / arrowSpacing));

      ctx.fillStyle = color;
      for (let i = 1; i <= numArrows; i++) {
        const t = i / (numArrows + 1);
        const curveX =
          (1 - t) * (1 - t) * source.x +
          2 * (1 - t) * t * midX +
          t * t * target.x;
        const curveY =
          (1 - t) * (1 - t) * source.y +
          2 * (1 - t) * t * midY +
          t * t * target.y;

        const tNext = (i + 0.1) / (numArrows + 1);
        const nextX =
          (1 - tNext) * (1 - tNext) * source.x +
          2 * (1 - tNext) * tNext * midX +
          tNext * tNext * target.x;
        const nextY =
          (1 - tNext) * (1 - tNext) * source.y +
          2 * (1 - tNext) * tNext * midY +
          tNext * tNext * target.y;

        const arrowAngle = Math.atan2(nextY - curveY, nextX - curveX);

        ctx.beginPath();
        ctx.moveTo(curveX, curveY);
        ctx.lineTo(
          curveX - arrowSize * Math.cos(arrowAngle - Math.PI / 6),
          curveY - arrowSize * Math.sin(arrowAngle - Math.PI / 6),
        );
        ctx.lineTo(
          curveX - arrowSize * Math.cos(arrowAngle + Math.PI / 6),
          curveY - arrowSize * Math.sin(arrowAngle + Math.PI / 6),
        );
        ctx.closePath();
        ctx.fill();
      }
    }
  });

  frame.nodes.forEach((node, idx) => {
    const pos = nodePositions.get(node.id);
    if (!pos) return;

    const isNodeConnected = !activeNodeId || connectedNodes?.has(node.id);
    const opacity = isNodeConnected ? 1 : 0.2;
    const isSelected = node.id === selectedNode;

    const baseFill = palette[idx % palette.length];
    let fill = baseFill;

    if (opacity < 1) {
      if (baseFill.startsWith("#")) {
        const hex = baseFill.slice(1);
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        fill = `rgba(${r}, ${g}, ${b}, ${opacity})`;
      }
    }

    const radius = 8 + (node.degree ?? 0) * 0.5;
    ctx.globalAlpha = opacity;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();

    if (isSelected) {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius + 4, 0, Math.PI * 2);
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    ctx.strokeStyle = isNodeConnected ? "white" : "rgba(255, 255, 255, 0.5)";
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.font = "500 12px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = isNodeConnected
      ? "white"
      : `rgba(255, 255, 255, ${opacity})`;
    ctx.fillText(node.label, pos.x, pos.y - radius - 6);

    ctx.globalAlpha = 1;
  });

  // Draw info box if provided
  if (infoBox) {
    const padding = 18;
    const lineHeight = 28;
    const fontSize = 18;
    const lines = [
      `Smoothing: ${infoBox.smoothing}`,
      `Interpolation: ${infoBox.interpolation}`,
      `Speed: ${infoBox.speed}x`,
      `Edge Threshold: ${infoBox.edgeThreshold.toFixed(1)}`,
    ];
    const boxWidth = 280;
    const boxHeight = padding * 2 + lines.length * lineHeight;
    const boxX = 24;
    const boxY = 24;

    ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 12);
    ctx.fill();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 12);
    ctx.stroke();

    ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = "white";

    lines.forEach((line, i) => {
      ctx.fillText(line, boxX + padding, boxY + padding + i * lineHeight);
    });
  }
}
