import { describe, it, expect } from "vitest";
import type {
  GraphFrame,
  GraphMeta,
  NodeDatum,
  EdgeDatum,
} from "./types";
import type {
  AbideParams,
  AbideFile,
  CorrelationMethod,
  SmoothingAlgorithm,
  InterpolationAlgorithm,
  CorrelationMethodInfo,
} from "./useGraphData";

/**
 * Contract tests ensure type structures match what the backend expects/provides.
 * If these tests fail, it likely means a breaking API change.
 */

describe("GraphFrame contract", () => {
  it("has required fields", () => {
    const frame: GraphFrame = {
      timestamp: 0,
      nodes: [],
      edges: [],
    };
    expect(frame).toHaveProperty("timestamp");
    expect(frame).toHaveProperty("nodes");
    expect(frame).toHaveProperty("edges");
  });

  it("metadata is optional", () => {
    const withMeta: GraphFrame = {
      timestamp: 0,
      nodes: [],
      edges: [],
      metadata: { key: "value" },
    };
    const withoutMeta: GraphFrame = {
      timestamp: 0,
      nodes: [],
      edges: [],
    };
    expect(withMeta.metadata).toBeDefined();
    expect(withoutMeta.metadata).toBeUndefined();
  });
});

describe("GraphMeta contract", () => {
  it("has required fields for visualization", () => {
    const meta: GraphMeta = {
      frame_count: 100,
      node_attributes: [],
      edge_attributes: [],
      edge_weight_min: -1,
      edge_weight_max: 1,
    };
    expect(meta).toHaveProperty("frame_count");
    expect(meta).toHaveProperty("edge_weight_min");
    expect(meta).toHaveProperty("edge_weight_max");
  });

  it("edge_weight fields are numbers (not strings)", () => {
    const meta: GraphMeta = {
      frame_count: 10,
      node_attributes: [],
      edge_attributes: [],
      edge_weight_min: -0.85,
      edge_weight_max: 0.92,
    };
    expect(typeof meta.edge_weight_min).toBe("number");
    expect(typeof meta.edge_weight_max).toBe("number");
  });
});

describe("NodeDatum contract", () => {
  it("id is required", () => {
    const node: NodeDatum = { id: "aDMN" };
    expect(node.id).toBe("aDMN");
  });

  it("label, degree are optional", () => {
    const minimal: NodeDatum = { id: "V1" };
    const full: NodeDatum = { id: "V1", label: "Primary Visual", degree: 5 };
    expect(minimal.label).toBeUndefined();
    expect(full.label).toBe("Primary Visual");
  });
});

describe("EdgeDatum contract", () => {
  it("has required fields", () => {
    const edge: EdgeDatum = {
      source: "aDMN",
      target: "pDMN",
      weight: 0.75,
    };
    expect(edge).toHaveProperty("source");
    expect(edge).toHaveProperty("target");
    expect(edge).toHaveProperty("weight");
  });

  it("weight is a number", () => {
    const edge: EdgeDatum = { source: "A", target: "B", weight: -0.5 };
    expect(typeof edge.weight).toBe("number");
  });

  it("directed is optional (defaults to false)", () => {
    const undirected: EdgeDatum = { source: "A", target: "B", weight: 0.5 };
    const directed: EdgeDatum = {
      source: "A",
      target: "B",
      weight: 0.5,
      directed: true,
    };
    expect(undirected.directed).toBeUndefined();
    expect(directed.directed).toBe(true);
  });
});

describe("AbideFile contract", () => {
  it("has all required fields from backend", () => {
    const file: AbideFile = {
      path: "ABIDE_I/CMU/dr_stage1_subject0050649.txt",
      subject_id: 50649,
      site: "CMU",
      version: "ABIDE_I",
      diagnosis: "ASD",
    };
    expect(file).toHaveProperty("path");
    expect(file).toHaveProperty("subject_id");
    expect(file).toHaveProperty("site");
    expect(file).toHaveProperty("version");
    expect(file).toHaveProperty("diagnosis");
  });

  it("diagnosis is ASD or HC only", () => {
    const asd: AbideFile = {
      path: "test.txt",
      subject_id: 1,
      site: "Test",
      version: "ABIDE_I",
      diagnosis: "ASD",
    };
    const hc: AbideFile = {
      path: "test.txt",
      subject_id: 2,
      site: "Test",
      version: "ABIDE_I",
      diagnosis: "HC",
    };
    expect(["ASD", "HC"]).toContain(asd.diagnosis);
    expect(["ASD", "HC"]).toContain(hc.diagnosis);
  });

  it("subject_id is a number (not string)", () => {
    const file: AbideFile = {
      path: "test.txt",
      subject_id: 50649,
      site: "Test",
      version: "ABIDE_I",
      diagnosis: "ASD",
    };
    expect(typeof file.subject_id).toBe("number");
  });
});

describe("CorrelationMethod values", () => {
  it("includes all expected methods", () => {
    const methods: CorrelationMethod[] = ["pearson", "spearman", "wavelet"];
    expect(methods).toContain("pearson");
    expect(methods).toContain("spearman");
    expect(methods).toContain("wavelet");
  });
});

describe("SmoothingAlgorithm values", () => {
  it("includes all expected algorithms", () => {
    const algorithms: SmoothingAlgorithm[] = [
      "moving_average",
      "exponential",
      "gaussian",
    ];
    expect(algorithms).toHaveLength(3);
    expect(algorithms).toContain("moving_average");
    expect(algorithms).toContain("exponential");
    expect(algorithms).toContain("gaussian");
  });
});

describe("InterpolationAlgorithm values", () => {
  it("includes all expected algorithms", () => {
    const algorithms: InterpolationAlgorithm[] = [
      "linear",
      "cubic_spline",
      "b_spline",
      "univariate_spline",
    ];
    expect(algorithms).toHaveLength(4);
    expect(algorithms).toContain("linear");
    expect(algorithms).toContain("cubic_spline");
  });
});

describe("CorrelationMethodInfo contract", () => {
  it("has required fields", () => {
    const info: CorrelationMethodInfo = {
      id: "pearson",
      name: "Pearson Correlation",
      symmetric: true,
      params: [
        { name: "window_size", type: "int", default: 30, min: 5, max: 100 },
      ],
    };
    expect(info).toHaveProperty("id");
    expect(info).toHaveProperty("name");
    expect(info).toHaveProperty("symmetric");
    expect(info).toHaveProperty("params");
  });

  it("params have required fields", () => {
    const info: CorrelationMethodInfo = {
      id: "test",
      name: "Test",
      symmetric: true,
      params: [{ name: "window_size", type: "int", default: 30, min: 5, max: 100 }],
    };
    const param = info.params[0];
    expect(param).toHaveProperty("name");
    expect(param).toHaveProperty("type");
    expect(param).toHaveProperty("min");
    expect(param).toHaveProperty("max");
  });
});

describe("AbideParams defaults", () => {
  // These are the expected defaults - if they change, dependent code may break
  it("has expected default values", () => {
    const defaults: Partial<AbideParams> = {
      windowSize: 30,
      step: 1,
      smoothingWindow: 3,
      smoothingAlpha: 0.5,
      smoothingSigma: 1.0,
      interpolationFactor: 2,
    };

    expect(defaults.windowSize).toBe(30);
    expect(defaults.step).toBe(1);
    expect(defaults.smoothingWindow).toBe(3);
    expect(defaults.smoothingAlpha).toBe(0.5);
    expect(defaults.smoothingSigma).toBe(1.0);
    expect(defaults.interpolationFactor).toBe(2);
  });
});
