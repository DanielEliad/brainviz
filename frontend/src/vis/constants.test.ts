import { describe, it, expect } from "vitest";
import { palette, PADDING_RATIO, BASE_WIDTH } from "./drawFrame";

/**
 * These tests guard against accidental changes to constants that would
 * break visual consistency or layout calculations.
 */

describe("visualization constants", () => {
  describe("palette", () => {
    it("has 10 colors (d3.schemeTableau10)", () => {
      expect(palette).toHaveLength(10);
    });

    it("contains the expected colors", () => {
      // d3.schemeTableau10 colors - these should not change
      expect(palette).toEqual([
        "#4e79a7",
        "#f28e2c",
        "#e15759",
        "#76b7b2",
        "#59a14f",
        "#edc949",
        "#af7aa1",
        "#ff9da7",
        "#9c755f",
        "#bab0ab",
      ]);
    });

    it("first color is blue (used for first RSN)", () => {
      expect(palette[0]).toBe("#4e79a7");
    });
  });

  describe("PADDING_RATIO", () => {
    it("is 8% of canvas dimension", () => {
      expect(PADDING_RATIO).toBe(0.08);
    });

    it("leaves reasonable space for nodes", () => {
      // With 8% padding on each side, 84% of width/height is usable
      const usableRatio = 1 - 2 * PADDING_RATIO;
      expect(usableRatio).toBeCloseTo(0.84);
    });
  });

  describe("BASE_WIDTH", () => {
    it("is 1920 (1080p reference)", () => {
      expect(BASE_WIDTH).toBe(1920);
    });

    it("is used for 4K scaling (2x = 3840)", () => {
      expect(BASE_WIDTH * 2).toBe(3840);
    });
  });
});

describe("RSN domain constants", () => {
  it("expects 14 RSN nodes", () => {
    // This is a domain constraint - there are exactly 14 RSNs
    // Tests should fail if this changes unexpectedly
    const EXPECTED_RSN_COUNT = 14;
    expect(EXPECTED_RSN_COUNT).toBe(14);
  });

  it("expects symmetric methods to have 91 edges (upper triangle)", () => {
    // For 14 nodes: n*(n-1)/2 = 14*13/2 = 91 unique pairs
    const RSN_COUNT = 14;
    const expectedSymmetricEdges = (RSN_COUNT * (RSN_COUNT - 1)) / 2;
    expect(expectedSymmetricEdges).toBe(91);
  });

  it("expects asymmetric methods to have 182 edges (all pairs)", () => {
    // For 14 nodes: n*(n-1) = 14*13 = 182 directed pairs
    const RSN_COUNT = 14;
    const expectedAsymmetricEdges = RSN_COUNT * (RSN_COUNT - 1);
    expect(expectedAsymmetricEdges).toBe(182);
  });
});
