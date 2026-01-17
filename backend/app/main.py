from typing import Optional

import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from scipy.ndimage import gaussian_filter1d
from scipy.interpolate import interp1d, UnivariateSpline, make_interp_spline

from app.analytics.community import simple_components
from app.models import Edge, GraphFrame, GraphMeta, Node

np.random.seed(42)
NUM_NODES = 6
NUM_FRAMES = 200
GRAPH_MATRICES = [
    np.random.uniform(0, 255, size=(NUM_NODES, NUM_NODES)) for _ in range(NUM_FRAMES)
]

app = FastAPI(title="BrainViz Graph Backend", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def healthcheck() -> dict:
    return {"status": "ok"}


@app.get("/graph/metadata")
def get_graph_metadata() -> dict:
    n = NUM_NODES
    node_names = [chr(ord("A") + i) for i in range(n)]
    return {
        "num_nodes": n,
        "node_names": node_names,
        "description": f"Graph with {n} nodes, matrix is {n}x{n} where (0,0) is {node_names[0]}->{node_names[0]}",
    }


def apply_smoothing(matrices: list[np.ndarray], algorithm: str) -> list[np.ndarray]:
    if algorithm == "none" or len(matrices) == 0:
        return matrices
    
    num_frames = len(matrices)
    n = matrices[0].shape[0]
    
    smoothed_data: dict[tuple[int, int], np.ndarray] = {}
    
    for i in range(n):
        for j in range(n):
            time_series = np.array([m[i, j] for m in matrices])
            
            if algorithm == "moving_average":
                window_size = min(3, num_frames)
                smoothed = np.convolve(time_series, np.ones(window_size) / window_size, mode="same")
            elif algorithm == "exponential":
                alpha = 0.5
                smoothed = np.zeros_like(time_series)
                smoothed[0] = time_series[0]
                for k in range(1, len(time_series)):
                    smoothed[k] = alpha * time_series[k] + (1 - alpha) * smoothed[k - 1]
            elif algorithm == "gaussian":
                smoothed = gaussian_filter1d(time_series, sigma=1.0, mode="nearest")
            else:
                smoothed = time_series
            
            smoothed_data[(i, j)] = smoothed
    
    result = []
    for t in range(num_frames):
        matrix = np.zeros((n, n))
        for i in range(n):
            for j in range(n):
                matrix[i, j] = smoothed_data[(i, j)][t]
        result.append(matrix)
    
    return result


def apply_interpolation(matrices: list[np.ndarray], algorithm: str, factor: int = 2) -> list[np.ndarray]:
    if algorithm == "none" or len(matrices) == 0 or factor <= 1:
        return matrices
    
    num_frames = len(matrices)
    n = matrices[0].shape[0]
    
    original_times = np.arange(num_frames)
    new_num_frames = (num_frames - 1) * factor + 1
    new_times = np.linspace(0, num_frames - 1, new_num_frames)
    
    interpolated_data: dict[tuple[int, int], np.ndarray] = {}
    
    for i in range(n):
        for j in range(n):
            time_series = np.array([m[i, j] for m in matrices])
            
            if algorithm == "linear":
                interp_func = interp1d(original_times, time_series, kind="linear", fill_value="extrapolate")
                interpolated = interp_func(new_times)
            elif algorithm == "cubic_spline":
                interp_func = interp1d(original_times, time_series, kind="cubic", fill_value="extrapolate")
                interpolated = interp_func(new_times)
            elif algorithm == "b_spline":
                spl = make_interp_spline(original_times, time_series, k=min(3, num_frames - 1))
                interpolated = spl(new_times)
            elif algorithm == "univariate_spline":
                spl = UnivariateSpline(original_times, time_series, k=min(3, num_frames - 1), s=0)
                interpolated = spl(new_times)
            else:
                interpolated = time_series
            
            interpolated_data[(i, j)] = interpolated
    
    result = []
    for t in range(new_num_frames):
        matrix = np.zeros((n, n))
        for i in range(n):
            for j in range(n):
                matrix[i, j] = interpolated_data[(i, j)][t]
        result.append(matrix)
    
    return result


@app.get("/graph/data")
def get_graph_data(
    smoothing: Optional[str] = Query(default="none", description="Smoothing algorithm: none, moving_average, exponential, gaussian"),
    interpolation: Optional[str] = Query(default="none", description="Interpolation algorithm: none, linear, cubic_spline, b_spline, univariate_spline"),
    interpolation_factor: Optional[int] = Query(default=2, description="Interpolation factor: number of frames to generate between existing frames")
) -> dict:
    matrices = GRAPH_MATRICES
    if interpolation and interpolation != "none":
        matrices = apply_interpolation(matrices, interpolation, interpolation_factor)
    if smoothing and smoothing != "none":
        matrices = apply_smoothing(matrices, smoothing)
    
    processed_frames = []
    
    for timestamp, matrix in enumerate(matrices):
        n = matrix.shape[0]
        node_ids = [chr(ord("A") + i) for i in range(n)]
        
        edges = []
        degree_map: dict[str, int] = {}
        
        for i in range(n):
            degree = 0
            for j in range(n):
                weight = float(matrix[i, j])
                if weight > 0:
                    edges.append(
                        Edge(
                            source=node_ids[i],
                            target=node_ids[j],
                            weight=weight,
                        )
                    )
                    degree += 1
            degree_map[node_ids[i]] = degree
        
        communities = simple_components(edges)
        
        nodes = [
            Node(
                id=node_id,
                label=f"Node {node_id}",
                degree=degree_map[node_id],
                group=str(communities.get(node_id, 0)),
            )
            for node_id in node_ids
        ]
        
        processed_frames.append(
            GraphFrame(
                timestamp=timestamp,
                nodes=nodes,
                edges=edges,
                metadata={"source": "inline_matrix"},
            )
        )
    
    available_timestamps = list(range(len(matrices)))

    # Calculate edge weight range across all frames
    all_weights = []
    for matrix in matrices:
        all_weights.extend(matrix.flatten().tolist())
    edge_weight_min = float(min(all_weights)) if all_weights else 0.0
    edge_weight_max = float(max(all_weights)) if all_weights else 255.0

    meta = GraphMeta(
        available_timestamps=available_timestamps,
        node_attributes=["label", "group", "degree"],
        edge_attributes=["weight"],
        edge_weight_min=edge_weight_min,
        edge_weight_max=edge_weight_max,
        description="Graph states from inline numpy matrices",
    )

    return {
        "frames": [frame.model_dump() for frame in processed_frames],
        "meta": meta.model_dump(),
    }
