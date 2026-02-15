import type { GraphFrame, NodeDatum, EdgeDatum } from "../vis/types";

export type MethodInfo = {
	symmetric: boolean;
	edge_count: number;
	global_min: number;
	global_max: number;
};

export type SubjectEntry = {
	path: string;
	subject_id: number;
	site: string;
	version: string;
	diagnosis: "ASD" | "HC";
	pearson?: { w: number[]; min: number; max: number };
	spearman?: { w: number[]; min: number; max: number };
	wavelet?: { w: number[]; min: number; max: number };
};

export type OverviewAsset = {
	version: number;
	rsn_labels: string[];
	rsn_full_names: string[];
	methods: Record<string, MethodInfo>;
	subjects: SubjectEntry[];
};

export function buildGraphFrame(
	weights: number[],
	symmetric: boolean,
	rsnLabels: string[],
	rsnFullNames: string[],
): GraphFrame {
	const n = rsnLabels.length;
	const degreeMap: Record<string, number> = {};
	for (const label of rsnLabels) degreeMap[label] = 0;

	const edges: EdgeDatum[] = [];
	let idx = 0;

	for (let i = 0; i < n; i++) {
		const jStart = symmetric ? i + 1 : 0;
		for (let j = jStart; j < n; j++) {
			if (i === j) continue;
			edges.push({
				source: rsnLabels[i],
				target: rsnLabels[j],
				weight: weights[idx],
			});
			degreeMap[rsnLabels[i]]++;
			if (symmetric) degreeMap[rsnLabels[j]]++;
			idx++;
		}
	}

	const nodes: NodeDatum[] = rsnLabels.map((label, i) => ({
		id: label,
		label,
		full_name: rsnFullNames[i],
		degree: degreeMap[label],
	}));

	return { timestamp: 0, nodes, edges };
}
