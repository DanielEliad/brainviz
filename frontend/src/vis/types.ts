export type NodeDatum = {
  id: string;
  label?: string;
  full_name?: string;
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
  frame_count: number;
  node_attributes: string[];
  edge_attributes: string[];
  edge_weight_min: number;
  edge_weight_max: number;
  description?: string;
};
