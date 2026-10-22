import os
import threading
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
    cached_group_average,
    compute_group_average_matrices,
    get_rsn_labels,
    is_symmetric,
    list_subject_files,
)
from app.processing import (
    CorrelationRequest,
    GroupCorrelationRequest,
    InterpolationAlgorithm,
    InterpolationParams,
    SmoothingAlgorithm,
    SmoothingParams,
)

DATA_DIR = Path(__file__).parent.parent.parent / "data" / "ABIDE"

# Only the Vite dev server needs CORS. In Docker, nginx serves both on one origin.
CORS_ORIGINS = [
    origin
    for origin in os.environ.get("BRAINVIZ_CORS_ORIGINS", "http://localhost:5173").split(",")
    if origin
]
API_DOCS = os.environ.get("BRAINVIZ_API_DOCS") == "1"

# Group averages take up to a minute, so each worker runs one at a time.
GROUP_SLOT = threading.Semaphore(1)

app = FastAPI(
    title="BrainViz Graph Backend",
    version="0.1.0",
    docs_url="/docs" if API_DOCS else None,
    redoc_url=None,
    openapi_url="/openapi.json" if API_DOCS else None,
    redirect_slashes=False,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/health")
def healthcheck() -> dict:
    return {"status": "ok"}


@app.get("/abide/files")
def list_abide_files() -> dict:
    files = list_subject_files(DATA_DIR)
    return {"files": files}


def resolve_subject_file(file_path: str) -> Path:
    """Reject anything that is not a subject file inside DATA_DIR."""
    data_dir = DATA_DIR.resolve()
    try:
        full_path = (data_dir / file_path).resolve(strict=True)
    except (OSError, ValueError):
        raise HTTPException(status_code=404, detail="File not found")
    if (
        not full_path.is_relative_to(data_dir)
        or full_path.suffix != ".txt"
        or not full_path.name.startswith("dr_stage1_subject")
        or not full_path.is_file()
    ):
        raise HTTPException(status_code=404, detail="File not found")
    return full_path


def relative_subject_path(full_path: Path) -> str:
    return full_path.relative_to(DATA_DIR.resolve()).as_posix()


def _build_response(
    matrices: list[np.ndarray],
    corr_method: CorrelationMethod,
    description: str,
    smoothing_params: SmoothingParams | None,
    interp_params: InterpolationParams | None,
    frame_metadata: dict | None = None,
) -> dict:
    if interp_params is not None and interp_params.algorithm is not None:
        matrices = apply_interpolation(matrices, interp_params)
    if smoothing_params is not None and smoothing_params.algorithm is not None:
        matrices = apply_smoothing(matrices, smoothing_params)

    node_labels = get_rsn_labels(short=True)
    node_long_labels = get_rsn_labels(short=False)
    symmetric = is_symmetric(corr_method)

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
                    Edge(source=node_ids[i], target=node_ids[j], weight=weight)
                )
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
                metadata=frame_metadata or {},
            )
        )

    all_weights = []
    for matrix in matrices:
        mask = ~np.eye(matrix.shape[0], dtype=bool)
        if symmetric:
            mask = np.triu(mask, k=1)
        all_weights.extend(matrix[mask].tolist())

    if not all_weights:
        raise HTTPException(
            status_code=400,
            detail="No correlation matrices could be computed from the provided data.",
        )

    meta = GraphMeta(
        frame_count=len(matrices),
        node_attributes=["label", "degree"],
        edge_attributes=["weight"],
        edge_weight_min=float(min(all_weights)),
        edge_weight_max=float(max(all_weights)),
        description=description,
    )

    return {
        "frames": [frame.model_dump() for frame in processed_frames],
        "meta": meta.model_dump(),
        "symmetric": symmetric,
    }


@app.post("/abide/data")
def get_abide_data(request: CorrelationRequest) -> dict:
    full_path = resolve_subject_file(request.file_path)
    file_path = relative_subject_path(full_path)

    try:
        corr_method = CorrelationMethod(request.method)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid method")

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

    description = f"ABIDE data: {file_path} ({corr_method.value} correlation)"
    frame_metadata = {
        "source": "abide",
        "file": file_path,
        "method": corr_method.value,
        "window_size": (
            "full" if request.window_size is None else str(request.window_size)
        ),
    }
    return _build_response(
        matrices,
        corr_method,
        description,
        request.smoothing,
        request.interpolation,
        frame_metadata,
    )


@app.post("/abide/group-data")
def get_group_abide_data(request: GroupCorrelationRequest) -> dict:
    try:
        corr_method = CorrelationMethod(request.method)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid method")

    params = CorrelationParams(
        method=corr_method,
        window_size=request.window_size,
        step=request.step,
    )

    cached = cached_group_average(request.group, params, DATA_DIR, request.aggregation)
    if cached is not None:
        matrices, n_subjects = cached
    else:
        if not GROUP_SLOT.acquire(blocking=False):
            raise HTTPException(status_code=503, detail="Busy, try again shortly")
        try:
            matrices, n_subjects = compute_group_average_matrices(
                request.group, params, DATA_DIR, request.aggregation
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        finally:
            GROUP_SLOT.release()

    description = f"Group average: {request.group} (N={n_subjects}, {request.aggregation}) ({corr_method.value} correlation)"
    return _build_response(
        matrices, corr_method, description, request.smoothing, request.interpolation
    )


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
