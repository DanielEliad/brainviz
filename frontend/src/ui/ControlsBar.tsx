import { Play, Pause, RefreshCw, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";

type ExportState = "idle" | "exporting" | "done" | "error";

type Props = {
  isPlaying?: boolean;
  onPlay?: () => void;
  onRefresh?: () => void;
  onExportVideo?: () => void;
  exportState?: ExportState;
  exportProgress?: number;
};

export function ControlsBar({
  isPlaying,
  onPlay,
  onRefresh,
  onExportVideo,
  exportState = "idle",
  exportProgress = 0,
}: Props) {
  const isExporting = exportState === "exporting";

  return (
    <div className="flex items-center gap-2">
      <Tooltip content={isPlaying ? "Pause" : "Play"}>
        <Button
          size="icon"
          variant="default"
          onClick={onPlay}
          aria-label={isPlaying ? "Pause" : "Play"}
          className="h-8 w-8"
          disabled={isExporting}
        >
          {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </Button>
      </Tooltip>
      <Tooltip content="Reload data">
        <Button
          size="icon"
          variant="outline"
          onClick={onRefresh}
          aria-label="Refresh"
          className="h-8 w-8"
          disabled={isExporting}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </Tooltip>
      <Tooltip content="Download Video">
        <Button
          size="icon"
          variant="outline"
          onClick={onExportVideo}
          aria-label="Download Video"
          className="h-8 w-8"
          disabled={isExporting}
        >
          {isExporting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
        </Button>
      </Tooltip>
      {isExporting && (
        <div className="flex items-center gap-2 ml-1 flex-1 min-w-0">
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden min-w-12 max-w-32">
            <div
              className="h-full bg-primary transition-all duration-150"
              style={{ width: `${exportProgress}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground tabular-nums shrink-0">
            {exportProgress}%
          </span>
        </div>
      )}
    </div>
  );
}
