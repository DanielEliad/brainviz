from typing import Dict, List

import networkx as nx

from app.models import Edge


def simple_components(edges: List[Edge]) -> Dict[str, int]:
    """Assign a component id to each node for quick coloring."""
    g = nx.Graph()
    for edge in edges:
        g.add_edge(edge.source, edge.target, weight=edge.weight)
    components = list(nx.connected_components(g))
    mapping: Dict[str, int] = {}
    for idx, comp in enumerate(components):
        for node in comp:
            mapping[node] = idx
    return mapping
