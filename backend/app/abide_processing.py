from pathlib import Path
from typing import List

import numpy as np
from scipy import stats

from app.rsn_constants import (
    PHENOTYPICS_FILE_PATH,
    RSN_INDICES,
    RSN_NAMES,
    RSN_SHORT,
    CorrelationMethod,
    CorrelationParams,
)
from app.wavelet_processing import compute_wavelet_matrices


def parse_dr_file(filepath: Path) -> np.ndarray:
    data = np.loadtxt(filepath)
    if data.ndim == 1:
        data = data.reshape(1, -1)
    return data


def filter_rsn_columns(data: np.ndarray) -> np.ndarray:
    indices = [i - 1 for i in RSN_INDICES]
    return data[:, indices]


def get_rsn_labels(short: bool = True) -> List[str]:
    names = RSN_SHORT if short else RSN_NAMES
    return [names[i] for i in RSN_INDICES]


def parse_phenotypics(filepath: Path | None = None) -> dict[int, str]:
    if filepath is None:
        filepath = PHENOTYPICS_FILE_PATH
    if not filepath.exists():
        raise FileNotFoundError(f"Phenotypics file not found: {filepath}")

    import csv

    diagnosis_map = {}
    with open(filepath, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            subject_id = int(row["partnum"])
            if subject_id in diagnosis_map:
                raise ValueError(f"Duplicate subject ID in phenotypics: {subject_id}")
            diagnosis_map[subject_id] = row["diagnosis"]
    return diagnosis_map


def list_subject_files(data_dir: Path) -> List[dict]:
    phenotypics = parse_phenotypics()

    files = []

    for txt_file in data_dir.rglob("*.txt"):
        parts = txt_file.relative_to(data_dir).parts

        subject_id = int(txt_file.stem.replace("dr_stage1_subject", ""))
        site = parts[-2] if len(parts) >= 2 else "unknown"
        version = parts[-3] if len(parts) >= 3 else "unknown"
        diagnosis = phenotypics.get(subject_id)
        if diagnosis is None:
            raise ValueError(f"Subject {subject_id} has no diagnosis in phenotypics")

        files.append(
            {
                "path": str(txt_file.relative_to(data_dir)),
                "subject_id": subject_id,
                "site": site,
                "version": version,
                "diagnosis": diagnosis,
            }
        )

    return sorted(files, key=lambda x: (x["version"], x["site"], x["subject_id"]))


def pearson_matrix(data: np.ndarray) -> np.ndarray:
    return np.corrcoef(data.T)


def spearman_matrix(data: np.ndarray) -> np.ndarray:
    n = data.shape[1]
    matrix = np.zeros((n, n))
    for i in range(n):
        for j in range(i, n):
            r, _ = stats.spearmanr(data[:, i], data[:, j])
            matrix[i, j] = matrix[j, i] = r if not np.isnan(r) else 0.0
    return matrix


def compute_correlation(data: np.ndarray, method: CorrelationMethod) -> np.ndarray:
    if method == CorrelationMethod.PEARSON:
        return pearson_matrix(data)
    elif method == CorrelationMethod.SPEARMAN:
        return spearman_matrix(data)
    else:
        raise ValueError(f"Unknown method: {method}")


def windowed_correlation(
    data: np.ndarray,
    method: CorrelationMethod,
    window_size: int,
    step: int = 1,
) -> np.ndarray:
    n_timepoints = data.shape[0]
    n_frames = (n_timepoints - window_size) // step + 1

    if n_frames <= 0:
        raise ValueError(
            f"Window size {window_size} too large for {n_timepoints} timepoints"
        )

    n_nodes = data.shape[1]
    matrices = np.zeros((n_frames, n_nodes, n_nodes))

    for f in range(n_frames):
        start = f * step
        end = start + window_size
        matrices[f] = compute_correlation(data[start:end], method)

    return matrices


def compute_correlation_matrices(
    filepath: Path,
    params: CorrelationParams,
) -> List[np.ndarray]:
    if params.method == CorrelationMethod.WAVELET:
        return compute_wavelet_matrices(filepath, params)

    data = parse_dr_file(filepath)
    data = filter_rsn_columns(data)
    window_size = params.window_size if params.window_size is not None else data.shape[0]
    step = params.step if params.step is not None else 1
    matrices = windowed_correlation(data, params.method, window_size, step)
    return [matrices[i] for i in range(matrices.shape[0])]


def is_symmetric(method: CorrelationMethod) -> bool:
    return method in {
        CorrelationMethod.PEARSON,
        CorrelationMethod.SPEARMAN,
    }


