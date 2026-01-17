// WebCodecs API type declarations
interface VideoEncoderConfig {
  codec: string;
  width: number;
  height: number;
  bitrate?: number;
  framerate?: number;
  hardwareAcceleration?: "no-preference" | "prefer-hardware" | "prefer-software";
}

interface VideoEncoderInit {
  output: (chunk: EncodedVideoChunk, metadata?: EncodedVideoChunkMetadata) => void;
  error: (error: DOMException) => void;
}

interface EncodedVideoChunkMetadata {
  decoderConfig?: VideoDecoderConfig;
}

interface VideoDecoderConfig {
  codec: string;
  codedWidth?: number;
  codedHeight?: number;
  description?: BufferSource;
}

interface EncodedVideoChunk {
  readonly type: "key" | "delta";
  readonly timestamp: number;
  readonly duration: number | null;
  readonly byteLength: number;
  copyTo(destination: BufferSource): void;
}

interface VideoFrameInit {
  timestamp: number;
  duration?: number;
  alpha?: "keep" | "discard";
}

declare class VideoEncoder {
  constructor(init: VideoEncoderInit);
  configure(config: VideoEncoderConfig): void;
  encode(frame: VideoFrame, options?: { keyFrame?: boolean }): void;
  flush(): Promise<void>;
  close(): void;
  reset(): void;
  readonly state: "unconfigured" | "configured" | "closed";
  readonly encodeQueueSize: number;
}

declare class VideoFrame {
  constructor(source: CanvasImageSource | OffscreenCanvas, init?: VideoFrameInit);
  readonly timestamp: number;
  readonly duration: number | null;
  readonly codedWidth: number;
  readonly codedHeight: number;
  close(): void;
}
