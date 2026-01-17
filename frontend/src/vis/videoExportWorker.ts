import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import { drawFrame } from "./drawFrame";
import { GraphFrame } from "./types";

type WorkerMessage = {
  type: "start";
  frames: GraphFrame[];
  playbackSpeed: number;
  nodeNames?: string[];
  edgeThreshold?: number;
  hiddenNodes?: string[];
  width: number;
  height: number;
};

const BASE_INTERVAL_MS = 500;

function filterFrame(frame: GraphFrame, hiddenNodes: Set<string>): GraphFrame {
  if (hiddenNodes.size === 0) return frame;
  const visibleNodes = frame.nodes.filter((n) => !hiddenNodes.has(n.id));
  const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));
  const visibleEdges = frame.edges.filter(
    (e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)
  );
  return { ...frame, nodes: visibleNodes, edges: visibleEdges };
}

async function encodeVideo(
  frames: GraphFrame[],
  playbackSpeed: number,
  width: number,
  height: number,
  nodeNames?: string[],
  edgeThreshold: number = 0,
  hiddenNodes: string[] = []
) {
  const hiddenSet = new Set(hiddenNodes);
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
    codec: "avc1.640032",
    width,
    height,
    bitrate: 15_000_000,
    framerate: fps,
  });

  const timestampIncrement = 1_000_000 / fps;
  const MAX_QUEUE_SIZE = 5;

  for (let i = 0; i < frames.length; i++) {
    // Wait for encoder queue to drain before adding more frames
    while (encoder.encodeQueueSize > MAX_QUEUE_SIZE) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    await new Promise((resolve) => setTimeout(resolve, 0));

    const frame = filterFrame(frames[i], hiddenSet);
    drawFrame(ctx, frame, width, height, { nodeNames, edgeThreshold });

    const videoFrame = new VideoFrame(canvas, {
      timestamp: Math.round(i * timestampIncrement),
      duration: Math.round(timestampIncrement),
    });

    encoder.encode(videoFrame, { keyFrame: i % 30 === 0 });
    videoFrame.close();

    self.postMessage({
      type: "progress",
      progress: Math.round(((i + 1) / frames.length) * 100),
    });
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
        e.data.edgeThreshold ?? 0,
        e.data.hiddenNodes ?? []
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
