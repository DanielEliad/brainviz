from pathlib import Path
from typing import Optional

import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from scipy.ndimage import gaussian_filter1d
from scipy.interpolate import interp1d, UnivariateSpline, make_interp_spline

from app.analytics.community import simple_components
from app.models import Edge, GraphFrame, GraphMeta, Node
from app.abide_processing import (
    CorrelationMethod,
    CorrelationParams,
    compute_correlation_matrices,
    get_method_info,
    get_rsn_labels,
    list_subject_files,
)

# Data directory (relative to project root)
DATA_DIR = Path(__file__).parent.parent.parent / "data"

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


# =============================================================================
# ABIDE Data Endpoints
# =============================================================================

@app.get("/abide/files")
def list_abide_files() -> dict:
    """List all available ABIDE subject files."""
    files = list_subject_files(DATA_DIR)
    return {"files": files, "data_dir": str(DATA_DIR)}


@app.get("/abide/methods")
def list_correlation_methods() -> dict:
    """List available correlation methods and their parameters."""
    return {"methods": get_method_info()}


@app.get("/abide/data")
def get_abide_data(
    file_path: str = Query(..., description="Relative path to subject file"),
    method: str = Query(default="pearson", description="Correlation method: pearson, spearman, partial"),
    window_size: int = Query(default=30, ge=5, le=100, description="Sliding window size"),
    step: int = Query(default=1, ge=1, le=10, description="Step between windows"),
    threshold: Optional[float] = Query(default=None, ge=0, le=1, description="Correlation threshold"),
    smoothing: Optional[str] = Query(default="none", description="Smoothing algorithm"),
    interpolation: Optional[str] = Query(default="none", description="Interpolation algorithm"),
    interpolation_factor: Optional[int] = Query(default=2, description="Interpolation factor"),
) -> dict:
    """
    Get graph data from an ABIDE subject file with correlation analysis.
    """
    # Validate file path
    full_path = DATA_DIR / file_path
    if not full_path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {file_path}")

    # Parse correlation method
    try:
        corr_method = CorrelationMethod(method)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid method: {method}")

    # Compute correlation matrices
    params = CorrelationParams(
        method=corr_method,
        window_size=window_size,
        step=step,
        threshold=threshold,
    )

    try:
        matrices = compute_correlation_matrices(full_path, params)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Apply interpolation/smoothing
    if interpolation and interpolation != "none":
        matrices = apply_interpolation(matrices, interpolation, interpolation_factor)
    if smoothing and smoothing != "none":
        matrices = apply_smoothing(matrices, smoothing)

    # Get node labels
    node_labels = get_rsn_labels(short=True)

    # Build frames
    processed_frames = []
    for timestamp, matrix in enumerate(matrices):
        n = matrix.shape[0]
        node_ids = node_labels

        edges = []
        degree_map: dict[str, int] = {nid: 0 for nid in node_ids}

        for i in range(n):
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
                    degree_map[node_ids[i]] += 1

        communities = simple_components(edges)

        nodes = [
            Node(
                id=node_id,
                label=node_id,
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
                metadata={
                    "source": "abide",
                    "file": file_path,
                    "method": method,
                    "window_size": str(window_size),
                },
            )
        )

    # Calculate edge weight range
    all_weights = []
    for matrix in matrices:
        all_weights.extend(matrix.flatten().tolist())
    edge_weight_min = float(min(all_weights)) if all_weights else 0.0
    edge_weight_max = float(max(all_weights)) if all_weights else 255.0

    meta = GraphMeta(
        available_timestamps=list(range(len(matrices))),
        node_attributes=["label", "group", "degree"],
        edge_attributes=["weight"],
        edge_weight_min=edge_weight_min,
        edge_weight_max=edge_weight_max,
        description=f"ABIDE data: {file_path} ({method} correlation)",
    )

    return {
        "frames": [frame.model_dump() for frame in processed_frames],
        "meta": meta.model_dump(),
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
