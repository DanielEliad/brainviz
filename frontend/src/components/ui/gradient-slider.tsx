import { useRef, useEffect, useState, useCallback } from "react";

type Props = {
	min: number;
	max: number;
	value: number;
	onChange: (value: number) => void;
	step?: number;
};

export function GradientSlider({ min, max, value, onChange, step }: Props) {
	const trackRef = useRef<HTMLDivElement>(null);
	const [isDragging, setIsDragging] = useState(false);

	const effectiveStep = step ?? (max - min) / 100;
	const percentage = max > min ? ((value - min) / (max - min)) * 100 : 0;

	const updateValue = useCallback(
		(clientX: number) => {
			if (!trackRef.current) return;
			const rect = trackRef.current.getBoundingClientRect();
			const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
			const pct = x / rect.width;
			const rawValue = min + pct * (max - min);
			const steppedValue = Math.round(rawValue / effectiveStep) * effectiveStep;
			const clampedValue = Math.max(min, Math.min(max, steppedValue));
			onChange(clampedValue);
		},
		[min, max, effectiveStep, onChange]
	);

	useEffect(() => {
		if (!isDragging) return;

		const handleMouseMove = (e: MouseEvent) => {
			updateValue(e.clientX);
		};

		const handleMouseUp = () => {
			setIsDragging(false);
		};

		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("mouseup", handleMouseUp);

		return () => {
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
		};
	}, [isDragging, updateValue]);

	const handleMouseDown = (e: React.MouseEvent) => {
		setIsDragging(true);
		updateValue(e.clientX);
	};

	return (
		<div className="relative pt-5 pb-1">
			{/* Value badge */}
			<div
				className="absolute -top-0 transform -translate-x-1/2 bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded font-medium shadow-sm"
				style={{ left: `${percentage}%` }}
			>
				{value.toFixed(2)}
			</div>

			{/* Track */}
			<div
				ref={trackRef}
				onMouseDown={handleMouseDown}
				className="relative h-2 rounded-full cursor-pointer"
				style={{
					background: "linear-gradient(to right, oklch(0.7 0.15 250), oklch(0.8 0.2 60), oklch(0.65 0.25 25))",
				}}
			>
				{/* Thumb */}
				<div
					className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 bg-white rounded-full shadow-md border-2 border-white/80 transition-transform ${
						isDragging ? "scale-110" : "hover:scale-105"
					}`}
					style={{ left: `${percentage}%` }}
				/>
			</div>

			{/* Min/Max labels */}
			<div className="flex justify-between text-[10px] text-muted-foreground mt-1">
				<span>{min.toFixed(2)}</span>
				<span>{max.toFixed(2)}</span>
			</div>
		</div>
	);
}
