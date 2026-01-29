"""
ABIDE Dual-Regression Processing Module

Linear pipeline: parse → transform → export

Stage 1: CONSTANTS  - RSN network mappings
Stage 2: PARSERS    - Load files to numpy arrays
Stage 3: TRANSFORMS - Correlation computations (array → array)
Stage 4: EXPORTERS  - Convert to CSV format
"""

from pathlib import Path
from typing import List, Optional, Tuple
import numpy as np
import pandas as pd
from scipy import stats


# =============================================================================
# STAGE 1: CONSTANTS
# =============================================================================

# RSN component indices (1-indexed, matching melodic_ic output)
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
# STAGE 2: PARSERS
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
    indices = [i - 1 for i in RSN_INDICES]  # Convert to 0-indexed
    return data[:, indices]


def get_rsn_labels(short: bool = True) -> List[str]:
    """Get ordered list of RSN labels."""
    names = RSN_SHORT if short else RSN_NAMES
    return [names[i] for i in RSN_INDICES]


# =============================================================================
# STAGE 3: TRANSFORMS
# =============================================================================

def pearson_matrix(data: np.ndarray) -> np.ndarray:
    """
    Compute Pearson correlation matrix.

    Input: ndarray [timepoints x nodes]
    Output: ndarray [nodes x nodes]
    """
    return np.corrcoef(data.T)


def spearman_matrix(data: np.ndarray) -> np.ndarray:
    """
    Compute Spearman correlation matrix.

    Input: ndarray [timepoints x nodes]
    Output: ndarray [nodes x nodes]
    """
    n_nodes = data.shape[1]
    matrix = np.zeros((n_nodes, n_nodes))
    for i in range(n_nodes):
        for j in range(i, n_nodes):
            r, _ = stats.spearmanr(data[:, i], data[:, j])
            matrix[i, j] = r
            matrix[j, i] = r
    return matrix


def windowed_correlation(
    data: np.ndarray,
    window_size: int,
    step: int = 1,
    method: str = "pearson"
) -> np.ndarray:
    """
    Compute correlation matrices over sliding windows.

    Input: ndarray [timepoints x nodes]
    Output: ndarray [n_windows x nodes x nodes]
    """
    n_timepoints, n_nodes = data.shape
    n_windows = (n_timepoints - window_size) // step + 1

    corr_func = pearson_matrix if method == "pearson" else spearman_matrix

    matrices = np.zeros((n_windows, n_nodes, n_nodes))
    for w in range(n_windows):
        start = w * step
        end = start + window_size
        matrices[w] = corr_func(data[start:end])

    return matrices


def fisher_z(matrices: np.ndarray) -> np.ndarray:
    """
    Apply Fisher z-transform to correlation matrices.

    Input: ndarray [... x nodes x nodes] with values in [-1, 1]
    Output: ndarray [... x nodes x nodes] with values in (-inf, inf)
    """
    clipped = np.clip(matrices, -0.9999, 0.9999)
    return 0.5 * np.log((1 + clipped) / (1 - clipped))


def threshold_matrices(matrices: np.ndarray, threshold: float) -> np.ndarray:
    """
    Zero out correlations below threshold.

    Input: ndarray [... x nodes x nodes]
    Output: ndarray [... x nodes x nodes]
    """
    result = matrices.copy()
    result[np.abs(result) < threshold] = 0.0
    return result


def normalize_to_range(
    matrices: np.ndarray,
    out_min: float = 0.0,
    out_max: float = 255.0
) -> np.ndarray:
    """
    Normalize correlation values from [-1, 1] to [out_min, out_max].

    Input: ndarray with values in [-1, 1]
    Output: ndarray with values in [out_min, out_max]
    """
    normalized = (matrices + 1) / 2  # [-1, 1] → [0, 1]
    return out_min + normalized * (out_max - out_min)


# =============================================================================
# STAGE 4: EXPORTERS
# =============================================================================

def matrices_to_edge_list(
    matrices: np.ndarray,
    node_labels: List[str]
) -> List[Tuple[int, str, str, float]]:
    """
    Convert correlation matrices to edge list.

    Input: ndarray [n_windows x nodes x nodes], list of node labels
    Output: list of (timestamp, source, target, weight) tuples
    """
    edges = []
    n_windows, n_nodes, _ = matrices.shape

    for t in range(n_windows):
        for i in range(n_nodes):
            for j in range(i + 1, n_nodes):
                weight = matrices[t, i, j]
                if weight != 0.0:
                    edges.append((t, node_labels[i], node_labels[j], weight))

    return edges


def edges_to_dataframe(
    edges: List[Tuple[int, str, str, float]]
) -> pd.DataFrame:
    """
    Convert edge list to DataFrame.

    Output columns: timestamp, source, target, weight
    """
    return pd.DataFrame(edges, columns=["timestamp", "source", "target", "weight"])


def save_edges_csv(edges: List[Tuple[int, str, str, float]], filepath: Path) -> None:
    """Save edge list to CSV file."""
    df = edges_to_dataframe(edges)
    df.to_csv(filepath, index=False)


# =============================================================================
# PIPELINE HELPERS
# =============================================================================

def process_subject(
    filepath: Path,
    window_size: int = 30,
    step: int = 1,
    method: str = "pearson",
    threshold: Optional[float] = None,
    normalize: bool = True,
) -> pd.DataFrame:
    """
    Full pipeline for a single subject file.

    parse → filter → correlate → (threshold) → (normalize) → export
    """
    # Parse
    data = parse_dr_file(filepath)
    data = filter_rsn_columns(data)
    labels = get_rsn_labels(short=True)

    # Transform
    matrices = windowed_correlation(data, window_size, step, method)

    if threshold is not None:
        matrices = threshold_matrices(matrices, threshold)

    if normalize:
        matrices = normalize_to_range(matrices)

    # Export
    edges = matrices_to_edge_list(matrices, labels)
    return edges_to_dataframe(edges)


if __name__ == "__main__":
    import tempfile

    print("ABIDE Processing Module - Test")
    print("=" * 50)

    # Generate test data
    with tempfile.NamedTemporaryFile(suffix=".txt", delete=False) as f:
        test_data = np.random.randn(100, 32)
        # Add correlation between DMN components
        signal = np.random.randn(100)
        test_data[:, 0] += 0.6 * signal  # Component 1 (aDMN)
        test_data[:, 5] += 0.6 * signal  # Component 6 (pDMN)
        np.savetxt(f.name, test_data, fmt="%.8f")
        test_file = Path(f.name)

    print(f"\n1. Parse: {test_file.name}")
    data = parse_dr_file(test_file)
    print(f"   Shape: {data.shape}")

    print("\n2. Filter RSN columns")
    rsn_data = filter_rsn_columns(data)
    print(f"   Shape: {rsn_data.shape}")
    print(f"   Labels: {get_rsn_labels()}")

    print("\n3. Windowed correlation (window=30, step=5)")
    matrices = windowed_correlation(rsn_data, window_size=30, step=5)
    print(f"   Shape: {matrices.shape}")

    print("\n4. Apply threshold (0.2)")
    matrices = threshold_matrices(matrices, 0.2)

    print("\n5. Normalize to [0, 255]")
    matrices = normalize_to_range(matrices)

    print("\n6. Export to edges")
    edges = matrices_to_edge_list(matrices, get_rsn_labels())
    print(f"   Total edges: {len(edges)}")

    df = edges_to_dataframe(edges)
    print(f"\n   DataFrame:\n{df.head(10)}")

    # Cleanup
    test_file.unlink()

    print("\n" + "=" * 50)
    print("RSN Networks:")
    for idx in RSN_INDICES:
        print(f"  {RSN_SHORT[idx]:8s} - {RSN_NAMES[idx]}")
