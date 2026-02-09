import { useQueries } from "@tanstack/react-query";
import type { CorrelationMethod, AbideFile } from "../vis/useGraphData";
import type { GraphFrame, GraphMeta } from "../vis/types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

type GraphDataResponse = {
	frames: GraphFrame[];
	meta: GraphMeta;
	symmetric: boolean;
};

async function fetchOverviewData(
	filePath: string,
	method: CorrelationMethod,
): Promise<GraphDataResponse> {
	const body = { file_path: filePath, method };
	const res = await fetch(`${API_URL}/abide/data`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Overview fetch failed (${res.status}): ${text}`);
	}
	return res.json();
}

export type OverviewResult = {
	file: AbideFile;
	data: GraphDataResponse | undefined;
	isLoading: boolean;
	error: Error | null;
};

export function useOverviewData(files: AbideFile[], method: CorrelationMethod) {
	const queries = useQueries({
		queries: files.map((file) => ({
			queryKey: ["overviewData", file.path, method],
			queryFn: () => fetchOverviewData(file.path, method),
			staleTime: 5 * 60 * 1000,
		})),
	});

	const results: OverviewResult[] = files.map((file, i) => ({
		file,
		data: queries[i].data,
		isLoading: queries[i].isLoading,
		error: queries[i].error,
	}));

	// Compute global data range across all loaded subjects
	let globalMin = Infinity;
	let globalMax = -Infinity;
	for (const q of queries) {
		if (q.data) {
			globalMin = Math.min(globalMin, q.data.meta.edge_weight_min);
			globalMax = Math.max(globalMax, q.data.meta.edge_weight_max);
		}
	}
	const dataRange =
		globalMin <= globalMax
			? { min: globalMin, max: globalMax }
			: { min: 0, max: 0 };

	const loadedCount = queries.filter((q) => q.data).length;

	return { results, dataRange, loadedCount };
}
