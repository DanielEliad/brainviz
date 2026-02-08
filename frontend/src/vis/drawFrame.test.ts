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
  PADDING_RATIO,
} from "./drawFrame";

// --- isEdgeVisible ---

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

// --- filterEdgesForDisplay ---

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

// --- isEdgeConnectedToNode ---

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

// --- isEdgeSelected ---

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

// --- getAbsoluteRange ---

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

// --- computeNodePositions ---

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

// --- createColorScale ---

describe("createColorScale", () => {
  it("returns blue for minimum value", () => {
    const scale = createColorScale({ min: 0, max: 1 });
    expect(scale(0)).toBe("rgb(59, 130, 246)");
  });

  it("returns red for maximum value", () => {
    const scale = createColorScale({ min: 0, max: 1 });
    expect(scale(1)).toBe("rgb(220, 38, 38)");
  });

  it("interpolates for middle values", () => {
    const scale = createColorScale({ min: 0, max: 1 });
    const midColor = scale(0.5);
    // Should be between blue and red
    expect(midColor).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
    // Not blue
    expect(midColor).not.toBe("rgb(59, 130, 246)");
    // Not red
    expect(midColor).not.toBe("rgb(220, 38, 38)");
  });

  it("uses absolute range for negative values", () => {
    const scale = createColorScale({ min: -0.5, max: 0.8 });
    // min is 0, so 0 should give blue
    expect(scale(0)).toBe("rgb(59, 130, 246)");
    // max is max(abs(-0.5), abs(0.8)) = 0.8
    expect(scale(0.8)).toBe("rgb(220, 38, 38)");
  });

  it("clamps values beyond domain", () => {
    const scale = createColorScale({ min: 0, max: 1 });
    // Value beyond max should clamp to red
    expect(scale(2)).toBe("rgb(220, 38, 38)");
  });
});

// --- createThicknessScale ---

describe("createThicknessScale", () => {
  it("returns minimum thickness for minimum value", () => {
    const scale = createThicknessScale({ min: 0, max: 1 });
    expect(scale(0)).toBe(0.5);
  });

  it("returns maximum thickness for maximum value", () => {
    const scale = createThicknessScale({ min: 0, max: 1 });
    expect(scale(1)).toBe(8);
  });

  it("interpolates linearly", () => {
    const scale = createThicknessScale({ min: 0, max: 1 });
    expect(scale(0.5)).toBeCloseTo(4.25); // (0.5 + 8) / 2
  });

  it("applies scale factor", () => {
    const scale = createThicknessScale({ min: 0, max: 1 }, 2);
    expect(scale(0)).toBe(1); // 0.5 * 2
    expect(scale(1)).toBe(16); // 8 * 2
  });

  it("uses absolute range for negative values", () => {
    const scale = createThicknessScale({ min: -0.5, max: 1 });
    expect(scale(0)).toBe(0.5);
    expect(scale(1)).toBe(8);
  });

  it("clamps values beyond domain", () => {
    const scale = createThicknessScale({ min: 0, max: 1 });
    expect(scale(2)).toBe(8);
  });
});
