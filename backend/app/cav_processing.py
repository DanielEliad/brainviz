"""
CAV Data Processing Module

This module provides functionality for:
1. Parsing CAV (Correlation/Adjacency/Covariance) files and time series data
2. Parsing ABIDE dual-regression ICA time series files
3. Applying various correlation and transformation techniques
4. Converting processed data to pipeline-compatible format

Supported input formats:
- ABIDE dual-regression files (dr_stage1_subjectXXXXXXX.txt)
- Time series data (nodes x timepoints)
- Adjacency/correlation matrices per timestamp
- Raw CSV with node time series

Transformations available:
- Pearson correlation (windowed)
- Spearman correlation (windowed)
- Fisher z-transformation
- Partial correlation
- Dynamic time warping similarity
- Mutual information
"""

from pathlib import Path
from typing import Dict, List, Optional, Tuple, Union, Callable
from dataclasses import dataclass, field
from enum import Enum
import numpy as np
import pandas as pd
from scipy import stats
from scipy.ndimage import uniform_filter1d


# =============================================================================
# ABIDE RSN (Resting-State Network) Component Mapping
# =============================================================================
# Based on the 32-component group ICA from ABIDE preprocessing
# Component indices follow melodic_ic output (1-indexed)

RSN_COMPONENTS: Dict[int, str] = {
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

# Short names for visualization
RSN_SHORT_NAMES: Dict[int, str] = {
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

# All RSN component indices (0-indexed for array access)
RSN_INDICES_0BASED: List[int] = [i - 1 for i in RSN_COMPONENTS.keys()]
RSN_INDICES_1BASED: List[int] = list(RSN_COMPONENTS.keys())


def get_rsn_name(component_index: int, one_indexed: bool = True, short: bool = False) -> str:
    """
    Get the RSN name for a component index.

    Args:
        component_index: The ICA component index
        one_indexed: If True, index starts at 1 (melodic_ic style)
        short: If True, return short name for visualization

    Returns:
        RSN name or "Component_N" if not a recognized RSN
    """
    idx = component_index if one_indexed else component_index + 1

    if short:
        return RSN_SHORT_NAMES.get(idx, f"IC{idx}")
    return RSN_COMPONENTS.get(idx, f"Component_{idx}")


def is_rsn_component(component_index: int, one_indexed: bool = True) -> bool:
    """Check if a component index corresponds to a recognized RSN."""
    idx = component_index if one_indexed else component_index + 1
    return idx in RSN_COMPONENTS


class CorrelationType(Enum):
    """Supported correlation types."""
    PEARSON = "pearson"
    SPEARMAN = "spearman"
    KENDALL = "kendall"


@dataclass
class CAVConfig:
    """Configuration for CAV data processing."""
    window_size: int = 10
    step_size: int = 1
    correlation_type: CorrelationType = CorrelationType.PEARSON
    fisher_transform: bool = False
    threshold: Optional[float] = None  # Filter edges below this correlation
    normalize_weights: bool = True
    weight_range: Tuple[float, float] = (0.0, 255.0)


@dataclass
class ProcessedFrame:
    """A single processed frame with correlation data."""
    timestamp: int
    edges: List[Tuple[str, str, float]]  # (source, target, weight)
    node_names: List[str]
    metadata: Dict


class CAVParser:
    """
    Parser for CAV (Correlation/Adjacency/Covariance) data files.

    Supports multiple input formats:
    - ABIDE dual-regression files: space-separated, 32 columns (ICA components)
    - Time series CSV: rows are timepoints, columns are nodes
    - Matrix files: adjacency/correlation matrices
    - Multi-timestamp matrices: 3D arrays (time x nodes x nodes)
    """

    @staticmethod
    def parse_abide_dr_file(
        filepath: Path,
        rsn_only: bool = True,
        use_short_names: bool = True,
    ) -> Tuple[np.ndarray, List[str]]:
        """
        Parse an ABIDE dual-regression time series file.

        These files are named 'dr_stage1_subjectXXXXXXX.txt' and contain
        space-separated values with 32 columns (one per ICA component).
        Each row is a timepoint.

        Args:
            filepath: Path to the dr_stage1_*.txt file
            rsn_only: If True, only include the 14 identified RSN components
            use_short_names: If True, use short names (e.g., "aDMN", "V1")

        Returns:
            Tuple of (data array [timepoints x nodes], node names)
        """
        # Load space/tab separated data
        data = np.loadtxt(filepath)

        if data.ndim == 1:
            # Single timepoint, reshape to 2D
            data = data.reshape(1, -1)

        n_timepoints, n_components = data.shape

        if n_components != 32:
            raise ValueError(
                f"Expected 32 components in ABIDE DR file, got {n_components}"
            )

        if rsn_only:
            # Filter to only RSN components (0-indexed)
            rsn_indices = RSN_INDICES_0BASED
            data = data[:, rsn_indices]

            # Get names for filtered components
            if use_short_names:
                node_names = [RSN_SHORT_NAMES[i + 1] for i in rsn_indices]
            else:
                node_names = [RSN_COMPONENTS[i + 1] for i in rsn_indices]
        else:
            # Include all 32 components
            if use_short_names:
                node_names = [
                    RSN_SHORT_NAMES.get(i + 1, f"IC{i + 1}")
                    for i in range(n_components)
                ]
            else:
                node_names = [
                    RSN_COMPONENTS.get(i + 1, f"Component_{i + 1}")
                    for i in range(n_components)
                ]

        return data, node_names

    @staticmethod
    def parse_abide_subject_files(
        filepaths: List[Path],
        rsn_only: bool = True,
        use_short_names: bool = True,
        concatenate: bool = False,
    ) -> Tuple[Union[np.ndarray, List[np.ndarray]], List[str], List[str]]:
        """
        Parse multiple ABIDE dual-regression files (multiple subjects).

        Args:
            filepaths: List of paths to dr_stage1_*.txt files
            rsn_only: If True, only include the 14 identified RSN components
            use_short_names: If True, use short names
            concatenate: If True, concatenate all subjects' data

        Returns:
            Tuple of:
                - data: Either single array (if concatenate) or list of arrays
                - node_names: List of node/network names
                - subject_ids: List of extracted subject IDs
        """
        all_data = []
        subject_ids = []
        node_names = None

        for fp in filepaths:
            data, names = CAVParser.parse_abide_dr_file(
                fp, rsn_only=rsn_only, use_short_names=use_short_names
            )
            all_data.append(data)

            # Extract subject ID from filename (dr_stage1_subjectXXXXXXX.txt)
            filename = fp.stem
            if filename.startswith("dr_stage1_subject"):
                subject_id = filename.replace("dr_stage1_subject", "")
            else:
                subject_id = filename
            subject_ids.append(subject_id)

            if node_names is None:
                node_names = names

        if concatenate:
            return np.vstack(all_data), node_names, subject_ids

        return all_data, node_names, subject_ids

    @staticmethod
    def find_abide_files(
        base_dir: Path,
        site: Optional[str] = None,
        version: Optional[str] = None,
    ) -> List[Path]:
        """
        Find ABIDE dual-regression files in a directory structure.

        Expected structure: base_dir/ABIDE/{ABIDE_I,ABIDE_II}/site/dr_stage1_*.txt

        Args:
            base_dir: Base directory containing ABIDE folder
            site: Optional site filter (e.g., "NYU", "UCLA")
            version: Optional version filter ("ABIDE_I" or "ABIDE_II")

        Returns:
            List of paths to dr_stage1_*.txt files
        """
        pattern_parts = ["ABIDE"]

        if version:
            pattern_parts.append(version)
        else:
            pattern_parts.append("*")

        if site:
            pattern_parts.append(f"*{site}*")
        else:
            pattern_parts.append("*")

        pattern_parts.append("dr_stage1_subject*.txt")

        pattern = "/".join(pattern_parts)
        return sorted(base_dir.glob(pattern))

    @staticmethod
    def parse_timeseries_csv(
        filepath: Path,
        time_col: Optional[str] = None,
        node_cols: Optional[List[str]] = None,
    ) -> Tuple[np.ndarray, List[str]]:
        """
        Parse a CSV file containing time series data.

        Args:
            filepath: Path to the CSV file
            time_col: Name of time column (excluded from data), None if no time column
            node_cols: Specific columns to use as nodes, None for all non-time columns

        Returns:
            Tuple of (data array [timepoints x nodes], node names)
        """
        df = pd.read_csv(filepath)

        if time_col and time_col in df.columns:
            df = df.drop(columns=[time_col])

        if node_cols:
            df = df[node_cols]

        node_names = list(df.columns)
        data = df.values.astype(np.float64)

        return data, node_names

    @staticmethod
    def parse_matrix_file(
        filepath: Path,
        node_names: Optional[List[str]] = None,
    ) -> Tuple[np.ndarray, List[str]]:
        """
        Parse a single correlation/adjacency matrix file.

        Supports:
        - .csv: Comma-separated matrix
        - .npy: NumPy array
        - .txt: Space/tab separated matrix

        Args:
            filepath: Path to the matrix file
            node_names: Optional node names, auto-generated if not provided

        Returns:
            Tuple of (matrix [nodes x nodes], node names)
        """
        suffix = filepath.suffix.lower()

        if suffix == '.npy':
            matrix = np.load(filepath)
        elif suffix == '.csv':
            df = pd.read_csv(filepath, header=None)
            # Check if first row/col are headers
            if df.iloc[0, 0] != df.iloc[0, 0]:  # NaN check for header
                df = pd.read_csv(filepath, index_col=0)
                if node_names is None:
                    node_names = list(df.columns)
            matrix = df.values.astype(np.float64)
        else:  # .txt or other
            matrix = np.loadtxt(filepath)

        n_nodes = matrix.shape[0]
        if node_names is None:
            node_names = [f"Node_{i}" for i in range(n_nodes)]

        return matrix, node_names

    @staticmethod
    def parse_multi_matrix_file(
        filepath: Path,
        node_names: Optional[List[str]] = None,
    ) -> Tuple[np.ndarray, List[str]]:
        """
        Parse a file containing multiple matrices (3D: time x nodes x nodes).

        Args:
            filepath: Path to the .npy file with 3D array
            node_names: Optional node names

        Returns:
            Tuple of (3D array [time x nodes x nodes], node names)
        """
        matrices = np.load(filepath)

        if matrices.ndim != 3:
            raise ValueError(f"Expected 3D array, got {matrices.ndim}D")

        n_nodes = matrices.shape[1]
        if node_names is None:
            node_names = [f"Node_{i}" for i in range(n_nodes)]

        return matrices, node_names


class CorrelationTransforms:
    """
    Collection of correlation and transformation methods.
    """

    @staticmethod
    def pearson_correlation(x: np.ndarray, y: np.ndarray) -> float:
        """Compute Pearson correlation between two arrays."""
        if len(x) < 2:
            return 0.0
        r, _ = stats.pearsonr(x, y)
        return r if not np.isnan(r) else 0.0

    @staticmethod
    def spearman_correlation(x: np.ndarray, y: np.ndarray) -> float:
        """Compute Spearman rank correlation between two arrays."""
        if len(x) < 2:
            return 0.0
        r, _ = stats.spearmanr(x, y)
        return r if not np.isnan(r) else 0.0

    @staticmethod
    def kendall_correlation(x: np.ndarray, y: np.ndarray) -> float:
        """Compute Kendall tau correlation between two arrays."""
        if len(x) < 2:
            return 0.0
        r, _ = stats.kendalltau(x, y)
        return r if not np.isnan(r) else 0.0

    @staticmethod
    def fisher_z_transform(r: float) -> float:
        """
        Apply Fisher z-transformation to a correlation coefficient.

        Transforms correlation from [-1, 1] to (-inf, inf) for
        statistical comparisons and averaging.
        """
        # Clip to avoid infinity
        r = np.clip(r, -0.9999, 0.9999)
        return 0.5 * np.log((1 + r) / (1 - r))

    @staticmethod
    def inverse_fisher_z(z: float) -> float:
        """Inverse Fisher z-transformation."""
        return np.tanh(z)

    @staticmethod
    def windowed_correlation(
        data: np.ndarray,
        window_size: int,
        step_size: int = 1,
        correlation_func: Callable[[np.ndarray, np.ndarray], float] = None,
    ) -> np.ndarray:
        """
        Compute windowed correlation matrices over time series data.

        Args:
            data: Time series data [timepoints x nodes]
            window_size: Size of sliding window
            step_size: Step between windows
            correlation_func: Correlation function to use (default: Pearson)

        Returns:
            3D array of correlation matrices [n_windows x nodes x nodes]
        """
        if correlation_func is None:
            correlation_func = CorrelationTransforms.pearson_correlation

        n_timepoints, n_nodes = data.shape
        n_windows = (n_timepoints - window_size) // step_size + 1

        if n_windows <= 0:
            raise ValueError(
                f"Window size {window_size} too large for data with {n_timepoints} timepoints"
            )

        correlation_matrices = np.zeros((n_windows, n_nodes, n_nodes))

        for w in range(n_windows):
            start = w * step_size
            end = start + window_size
            window_data = data[start:end, :]

            # Compute pairwise correlations
            for i in range(n_nodes):
                for j in range(i + 1, n_nodes):
                    r = correlation_func(window_data[:, i], window_data[:, j])
                    correlation_matrices[w, i, j] = r
                    correlation_matrices[w, j, i] = r
                # Diagonal is 1 (self-correlation)
                correlation_matrices[w, i, i] = 1.0

        return correlation_matrices

    @staticmethod
    def partial_correlation(data: np.ndarray) -> np.ndarray:
        """
        Compute partial correlation matrix.

        Partial correlation measures the relationship between two variables
        while controlling for all other variables.

        Args:
            data: Time series data [timepoints x nodes]

        Returns:
            Partial correlation matrix [nodes x nodes]
        """
        # Compute covariance matrix
        cov = np.cov(data.T)

        # Compute precision matrix (inverse of covariance)
        try:
            precision = np.linalg.inv(cov)
        except np.linalg.LinAlgError:
            # Use pseudo-inverse for singular matrices
            precision = np.linalg.pinv(cov)

        # Convert precision to partial correlation
        n_nodes = precision.shape[0]
        partial_corr = np.zeros_like(precision)

        for i in range(n_nodes):
            for j in range(n_nodes):
                if i == j:
                    partial_corr[i, j] = 1.0
                else:
                    denom = np.sqrt(precision[i, i] * precision[j, j])
                    if denom > 0:
                        partial_corr[i, j] = -precision[i, j] / denom
                    else:
                        partial_corr[i, j] = 0.0

        return partial_corr

    @staticmethod
    def windowed_partial_correlation(
        data: np.ndarray,
        window_size: int,
        step_size: int = 1,
    ) -> np.ndarray:
        """
        Compute windowed partial correlation matrices.

        Args:
            data: Time series data [timepoints x nodes]
            window_size: Size of sliding window
            step_size: Step between windows

        Returns:
            3D array of partial correlation matrices [n_windows x nodes x nodes]
        """
        n_timepoints, n_nodes = data.shape
        n_windows = (n_timepoints - window_size) // step_size + 1

        partial_matrices = np.zeros((n_windows, n_nodes, n_nodes))

        for w in range(n_windows):
            start = w * step_size
            end = start + window_size
            window_data = data[start:end, :]
            partial_matrices[w] = CorrelationTransforms.partial_correlation(window_data)

        return partial_matrices

    @staticmethod
    def mutual_information(x: np.ndarray, y: np.ndarray, n_bins: int = 10) -> float:
        """
        Estimate mutual information between two time series.

        Uses histogram-based estimation.

        Args:
            x, y: Time series arrays
            n_bins: Number of bins for histogram

        Returns:
            Mutual information value (non-negative)
        """
        # Create 2D histogram
        hist_2d, _, _ = np.histogram2d(x, y, bins=n_bins)

        # Normalize to get joint probability
        p_xy = hist_2d / np.sum(hist_2d)

        # Marginal probabilities
        p_x = np.sum(p_xy, axis=1)
        p_y = np.sum(p_xy, axis=0)

        # Compute mutual information
        mi = 0.0
        for i in range(n_bins):
            for j in range(n_bins):
                if p_xy[i, j] > 0 and p_x[i] > 0 and p_y[j] > 0:
                    mi += p_xy[i, j] * np.log(p_xy[i, j] / (p_x[i] * p_y[j]))

        return max(0.0, mi)

    @staticmethod
    def windowed_mutual_information(
        data: np.ndarray,
        window_size: int,
        step_size: int = 1,
        n_bins: int = 10,
    ) -> np.ndarray:
        """
        Compute windowed mutual information matrices.

        Args:
            data: Time series data [timepoints x nodes]
            window_size: Size of sliding window
            step_size: Step between windows
            n_bins: Number of bins for histogram estimation

        Returns:
            3D array of MI matrices [n_windows x nodes x nodes]
        """
        n_timepoints, n_nodes = data.shape
        n_windows = (n_timepoints - window_size) // step_size + 1

        mi_matrices = np.zeros((n_windows, n_nodes, n_nodes))

        for w in range(n_windows):
            start = w * step_size
            end = start + window_size
            window_data = data[start:end, :]

            for i in range(n_nodes):
                for j in range(i + 1, n_nodes):
                    mi = CorrelationTransforms.mutual_information(
                        window_data[:, i], window_data[:, j], n_bins
                    )
                    mi_matrices[w, i, j] = mi
                    mi_matrices[w, j, i] = mi

        return mi_matrices


class CAVProcessor:
    """
    Main processor class for CAV data.

    Handles the full pipeline from raw data to processed frames
    compatible with the visualization system.
    """

    def __init__(self, config: Optional[CAVConfig] = None):
        """
        Initialize the CAV processor.

        Args:
            config: Processing configuration
        """
        self.config = config or CAVConfig()
        self._data: Optional[np.ndarray] = None
        self._node_names: Optional[List[str]] = None
        self._processed_matrices: Optional[np.ndarray] = None
        self._subject_ids: Optional[List[str]] = None
        self._subject_data: Optional[List[np.ndarray]] = None

    def load_abide_file(
        self,
        filepath: Path,
        rsn_only: bool = True,
        use_short_names: bool = True,
    ) -> "CAVProcessor":
        """
        Load an ABIDE dual-regression time series file.

        Args:
            filepath: Path to dr_stage1_subjectXXXXXXX.txt file
            rsn_only: If True, only include the 14 identified RSN components
            use_short_names: If True, use short names (e.g., "aDMN", "V1")

        Returns:
            Self for method chaining
        """
        self._data, self._node_names = CAVParser.parse_abide_dr_file(
            filepath, rsn_only=rsn_only, use_short_names=use_short_names
        )
        self._processed_matrices = None
        return self

    def load_abide_files(
        self,
        filepaths: List[Path],
        rsn_only: bool = True,
        use_short_names: bool = True,
        concatenate: bool = True,
    ) -> "CAVProcessor":
        """
        Load multiple ABIDE dual-regression files and optionally concatenate.

        Args:
            filepaths: List of paths to dr_stage1_*.txt files
            rsn_only: If True, only include the 14 identified RSN components
            use_short_names: If True, use short names
            concatenate: If True, concatenate all subjects' data into one

        Returns:
            Self for method chaining
        """
        result, self._node_names, self._subject_ids = CAVParser.parse_abide_subject_files(
            filepaths,
            rsn_only=rsn_only,
            use_short_names=use_short_names,
            concatenate=concatenate,
        )

        if concatenate:
            self._data = result
            self._subject_data = None
        else:
            self._data = None
            self._subject_data = result  # List of arrays per subject

        self._processed_matrices = None
        return self

    def load_timeseries(
        self,
        filepath: Path,
        time_col: Optional[str] = None,
        node_cols: Optional[List[str]] = None,
    ) -> "CAVProcessor":
        """
        Load time series data from a CSV file.

        Args:
            filepath: Path to CSV file
            time_col: Column name for time (to exclude)
            node_cols: Specific columns to use as nodes

        Returns:
            Self for method chaining
        """
        self._data, self._node_names = CAVParser.parse_timeseries_csv(
            filepath, time_col, node_cols
        )
        self._processed_matrices = None
        return self

    def load_matrices(
        self,
        filepath: Path,
        node_names: Optional[List[str]] = None,
    ) -> "CAVProcessor":
        """
        Load pre-computed correlation matrices.

        Args:
            filepath: Path to matrix file (.npy with 3D array)
            node_names: Optional node names

        Returns:
            Self for method chaining
        """
        self._processed_matrices, self._node_names = CAVParser.parse_multi_matrix_file(
            filepath, node_names
        )
        self._data = None
        return self

    def load_from_array(
        self,
        data: np.ndarray,
        node_names: Optional[List[str]] = None,
        is_timeseries: bool = True,
    ) -> "CAVProcessor":
        """
        Load data directly from a numpy array.

        Args:
            data: Either time series [timepoints x nodes] or
                  matrices [n_matrices x nodes x nodes]
            node_names: Names for each node
            is_timeseries: True if data is time series, False if matrices

        Returns:
            Self for method chaining
        """
        if is_timeseries:
            self._data = data.astype(np.float64)
            n_nodes = data.shape[1]
            self._processed_matrices = None
        else:
            self._processed_matrices = data.astype(np.float64)
            n_nodes = data.shape[1]
            self._data = None

        if node_names is None:
            self._node_names = [f"Node_{i}" for i in range(n_nodes)]
        else:
            self._node_names = node_names

        return self

    def compute_correlations(
        self,
        method: Optional[str] = None,
        window_size: Optional[int] = None,
        step_size: Optional[int] = None,
    ) -> "CAVProcessor":
        """
        Compute correlation matrices from time series data.

        Args:
            method: Correlation method ('pearson', 'spearman', 'kendall',
                    'partial', 'mutual_info')
            window_size: Override config window size
            step_size: Override config step size

        Returns:
            Self for method chaining
        """
        if self._data is None:
            raise ValueError("No time series data loaded. Use load_timeseries first.")

        window = window_size or self.config.window_size
        step = step_size or self.config.step_size
        method = method or self.config.correlation_type.value

        if method == 'pearson':
            corr_func = CorrelationTransforms.pearson_correlation
            self._processed_matrices = CorrelationTransforms.windowed_correlation(
                self._data, window, step, corr_func
            )
        elif method == 'spearman':
            corr_func = CorrelationTransforms.spearman_correlation
            self._processed_matrices = CorrelationTransforms.windowed_correlation(
                self._data, window, step, corr_func
            )
        elif method == 'kendall':
            corr_func = CorrelationTransforms.kendall_correlation
            self._processed_matrices = CorrelationTransforms.windowed_correlation(
                self._data, window, step, corr_func
            )
        elif method == 'partial':
            self._processed_matrices = CorrelationTransforms.windowed_partial_correlation(
                self._data, window, step
            )
        elif method == 'mutual_info':
            self._processed_matrices = CorrelationTransforms.windowed_mutual_information(
                self._data, window, step
            )
        else:
            raise ValueError(f"Unknown correlation method: {method}")

        return self

    def apply_fisher_transform(self) -> "CAVProcessor":
        """
        Apply Fisher z-transformation to correlation matrices.

        Returns:
            Self for method chaining
        """
        if self._processed_matrices is None:
            raise ValueError("No correlation matrices computed yet.")

        # Apply Fisher transform element-wise (excluding diagonal)
        transformed = np.zeros_like(self._processed_matrices)
        for t in range(self._processed_matrices.shape[0]):
            for i in range(self._processed_matrices.shape[1]):
                for j in range(self._processed_matrices.shape[2]):
                    if i != j:
                        transformed[t, i, j] = CorrelationTransforms.fisher_z_transform(
                            self._processed_matrices[t, i, j]
                        )
                    else:
                        transformed[t, i, j] = self._processed_matrices[t, i, j]

        self._processed_matrices = transformed
        return self

    def apply_threshold(self, threshold: Optional[float] = None) -> "CAVProcessor":
        """
        Apply threshold to filter weak correlations.

        Args:
            threshold: Minimum absolute correlation value to keep

        Returns:
            Self for method chaining
        """
        if self._processed_matrices is None:
            raise ValueError("No correlation matrices computed yet.")

        thresh = threshold or self.config.threshold
        if thresh is not None:
            mask = np.abs(self._processed_matrices) < thresh
            self._processed_matrices[mask] = 0.0

        return self

    def get_frames(self) -> List[ProcessedFrame]:
        """
        Convert processed matrices to frame objects.

        Returns:
            List of ProcessedFrame objects
        """
        if self._processed_matrices is None:
            raise ValueError("No processed data available.")

        frames = []
        n_timestamps = self._processed_matrices.shape[0]
        n_nodes = self._processed_matrices.shape[1]

        for t in range(n_timestamps):
            edges = []
            matrix = self._processed_matrices[t]

            for i in range(n_nodes):
                for j in range(i + 1, n_nodes):
                    weight = matrix[i, j]

                    # Skip zero weights (thresholded out)
                    if weight == 0.0:
                        continue

                    # Normalize weight to configured range
                    if self.config.normalize_weights:
                        weight = self._normalize_weight(weight)

                    edges.append((
                        self._node_names[i],
                        self._node_names[j],
                        weight
                    ))

            frames.append(ProcessedFrame(
                timestamp=t,
                edges=edges,
                node_names=self._node_names.copy(),
                metadata={
                    "window_size": self.config.window_size,
                    "correlation_type": self.config.correlation_type.value,
                }
            ))

        return frames

    def _normalize_weight(self, weight: float) -> float:
        """Normalize weight to configured range."""
        min_w, max_w = self.config.weight_range

        # Map from [-1, 1] or [0, inf) to [min_w, max_w]
        # For correlations: -1 to 1 -> min to max
        # For mutual info: 0 to inf (we cap at reasonable value)

        # Assume correlation range [-1, 1]
        normalized = (weight + 1) / 2  # Now [0, 1]
        return min_w + normalized * (max_w - min_w)

    def to_dataframe(self) -> pd.DataFrame:
        """
        Convert processed data to a pandas DataFrame.

        Returns:
            DataFrame with columns: timestamp, source, target, weight
        """
        frames = self.get_frames()

        rows = []
        for frame in frames:
            for source, target, weight in frame.edges:
                rows.append({
                    "timestamp": frame.timestamp,
                    "source": source,
                    "target": target,
                    "weight": weight,
                })

        return pd.DataFrame(rows)

    def to_csv(self, filepath: Path) -> None:
        """
        Export processed data to CSV file.

        Args:
            filepath: Output path for CSV file
        """
        df = self.to_dataframe()
        df.to_csv(filepath, index=False)

    def get_raw_matrices(self) -> Optional[np.ndarray]:
        """Get the raw processed correlation matrices."""
        return self._processed_matrices

    def get_node_names(self) -> Optional[List[str]]:
        """Get the node names."""
        return self._node_names


# Convenience functions for quick processing

def process_timeseries_to_csv(
    input_path: Path,
    output_path: Path,
    window_size: int = 10,
    step_size: int = 1,
    method: str = "pearson",
    threshold: Optional[float] = None,
    time_col: Optional[str] = None,
) -> None:
    """
    Quick function to process time series data to pipeline-compatible CSV.

    Args:
        input_path: Path to input time series CSV
        output_path: Path for output edges CSV
        window_size: Sliding window size
        step_size: Step between windows
        method: Correlation method
        threshold: Optional correlation threshold
        time_col: Time column name to exclude
    """
    config = CAVConfig(
        window_size=window_size,
        step_size=step_size,
        threshold=threshold,
    )

    processor = CAVProcessor(config)
    processor.load_timeseries(input_path, time_col=time_col)
    processor.compute_correlations(method=method)

    if threshold:
        processor.apply_threshold()

    processor.to_csv(output_path)


def process_abide_to_csv(
    input_path: Path,
    output_path: Path,
    window_size: int = 30,
    step_size: int = 1,
    method: str = "pearson",
    threshold: Optional[float] = 0.1,
    rsn_only: bool = True,
    use_short_names: bool = True,
) -> None:
    """
    Quick function to process an ABIDE DR file to pipeline-compatible CSV.

    Args:
        input_path: Path to input dr_stage1_*.txt file
        output_path: Path for output edges CSV
        window_size: Sliding window size (default 30 TRs)
        step_size: Step between windows
        method: Correlation method
        threshold: Optional correlation threshold
        rsn_only: If True, only include the 14 identified RSN components
        use_short_names: If True, use short names
    """
    config = CAVConfig(
        window_size=window_size,
        step_size=step_size,
        threshold=threshold,
    )

    processor = CAVProcessor(config)
    processor.load_abide_file(
        input_path, rsn_only=rsn_only, use_short_names=use_short_names
    )
    processor.compute_correlations(method=method)

    if threshold:
        processor.apply_threshold()

    processor.to_csv(output_path)


def generate_sample_timeseries(
    n_nodes: int = 10,
    n_timepoints: int = 200,
    node_names: Optional[List[str]] = None,
    seed: Optional[int] = None,
) -> Tuple[np.ndarray, List[str]]:
    """
    Generate sample time series data for testing.

    Creates synthetic data with some correlated node pairs.

    Args:
        n_nodes: Number of nodes
        n_timepoints: Number of time points
        node_names: Optional node names
        seed: Random seed

    Returns:
        Tuple of (data array, node names)
    """
    if seed is not None:
        np.random.seed(seed)

    if node_names is None:
        node_names = [f"Region_{i}" for i in range(n_nodes)]

    # Generate base signals
    data = np.random.randn(n_timepoints, n_nodes)

    # Add some correlations between pairs
    # First 3 nodes share a common signal
    common_signal = np.random.randn(n_timepoints)
    for i in range(min(3, n_nodes)):
        data[:, i] += 0.7 * common_signal

    # Nodes 4-6 share another signal
    if n_nodes > 3:
        another_signal = np.random.randn(n_timepoints)
        for i in range(3, min(6, n_nodes)):
            data[:, i] += 0.5 * another_signal

    return data, node_names


def generate_sample_abide_file(
    output_path: Path,
    n_timepoints: int = 200,
    seed: Optional[int] = None,
) -> None:
    """
    Generate a sample ABIDE-like DR file for testing.

    Creates a file with 32 columns (ICA components) and specified timepoints.

    Args:
        output_path: Path to save the generated file
        n_timepoints: Number of timepoints (TRs)
        seed: Random seed
    """
    if seed is not None:
        np.random.seed(seed)

    # Generate 32 ICA component time series
    data = np.random.randn(n_timepoints, 32)

    # Add correlations within some RSN pairs
    # DMN components (1 and 6) should be correlated
    common_dmn = np.random.randn(n_timepoints)
    data[:, 0] += 0.6 * common_dmn  # aDMN (component 1)
    data[:, 5] += 0.6 * common_dmn  # pDMN (component 6)

    # Visual components correlated
    common_vis = np.random.randn(n_timepoints)
    data[:, 1] += 0.5 * common_vis  # Primary Visual
    data[:, 12] += 0.5 * common_vis  # Lateral Visual
    data[:, 26] += 0.5 * common_vis  # Occipital Visual

    # Frontoparietal networks correlated
    common_fpn = np.random.randn(n_timepoints)
    data[:, 8] += 0.4 * common_fpn  # Left FPN
    data[:, 11] += 0.4 * common_fpn  # Right FPN

    # Save as space-separated file
    np.savetxt(output_path, data, fmt="%.8f", delimiter="  ")


if __name__ == "__main__":
    import tempfile

    # Example usage
    print("CAV Processing Module - Example Usage")
    print("=" * 50)

    # Example 1: Generate sample data and process
    print("\n1. Processing synthetic time series data:")
    print("-" * 40)

    data, node_names = generate_sample_timeseries(
        n_nodes=8,
        n_timepoints=100,
        seed=42
    )
    print(f"Generated sample data: {data.shape[0]} timepoints, {data.shape[1]} nodes")

    config = CAVConfig(
        window_size=20,
        step_size=5,
        correlation_type=CorrelationType.PEARSON,
        threshold=0.1,
    )

    processor = CAVProcessor(config)
    processor.load_from_array(data, node_names)
    processor.compute_correlations()
    processor.apply_threshold()

    frames = processor.get_frames()
    print(f"Generated {len(frames)} frames")

    if frames:
        print(f"First frame has {len(frames[0].edges)} edges")
        print(f"Sample edges: {frames[0].edges[:3]}")

    # Example 2: Generate and process ABIDE-like data
    print("\n2. Processing ABIDE-format dual-regression data:")
    print("-" * 40)

    with tempfile.TemporaryDirectory() as tmpdir:
        # Generate sample ABIDE file
        sample_file = Path(tmpdir) / "dr_stage1_subject0051234.txt"
        generate_sample_abide_file(sample_file, n_timepoints=150, seed=42)
        print(f"Generated sample ABIDE file: {sample_file.name}")

        # Process the file
        config = CAVConfig(
            window_size=30,
            step_size=5,
            correlation_type=CorrelationType.PEARSON,
            threshold=0.2,
        )

        processor = CAVProcessor(config)
        processor.load_abide_file(sample_file, rsn_only=True, use_short_names=True)
        processor.compute_correlations()
        processor.apply_threshold()

        frames = processor.get_frames()
        print(f"Generated {len(frames)} frames from ABIDE data")
        print(f"Nodes (RSN networks): {processor.get_node_names()}")

        if frames:
            print(f"First frame edges: {len(frames[0].edges)}")
            print("Sample edges (network connectivity):")
            for edge in frames[0].edges[:5]:
                print(f"  {edge[0]} <-> {edge[1]}: {edge[2]:.1f}")

        # Export to DataFrame
        df = processor.to_dataframe()
        print(f"\nExported DataFrame shape: {df.shape}")
        print(df.head(10))

    # Show RSN information
    print("\n3. Available RSN Components:")
    print("-" * 40)
    for idx, name in RSN_COMPONENTS.items():
        short = RSN_SHORT_NAMES[idx]
        print(f"  Component {idx:2d}: {short:8s} - {name}")
