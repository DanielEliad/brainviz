type Option<T extends string | number> = {
	value: T;
	label: string;
};

type Props<T extends string | number> = {
	options: Option<T>[];
	value: T | null;
	onChange: (value: T) => void;
	size?: "sm" | "md";
};

export function SegmentedControl<T extends string | number>({
	options,
	value,
	onChange,
	size = "md",
}: Props<T>) {
	const sizeClasses = size === "sm" ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-1";

	return (
		<div className="inline-flex rounded-md bg-muted p-0.5 gap-0.5">
			{options.map((option) => (
				<button
					key={String(option.value)}
					onClick={() => onChange(option.value)}
					className={`${sizeClasses} rounded transition-all font-medium ${
						value === option.value
							? "bg-primary text-primary-foreground shadow-sm"
							: "text-muted-foreground hover:text-foreground hover:bg-muted-foreground/10"
					}`}
				>
					{option.label}
				</button>
			))}
		</div>
	);
}
