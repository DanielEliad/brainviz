import * as d3 from "d3";
import { GraphFrame } from "./types";

export type Point = { x: number; y: number };

// ── Palette / layout ────────────────────────────────────────────────────────
export const palette = d3.schemeTableau10;
export const PADDING_RATIO = 0.08; // 8% of smaller dimension
export const BASE_WIDTH = 1920; // Reference width for scaling
export const BG_COLOR = "#0f172a";
export const SELECTION_COLOR = "#fbbf24";

// ── Nodes ────────────────────────────────────────────────────────────────────
export const NODE_RADIUS = 10;
export const NODE_STROKE = 1.5;
export const NODE_STROKE_SELECTED = 2.5;
export const NODE_SELECTION_GLOW_RADIUS = 4;
export const NODE_SELECTION_GLOW_STROKE = 3;

// ── Labels ───────────────────────────────────────────────────────────────────
export const LABEL_FONT_SIZE = 35;
export const LABEL_FONT_WEIGHT = 500;
export const LABEL_GAP = 14; // extra distance from node edge to label anchor
export const LABEL_MARGIN = 4; // min distance from canvas edge
export const LABEL_CLAMP_RAISE = 30; // Y raise applied when X is clamped to bounds
export const LABEL_OUTLINE_WIDTH = 4;

// ── Edges ────────────────────────────────────────────────────────────────────
export const EDGE_THICKNESS_MIN = 0.5;
export const EDGE_THICKNESS_MAX = 16;
export const EDGE_GLOW_WIDTH = 4; // extra stroke width behind selected edge
export const EDGE_COLOR_WEAK = "rgb(59, 130, 246)";
export const EDGE_COLOR_STRONG = "rgb(220, 38, 38)";

// Symmetric arrows
export const EDGE_ARROW_MIN_SYMMETRIC = 8;
export const EDGE_ARROW_MULTIPLIER_SYMMETRIC = 2.8;

// Asymmetric (curved) arrows
export const EDGE_CURVE_OFFSET = 30; // perpendicular offset for curved edges
export const EDGE_ARROW_SPACING = 40;
export const EDGE_ARROW_MIN_ASYMMETRIC = 4;
export const EDGE_ARROW_MULTIPLIER_ASYMMETRIC = 2.2;

// ── Info box ─────────────────────────────────────────────────────────────────
export const INFO_BOX_FONT_SIZE = 20;
export const INFO_BOX_PADDING = 14;
export const INFO_BOX_LINE_HEIGHT = 20;
export const INFO_BOX_WIDTH = 600;
export const INFO_BOX_MARGIN = 5;
export const INFO_BOX_CORNER_RADIUS = 10;
export const INFO_BOX_BORDER_WIDTH = 1.5;

// ── Types ────────────────────────────────────────────────────────────────────

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
    .scalePow<string>()
    .exponent(2.5)
    .domain([absRange.min, absRange.max])
    .range([EDGE_COLOR_WEAK, EDGE_COLOR_STRONG])
    .clamp(true);
}

export function createThicknessScale(range: DataRange, scale: number = 1) {
  const absRange = getAbsoluteRange(range);
  return d3
    .scalePow()
    .exponent(2.5)
    .domain([absRange.min, absRange.max])
    .range([EDGE_THICKNESS_MIN * scale, EDGE_THICKNESS_MAX * scale])
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

  ctx.fillStyle = BG_COLOR;
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
        ctx.strokeStyle = SELECTION_COLOR;
        ctx.lineWidth = thickness + EDGE_GLOW_WIDTH * scale;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = thickness;
      ctx.stroke();

      // Add 3 equally spaced arrows to show direction
      const arrowSize = Math.max(
        EDGE_ARROW_MIN_SYMMETRIC * scale,
        thickness * EDGE_ARROW_MULTIPLIER_SYMMETRIC,
      );
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

      const curveOffset = curveDirection * EDGE_CURVE_OFFSET * scale;
      const midX = (source.x + target.x) / 2 + perpX * curveOffset;
      const midY = (source.y + target.y) / 2 + perpY * curveOffset;

      // Draw yellow glow behind selected edge
      if (edgeIsSelectedCurrent) {
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.quadraticCurveTo(midX, midY, target.x, target.y);
        ctx.strokeStyle = SELECTION_COLOR;
        ctx.lineWidth = thickness + EDGE_GLOW_WIDTH * scale;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.quadraticCurveTo(midX, midY, target.x, target.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = thickness;
      ctx.stroke();

      const arrowSize = Math.max(
        EDGE_ARROW_MIN_ASYMMETRIC * scale,
        thickness * EDGE_ARROW_MULTIPLIER_ASYMMETRIC,
      );
      const arrowSpacing = EDGE_ARROW_SPACING * scale;
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

    const radius = NODE_RADIUS * scale;
    ctx.globalAlpha = opacity;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();

    if (isSelected) {
      ctx.beginPath();
      ctx.arc(
        pos.x,
        pos.y,
        radius + NODE_SELECTION_GLOW_RADIUS * scale,
        0,
        Math.PI * 2,
      );
      ctx.strokeStyle = SELECTION_COLOR;
      ctx.lineWidth = NODE_SELECTION_GLOW_STROKE * scale;
      ctx.stroke();
    }

    ctx.strokeStyle = isNodeConnected ? "white" : "rgba(255, 255, 255, 0.5)";
    ctx.lineWidth = isSelected
      ? NODE_STROKE_SELECTED * scale
      : NODE_STROKE * scale;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.stroke();

    const label = node.full_name ?? node.label;

    // Position label radially outward from the circle center
    const cx = width / 2;
    const cy = height / 2;
    const angle = Math.atan2(pos.y - cy, pos.x - cx);
    const labelDist = radius + LABEL_GAP * scale;
    let labelX = pos.x + Math.cos(angle) * labelDist;
    let labelY = pos.y + Math.sin(angle) * labelDist;

    // Align text so it reads outward (never overlaps the node)
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const hAlign: CanvasTextAlign =
      Math.abs(cosA) < 0.3 ? "center" : cosA > 0 ? "left" : "right";
    const vAlign: CanvasTextBaseline =
      Math.abs(sinA) < 0.3 ? "middle" : sinA > 0 ? "top" : "bottom";

    ctx.font = `${LABEL_FONT_WEIGHT} ${LABEL_FONT_SIZE * scale}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = hAlign;
    ctx.textBaseline = vAlign;

    const margin = LABEL_MARGIN * scale;
    const fontSize = LABEL_FONT_SIZE * scale;
    const textWidth = ctx.measureText(label).width;

    // Returns bounding box of the text given an anchor point
    const getTextBounds = (lx: number, ly: number) => {
      const left =
        hAlign === "left"
          ? lx
          : hAlign === "right"
            ? lx - textWidth
            : lx - textWidth / 2;
      const top =
        vAlign === "top"
          ? ly
          : vAlign === "bottom"
            ? ly - fontSize
            : ly - fontSize / 2;
      return { left, right: left + textWidth, top, bottom: top + fontSize };
    };

    // Clamp X to canvas bounds; when clamped, also raise Y to avoid node overlap
    let b = getTextBounds(labelX, labelY);
    if (b.left < margin) {
      labelY -= LABEL_CLAMP_RAISE * scale;
      labelX += margin - b.left;
    } else if (b.right > width - margin) {
      labelY -= LABEL_CLAMP_RAISE * scale;
      labelX -= b.right - (width - margin);
    }

    // Clamp Y to canvas bounds
    b = getTextBounds(labelX, labelY);
    if (b.top < margin) labelY += margin - b.top;
    else if (b.bottom > height - margin) labelY -= b.bottom - (height - margin);

    // Dark outline for contrast against edges and background
    ctx.strokeStyle = "rgba(0, 0, 0, 0.9)";
    ctx.lineWidth = LABEL_OUTLINE_WIDTH * scale;
    ctx.lineJoin = "round";
    ctx.globalAlpha = opacity;
    ctx.strokeText(label, labelX, labelY);

    ctx.fillStyle = isNodeConnected
      ? "white"
      : `rgba(255, 255, 255, ${opacity})`;
    ctx.fillText(label, labelX, labelY);

    ctx.globalAlpha = 1;
  });

  // Draw info box if provided (compact wide format)
  if (infoBox) {
    const padding = INFO_BOX_PADDING * scale;
    const lineHeight = INFO_BOX_LINE_HEIGHT * scale;
    const fontSize = INFO_BOX_FONT_SIZE * scale;

    // Compact two-line format
    const subjectLine = infoBox.subjectInfo
      ? `${infoBox.subjectInfo.version} / ${infoBox.subjectInfo.site} / ${infoBox.subjectInfo.subject_id} (${infoBox.subjectInfo.diagnosis})`
      : "";
    const paramsLine = `Smooth: ${infoBox.smoothing} | Interp: ${infoBox.interpolation} | Speed: ${infoBox.speed}x | Thresh: ${infoBox.edgeThreshold.toFixed(2)}`;

    const lines = subjectLine ? [subjectLine, paramsLine] : [paramsLine];

    const boxWidth = INFO_BOX_WIDTH * scale;
    const boxHeight = padding * 2 + lines.length * lineHeight;
    const boxX = INFO_BOX_MARGIN * scale;
    const boxY = INFO_BOX_MARGIN * scale;

    ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
    ctx.beginPath();
    ctx.roundRect(
      boxX,
      boxY,
      boxWidth,
      boxHeight,
      INFO_BOX_CORNER_RADIUS * scale,
    );
    ctx.fill();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = INFO_BOX_BORDER_WIDTH * scale;
    ctx.beginPath();
    ctx.roundRect(
      boxX,
      boxY,
      boxWidth,
      boxHeight,
      INFO_BOX_CORNER_RADIUS * scale,
    );
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
