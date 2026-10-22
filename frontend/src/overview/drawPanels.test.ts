import { describe, it, expect } from "vitest";
import { frameToMatrix, NUM_RSNS } from "./drawPanels";
import type { GraphFrame } from "../vis/types";

const frameOf = (edges: { source: string; target: string; weight: number }[]): GraphFrame => ({
	timestamp: 0,
	nodes: Array.from({ length: NUM_RSNS }, (_, i) => ({ id: `n${i}` })),
	edges,
});

describe("frameToMatrix", () => {
	it("returns a square matrix of the RSN count", () => {
		const matrix = frameToMatrix(frameOf([]));
		expect(matrix).toHaveLength(NUM_RSNS);
		for (const row of matrix) expect(row).toHaveLength(NUM_RSNS);
	});

	it("is all zeros for an edgeless frame", () => {
		expect(frameToMatrix(frameOf([])).flat().every((v) => v === 0)).toBe(true);
	});

	it("mirrors an edge given in one direction only", () => {
		const matrix = frameToMatrix(frameOf([{ source: "n0", target: "n3", weight: 0.7 }]));
		expect(matrix[0][3]).toBe(0.7);
		expect(matrix[3][0]).toBe(0.7);
	});

	it("keeps both directions when the data is asymmetric", () => {
		const matrix = frameToMatrix(
			frameOf([
				{ source: "n1", target: "n2", weight: 0.8 },
				{ source: "n2", target: "n1", weight: 0.2 },
			]),
		);
		expect(matrix[1][2]).toBe(0.8);
		expect(matrix[2][1]).toBe(0.2);
	});

	it("ignores edges referencing unknown nodes", () => {
		const matrix = frameToMatrix(frameOf([{ source: "ghost", target: "n1", weight: 0.9 }]));
		expect(matrix.flat().every((v) => v === 0)).toBe(true);
	});
});
