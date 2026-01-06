from pathlib import Path
from typing import Dict, List, Optional, Sequence

import pandas as pd

from app.models import Edge, GraphFrame, GraphMeta, Node
from app.pipelines.base import GraphPipeline


class CSVTimeWeightedGraphPipeline(GraphPipeline):
    """Loads a CSV of timestamped edges and returns frame slices."""

    def __init__(
        self,
        csv_path: Path,
        time_col: str = "timestamp",
        source_col: str = "source",
        target_col: str = "target",
        weight_col: str = "weight",
        extra_edge_cols: Optional[Sequence[str]] = None,
    ):
        if not csv_path.exists():
            raise FileNotFoundError(csv_path)
        self.csv_path = csv_path
        self.time_col = time_col
        self.source_col = source_col
        self.target_col = target_col
        self.weight_col = weight_col
        self.extra_edge_cols = list(extra_edge_cols or [])
        self.df = pd.read_csv(csv_path)

        if self.time_col not in self.df.columns:
            raise ValueError(f"Missing time column {self.time_col} in CSV")

        self._timestamps = sorted(self.df[self.time_col].unique().tolist())

    def available_timestamps(self) -> List[int]:
        return list(self._timestamps)

    def get_meta(self) -> GraphMeta:
        return GraphMeta(
            available_timestamps=self.available_timestamps(),
            node_attributes=["label", "group", "degree"],
            edge_attributes=["weight", *self.extra_edge_cols],
            description=f"CSV-derived graph from {self.csv_path.name}",
        )

    def frame_at(self, timestamp: int) -> GraphFrame:
        if timestamp not in self._timestamps:
            raise ValueError(f"Timestamp {timestamp} not found in {self.csv_path}")

        slice_df = self.df[self.df[self.time_col] == timestamp]
        edges = self._edges_from_df(slice_df)
        nodes = self._nodes_from_edges(edges)

        return GraphFrame(
            timestamp=int(timestamp),
            nodes=nodes,
            edges=edges,
            metadata={"source": self.csv_path.name},
        )

    def _edges_from_df(self, df: pd.DataFrame) -> List[Edge]:
        edge_records = df[[self.source_col, self.target_col, self.weight_col] + self.extra_edge_cols].to_dict(
            orient="records"
        )
        edges: List[Edge] = []
        for rec in edge_records:
            attrs: Dict[str, str] = {}
            for col in self.extra_edge_cols:
                attrs[col] = str(rec.get(col, ""))
            edges.append(
                Edge(
                    source=str(rec[self.source_col]),
                    target=str(rec[self.target_col]),
                    weight=float(rec[self.weight_col]),
                    attrs=attrs,
                )
            )
        return edges

    def _nodes_from_edges(self, edges: List[Edge]) -> List[Node]:
        degree_map: Dict[str, int] = {}
        for edge in edges:
            degree_map[edge.source] = degree_map.get(edge.source, 0) + 1
            degree_map[edge.target] = degree_map.get(edge.target, 0) + 1

        return [
            Node(
                id=node_id,
                label=node_id,
                degree=degree_map.get(node_id, 0),
            )
            for node_id in degree_map.keys()
        ]
