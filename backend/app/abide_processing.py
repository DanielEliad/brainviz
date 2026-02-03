from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import List, Optional
import numpy as np
from scipy import stats


# =============================================================================
# STAGE 1: CONSTANTS
# =============================================================================

RSN_INDICES = [1, 2, 5, 6, 7, 9, 12, 13, 14, 15, 18, 19, 21, 27]

PHENOTYPICS_FILE_PATH = Path(__file__).parent.parent.parent / "data" / "phenotypics.csv"

RSN_NAMES = {
    1: "Anterior Default Mode Network",
    2: "Primary Visual Network",
    5: "Salience Network",
    6: "Posterior Default Mode Network",
    7: "Auditory Network",
    9: "Left Frontoparietal Network",
    12: "Right Frontoparietal Network",
    13: "Lateral Visual Network",
    14: "Lateral Sensorimotor Network",
    15: "Cerebellum Network",
    18: "Primary Sensorimotor Network",
    19: "Dorsal Attention Network",
    21: "Language Network",
    27: "Occipital Visual Network",
}

RSN_SHORT = {
    1: "aDMN",
    2: "V1",
    5: "SAL",
    6: "pDMN",
    7: "AUD",
    9: "lFPN",
    12: "rFPN",
    13: "latVIS",
    14: "latSM",
    15: "CER",
    18: "SM1",
    19: "DAN",
    21: "LANG",
    27: "occVIS",
}


# =============================================================================
# STAGE 2: ENUMS
# =============================================================================


class CorrelationMethod(str, Enum):
    """Available correlation methods."""

    PEARSON = "pearson"
    SPEARMAN = "spearman"


@dataclass
class CorrelationParams:
    """Parameters for correlation computation."""

    method: CorrelationMethod = CorrelationMethod.PEARSON
    window_size: int = 30
    step: int = 1


# =============================================================================
# STAGE 3: PARSERS
# =============================================================================


def parse_dr_file(filepath: Path) -> np.ndarray:
    """
    Parse a dual-regression file.

    Input: dr_stage1_subjectXXXXXXX.txt (space-separated, 32 columns)
    Output: ndarray [timepoints x 32]
    """
    data = np.loadtxt(filepath)
    if data.ndim == 1:
        data = data.reshape(1, -1)
    return data


def filter_rsn_columns(data: np.ndarray) -> np.ndarray:
    """
    Keep only the 14 RSN components.

    Input: ndarray [timepoints x 32]
    Output: ndarray [timepoints x 14]
    """
    indices = [i - 1 for i in RSN_INDICES]
    return data[:, indices]


def get_rsn_labels(short: bool = True) -> List[str]:
    """Get ordered list of RSN labels."""
    names = RSN_SHORT if short else RSN_NAMES
    return [names[i] for i in RSN_INDICES]


def parse_phenotypics(filepath: Path = PHENOTYPICS_FILE_PATH) -> dict[int, str]:
    """
    Parse phenotypics CSV and return mapping of subject_id -> diagnosis.
    Raises FileNotFoundError if file not found.
    Raises ValueError if duplicate subject IDs are found.
    """
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
    """
    List all available subject files in the data directory.

    Returns list of {path, subject_id, site, version, diagnosis} dicts.
    Raises ValueError if any subject is missing a diagnosis.
    """
    # Load phenotypics data
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


# =============================================================================
# STAGE 4: TRANSFORMS
# =============================================================================


def pearson_matrix(data: np.ndarray) -> np.ndarray:
    """Pearson correlation matrix. Input: [T x N], Output: [N x N]"""
    return np.corrcoef(data.T)


def spearman_matrix(data: np.ndarray) -> np.ndarray:
    """Spearman correlation matrix. Input: [T x N], Output: [N x N]"""
    n = data.shape[1]
    matrix = np.zeros((n, n))
    for i in range(n):
        for j in range(i, n):
            r, _ = stats.spearmanr(data[:, i], data[:, j])
            matrix[i, j] = matrix[j, i] = r if not np.isnan(r) else 0.0
    return matrix


def compute_correlation(data: np.ndarray, method: CorrelationMethod) -> np.ndarray:
    """Compute correlation matrix using specified method."""
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


# =============================================================================
# STAGE 5: API
# =============================================================================


def compute_correlation_matrices(
    filepath: Path,
    params: CorrelationParams,
) -> List[np.ndarray]:
    # Parse
    data = parse_dr_file(filepath)
    data = filter_rsn_columns(data)

    # Transform
    matrices = windowed_correlation(
        data, params.method, params.window_size, params.step
    )

    # Return as list of 2D matrices for easier downstream processing
    # Values are NOT normalized - use actual min/max from data for visualization
    return [matrices[i] for i in range(matrices.shape[0])]


def is_symmetric(method: CorrelationMethod) -> bool:
    """Return whether a correlation method produces symmetric matrices."""
    # All current correlation methods are symmetric
    # Future asymmetric methods (e.g., Granger causality) would return False
    return method in {
        CorrelationMethod.PEARSON,
        CorrelationMethod.SPEARMAN,
    }


def get_method_info() -> List[dict]:
    """Return info about available correlation methods and their parameters."""
    return [
        {
            "id": CorrelationMethod.PEARSON.value,
            "name": "Pearson Correlation",
            "symmetric": True,
            "params": [
                {
                    "name": "window_size",
                    "type": "int",
                    "default": 30,
                    "min": 5,
                    "max": 100,
                },
                {"name": "step", "type": "int", "default": 1, "min": 1, "max": 100},
            ],
        },
        {
            "id": CorrelationMethod.SPEARMAN.value,
            "name": "Spearman Correlation",
            "symmetric": True,
            "params": [
                {
                    "name": "window_size",
                    "type": "int",
                    "default": 30,
                    "min": 5,
                    "max": 100,
                },
                {"name": "step", "type": "int", "default": 1, "min": 1, "max": 100},
            ],
        },
    ]
