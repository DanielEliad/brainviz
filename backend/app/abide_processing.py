"""
ABIDE Dual-Regression Processing Module

Linear pipeline: parse → transform → export

Stage 1: CONSTANTS  - RSN network mappings
Stage 2: ENUMS      - Correlation methods and parameters
Stage 3: PARSERS    - Load files to numpy arrays
Stage 4: TRANSFORMS - Correlation computations (array → array)
Stage 5: API        - Entry point for backend
"""

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
    fisher_transform: bool = False


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


def list_subject_files(data_dir: Path) -> List[dict]:
    """
    List all available subject files in the data directory.

    Returns list of {path, subject_id, site, version} dicts.
    """
    files = []

    for txt_file in data_dir.rglob("*.txt"):
        parts = txt_file.relative_to(data_dir).parts

        subject_id = txt_file.stem.replace("dr_stage1_subject", "")
        site = parts[-2] if len(parts) >= 2 else "unknown"
        version = parts[-3] if len(parts) >= 3 else "unknown"

        files.append(
            {
                "path": str(txt_file.relative_to(data_dir)),
                "subject_id": subject_id,
                "site": site,
                "version": version,
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
    """
    Compute correlation matrices over sliding windows.

    Input: ndarray [T x N]
    Output: ndarray [F x N x N] where F = number of frames
    """
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


def fisher_z(matrices: np.ndarray) -> np.ndarray:
    """Apply Fisher z-transform. Input: [-1,1], Output: (-inf, inf)"""
    clipped = np.clip(matrices, -0.9999, 0.9999)
    return 0.5 * np.log((1 + clipped) / (1 - clipped))


# =============================================================================
# STAGE 5: API
# =============================================================================


def compute_correlation_matrices(
    filepath: Path,
    params: CorrelationParams,
) -> List[np.ndarray]:
    """
    Main API function: file → list of NxN correlation matrices.

    Args:
        filepath: Path to dr_stage1_subjectXXXXXXX.txt file
        params: Correlation parameters

    Returns:
        List of NxN matrices (one per frame) with raw correlation values.
        For standard correlation methods, values are in [-1, 1].
        For Fisher-transformed values, range is unbounded.
        The actual data range should be computed from the returned matrices.
    """
    # Parse
    data = parse_dr_file(filepath)
    data = filter_rsn_columns(data)

    # Transform
    matrices = windowed_correlation(
        data, params.method, params.window_size, params.step
    )

    if params.fisher_transform:
        matrices = fisher_z(matrices)

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
            "description": "Linear correlation coefficient",
            "symmetric": True,
            "params": [
                {
                    "name": "window_size",
                    "type": "int",
                    "default": 30,
                    "min": 5,
                    "max": 100,
                },
                {"name": "step", "type": "int", "default": 1, "min": 1, "max": 10},
            ],
        },
        {
            "id": CorrelationMethod.SPEARMAN.value,
            "name": "Spearman Correlation",
            "description": "Rank-based correlation (robust to outliers)",
            "symmetric": True,
            "params": [
                {
                    "name": "window_size",
                    "type": "int",
                    "default": 30,
                    "min": 5,
                    "max": 100,
                },
                {"name": "step", "type": "int", "default": 1, "min": 1, "max": 10},
            ],
        },
    ]


if __name__ == "__main__":
    import tempfile

    print("ABIDE Processing Module - Test")
    print("=" * 50)

    # Generate test file
    with tempfile.NamedTemporaryFile(suffix=".txt", delete=False) as f:
        test_data = np.random.randn(100, 32)
        signal = np.random.randn(100)
        test_data[:, 0] += 0.6 * signal
        test_data[:, 5] += 0.6 * signal
        np.savetxt(f.name, test_data, fmt="%.8f")
        test_file = Path(f.name)

    print(f"\nTest file: {test_file}")

    # Test API function
    params = CorrelationParams(
        method=CorrelationMethod.PEARSON,
        window_size=30,
        step=5,
    )

    matrices = compute_correlation_matrices(test_file, params)
    print(f"\nResult shape: {matrices.shape}")
    print(f"  Frames: {matrices.shape[0]}")
    print(f"  Nodes: {matrices.shape[1]}")
    print(f"  Value range: [{matrices.min():.1f}, {matrices.max():.1f}]")

    print(f"\nRSN Labels: {get_rsn_labels()}")

    print("\nAvailable methods:")
    for m in get_method_info():
        print(f"  - {m['name']}: {m['description']}")

    # Cleanup
    test_file.unlink()
