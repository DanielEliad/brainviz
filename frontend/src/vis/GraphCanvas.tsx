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
  edgeThreshold?: number;
};

type Point = { x: number; y: number };

const palette = d3.schemeTableau10;

function computeNodePositions(nodesLength: number, width: number, height: number) {
  const cx = width / 2;
  const cy = height / 2;
  const rx = width / 2 - 20;
  const ry = height / 2 - 20;
  const positions: Point[] = [];
  
  for (let i = 0; i < nodesLength; i += 1) {
    const angle = (i / Math.max(nodesLength, 1)) * Math.PI * 2;
    positions.push({
      x: cx + rx * Math.cos(angle),
      y: cy + ry * Math.sin(angle),
    });
  }
  return positions;
}

export default function GraphCanvas({ frame, isLoading, edgeThreshold = 0 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
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

  const connectedNodes = useMemo(() => {
    const activeNode = selectedNode || hoveredNode;
    console.log("[GraphCanvas] connectedNodes calc:", { selectedNode, hoveredNode, activeNode });
    if (!activeNode || !frame) return new Set<string>();
    
    const connected = new Set<string>([activeNode]);
    frame.edges.forEach((edge) => {
      if (edge.source === activeNode) connected.add(edge.target);
      if (edge.target === activeNode) connected.add(edge.source);
    });
    console.log("[GraphCanvas] connected nodes:", Array.from(connected));
    return connected;
  }, [selectedNode, hoveredNode, frame]);

  const activeNodeId = selectedNode || hoveredNode;
  console.log("[GraphCanvas] render:", { selectedNode, hoveredNode, activeNodeId });

  useEffect(() => {
    console.log("[GraphCanvas] draw effect triggered:", { selectedNode, hoveredNode, activeNodeId, connectedNodesSize: connectedNodes.size });
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
      const isNodeConnected = !activeNodeId || connectedNodes.has(node.id);
      const opacity = isNodeConnected ? 1 : 0.2;
      const isSelected = node.id === selectedNode;

      const baseFill = palette[idx % palette.length];
      let fill = baseFill;

      if (opacity < 1) {
        if (baseFill.startsWith("rgb")) {
          const rgbMatch = baseFill.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
          if (rgbMatch) {
            fill = `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${opacity})`;
          }
        } else if (baseFill.startsWith("#")) {
          const hex = baseFill.slice(1);
          const r = parseInt(hex.slice(0, 2), 16);
          const g = parseInt(hex.slice(2, 4), 16);
          const b = parseInt(hex.slice(4, 6), 16);
          fill = `rgba(${r}, ${g}, ${b}, ${opacity})`;
        } else {
          ctx.globalAlpha = opacity;
          fill = baseFill;
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

      // Draw node name label
      const nodeNames = metadataQuery.data?.node_names;
      if (nodeNames) {
        const nameIndex = node.id.charCodeAt(0) - "A".charCodeAt(0);
        const name = nodeNames[nameIndex] ?? node.id;
        ctx.font = "11px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillStyle = isNodeConnected ? "white" : `rgba(255, 255, 255, ${opacity})`;
        ctx.fillText(name, pos.x, pos.y - radius - 4);
      }

      ctx.globalAlpha = 1;
    });
  }, [frame, nodePositions, size.height, size.width, selectedNode, hoveredNode, connectedNodes, metadataQuery.data, edgeThreshold]);

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

      if (foundNode !== hoveredNode) {
        console.log("[GraphCanvas] hover node changed:", { from: hoveredNode, to: foundNode });
      }
      setHoveredNode(foundNode);
      setHoveredEdge(foundEdge);
    };

    const handleClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      console.log("[GraphCanvas] click at:", { x, y });

      for (const [nodeId, pos] of nodePositions.entries()) {
        const node = frame.nodes.find((n) => n.id === nodeId);
        if (!node) continue;
        const radius = 8 + (node.degree ?? 0) * 0.5;
        const dx = x - pos.x;
        const dy = y - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= radius) {
          const newSelected = nodeId === selectedNode ? null : nodeId;
          console.log("[GraphCanvas] clicked node:", nodeId, "setting selectedNode to:", newSelected);
          setSelectedNode(newSelected);
          return;
        }
      }
      console.log("[GraphCanvas] click missed all nodes, clearing selection");
      setSelectedNode(null);
    };

    const handleMouseLeave = () => {
      setHoveredNode(null);
      setHoveredEdge(null);
    };

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("click", handleClick);
    canvas.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("click", handleClick);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [frame, nodePositions, selectedNode]);

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
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", cursor: "pointer" }} />
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
