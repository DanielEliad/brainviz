import { describe, it, expect } from "vitest";
import {
  isEdgeVisible,
  filterEdgesForDisplay,
  isEdgeConnectedToNode,
  isEdgeSelected,
  getAbsoluteRange,
  computeNodePositions,
  createColorScale,
  createThicknessScale,
  filterHiddenNodes,
  PADDING_RATIO,
  EDGE_COLOR_NEGATIVE,
  EDGE_COLOR_NEUTRAL,
  EDGE_COLOR_POSITIVE,
  EDGE_THICKNESS_MIN,
  EDGE_THICKNESS_MAX,
} from "./drawFrame";

describe("isEdgeVisible", () => {
  it("returns false for zero weight", () => {
    expect(isEdgeVisible({ source: "A", target: "B", weight: 0 }, 0)).toBe(false);
  });

  it("returns false for weight at threshold", () => {
    expect(isEdgeVisible({ source: "A", target: "B", weight: 0.5 }, 0.5)).toBe(false);
  });

  it("returns true for weight above threshold", () => {
    expect(isEdgeVisible({ source: "A", target: "B", weight: 0.6 }, 0.5)).toBe(true);
  });

  it("uses absolute value for negative weights", () => {
    expect(isEdgeVisible({ source: "A", target: "B", weight: -0.6 }, 0.5)).toBe(true);
    expect(isEdgeVisible({ source: "A", target: "B", weight: -0.4 }, 0.5)).toBe(false);
  });
});

describe("filterEdgesForDisplay", () => {
  const edges = [
    { source: "A", target: "B", weight: 0.7 },
    { source: "B", target: "A", weight: 0.3 },
    { source: "A", target: "C", weight: 0.5 },
    { source: "C", target: "A", weight: 0.5 },
  ];

  describe("asymmetric mode", () => {
    it("returns all edges that pass threshold", () => {
      const result = filterEdgesForDisplay(edges, 0.2, false);
      expect(result).toHaveLength(4);
    });

    it("filters by threshold", () => {
      const result = filterEdgesForDisplay(edges, 0.4, false);
      expect(result).toHaveLength(3);
      expect(result.map((e) => e.weight).sort()).toEqual([0.5, 0.5, 0.7]);
    });
  });

  describe("symmetric mode", () => {
    it("picks dominant edge per pair", () => {
      const result = filterEdgesForDisplay(edges, 0, true);
      expect(result).toHaveLength(2);

      const abEdge = result.find(
        (e) =>
          (e.source === "A" && e.target === "B") ||
          (e.source === "B" && e.target === "A"),
      );
      expect(abEdge?.weight).toBe(0.7);
      expect(abEdge?.source).toBe("A");
    });

    it("uses tiebreaker when weights are equal", () => {
      const result = filterEdgesForDisplay(edges, 0, true);
      const acEdge = result.find(
        (e) =>
          (e.source === "A" && e.target === "C") ||
          (e.source === "C" && e.target === "A"),
      );
      // Tiebreaker: source < target, so A->C wins over C->A
      expect(acEdge?.source).toBe("A");
      expect(acEdge?.target).toBe("C");
    });

    it("applies threshold after picking dominant", () => {
      const result = filterEdgesForDisplay(edges, 0.6, true);
      expect(result).toHaveLength(1);
      expect(result[0].weight).toBe(0.7);
    });
  });
});

describe("isEdgeConnectedToNode", () => {
  const edge = { source: "A", target: "B" };

  it("returns true if node is source", () => {
    expect(isEdgeConnectedToNode(edge, "A")).toBe(true);
  });

  it("returns true if node is target", () => {
    expect(isEdgeConnectedToNode(edge, "B")).toBe(true);
  });

  it("returns false if node is neither", () => {
    expect(isEdgeConnectedToNode(edge, "C")).toBe(false);
  });
});

describe("isEdgeSelected", () => {
  const edge = { source: "A", target: "B" };

  it("returns true for exact match", () => {
    expect(isEdgeSelected(edge, { source: "A", target: "B" })).toBe(true);
  });

  it("returns true for reverse match", () => {
    expect(isEdgeSelected(edge, { source: "B", target: "A" })).toBe(true);
  });

  it("returns false for different edge", () => {
    expect(isEdgeSelected(edge, { source: "A", target: "C" })).toBe(false);
  });
});

describe("getAbsoluteRange", () => {
  it("returns zero min for positive range", () => {
    expect(getAbsoluteRange({ min: 0.1, max: 0.9 })).toEqual({ min: 0, max: 0.9 });
  });

  it("uses max of abs values when min is negative", () => {
    expect(getAbsoluteRange({ min: -0.5, max: 0.8 })).toEqual({ min: 0, max: 0.8 });
  });

  it("uses abs(min) when both values are negative", () => {
    expect(getAbsoluteRange({ min: -0.8, max: -0.2 })).toEqual({ min: 0, max: 0.8 });
  });

  it("handles zero range", () => {
    expect(getAbsoluteRange({ min: 0, max: 0 })).toEqual({ min: 0, max: 0 });
  });

  it("picks larger absolute value as max", () => {
    expect(getAbsoluteRange({ min: -0.9, max: 0.5 })).toEqual({ min: 0, max: 0.9 });
  });
});

describe("computeNodePositions", () => {
  it("returns empty array for zero nodes", () => {
    expect(computeNodePositions(0, 100, 100)).toEqual([]);
  });

  it("returns correct number of positions", () => {
    expect(computeNodePositions(5, 100, 100)).toHaveLength(5);
  });

  it("positions single node at top center", () => {
    const positions = computeNodePositions(1, 100, 100);
    const padding = 100 * PADDING_RATIO;
    expect(positions[0].x).toBeCloseTo(50);
    expect(positions[0].y).toBeCloseTo(padding);
  });

  it("positions nodes in a circle", () => {
    const positions = computeNodePositions(4, 200, 200);
    const cx = 100;
    const cy = 100;
    const padding = 200 * PADDING_RATIO;
    const radius = 100 - padding;

    // First node at top (angle = -π/2)
    expect(positions[0].x).toBeCloseTo(cx);
    expect(positions[0].y).toBeCloseTo(cy - radius);

    // Second node at right (angle = 0)
    expect(positions[1].x).toBeCloseTo(cx + radius);
    expect(positions[1].y).toBeCloseTo(cy);

    // Third node at bottom (angle = π/2)
    expect(positions[2].x).toBeCloseTo(cx);
    expect(positions[2].y).toBeCloseTo(cy + radius);

    // Fourth node at left (angle = π)
    expect(positions[3].x).toBeCloseTo(cx - radius);
    expect(positions[3].y).toBeCloseTo(cy);
  });

  it("handles non-square dimensions", () => {
    const positions = computeNodePositions(2, 200, 100);
    const padding = 100 * PADDING_RATIO; // min dimension
    const ry = 50 - padding;

    // First node at top
    expect(positions[0].x).toBeCloseTo(100);
    expect(positions[0].y).toBeCloseTo(50 - ry);

    // Second node at bottom
    expect(positions[1].x).toBeCloseTo(100);
    expect(positions[1].y).toBeCloseTo(50 + ry);
  });
});

describe("createColorScale (linear)", () => {
  it("returns neutral color for zero", () => {
    const scale = createColorScale("linear");
    expect(scale(0)).toBe(EDGE_COLOR_NEUTRAL);
  });

  it("returns negative color for -1", () => {
    const scale = createColorScale("linear");
    expect(scale(-1)).toBe(EDGE_COLOR_NEGATIVE);
  });

  it("returns positive color for +1", () => {
    const scale = createColorScale("linear");
    expect(scale(1)).toBe(EDGE_COLOR_POSITIVE);
  });

  it("clamps values beyond domain", () => {
    const scale = createColorScale("linear");
    expect(scale(2)).toBe(EDGE_COLOR_POSITIVE);
    expect(scale(-2)).toBe(EDGE_COLOR_NEGATIVE);
  });

  it("interpolates for intermediate values", () => {
    const scale = createColorScale("linear");
    const mid = scale(0.5);
    expect(mid).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
    expect(mid).not.toBe(EDGE_COLOR_NEUTRAL);
    expect(mid).not.toBe(EDGE_COLOR_POSITIVE);
  });
});

describe("createColorScale (exponential)", () => {
  it("returns neutral color for zero", () => {
    const scale = createColorScale("exponential");
    expect(scale(0)).toBe(EDGE_COLOR_NEUTRAL);
  });

  it("returns negative color for -1", () => {
    const scale = createColorScale("exponential");
    expect(scale(-1)).toBe(EDGE_COLOR_NEGATIVE);
  });

  it("returns positive color for +1", () => {
    const scale = createColorScale("exponential");
    expect(scale(1)).toBe(EDGE_COLOR_POSITIVE);
  });

  it("clamps values beyond domain", () => {
    const scale = createColorScale("exponential");
    expect(scale(2)).toBe(EDGE_COLOR_POSITIVE);
    expect(scale(-2)).toBe(EDGE_COLOR_NEGATIVE);
  });
});

describe("createThicknessScale", () => {
  it("returns minimum thickness for zero (exponential)", () => {
    const scale = createThicknessScale(1, "exponential");
    expect(scale(0)).toBe(EDGE_THICKNESS_MIN);
  });

  it("returns maximum thickness for 1 (exponential)", () => {
    const scale = createThicknessScale(1, "exponential");
    expect(scale(1)).toBe(EDGE_THICKNESS_MAX);
  });

  it("applies scale factor", () => {
    const scale = createThicknessScale(2, "exponential");
    expect(scale(0)).toBe(EDGE_THICKNESS_MIN * 2);
    expect(scale(1)).toBe(EDGE_THICKNESS_MAX * 2);
  });

  it("clamps values beyond domain", () => {
    const scale = createThicknessScale(1, "exponential");
    expect(scale(2)).toBe(EDGE_THICKNESS_MAX);
  });

  it("linear: maps midpoint to midpoint", () => {
    const scale = createThicknessScale(1, "linear");
    expect(scale(0.5)).toBeCloseTo((EDGE_THICKNESS_MIN + EDGE_THICKNESS_MAX) / 2);
  });

  it("linear: returns minimum for zero", () => {
    const scale = createThicknessScale(1, "linear");
    expect(scale(0)).toBe(EDGE_THICKNESS_MIN);
  });

  it("linear: returns maximum for 1", () => {
    const scale = createThicknessScale(1, "linear");
    expect(scale(1)).toBe(EDGE_THICKNESS_MAX);
  });
});

const frameWith = (nodeIds: string[], edges: [string, string][]) => ({
  timestamp: 0,
  nodes: nodeIds.map((id) => ({ id })),
  edges: edges.map(([source, target]) => ({ source, target, weight: 0.5 })),
});

describe("filterHiddenNodes", () => {
  it("returns the same object when nothing is hidden", () => {
    const frame = frameWith(["A", "B"], [["A", "B"]]);
    expect(filterHiddenNodes(frame, new Set())).toBe(frame);
  });

  it("drops the hidden node", () => {
    const frame = frameWith(["A", "B", "C"], []);
    expect(filterHiddenNodes(frame, new Set(["B"])).nodes.map((n) => n.id)).toEqual(["A", "C"]);
  });

  it("drops every edge touching a hidden node, in either direction", () => {
    const frame = frameWith(
      ["A", "B", "C"],
      [["A", "B"], ["B", "A"], ["A", "C"]],
    );
    const filtered = filterHiddenNodes(frame, new Set(["B"]));
    expect(filtered.edges).toEqual([{ source: "A", target: "C", weight: 0.5 }]);
  });

  it("leaves the original frame untouched", () => {
    const frame = frameWith(["A", "B"], [["A", "B"]]);
    filterHiddenNodes(frame, new Set(["A"]));
    expect(frame.nodes).toHaveLength(2);
    expect(frame.edges).toHaveLength(1);
  });

  it("preserves the timestamp", () => {
    const frame = { ...frameWith(["A", "B"], []), timestamp: 42 };
    expect(filterHiddenNodes(frame, new Set(["A"])).timestamp).toBe(42);
  });
});
