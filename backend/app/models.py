from typing import Dict, List, Optional

from pydantic import BaseModel


class Node(BaseModel):
    id: str
    label: Optional[str] = None
    full_name: Optional[str] = None
    degree: Optional[int] = None


class Edge(BaseModel):
    source: str
    target: str
    weight: float
    directed: bool = False
    attrs: Dict[str, str] = {}


class GraphFrame(BaseModel):
    timestamp: int
    nodes: List[Node]
    edges: List[Edge]
    metadata: Dict[str, str] = {}


class GraphMeta(BaseModel):
    frame_count: int
    node_attributes: List[str]
    edge_attributes: List[str]
    edge_weight_min: float = 0.0
    edge_weight_max: float = 1.0
    description: Optional[str] = None
