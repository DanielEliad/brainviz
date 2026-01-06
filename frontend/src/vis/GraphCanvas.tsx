import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { GraphFrame } from "./types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

type GraphMetadata = {
  num_nodes: number;
  node_names: string[];
  description: string;
};

type Props = {
  frame?: GraphFrame;
  isLoading?: boolean;
};

type Point = { x: number; y: number };

const palette = d3.schemeTableau10;

function computeNodePositions(nodesLength: number, width: number, height: number) {
  const radius = Math.max(Math.min(width, height) / 2 - 60, 60);
  const cx = width / 2;
  const cy = height / 2;
  const positions: Point[] = [];
  for (let i = 0; i < nodesLength; i += 1) {
    const angle = (i / Math.max(nodesLength, 1)) * Math.PI * 2;
    positions.push({
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    });
  }
  return positions;
}

export default function GraphCanvas({ frame, isLoading }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<{ source: string; target: string; weight: number } | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const metadataQuery = useQuery<GraphMetadata>({
    queryKey: ["graphMetadata"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/graph/metadata`);
      if (!res.ok) {
        throw new Error(`Metadata fetch failed (${res.status})`);
      }
      return res.json();
    },
  });

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ width, height });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const nodePositions = useMemo(() => {
    if (!frame || size.width === 0 || size.height === 0) return new Map<string, Point>();
    const positions = computeNodePositions(frame.nodes.length, size.width, size.height);
    const mapping = new Map<string, Point>();
    frame.nodes.forEach((node, i) => {
      mapping.set(node.id, positions[i]);
    });
    return mapping;
  }, [frame, size.width, size.height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frame || size.width === 0 || size.height === 0) {
      if (canvas && size.width > 0 && size.height > 0) {
        canvas.width = size.width;
        canvas.height = size.height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#0f172a";
          ctx.fillRect(0, 0, size.width, size.height);
        }
      }
      return;
    }

    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, size.width, size.height);

    const colorScale = d3.scaleLinear<string>()
      .domain([0, 255])
      .range(["rgb(220, 38, 38)", "rgb(59, 130, 246)"]);
    
    const thicknessScale = d3.scaleLinear()
      .domain([0, 255])
      .range([0.5, 8]);
    
    frame.edges.forEach((edge) => {
      const source = nodePositions.get(edge.source);
      const target = nodePositions.get(edge.target);
      if (!source || !target || edge.weight <= 0) return;
      
      const weight = Math.max(0, Math.min(255, edge.weight));
      const color = colorScale(weight);
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
        const curveX = (1 - t) * (1 - t) * source.x + 2 * (1 - t) * t * midX + t * t * target.x;
        const curveY = (1 - t) * (1 - t) * source.y + 2 * (1 - t) * t * midY + t * t * target.y;
        
        const tNext = (i + 0.1) / (numArrows + 1);
        const nextX = (1 - tNext) * (1 - tNext) * source.x + 2 * (1 - tNext) * tNext * midX + tNext * tNext * target.x;
        const nextY = (1 - tNext) * (1 - tNext) * source.y + 2 * (1 - tNext) * tNext * midY + tNext * tNext * target.y;
        
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
      const fill = palette[idx % palette.length];
      const radius = 8 + (node.degree ?? 0) * 0.5;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = "white";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  }, [frame, nodePositions, size.height, size.width]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frame) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setMousePos({ x: e.clientX, y: e.clientY });

      let foundNode: string | null = null;
      let foundEdge: { source: string; target: string; weight: number } | null = null;

      for (const [nodeId, pos] of nodePositions.entries()) {
        const node = frame.nodes.find((n) => n.id === nodeId);
        if (!node) continue;
        const radius = 8 + (node.degree ?? 0) * 0.5;
        const dx = x - pos.x;
        const dy = y - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= radius) {
          foundNode = nodeId;
          break;
        }
      }

      if (!foundNode) {
        for (const edge of frame.edges) {
          const source = nodePositions.get(edge.source);
          const target = nodePositions.get(edge.target);
          if (!source || !target || edge.weight <= 0) continue;

          const pair = [edge.source, edge.target].sort();
          const [sourceId, targetId] = pair;
          const sourcePos = nodePositions.get(sourceId)!;
          const targetPos = nodePositions.get(targetId)!;
          const dx = targetPos.x - sourcePos.x;
          const dy = targetPos.y - sourcePos.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const perpX = -dy / dist;
          const perpY = dx / dist;
          const curveDirection = edge.source === sourceId ? 1 : -1;
          const curveOffset = curveDirection * 30;
          const midX = (source.x + target.x) / 2 + perpX * curveOffset;
          const midY = (source.y + target.y) / 2 + perpY * curveOffset;

          const weight = Math.max(0, Math.min(255, edge.weight));
          const thickness = d3.scaleLinear().domain([0, 255]).range([0.5, 8])(weight);
          const hitRadius = Math.max(8, thickness + 5);

          const curveBounds = {
            minX: Math.min(source.x, target.x, midX) - hitRadius,
            maxX: Math.max(source.x, target.x, midX) + hitRadius,
            minY: Math.min(source.y, target.y, midY) - hitRadius,
            maxY: Math.max(source.y, target.y, midY) + hitRadius,
          };

          if (x < curveBounds.minX || x > curveBounds.maxX || y < curveBounds.minY || y > curveBounds.maxY) continue;

          const numSteps = Math.max(50, Math.floor(dist / 2));
          for (let i = 0; i <= numSteps; i++) {
            const t = i / numSteps;
            const curveX = (1 - t) * (1 - t) * source.x + 2 * (1 - t) * t * midX + t * t * target.x;
            const curveY = (1 - t) * (1 - t) * source.y + 2 * (1 - t) * t * midY + t * t * target.y;
            const dx = x - curveX;
            const dy = y - curveY;
            const distToPoint = Math.sqrt(dx * dx + dy * dy);
            if (distToPoint <= hitRadius) {
              foundEdge = { source: edge.source, target: edge.target, weight: edge.weight };
              break;
            }
          }
          if (foundEdge) break;
        }
      }

      setHoveredNode(foundNode);
      setHoveredEdge(foundEdge);
    };

    const handleMouseLeave = () => {
      setHoveredNode(null);
      setHoveredEdge(null);
    };

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [frame, nodePositions]);

  const getNodeName = (nodeId: string): string => {
    if (!metadataQuery.data?.node_names) return nodeId;
    const index = nodeId.charCodeAt(0) - "A".charCodeAt(0);
    return metadataQuery.data.node_names[index] ?? nodeId;
  };

  const nodeName = hoveredNode ? getNodeName(hoveredNode) : null;

  const edgeLabel = hoveredEdge
    ? `${getNodeName(hoveredEdge.source)} → ${getNodeName(hoveredEdge.target)} (${hoveredEdge.weight.toFixed(1)})`
    : null;

  return (
    <div ref={containerRef} style={{ height: "100%", width: "100%", position: "relative" }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%" }} />
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}
      {frame && (
        <div className="absolute bottom-2 right-3 text-xs text-muted-foreground font-mono">
          t={frame.timestamp}
        </div>
      )}
      {(hoveredNode || hoveredEdge) && (
        <div
          className="fixed pointer-events-none z-50 bg-popover text-popover-foreground px-2 py-1 rounded-md text-sm shadow-lg border border-border whitespace-nowrap"
          style={{
            left: `${mousePos.x}px`,
            top: `${mousePos.y - 30}px`,
            transform: "translateX(-50%)",
          }}
        >
          {hoveredNode ? nodeName : edgeLabel}
        </div>
      )}
    </div>
  );
}
