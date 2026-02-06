import { Slider } from "@/components/ui/slider";
import { GraphMeta } from "../vis/types";

type Props = {
  meta?: GraphMeta;
  value?: number;
  onChange?: (t: number) => void;
};

export function Timeline({ meta, value, onChange }: Props) {
  const frameCount = meta?.frame_count ?? 1;
  const currentValue = value ?? 0;
  const max = Math.max(0, frameCount - 1);


  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground">Time</label>
        <span className="text-sm text-muted-foreground font-mono">{currentValue}</span>
      </div>
      <div className="space-y-2">
        <Slider
          min={0}
          max={max}
          step={1}
          value={currentValue}
          onValueChange={(v) => {
            onChange?.(v);
          }}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>0</span>
          <span>{max}</span>
        </div>
      </div>
    </div>
  );
}
