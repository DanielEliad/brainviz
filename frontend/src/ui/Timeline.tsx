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
    <div className="flex items-center gap-2">
      <label className="text-xs font-medium text-foreground flex-shrink-0">Time</label>
      <Slider
        min={0}
        max={max}
        step={1}
        value={currentValue}
        onValueChange={(v) => {
          onChange?.(v);
        }}
        className="flex-1"
      />
      <span className="text-[10px] text-muted-foreground font-mono flex-shrink-0 tabular-nums w-12 text-right">
        {currentValue}/{max}
      </span>
    </div>
  );
}
