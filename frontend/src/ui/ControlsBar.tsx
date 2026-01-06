import { Play, Pause, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";

type Props = {
  isPlaying?: boolean;
  onPlay?: () => void;
  onRefresh?: () => void;
};

export function ControlsBar({ isPlaying, onPlay, onRefresh }: Props) {
  return (
    <div className="flex items-center gap-2">
      <Tooltip content={isPlaying ? "Pause" : "Play"}>
        <Button
          size="icon"
          variant="default"
          onClick={onPlay}
          aria-label={isPlaying ? "Pause" : "Play"}
          className="h-8 w-8"
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
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </Tooltip>
    </div>
  );
}
