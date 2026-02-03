import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import { drawFrame, DataRange, SubjectInfo } from "./drawFrame";
import { GraphFrame } from "./types";

type WorkerMessage = {
  type: "start";
  frames: GraphFrame[];
  playbackSpeed: number;
  symmetric: boolean;
  width: number;
  height: number;
  dataRange: DataRange; // Required - from meta.edge_weight_min/max
  nodeNames?: string[];
  edgeThreshold?: number;
  hiddenNodes?: string[];
  smoothing?: string;
  interpolation?: string;
  subjectInfo?: SubjectInfo;
};

const BASE_INTERVAL_MS = 500;

function filterFrame(frame: GraphFrame, hiddenNodes: Set<string>): GraphFrame {
  if (hiddenNodes.size === 0) return frame;
  const visibleNodes = frame.nodes.filter((n) => !hiddenNodes.has(n.id));
  const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));
  const visibleEdges = frame.edges.filter(
    (e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target),
  );
  return { ...frame, nodes: visibleNodes, edges: visibleEdges };
}

async function encodeVideo(
  frames: GraphFrame[],
  playbackSpeed: number,
  symmetric: boolean,
  width: number,
  height: number,
  dataRange: DataRange,
  edgeThreshold: number = 0,
  hiddenNodes: string[] = [],
  smoothing: string = "none",
  interpolation: string = "none",
  subjectInfo?: SubjectInfo,
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
    bitrate: 50_000_000,
    framerate: fps,
    latencyMode: "quality",
  });

  const timestampIncrement = 1_000_000 / fps;
  const MAX_QUEUE_SIZE = 5;

  let totalDrawTime = 0;
  let totalEncodeTime = 0;
  let totalWaitTime = 0;
  let totalPostTime = 0;
  let backpressureHits = 0;
  const overallStart = performance.now();

  for (let i = 0; i < frames.length; i++) {
    const waitStart = performance.now();
    // Only wait if queue is full (not on every frame)
    if (encoder.encodeQueueSize >= MAX_QUEUE_SIZE) {
      backpressureHits++;
      while (encoder.encodeQueueSize >= MAX_QUEUE_SIZE) {
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
    }
    totalWaitTime += performance.now() - waitStart;

    const drawStart = performance.now();
    const frame = filterFrame(frames[i], hiddenSet);
    drawFrame(ctx, frame, width, height, {
      edgeThreshold,
      symmetric,
      dataRange,
      infoBox: {
        smoothing,
        interpolation,
        speed: playbackSpeed,
        edgeThreshold,
        subjectInfo,
      },
    });
    totalDrawTime += performance.now() - drawStart;

    const encodeStart = performance.now();
    const videoFrame = new VideoFrame(canvas, {
      timestamp: Math.round(i * timestampIncrement),
      duration: Math.round(timestampIncrement),
    });

    encoder.encode(videoFrame, { keyFrame: i % 2 === 0 });
    videoFrame.close();
    totalEncodeTime += performance.now() - encodeStart;

    const postStart = performance.now();
    self.postMessage({
      type: "progress",
      progress: Math.round(((i + 1) / frames.length) * 100),
    });
    totalPostTime += performance.now() - postStart;
  }

  await encoder.flush();
  encoder.close();
  muxer.finalize();

  const overallTime = performance.now() - overallStart;
  const accountedTime =
    totalDrawTime + totalEncodeTime + totalWaitTime + totalPostTime;
  console.log(`=== Video Export Timing (${frames.length} frames) ===`);
  console.log(
    `Draw:     ${totalDrawTime.toFixed(0)}ms (${(totalDrawTime / frames.length).toFixed(1)}ms/frame)`,
  );
  console.log(
    `Encode:   ${totalEncodeTime.toFixed(0)}ms (${(totalEncodeTime / frames.length).toFixed(1)}ms/frame)`,
  );
  console.log(
    `Wait:     ${totalWaitTime.toFixed(0)}ms (backpressure hits: ${backpressureHits})`,
  );
  console.log(`PostMsg:  ${totalPostTime.toFixed(0)}ms`);
  console.log(
    `Other:    ${(overallTime - accountedTime).toFixed(0)}ms (unaccounted)`,
  );
  console.log(`Total:    ${overallTime.toFixed(0)}ms`);

  return target.buffer;
}

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  if (e.data.type === "start") {
    try {
      const buffer = await encodeVideo(
        e.data.frames,
        e.data.playbackSpeed,
        e.data.symmetric,
        e.data.width,
        e.data.height,
        e.data.dataRange,
        e.data.edgeThreshold ?? 0,
        e.data.hiddenNodes ?? [],
        e.data.smoothing ?? "none",
        e.data.interpolation ?? "none",
        e.data.subjectInfo,
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
