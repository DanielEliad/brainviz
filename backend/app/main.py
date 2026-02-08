from pathlib import Path

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from scipy.ndimage import gaussian_filter1d
from scipy.interpolate import interp1d, UnivariateSpline, make_interp_spline

from app.models import Edge, GraphFrame, GraphMeta, Node
from app.abide_processing import (
    CorrelationMethod,
    CorrelationParams,
    compute_correlation_matrices,
    get_rsn_labels,
    is_symmetric,
    list_subject_files,
)
from app.processing import (
    CorrelationRequest,
    InterpolationAlgorithm,
    InterpolationParams,
    SmoothingAlgorithm,
    SmoothingParams,
)

# Data directory (relative to project root)
DATA_DIR = Path(__file__).parent.parent.parent / "data" / "ABIDE"

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


@app.get("/abide/files")
def list_abide_files() -> dict:
    files = list_subject_files(DATA_DIR)
    return {"files": files, "data_dir": str(DATA_DIR)}


@app.post("/abide/data")
def get_abide_data(request: CorrelationRequest) -> dict:
    # Validate file path
    full_path = DATA_DIR / request.file_path
    if not full_path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {request.file_path}")

    try:
        corr_method = CorrelationMethod(request.method)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid method: {request.method}")

    params = CorrelationParams(
        method=corr_method,
        window_size=request.window_size,
        step=request.step,
    )

    try:
        matrices = compute_correlation_matrices(full_path, params)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Apply interpolation/smoothing
    if request.interpolation is not None and request.interpolation.algorithm is not None:
        matrices = apply_interpolation(matrices, request.interpolation)
    if request.smoothing is not None and request.smoothing.algorithm is not None:
        matrices = apply_smoothing(matrices, request.smoothing)

    # Get node labels (short for IDs, long for display)
    node_labels = get_rsn_labels(short=True)
    node_long_labels = get_rsn_labels(short=False)

    # For symmetric correlations, only create upper triangle edges
    # to avoid duplicate A→B and B→A edges with same weight
    symmetric = is_symmetric(corr_method)

    # Build frames
    processed_frames = []
    for timestamp, matrix in enumerate(matrices):
        n = matrix.shape[0]
        node_ids = node_labels

        edges = []
        degree_map: dict[str, int] = {nid: 0 for nid in node_ids}

        for i in range(n):
            j_start = i + 1 if symmetric else 0
            for j in range(j_start, n):
                if i == j:
                    continue
                weight = float(matrix[i, j])
                edges.append(
                    Edge(
                        source=node_ids[i],
                        target=node_ids[j],
                        weight=weight,
                    )
                )
                # For symmetric edges, both nodes get degree incremented
                degree_map[node_ids[i]] += 1
                if symmetric:
                    degree_map[node_ids[j]] += 1

        nodes = [
            Node(
                id=node_id,
                label=node_id,
                full_name=node_long_labels[i],
                degree=degree_map[node_id],
            )
            for i, node_id in enumerate(node_ids)
        ]

        processed_frames.append(
            GraphFrame(
                timestamp=timestamp,
                nodes=nodes,
                edges=edges,
                metadata={
                    "source": "abide",
                    "file": request.file_path,
                    "method": request.method,
                    "window_size": str(request.window_size),
                },
            )
        )

    # Calculate edge weight range from actual data
    # Values are raw correlation coefficients (typically [-1, 1] for Pearson/Spearman)
    # Frontend must use these values to scale visualizations - never assume a fixed range
    all_weights = []
    for matrix in matrices:
        mask = ~np.eye(matrix.shape[0], dtype=bool)
        if symmetric:
            mask = np.triu(mask, k=1)
        all_weights.extend(matrix[mask].tolist())

    if not all_weights:
        raise HTTPException(
            status_code=400,
            detail="Invalid data file: no correlation matrices could be computed. "
            "The file may be empty, corrupted, or have insufficient data points.",
        )

    edge_weight_min = float(min(all_weights))
    edge_weight_max = float(max(all_weights))

    meta = GraphMeta(
        frame_count=len(matrices),
        node_attributes=["label", "degree"],
        edge_attributes=["weight"],
        edge_weight_min=edge_weight_min,
        edge_weight_max=edge_weight_max,
        description=f"ABIDE data: {request.file_path} ({request.method} correlation)",
    )

    return {
        "frames": [frame.model_dump() for frame in processed_frames],
        "meta": meta.model_dump(),
        "symmetric": symmetric,
    }


def apply_smoothing(
    matrices: list[np.ndarray], params: SmoothingParams
) -> list[np.ndarray]:
    if len(matrices) == 0 or params.algorithm is None:
        return matrices

    num_frames = len(matrices)
    n = matrices[0].shape[0]

    smoothed_data: dict[tuple[int, int], np.ndarray] = {}

    for i in range(n):
        for j in range(n):
            time_series = np.array([m[i, j] for m in matrices])

            if params.algorithm == SmoothingAlgorithm.MOVING_AVERAGE:
                window = min(params.window, num_frames)
                smoothed = np.convolve(
                    time_series, np.ones(window) / window, mode="same"
                )
            elif params.algorithm == SmoothingAlgorithm.EXPONENTIAL:
                smoothed = np.zeros_like(time_series)
                smoothed[0] = time_series[0]
                for k in range(1, len(time_series)):
                    smoothed[k] = (
                        params.alpha * time_series[k]
                        + (1 - params.alpha) * smoothed[k - 1]
                    )
            elif params.algorithm == SmoothingAlgorithm.GAUSSIAN:
                smoothed = gaussian_filter1d(
                    time_series, sigma=params.sigma, mode="nearest"
                )
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


def apply_interpolation(
    matrices: list[np.ndarray], params: InterpolationParams
) -> list[np.ndarray]:
    if len(matrices) == 0 or params.algorithm is None or params.factor <= 1:
        return matrices

    num_frames = len(matrices)
    n = matrices[0].shape[0]

    original_times = np.arange(num_frames)
    new_num_frames = (num_frames - 1) * params.factor + 1
    new_times = np.linspace(0, num_frames - 1, new_num_frames)

    interpolated_data: dict[tuple[int, int], np.ndarray] = {}

    for i in range(n):
        for j in range(n):
            time_series = np.array([m[i, j] for m in matrices])

            if params.algorithm == InterpolationAlgorithm.LINEAR:
                interp_func = interp1d(
                    original_times, time_series, kind="linear", fill_value="extrapolate"
                )
                interpolated = interp_func(new_times)
            elif params.algorithm == InterpolationAlgorithm.CUBIC_SPLINE:
                interp_func = interp1d(
                    original_times, time_series, kind="cubic", fill_value="extrapolate"
                )
                interpolated = interp_func(new_times)
            elif params.algorithm == InterpolationAlgorithm.B_SPLINE:
                spl = make_interp_spline(
                    original_times, time_series, k=min(3, num_frames - 1)
                )
                interpolated = spl(new_times)
            elif params.algorithm == InterpolationAlgorithm.UNIVARIATE_SPLINE:
                spl = UnivariateSpline(
                    original_times, time_series, k=min(3, num_frames - 1), s=0
                )
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
