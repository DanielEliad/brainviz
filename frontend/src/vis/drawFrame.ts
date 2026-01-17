import * as d3 from "d3";
import { GraphFrame } from "./types";

export type Point = { x: number; y: number };

export const palette = d3.schemeTableau10;
export const PADDING = 60;

export const colorScale = d3
  .scaleLinear<string>()
  .domain([0, 255])
  .range(["rgb(220, 38, 38)", "rgb(59, 130, 246)"]);

export const thicknessScale = d3.scaleLinear().domain([0, 255]).range([0.5, 8]);

export function computeNodePositions(
  nodesLength: number,
  width: number,
  height: number
): Point[] {
  const cx = width / 2;
  const cy = height / 2;
  const rx = width / 2 - PADDING;
  const ry = height / 2 - PADDING;
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
  nodeNames?: string[];
  edgeThreshold?: number;
  activeNodeId?: string | null;
  connectedNodes?: Set<string>;
  selectedNode?: string | null;
};

type AnyCanvasContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function drawFrame(
  ctx: AnyCanvasContext,
  frame: GraphFrame,
  width: number,
  height: number,
  options: DrawOptions = {}
): void {
  const { nodeNames, edgeThreshold = 0, activeNodeId, connectedNodes, selectedNode } = options;

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

  frame.edges.forEach((edge) => {
    const source = nodePositions.get(edge.source);
    const target = nodePositions.get(edge.target);
    if (!source || !target || edge.weight <= 0 || edge.weight < edgeThreshold) return;

    const weight = Math.max(0, Math.min(255, edge.weight));
    const baseColor = colorScale(weight);
    const edgeIsConnected = isEdgeConnected(edge);
    const opacity = edgeIsConnected ? 1 : 0.15;

    const rgbMatch = baseColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    const color = rgbMatch
      ? `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${opacity})`
      : baseColor;
    const thickness = thicknessScale(weight);
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
        (1 - t) * (1 - t) * source.x + 2 * (1 - t) * t * midX + t * t * target.x;
      const curveY =
        (1 - t) * (1 - t) * source.y + 2 * (1 - t) * t * midY + t * t * target.y;

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
        curveY - arrowSize * Math.sin(arrowAngle - Math.PI / 6)
      );
      ctx.lineTo(
        curveX - arrowSize * Math.cos(arrowAngle + Math.PI / 6),
        curveY - arrowSize * Math.sin(arrowAngle + Math.PI / 6)
      );
      ctx.closePath();
      ctx.fill();
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

    if (nodeNames) {
      const nameIndex = node.id.charCodeAt(0) - "A".charCodeAt(0);
      const name = nodeNames[nameIndex] ?? node.id;
      ctx.font = "500 12px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = isNodeConnected ? "white" : `rgba(255, 255, 255, ${opacity})`;
      ctx.fillText(name, pos.x, pos.y - radius - 6);
    }

    ctx.globalAlpha = 1;
  });
}
