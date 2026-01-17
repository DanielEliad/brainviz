import { useMemo } from "react";
import { Slider } from "@/components/ui/slider";
import { GraphMeta } from "../vis/types";

type Props = {
  meta?: GraphMeta;
  value?: number;
  onChange?: (t: number) => void;
};

export function Timeline({ meta, value, onChange }: Props) {
  const times = meta?.available_timestamps || [0];
  const currentValue = value ?? times[0] ?? 0;
  const min = times[0] ?? 0;
  const max = times[times.length - 1] ?? 0;


  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground">Time</label>
        <span className="text-sm text-muted-foreground font-mono">{currentValue}</span>
      </div>
      <div className="space-y-2">
        <Slider
          min={min}
          max={max}
          step={1}
          value={currentValue}
          onValueChange={(v) => {
            onChange?.(v);
          }}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{min}</span>
          <span>{max}</span>
        </div>
      </div>
    </div>
  );
}
