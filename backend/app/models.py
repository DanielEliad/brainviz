from typing import Dict, List, Optional

from pydantic import BaseModel


class Node(BaseModel):
    id: str
    label: Optional[str] = None
    group: Optional[str] = None
    degree: Optional[int] = None
    attrs: Dict[str, str] = {}


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
    available_timestamps: List[int]
    node_attributes: List[str]
    edge_attributes: List[str]
    description: Optional[str] = None
