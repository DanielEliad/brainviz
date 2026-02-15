import { useState, useEffect, useRef, useMemo } from "react";
import type { CorrelationMethod } from "../vis/useGraphData";
import type { GraphFrame, GraphMeta } from "../vis/types";
import {
	buildGraphFrame,
	type OverviewAsset,
	type SubjectEntry,
} from "./overviewCodec";

type GraphDataResponse = {
	frames: GraphFrame[];
	meta: GraphMeta;
	symmetric: boolean;
};

export type OverviewResult = {
	file: {
		path: string;
		subject_id: number;
		site: string;
		version: string;
		diagnosis: "ASD" | "HC";
	};
	data: GraphDataResponse | undefined;
	isLoading: boolean;
	error: Error | null;
};

let cachedAsset: OverviewAsset | null = null;
let assetPromise: Promise<OverviewAsset> | null = null;

function fetchAsset(): Promise<OverviewAsset> {
	if (cachedAsset) return Promise.resolve(cachedAsset);
	if (assetPromise) return assetPromise;
	assetPromise = fetch("/overview_data.json")
		.then((res) => {
			if (!res.ok) throw new Error(`Failed to fetch overview data (${res.status})`);
			return res.json() as Promise<OverviewAsset>;
		})
		.then((data) => {
			cachedAsset = data;
			return data;
		});
	return assetPromise;
}

type BuiltCache = Map<CorrelationMethod, GraphDataResponse[]>;

function buildForMethod(
	asset: OverviewAsset,
	method: CorrelationMethod,
): GraphDataResponse[] {
	const methodInfo = asset.methods[method];
	if (!methodInfo) return [];

	return asset.subjects.map((subject: SubjectEntry) => {
		const methodData = subject[method];
		if (!methodData) {
			return {
				frames: [],
				meta: {
					frame_count: 0,
					node_attributes: [],
					edge_attributes: [],
					edge_weight_min: 0,
					edge_weight_max: 0,
				},
				symmetric: methodInfo.symmetric,
			};
		}

		const frame = buildGraphFrame(
			methodData.w,
			methodInfo.symmetric,
			asset.rsn_labels,
			asset.rsn_full_names,
		);

		return {
			frames: [frame],
			meta: {
				frame_count: 1,
				node_attributes: ["label", "degree"],
				edge_attributes: ["weight"],
				edge_weight_min: methodData.min,
				edge_weight_max: methodData.max,
			},
			symmetric: methodInfo.symmetric,
		};
	});
}

export function useOverviewData(method: CorrelationMethod) {
	const [asset, setAsset] = useState<OverviewAsset | null>(cachedAsset);
	const builtCache = useRef<BuiltCache>(new Map());

	useEffect(() => {
		if (asset) return;
		fetchAsset().then(setAsset);
	}, [asset]);

	const methodResponses = useMemo(() => {
		if (!asset) return null;

		const cached = builtCache.current.get(method);
		if (cached) return cached;

		const built = buildForMethod(asset, method);
		builtCache.current.set(method, built);
		return built;
	}, [asset, method]);

	const results: OverviewResult[] = useMemo(() => {
		if (!asset || !methodResponses) return [];

		return asset.subjects.map((subject, i) => ({
			file: {
				path: subject.path,
				subject_id: subject.subject_id,
				site: subject.site,
				version: subject.version,
				diagnosis: subject.diagnosis,
			},
			data: methodResponses[i].frames.length > 0 ? methodResponses[i] : undefined,
			isLoading: false,
			error: null,
		}));
	}, [asset, methodResponses]);

	const dataRange = useMemo(() => {
		if (!asset) return { min: 0, max: 0 };
		const info = asset.methods[method];
		if (!info) return { min: 0, max: 0 };
		return { min: info.global_min, max: info.global_max };
	}, [asset, method]);

	return {
		results,
		dataRange,
		loadedCount: results.length,
		totalCount: asset?.subjects.length ?? 0,
	};
}
