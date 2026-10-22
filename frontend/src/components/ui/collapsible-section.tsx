import { ChevronRight } from "lucide-react";

type Props = {
	title: string;
	summary: React.ReactNode;
	isOpen: boolean;
	onToggle: () => void;
	children: React.ReactNode;
	action?: React.ReactNode;
};

export function CollapsibleSection({ title, summary, isOpen, onToggle, children, action }: Props) {
	return (
		<div className="border-b border-border last:border-b-0">
			<div className="flex items-center gap-1.5 py-2 px-1">
				<button
					onClick={onToggle}
					className="flex items-center gap-1.5 flex-1 min-w-0 hover:bg-muted/50 transition-colors rounded-sm -my-2 -ml-1 py-2 pl-1 pr-2"
				>
					<ChevronRight
						className={`w-3.5 h-3.5 text-muted-foreground flex-shrink-0 transition-transform duration-300 ease-out ${
							isOpen ? "rotate-90" : ""
						}`}
					/>
					<span className="text-xs font-semibold text-foreground flex-shrink-0">{title}</span>
					<span
						className={`text-[10px] text-muted-foreground transition-opacity duration-300 ease-out ${
							isOpen ? "opacity-0" : "opacity-70"
						}`}
					>
						{summary}
					</span>
				</button>
				{action && (
					<div
						className={`flex-shrink-0 transition-opacity duration-300 ease-out ${
							isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
						}`}
					>
						{action}
					</div>
				)}
			</div>
			<div
				className={`grid transition-[grid-template-rows] duration-300 ease-out ${
					isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
				}`}
			>
				<div className="overflow-hidden">
					<div
						className={`py-2 pl-5 pr-2 space-y-3 transition-opacity duration-300 ease-out ${
							isOpen ? "opacity-100" : "opacity-0"
						}`}
					>
						{children}
					</div>
				</div>
			</div>
		</div>
	);
}
