import type { GraphFrame } from "../vis/types";
import {
  BASE_WIDTH,
  BG_COLOR,
  computeNodePositions,
  createColorScale,
  createThicknessScale,
  filterEdgesForDisplay,
  getAbsoluteRange,
  palette,
  type DataRange,
} from "../vis/drawFrame";

export const NUM_RSNS = 14;

const MATRIX_DIAGONAL_COLOR = "#334155";
// 0.5 px at the 120 px thumbnail size
const HAIRLINE_RATIO = 1 / 240;

type AnyCanvasContext =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

/** Dense 14x14 matrix from a frame's edge list, mirroring where only one direction is present. */
export function frameToMatrix(frame: GraphFrame): number[][] {
  const idxMap = new Map(frame.nodes.map((n, i) => [n.id, i]));
  const matrix: number[][] = Array.from({ length: NUM_RSNS }, () =>
    Array(NUM_RSNS).fill(0),
  );
  for (const edge of frame.edges) {
    const i = idxMap.get(edge.source);
    const j = idxMap.get(edge.target);
    if (i === undefined || j === undefined) continue;
    matrix[i][j] = edge.weight;
    if (matrix[j][i] === 0) matrix[j][i] = edge.weight;
  }
  return matrix;
}

export function drawMatrixPanel(
  ctx: AnyCanvasContext,
  frame: GraphFrame,
  size: number,
  dataRange: DataRange,
  threshold: number,
  exponent: number = 1.5,
): void {
  const cellSize = size / NUM_RSNS;
  const colorScale = createColorScale("exponential", exponent);
  const absRange = getAbsoluteRange(dataRange);
  const matrix = frameToMatrix(frame);

  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < NUM_RSNS; i++) {
    for (let j = 0; j < NUM_RSNS; j++) {
      if (i === j) {
        ctx.fillStyle = MATRIX_DIAGONAL_COLOR;
      } else {
        const absVal = Math.abs(matrix[i][j]);
        const empty = absVal === 0 || absRange.max === 0 || absVal <= threshold;
        ctx.fillStyle = empty ? BG_COLOR : colorScale(matrix[i][j]);
      }
      ctx.fillRect(j * cellSize, i * cellSize, cellSize, cellSize);
    }
  }
}

export function drawMiniGraphPanel(
  ctx: AnyCanvasContext,
  frame: GraphFrame,
  size: number,
  edgeThreshold: number,
  symmetric: boolean,
  exponent: number = 1.5,
): void {
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, size, size);

  const positions = computeNodePositions(frame.nodes.length, size, size);
  const nodePositions = new Map<string, { x: number; y: number }>();
  frame.nodes.forEach((node, i) => nodePositions.set(node.id, positions[i]));

  const colorScale = createColorScale("exponential", exponent);
  const thicknessScale = createThicknessScale();
  const edges = filterEdgesForDisplay(frame.edges, edgeThreshold, symmetric);

  for (const edge of edges) {
    const source = nodePositions.get(edge.source);
    const target = nodePositions.get(edge.target);
    if (!source || !target) continue;

    ctx.beginPath();
    ctx.moveTo(source.x, source.y);
    ctx.lineTo(target.x, target.y);
    ctx.strokeStyle = colorScale(edge.weight);
    const rawThickness = thicknessScale(Math.abs(edge.weight));
    ctx.lineWidth = Math.max(HAIRLINE_RATIO * size, rawThickness * (size / BASE_WIDTH));
    ctx.stroke();
  }

  const nodeRadius = size / 60;
  frame.nodes.forEach((node, idx) => {
    const pos = nodePositions.get(node.id);
    if (!pos) return;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, nodeRadius, 0, Math.PI * 2);
    ctx.fillStyle = palette[idx % palette.length];
    ctx.fill();
    ctx.strokeStyle = "white";
    ctx.lineWidth = HAIRLINE_RATIO * size;
    ctx.stroke();
  });
}
