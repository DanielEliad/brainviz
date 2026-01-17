export type NodeDatum = {
  id: string;
  label?: string;
  group?: string | number | null;
  degree?: number | null;
};

export type EdgeDatum = {
  source: string;
  target: string;
  weight: number;
  directed?: boolean;
};

export type GraphFrame = {
  timestamp: number;
  nodes: NodeDatum[];
  edges: EdgeDatum[];
  metadata?: Record<string, string>;
};

export type GraphMeta = {
  available_timestamps: number[];
  node_attributes: string[];
  edge_attributes: string[];
  edge_weight_min: number;
  edge_weight_max: number;
  description?: string;
};
