import { describe, it, expect } from "vitest";
import {
  linear,
  easeIn,
  easeOut,
  easeInOut,
  easeInCubic,
  easeOutCubic,
  easeInOutCubic,
  elastic,
  bounce,
} from "./interpolation";

// All easing functions should:
// 1. Return 0 when t = 0
// 2. Return 1 when t = 1
// 3. Return values in expected ranges for t in [0, 1]

describe("linear", () => {
  it("returns 0 at t=0", () => {
    expect(linear(0)).toBe(0);
  });

  it("returns 1 at t=1", () => {
    expect(linear(1)).toBe(1);
  });

  it("returns t unchanged", () => {
    expect(linear(0.25)).toBe(0.25);
    expect(linear(0.5)).toBe(0.5);
    expect(linear(0.75)).toBe(0.75);
  });
});

describe("easeIn", () => {
  it("returns 0 at t=0", () => {
    expect(easeIn(0)).toBe(0);
  });

  it("returns 1 at t=1", () => {
    expect(easeIn(1)).toBe(1);
  });

  it("starts slow (value < t for small t)", () => {
    expect(easeIn(0.25)).toBeLessThan(0.25);
    expect(easeIn(0.5)).toBeLessThan(0.5);
  });

  it("is quadratic (t^2)", () => {
    expect(easeIn(0.5)).toBe(0.25);
  });
});

describe("easeOut", () => {
  it("returns 0 at t=0", () => {
    expect(easeOut(0)).toBe(0);
  });

  it("returns 1 at t=1", () => {
    expect(easeOut(1)).toBe(1);
  });

  it("ends slow (value > t for most of range)", () => {
    expect(easeOut(0.25)).toBeGreaterThan(0.25);
    expect(easeOut(0.5)).toBeGreaterThan(0.5);
  });
});

describe("easeInOut", () => {
  it("returns 0 at t=0", () => {
    expect(easeInOut(0)).toBe(0);
  });

  it("returns 1 at t=1", () => {
    expect(easeInOut(1)).toBe(1);
  });

  it("returns 0.5 at t=0.5", () => {
    expect(easeInOut(0.5)).toBe(0.5);
  });

  it("is symmetric around midpoint", () => {
    expect(easeInOut(0.25)).toBeCloseTo(1 - easeInOut(0.75));
  });
});

describe("easeInCubic", () => {
  it("returns 0 at t=0", () => {
    expect(easeInCubic(0)).toBe(0);
  });

  it("returns 1 at t=1", () => {
    expect(easeInCubic(1)).toBe(1);
  });

  it("is cubic (t^3)", () => {
    expect(easeInCubic(0.5)).toBe(0.125);
  });

  it("is slower than quadratic easeIn", () => {
    expect(easeInCubic(0.5)).toBeLessThan(easeIn(0.5));
  });
});

describe("easeOutCubic", () => {
  it("returns 0 at t=0", () => {
    expect(easeOutCubic(0)).toBe(0);
  });

  it("returns 1 at t=1", () => {
    expect(easeOutCubic(1)).toBe(1);
  });

  it("ends slow (value > t for most of range)", () => {
    expect(easeOutCubic(0.25)).toBeGreaterThan(0.25);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });
});

describe("easeInOutCubic", () => {
  it("returns 0 at t=0", () => {
    expect(easeInOutCubic(0)).toBe(0);
  });

  it("returns 1 at t=1", () => {
    expect(easeInOutCubic(1)).toBe(1);
  });

  it("returns 0.5 at t=0.5", () => {
    expect(easeInOutCubic(0.5)).toBe(0.5);
  });
});

describe("elastic", () => {
  it("returns 0 at t=0", () => {
    expect(elastic(0)).toBe(0);
  });

  it("returns 1 at t=1", () => {
    expect(elastic(1)).toBe(1);
  });

  it("oscillates (can go below 0 or above 1)", () => {
    // Elastic functions typically overshoot
    const values = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map(elastic);
    const hasNegative = values.some((v) => v < 0);
    expect(hasNegative).toBe(true);
  });
});

describe("bounce", () => {
  it("returns 0 at t=0", () => {
    expect(bounce(0)).toBe(0);
  });

  it("returns 1 at t=1", () => {
    expect(bounce(1)).toBe(1);
  });

  it("stays in [0, 1] range", () => {
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const value = bounce(t);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("has characteristic bounce behavior", () => {
    // Bounce should have distinct phases
    expect(bounce(0.5)).toBeGreaterThan(0.5);
  });
});
