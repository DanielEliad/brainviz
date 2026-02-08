import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { InterpolationFunction, linear } from "./interpolation";

type Node = {
  id: string;
  label?: string;
  degree?: number;
};

type Edge = {
  source: string;
  target: string;
  weight: number;
};

type GraphFrame = {
  timestamp: number;
  nodes: Node[];
  edges: Edge[];
};

type GraphData = {
  frames: GraphFrame[];
  meta: {
    frame_count: number;
  };
};

type Props = {
  data: GraphData;
  width?: number;
  height?: number;
  autoPlay?: boolean;
  playSpeed?: number;
  interpolation?: InterpolationFunction;
  transitionDuration?: number;
  externalPlayState?: boolean;
  onPlayStateChange?: (playing: boolean) => void;
};

type Point = { x: number; y: number };

const palette = d3.schemeTableau10;

function computeNodePositions(nodesLength: number, width: number, height: number): Point[] {
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

export default function GraphVisualization({
  data,
  width = 800,
  height = 600,
  autoPlay = false,
  playSpeed = 500,
  interpolation = linear,
  transitionDuration = 300,
  externalPlayState,
  onPlayStateChange,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [internalPlaying, setInternalPlaying] = useState(autoPlay);
  const intervalRef = useRef<number | null>(null);
  const transitionRef = useRef<number | null>(null);
  const [transitionProgress, setTransitionProgress] = useState(0);
  const [targetFrame, setTargetFrame] = useState(0);
  const previousFrameRef = useRef<GraphFrame | null>(null);

  const isPlaying = externalPlayState !== undefined ? externalPlayState : internalPlaying;
  
  const handlePlayToggle = () => {
    const newState = !isPlaying;
    if (externalPlayState === undefined) {
      setInternalPlaying(newState);
    }
    onPlayStateChange?.(newState);
  };

  const currentFrameData = data.frames?.[currentFrame] || data.frames?.[0];
  const targetFrameData = data.frames?.[targetFrame] || data.frames?.[0];
  
  useEffect(() => {
    if (currentFrame === targetFrame && transitionProgress === 0) {
      setTransitionProgress(0);
    }
  }, [currentFrame, targetFrame, transitionProgress]);

  const interpolatedFrame = useMemo(() => {
    if (!currentFrameData || !targetFrameData) {
      return currentFrameData || targetFrameData;
    }
    
    if (transitionProgress === 0 || currentFrame === targetFrame) {
      return currentFrameData;
    }

    const t = interpolation(transitionProgress);
    
    const allNodeIds = new Set([
      ...currentFrameData.nodes.map((n) => n.id),
      ...targetFrameData.nodes.map((n) => n.id),
    ]);

    const nodeMap = new Map<string, Node>();
    currentFrameData.nodes.forEach((n) => nodeMap.set(n.id, n));
    targetFrameData.nodes.forEach((n) => nodeMap.set(n.id, n));

    const interpolatedNodes: Node[] = Array.from(allNodeIds).map((id) => {
      const prevNode = currentFrameData.nodes.find((n) => n.id === id);
      const nextNode = targetFrameData.nodes.find((n) => n.id === id);

      if (!prevNode && nextNode) {
        return { ...nextNode, degree: (nextNode.degree || 0) * t };
      }
      if (prevNode && !nextNode) {
        return { ...prevNode, degree: (prevNode.degree || 0) * (1 - t) };
      }
      if (prevNode && nextNode) {
        return {
          id: id,
          degree: (prevNode.degree || 0) * (1 - t) + (nextNode.degree || 0) * t,
        };
      }
      return { id };
    });

    const allEdges = new Map<string, Edge>();
    currentFrameData.edges.forEach((e) => {
      const key = `${e.source}-${e.target}`;
      allEdges.set(key, e);
    });
    targetFrameData.edges.forEach((e) => {
      const key = `${e.source}-${e.target}`;
      const existing = allEdges.get(key);
      if (existing) {
        allEdges.set(key, {
          ...e,
          weight: existing.weight * (1 - t) + e.weight * t,
        });
      } else {
        allEdges.set(key, { ...e, weight: e.weight * t });
      }
    });

    const interpolatedEdges = Array.from(allEdges.values());

    return {
      timestamp: Math.round(
        currentFrameData.timestamp * (1 - t) + targetFrameData.timestamp * t
      ),
      nodes: interpolatedNodes,
      edges: interpolatedEdges,
    };
  }, [currentFrameData, targetFrameData, transitionProgress, interpolation]);

  const nodePositions = useMemo(() => {
    const frame = interpolatedFrame;
    if (!frame || width === 0 || height === 0) return new Map<string, Point>();
    const positions = computeNodePositions(frame.nodes.length, width, height);
    const mapping = new Map<string, Point>();
    frame.nodes.forEach((node, i) => {
      mapping.set(node.id, positions[i]);
    });
    return mapping;
  }, [interpolatedFrame, width, height]);

  useEffect(() => {
    if (currentFrame !== targetFrame) {
      previousFrameRef.current = currentFrameData;
      setTransitionProgress(0);

      const startTime = performance.now();
      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / transitionDuration, 1);
        setTransitionProgress(progress);

        if (progress < 1) {
          transitionRef.current = requestAnimationFrame(animate);
        } else {
          setCurrentFrame(targetFrame);
          setTransitionProgress(0);
          previousFrameRef.current = null;
        }
      };

      transitionRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (transitionRef.current) {
        cancelAnimationFrame(transitionRef.current);
      }
    };
  }, [currentFrame, targetFrame, transitionDuration, currentFrameData]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !interpolatedFrame) return;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const needsResize = canvas.width !== width || canvas.height !== height;
    if (needsResize) {
      canvas.width = width;
      canvas.height = height;
    }

    const draw = () => {
      if (!canvas || !interpolatedFrame || !ctx) return;

      ctx.clearRect(0, 0, width, height);

      const weights = interpolatedFrame.edges.map((e) => e.weight);
      const weightScale =
        weights.length > 0
          ? d3.scaleLinear().domain(d3.extent(weights) as [number, number]).range([1, 6])
          : () => 1;

      ctx.strokeStyle = "rgba(52, 73, 94, 0.6)";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      
      interpolatedFrame.edges.forEach((edge) => {
        const source = nodePositions.get(edge.source);
        const target = nodePositions.get(edge.target);
        if (!source || !target) return;
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.lineWidth = weightScale(edge.weight);
        ctx.stroke();
      });

      interpolatedFrame.nodes.forEach((node, idx) => {
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
    };

    const animationFrameId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [interpolatedFrame, nodePositions, width, height]);

  useEffect(() => {
    if (isPlaying && data.frames.length > 0) {
      intervalRef.current = window.setInterval(() => {
        setTargetFrame((prev) => (prev + 1) % data.frames.length);
      }, playSpeed + transitionDuration);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, data.frames.length, playSpeed, transitionDuration]);

  return (
    <div style={{ width, height, position: "relative", border: "1px solid #e5e7eb", borderRadius: "8px", overflow: "hidden" }}>
      <canvas 
        ref={canvasRef} 
        style={{ 
          width: "100%", 
          height: "100%", 
          display: "block",
          imageRendering: "crisp-edges",
        }} 
      />
      <div
        style={{
          position: "absolute",
          bottom: 8,
          right: 12,
          fontSize: "12px",
          color: "#6b7280",
          fontFamily: "monospace",
        }}
      >
        t={interpolatedFrame?.timestamp || 0}
      </div>
      <div
        style={{
          position: "absolute",
          top: 8,
          left: 8,
          display: "flex",
          gap: "8px",
        }}
      >
        <button
          onClick={handlePlayToggle}
          style={{
            padding: "4px 12px",
            fontSize: "12px",
            border: "1px solid #d1d5db",
            borderRadius: "4px",
            background: isPlaying ? "#3b82f6" : "#fff",
            color: isPlaying ? "#fff" : "#000",
            cursor: "pointer",
          }}
        >
          {isPlaying ? "Pause" : "Play"}
        </button>
        <input
          type="range"
          min={0}
          max={Math.max(0, (data.frames?.length || 1) - 1)}
          value={targetFrame}
          onChange={(e) => {
            const newFrame = Number(e.target.value);
            setTargetFrame(newFrame);
            handlePlayToggle();
            if (isPlaying) {
              onPlayStateChange?.(false);
              if (externalPlayState === undefined) {
                setInternalPlaying(false);
              }
            }
          }}
          style={{ width: "200px" }}
        />
        <span style={{ fontSize: "12px", lineHeight: "24px", color: "#6b7280" }}>
          {targetFrame + 1} / {data.frames?.length || 0}
        </span>
      </div>
    </div>
  );
}

