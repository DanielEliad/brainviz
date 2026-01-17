import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import * as d3 from "d3";

type NodeDatum = {
  id: string;
  label?: string;
  group?: string | number | null;
  degree?: number | null;
};

type EdgeDatum = {
  source: string;
  target: string;
  weight: number;
  directed?: boolean;
};

type GraphFrame = {
  timestamp: number;
  nodes: NodeDatum[];
  edges: EdgeDatum[];
  metadata?: Record<string, string>;
};

type Point = { x: number; y: number };

type WorkerMessage = {
  type: "start";
  frames: GraphFrame[];
  playbackSpeed: number;
  nodeNames?: string[];
  edgeThreshold?: number;
  width: number;
  height: number;
};

const palette = d3.schemeTableau10;
const BASE_INTERVAL_MS = 500;

function computeNodePositions(
  nodesLength: number,
  width: number,
  height: number
): Point[] {
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

function drawFrame(
  ctx: OffscreenCanvasRenderingContext2D,
  frame: GraphFrame,
  width: number,
  height: number,
  nodeNames?: string[],
  edgeThreshold: number = 0
): void {
  const positions = computeNodePositions(frame.nodes.length, width, height);
  const nodePositions = new Map<string, Point>();
  frame.nodes.forEach((node, i) => {
    nodePositions.set(node.id, positions[i]);
  });

  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, width, height);

  const colorScale = d3
    .scaleLinear<string>()
    .domain([0, 255])
    .range(["rgb(220, 38, 38)", "rgb(59, 130, 246)"]);

  const thicknessScale = d3.scaleLinear().domain([0, 255]).range([0.5, 8]);

  frame.edges.forEach((edge) => {
    const source = nodePositions.get(edge.source);
    const target = nodePositions.get(edge.target);
    if (!source || !target || edge.weight <= 0 || edge.weight < edgeThreshold) return;

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

    const baseFill = palette[idx % palette.length];
    const radius = 8 + (node.degree ?? 0) * 0.5;

    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = baseFill;
    ctx.fill();

    ctx.strokeStyle = "white";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Draw node name label
    if (nodeNames) {
      const nameIndex = node.id.charCodeAt(0) - "A".charCodeAt(0);
      const name = nodeNames[nameIndex] ?? node.id;
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = "white";
      ctx.fillText(name, pos.x, pos.y - radius - 4);
    }
  });
}

async function encodeVideo(
  frames: GraphFrame[],
  playbackSpeed: number,
  width: number,
  height: number,
  nodeNames?: string[],
  edgeThreshold: number = 0
) {
  const frameDurationMs = BASE_INTERVAL_MS / playbackSpeed;
  const fps = 1000 / frameDurationMs;

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to create canvas context");
  }

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: {
      codec: "avc",
      width,
      height,
    },
    fastStart: "in-memory",
  });

  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      muxer.addVideoChunk(chunk, meta);
    },
    error: (e) => {
      throw e;
    },
  });

  encoder.configure({
    codec: "avc1.640028",
    width,
    height,
    bitrate: 5_000_000,
    framerate: fps,
  });

  const timestampIncrement = 1_000_000 / fps;

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    drawFrame(ctx, frame, width, height, nodeNames, edgeThreshold);

    const videoFrame = new VideoFrame(canvas, {
      timestamp: Math.round(i * timestampIncrement),
      duration: Math.round(timestampIncrement),
    });

    encoder.encode(videoFrame, { keyFrame: i % 30 === 0 });
    videoFrame.close();

    // Send progress update
    self.postMessage({
      type: "progress",
      progress: Math.round(((i + 1) / frames.length) * 100),
    });

    // Yield to allow message processing
    if (i % 10 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  await encoder.flush();
  encoder.close();
  muxer.finalize();

  return target.buffer;
}

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  if (e.data.type === "start") {
    try {
      const buffer = await encodeVideo(
        e.data.frames,
        e.data.playbackSpeed,
        e.data.width,
        e.data.height,
        e.data.nodeNames,
        e.data.edgeThreshold ?? 0
      );
      self.postMessage({ type: "done", buffer }, [buffer]);
    } catch (err) {
      self.postMessage({
        type: "error",
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }
};
