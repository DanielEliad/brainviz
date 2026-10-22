import { describe, it, expect } from "vitest";
import {
  pickFrameIndices,
  stripLayout,
  formatAspect,
  exportFileName,
} from "./svgLayout";

describe("pickFrameIndices", () => {
  it("returns empty for a non-positive count or total", () => {
    expect(pickFrameIndices(0, 5)).toEqual([]);
    expect(pickFrameIndices(10, 0)).toEqual([]);
  });

  it("returns the first frame when asked for one", () => {
    expect(pickFrameIndices(10, 1)).toEqual([0]);
  });

  it("spans first to last inclusive", () => {
    const indices = pickFrameIndices(41, 5);
    expect(indices[0]).toBe(0);
    expect(indices[indices.length - 1]).toBe(40);
    expect(indices).toEqual([0, 10, 20, 30, 40]);
  });

  it("returns every frame when count exceeds the sequence", () => {
    expect(pickFrameIndices(3, 8)).toEqual([0, 1, 2]);
  });

  it("never produces an out of range index", () => {
    for (const total of [2, 7, 13, 200]) {
      for (const count of [2, 3, 5, 8]) {
        for (const i of pickFrameIndices(total, count)) {
          expect(i).toBeGreaterThanOrEqual(0);
          expect(i).toBeLessThan(total);
        }
      }
    }
  });
});

describe("stripLayout", () => {
  const base = {
    count: 5,
    panelWidth: 1920,
    gap: 60,
    margin: 40,
    captions: true,
    arrow: true,
  };

  it("hits the target aspect ratio", () => {
    const layout = stripLayout({ ...base, targetAspect: 9 });
    expect(layout.width / layout.height).toBeCloseTo(9, 1);
  });

  it("lays panels left to right with the requested gap", () => {
    const layout = stripLayout({ ...base, targetAspect: 9 });
    expect(layout.panels).toHaveLength(5);
    for (let i = 1; i < layout.panels.length; i++) {
      const prev = layout.panels[i - 1];
      expect(layout.panels[i].x - (prev.x + prev.width)).toBe(base.gap);
    }
  });

  it("keeps every panel inside the figure", () => {
    const layout = stripLayout({ ...base, targetAspect: 9 });
    for (const p of layout.panels) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x + p.width).toBeLessThanOrEqual(layout.width);
      expect(p.y + p.height).toBeLessThanOrEqual(layout.height);
    }
  });

  it("gives every panel the same size", () => {
    const layout = stripLayout({ ...base, targetAspect: 9 });
    const [first] = layout.panels;
    for (const p of layout.panels) {
      expect(p.width).toBe(first.width);
      expect(p.height).toBe(first.height);
    }
  });

  it("drops the caption and arrow bands when they are off", () => {
    const withBands = stripLayout({ ...base, panelHeight: 900 });
    const without = stripLayout({
      ...base,
      panelHeight: 900,
      captions: false,
      arrow: false,
    });
    expect(without.captionBaselineY).toBeNull();
    expect(without.arrow).toBeNull();
    expect(without.height).toBeLessThan(withBands.height);
  });

  it("places captions below the panels and the arrow below the captions", () => {
    const layout = stripLayout({ ...base, panelHeight: 900 });
    const panelBottom = layout.panels[0].y + layout.panels[0].height;
    expect(layout.captionBaselineY).toBeGreaterThan(panelBottom);
    expect(layout.arrow!.y).toBeGreaterThan(layout.captionBaselineY!);
    expect(layout.arrow!.y).toBeLessThan(layout.height);
  });

  it("pads a too-tall composition horizontally to reach the target", () => {
    const layout = stripLayout({
      count: 2,
      panelWidth: 1200,
      panelHeight: 1200,
      gap: 240,
      margin: 40,
      captions: true,
      arrow: false,
      targetAspect: 2.5,
    });
    expect(layout.width / layout.height).toBeCloseTo(2.5, 1);
    // Padding is symmetric: equal space either side of the panel block.
    const leftGap = layout.panels[0].x;
    const rightGap =
      layout.width -
      (layout.panels[1].x + layout.panels[1].width);
    expect(leftGap).toBeCloseTo(rightGap, 5);
  });

  it("never produces a degenerate panel height", () => {
    const layout = stripLayout({ ...base, count: 8, targetAspect: 40 });
    expect(layout.panels[0].height).toBeGreaterThan(0);
  });

  it("works for a single panel", () => {
    const layout = stripLayout({
      ...base,
      count: 1,
      captions: false,
      arrow: false,
      panelHeight: 1080,
    });
    expect(layout.panels).toHaveLength(1);
    expect(layout.width).toBe(1920 + 80);
  });
});

describe("formatAspect", () => {
  it("formats a ratio", () => {
    expect(formatAspect(900, 100)).toBe("9.00:1");
  });

  it("guards against a zero height", () => {
    expect(formatAspect(900, 0)).toBe("–");
  });
});

describe("exportFileName", () => {
  it("slugifies and joins the parts", () => {
    expect(exportFileName("brainviz-filmstrip", ["CMU", 50649, "ASD"])).toBe(
      "brainviz-filmstrip-cmu-50649-asd.svg",
    );
  });

  it("drops empty parts", () => {
    expect(exportFileName("graph", [null, undefined, ""])).toBe("graph.svg");
  });

  it("collapses runs of punctuation", () => {
    expect(exportFileName("graph", ["a / b_c"])).toBe("graph-a-b-c.svg");
  });

  it("honours a custom extension", () => {
    expect(exportFileName("graph", ["x"], "pdf")).toBe("graph-x.pdf");
  });
});
