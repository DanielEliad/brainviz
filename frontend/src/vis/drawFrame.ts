import * as d3 from "d3";
import { GraphFrame } from "./types";

export type Point = { x: number; y: number };

export const palette = d3.schemeTableau10;
export const PADDING_RATIO = 0.08; // 8% of smaller dimension
export const BASE_WIDTH = 1920; // Reference width for scaling

// Data range type - must be provided from actual data, never hardcoded
export type DataRange = {
  min: number;
  max: number;
};

// Subject info for video export info box
export type SubjectInfo = {
  subject_id: number;
  site: string;
  version: string;
  diagnosis: "ASD" | "HC";
};

export function getAbsoluteRange(range: DataRange): {
  min: number;
  max: number;
} {
  return { min: 0, max: Math.max(Math.abs(range.min), Math.abs(range.max)) };
}

// Scale factory functions - create scales based on absolute value range
// These expect |correlation| as input, not raw correlation
export function createColorScale(range: DataRange) {
  const absRange = getAbsoluteRange(range);
  return d3
    .scaleLinear<string>()
    .domain([absRange.min, absRange.max])
    .range(["rgb(59, 130, 246)", "rgb(220, 38, 38)"])
    .clamp(true);
}

export function createThicknessScale(range: DataRange, scale: number = 1) {
  const absRange = getAbsoluteRange(range);
  return d3
    .scaleLinear()
    .domain([absRange.min, absRange.max])
    .range([0.5 * scale, 8 * scale])
    .clamp(true);
}

type Edge = { source: string; target: string; weight: number };

/**
 * Check if edge passes threshold filter.
 */
export function isEdgeVisible(edge: Edge, edgeThreshold: number): boolean {
  const absWeight = Math.abs(edge.weight);
  return absWeight > 0 && absWeight > edgeThreshold;
}

function filterStrongerEdgePerPair(edges: Edge[]): Edge[] {
  const pairMap = new Map<string, Edge>();
  for (const edge of edges) {
    const pairKey = [edge.source, edge.target].sort().join("|");
    const existing = pairMap.get(pairKey);
    if (!existing) {
      pairMap.set(pairKey, edge);
      continue;
    }
    const edgeWeight = Math.abs(edge.weight);
    const existingWeight = Math.abs(existing.weight);
    if (edgeWeight > existingWeight) {
      pairMap.set(pairKey, edge);
    } else if (edgeWeight === existingWeight && edge.source < edge.target) {
      // tie breaker: prefer edge where source < target
      pairMap.set(pairKey, edge);
    }
  }
  return Array.from(pairMap.values());
}
/**
 * Filter edges for display. For symmetric mode, picks the dominant edge per pair
 * (the one with larger |weight|). For asymmetric mode, returns all edges.
 */
export function filterEdgesForDisplay(
  edges: Edge[],
  edgeThreshold: number,
  symmetric: boolean,
): Edge[] {
  let filteredEdges = edges;
  if (symmetric) {
    filteredEdges = filterStrongerEdgePerPair(edges);
  }
  return filteredEdges.filter((e) => isEdgeVisible(e, edgeThreshold));
}

/**
 * Is edge connected to the active (hovered/selected) node?
 * Used to dim unrelated edges when a node is focused.
 */
export function isEdgeConnectedToNode(
  edge: { source: string; target: string },
  activeNodeId: string,
): boolean {
  return edge.source === activeNodeId || edge.target === activeNodeId;
}

/**
 * Is this edge the currently selected edge?
 * Matches in either direction since edges can be clicked from either end.
 */
export function isEdgeSelected(
  edge: { source: string; target: string },
  selectedEdge: { source: string; target: string },
): boolean {
  return (
    (edge.source === selectedEdge.source &&
      edge.target === selectedEdge.target) ||
    (edge.source === selectedEdge.target && edge.target === selectedEdge.source)
  );
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
  selectedEdge?: { source: string; target: string } | null;
  infoBox?: {
    smoothing: string;
    interpolation: string;
    speed: number;
    edgeThreshold: number;
    subjectInfo?: SubjectInfo;
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
    selectedEdge,
    infoBox,
  } = options;

  // Calculate scale factor based on canvas width relative to base (1920px)
  // This ensures all elements scale proportionally at higher resolutions
  const scale = width / BASE_WIDTH;

  // Create scales based on actual data range - never use hardcoded values
  const colorScale = createColorScale(dataRange);
  const thicknessScale = createThicknessScale(dataRange, scale);

  const positions = computeNodePositions(frame.nodes.length, width, height);
  const nodePositions = new Map<string, Point>();
  frame.nodes.forEach((node, i) => {
    nodePositions.set(node.id, positions[i]);
  });

  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, width, height);

  // Filter edges for display
  const edgesToDraw = filterEdgesForDisplay(
    frame.edges,
    edgeThreshold,
    symmetric,
  );

  edgesToDraw.forEach((edge) => {
    const source = nodePositions.get(edge.source);
    const target = nodePositions.get(edge.target);
    if (!source || !target) return;
    const absWeight = Math.abs(edge.weight);

    // Use absolute value for color/thickness - scales expect |correlation|
    const baseColor = colorScale(absWeight);
    let opacity = 1;
    let edgeIsSelectedCurrent = selectedEdge
      ? isEdgeSelected(edge, selectedEdge)
      : false;
    if (activeNodeId) {
      opacity = isEdgeConnectedToNode(edge, activeNodeId) ? opacity : 0.15;
    }
    if (selectedEdge) {
      opacity = edgeIsSelectedCurrent ? opacity : 0.15;
    }

    const rgbMatch = baseColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    const color = rgbMatch
      ? `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${opacity})`
      : baseColor;
    const thickness = thicknessScale(absWeight);

    // Calculate direction vector for arrows
    const dx = target.x - source.x;
    const dy = target.y - source.y;

    if (symmetric) {
      // Symmetric: draw straight line with arrow to show correlation direction
      // Draw yellow glow behind selected edge
      if (edgeIsSelectedCurrent) {
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.strokeStyle = "#fbbf24";
        ctx.lineWidth = thickness + 4 * scale;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = thickness;
      ctx.stroke();

      // Add 3 equally spaced arrows to show direction
      const arrowSize = Math.max(8 * scale, thickness * 2.8);
      const arrowAngle = Math.atan2(dy, dx);

      ctx.fillStyle = color;

      for (const t of [0.25, 0.5, 0.75]) {
        const arrowX = source.x + dx * t;
        const arrowY = source.y + dy * t;

        ctx.beginPath();
        ctx.moveTo(arrowX, arrowY);
        ctx.lineTo(
          arrowX - arrowSize * Math.cos(arrowAngle - Math.PI / 6),
          arrowY - arrowSize * Math.sin(arrowAngle - Math.PI / 6),
        );
        ctx.lineTo(
          arrowX - arrowSize * Math.cos(arrowAngle + Math.PI / 6),
          arrowY - arrowSize * Math.sin(arrowAngle + Math.PI / 6),
        );
        ctx.closePath();
        ctx.fill();
      }
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

      const curveOffset = curveDirection * 30 * scale;
      const midX = (source.x + target.x) / 2 + perpX * curveOffset;
      const midY = (source.y + target.y) / 2 + perpY * curveOffset;

      // Draw yellow glow behind selected edge
      if (edgeIsSelectedCurrent) {
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.quadraticCurveTo(midX, midY, target.x, target.y);
        ctx.strokeStyle = "#fbbf24";
        ctx.lineWidth = thickness + 4 * scale;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.quadraticCurveTo(midX, midY, target.x, target.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = thickness;
      ctx.stroke();

      const arrowSize = Math.max(4 * scale, thickness * 2.2);
      const arrowSpacing = 40 * scale;
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

    const radius = 10 * scale;
    ctx.globalAlpha = opacity;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();

    if (isSelected) {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius + 4 * scale, 0, Math.PI * 2);
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 3 * scale;
      ctx.stroke();
    }

    ctx.strokeStyle = isNodeConnected ? "white" : "rgba(255, 255, 255, 0.5)";
    ctx.lineWidth = isSelected ? 2.5 * scale : 1.5 * scale;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.font = `500 ${12 * scale}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = isNodeConnected
      ? "white"
      : `rgba(255, 255, 255, ${opacity})`;
    ctx.fillText(node.label, pos.x, pos.y - radius - 6 * scale);

    ctx.globalAlpha = 1;
  });

  // Draw info box if provided (compact wide format)
  if (infoBox) {
    const padding = 14 * scale;
    const lineHeight = 24 * scale;
    const fontSize = 16 * scale;

    // Compact two-line format
    const subjectLine = infoBox.subjectInfo
      ? `${infoBox.subjectInfo.version} / ${infoBox.subjectInfo.site} / ${infoBox.subjectInfo.subject_id} (${infoBox.subjectInfo.diagnosis})`
      : "";
    const paramsLine = `Smooth: ${infoBox.smoothing} | Interp: ${infoBox.interpolation} | Speed: ${infoBox.speed}x | Thresh: ${infoBox.edgeThreshold.toFixed(2)}`;

    const lines = subjectLine ? [subjectLine, paramsLine] : [paramsLine];

    const boxWidth = 500 * scale;
    const boxHeight = padding * 2 + lines.length * lineHeight;
    const boxX = 24 * scale;
    const boxY = 24 * scale;

    ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 10 * scale);
    ctx.fill();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 1.5 * scale;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 10 * scale);
    ctx.stroke();

    ctx.font = `500 ${fontSize}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = "white";

    lines.forEach((line, i) => {
      ctx.fillText(line, boxX + padding, boxY + padding + i * lineHeight);
    });
  }
}
