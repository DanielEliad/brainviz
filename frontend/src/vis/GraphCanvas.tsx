import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { GraphFrame } from "./types";
import { drawFrame, computeNodePositions, createThicknessScale, filterEdgesForDisplay, Point, DataRange } from "./drawFrame";

type Props = {
  frame?: GraphFrame;
  symmetric: boolean;
  isLoading?: boolean;
  edgeThreshold?: number;
  hiddenNodes?: Set<string>;
  dataRange: DataRange;  // Required - from meta.edge_weight_min/max
  diagnosis?: string | null;
};

export default function GraphCanvas({ frame, symmetric, isLoading, edgeThreshold = 0, hiddenNodes = new Set(), dataRange, diagnosis }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<{ source: string; target: string } | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<{ source: string; target: string } | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const filteredFrame = useMemo(() => {
    if (!frame) return undefined;
    if (hiddenNodes.size === 0) return frame;
    const visibleNodes = frame.nodes.filter((n) => !hiddenNodes.has(n.id));
    const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));
    const visibleEdges = frame.edges.filter(
      (e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)
    );
    return { ...frame, nodes: visibleNodes, edges: visibleEdges };
  }, [frame, hiddenNodes]);

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
    if (!filteredFrame || size.width === 0 || size.height === 0) return new Map<string, Point>();
    const positions = computeNodePositions(filteredFrame.nodes.length, size.width, size.height);
    const mapping = new Map<string, Point>();
    filteredFrame.nodes.forEach((node, i) => {
      mapping.set(node.id, positions[i]);
    });
    return mapping;
  }, [filteredFrame, size.width, size.height]);

  const connectedNodes = useMemo(() => {
    const activeNode = selectedNode || hoveredNode;
    if (!activeNode || !filteredFrame) return new Set<string>();

    const connected = new Set<string>([activeNode]);
    filteredFrame.edges.forEach((edge) => {
      if (edge.source === activeNode) connected.add(edge.target);
      if (edge.target === activeNode) connected.add(edge.source);
    });
    return connected;
  }, [selectedNode, hoveredNode, filteredFrame]);

  const activeNodeId = selectedNode || hoveredNode;

  useEffect(() => {
    const canvas = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;

    if (!canvas || !filteredFrame || size.width === 0 || size.height === 0) {
      if (canvas && size.width > 0 && size.height > 0) {
        canvas.width = size.width * dpr;
        canvas.height = size.height * dpr;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.scale(dpr, dpr);
          ctx.fillStyle = "#0f172a";
          ctx.fillRect(0, 0, size.width, size.height);
        }
      }
      return;
    }

    canvas.width = size.width * dpr;
    canvas.height = size.height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    drawFrame(ctx, filteredFrame, size.width, size.height, {
      edgeThreshold,
      activeNodeId,
      connectedNodes,
      selectedNode,
      selectedEdge,
      symmetric,
      dataRange,
    });
  }, [filteredFrame, nodePositions, size.height, size.width, selectedNode, selectedEdge, hoveredNode, connectedNodes, edgeThreshold, activeNodeId, symmetric, dataRange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !filteredFrame) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setMousePos({ x: e.clientX, y: e.clientY });

      let foundNode: string | null = null;
      let foundEdge: { source: string; target: string } | null = null;

      for (const [nodeId, pos] of nodePositions.entries()) {
        const node = filteredFrame.nodes.find((n) => n.id === nodeId);
        if (!node) continue;
        const radius = 10;
        const dx = x - pos.x;
        const dy = y - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= radius) {
          foundNode = nodeId;
          break;
        }
      }

      if (!foundNode) {
        let closestDist = Infinity;
        const visibleEdges = filterEdgesForDisplay(filteredFrame.edges, edgeThreshold, symmetric);

        for (const edge of visibleEdges) {
          const source = nodePositions.get(edge.source);
          const target = nodePositions.get(edge.target);
          if (!source || !target) continue;

          const absWeight = Math.abs(edge.weight);
          const thicknessScale = createThicknessScale(dataRange);
          const thickness = thicknessScale(absWeight);
          const hitRadius = Math.max(5, thickness + 3);

          if (symmetric) {
            // Symmetric mode: straight line hit detection
            const edgeDx = target.x - source.x;
            const edgeDy = target.y - source.y;
            const edgeLen = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy);

            // Quick bounding box check
            const minX = Math.min(source.x, target.x) - hitRadius;
            const maxX = Math.max(source.x, target.x) + hitRadius;
            const minY = Math.min(source.y, target.y) - hitRadius;
            const maxY = Math.max(source.y, target.y) + hitRadius;
            if (x < minX || x > maxX || y < minY || y > maxY) continue;

            // Distance from point to line segment
            const t = Math.max(0, Math.min(1, ((x - source.x) * edgeDx + (y - source.y) * edgeDy) / (edgeLen * edgeLen)));
            const projX = source.x + t * edgeDx;
            const projY = source.y + t * edgeDy;
            const distToLine = Math.sqrt((x - projX) * (x - projX) + (y - projY) * (y - projY));

            if (distToLine <= hitRadius && distToLine < closestDist) {
              closestDist = distToLine;
              foundEdge = { source: edge.source, target: edge.target };
            }
          } else {
            // Asymmetric mode: curved line hit detection
            const pair = [edge.source, edge.target].sort();
            const [sourceId, targetId] = pair;
            const sourcePos = nodePositions.get(sourceId)!;
            const targetPos = nodePositions.get(targetId)!;
            const edgeDx = targetPos.x - sourcePos.x;
            const edgeDy = targetPos.y - sourcePos.y;
            const dist = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy);
            const perpX = -edgeDy / dist;
            const perpY = edgeDx / dist;
            const curveDirection = edge.source === sourceId ? 1 : -1;
            const curveOffset = curveDirection * 30;
            const midX = (source.x + target.x) / 2 + perpX * curveOffset;
            const midY = (source.y + target.y) / 2 + perpY * curveOffset;

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
              const ptDx = x - curveX;
              const ptDy = y - curveY;
              const distToPoint = Math.sqrt(ptDx * ptDx + ptDy * ptDy);
              if (distToPoint <= hitRadius && distToPoint < closestDist) {
                closestDist = distToPoint;
                foundEdge = { source: edge.source, target: edge.target };
              }
            }
          }
        }
      }

      setHoveredNode(foundNode);
      setHoveredEdge(foundEdge);
    };

    const handleClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Check for node click first
      for (const [nodeId, pos] of nodePositions.entries()) {
        const node = filteredFrame.nodes.find((n) => n.id === nodeId);
        if (!node) continue;
        const radius = 10;
        const dx = x - pos.x;
        const dy = y - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= radius) {
          const newSelected = nodeId === selectedNode ? null : nodeId;
          setSelectedNode(newSelected);
          setSelectedEdge(null);
          return;
        }
      }

      // Check for edge click (use hoveredEdge since it's already computed)
      if (hoveredEdge) {
        const isSameEdge = selectedEdge &&
          selectedEdge.source === hoveredEdge.source &&
          selectedEdge.target === hoveredEdge.target;
        setSelectedEdge(isSameEdge ? null : { source: hoveredEdge.source, target: hoveredEdge.target });
        setSelectedNode(null);
        return;
      }

      setSelectedNode(null);
      setSelectedEdge(null);
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
  }, [filteredFrame, nodePositions, selectedNode, selectedEdge, hoveredEdge, edgeThreshold, dataRange, symmetric]);

  const nodeFullName = hoveredNode && filteredFrame
    ? filteredFrame.nodes.find(n => n.id === hoveredNode)?.full_name ?? hoveredNode
    : null;

  // Look up weight from current frame so tooltip updates when frame changes
  const hoveredEdgeWeight = hoveredEdge && filteredFrame
    ? filteredFrame.edges.find(
        e => e.source === hoveredEdge.source && e.target === hoveredEdge.target
      )?.weight
    : undefined;

  const edgeLabel = hoveredEdge && hoveredEdgeWeight !== undefined
    ? `${hoveredEdge.source} → ${hoveredEdge.target} (${hoveredEdgeWeight.toFixed(2)})`
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
        <div className="absolute bottom-2 right-3 flex items-center gap-2 text-xs font-mono">
          {diagnosis && (
            <span
              className={`px-2 py-0.5 rounded ${
                diagnosis === "ASD"
                  ? "bg-amber-500/20 text-amber-400"
                  : "bg-emerald-500/20 text-emerald-400"
              }`}
            >
              {diagnosis}
            </span>
          )}
          <span className="text-muted-foreground">t={frame.timestamp}</span>
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
          {hoveredNode ? nodeFullName : edgeLabel}
        </div>
      )}
    </div>
  );
}
