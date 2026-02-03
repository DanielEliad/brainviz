"""
Test fixtures for ABIDE processing and API tests.
"""

import importlib
import shutil
import sys
import tempfile
from pathlib import Path
from typing import Generator

import numpy as np
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def temp_data_dir() -> Generator[Path, None, None]:
    """Create a temporary data directory with test ABIDE files."""
    temp_dir = Path(tempfile.mkdtemp())
    yield temp_dir
    shutil.rmtree(temp_dir)


def create_test_phenotypics(data_dir: Path, subjects: list[tuple[int, str]]) -> Path:
    """
    Create a test phenotypics.csv file with the given subjects.

    Args:
        data_dir: Directory to create the phenotypics.csv file in
        subjects: List of (subject_id, diagnosis) tuples

    Returns:
        Path to the created phenotypics.csv file
    """
    phenotypics_path = data_dir / "phenotypics.csv"
    with open(phenotypics_path, "w") as f:
        f.write("partnum,diagnosis\n")
        for subject_id, diagnosis in subjects:
            f.write(f"{subject_id},{diagnosis}\n")
    return phenotypics_path


@pytest.fixture
def sample_abide_structure(temp_data_dir: Path) -> Path:
    """
    Create a sample ABIDE directory structure with test files and phenotypics.csv.

    Generates its own test data - does not depend on real data files.

    Structure:
        temp_dir/
            phenotypics.csv
            ABIDE/
                ABIDE_I/
                    NYU/
                        dr_stage1_subject0050953.txt
                        dr_stage1_subject0050954.txt
                    CMU/
                        dr_stage1_subject0050649.txt
                    CMU2/
                        dr_stage1_subject0050659.txt
    """
    np.random.seed(42)

    # Define test subjects with their diagnoses
    test_subjects = [
        (50953, "ASD"),
        (50954, "HC"),
        (50649, "ASD"),
        (50659, "HC"),
    ]

    # Create phenotypics.csv with test subjects
    create_test_phenotypics(temp_data_dir, test_subjects)

    # Create ABIDE file structure
    sites = [
        ("ABIDE_I", "NYU", ["0050953", "0050954"]),
        ("ABIDE_I", "CMU", ["0050649"]),
        ("ABIDE_I", "CMU2", ["0050659"]),
    ]

    for version, site, subjects in sites:
        site_dir = temp_data_dir / "ABIDE" / version / site
        site_dir.mkdir(parents=True, exist_ok=True)

        for subject_id in subjects:
            filepath = site_dir / f"dr_stage1_subject{subject_id}.txt"
            data = generate_abide_timeseries(n_timepoints=100, seed=int(subject_id))
            np.savetxt(filepath, data, fmt="%.8f")

    return temp_data_dir


@pytest.fixture
def single_abide_file(temp_data_dir: Path) -> Path:
    """Create a single test ABIDE file."""
    filepath = temp_data_dir / "dr_stage1_subject0050001.txt"
    data = generate_abide_timeseries(n_timepoints=100, seed=42)
    np.savetxt(filepath, data, fmt="%.8f")
    return filepath


def generate_abide_timeseries(
    n_timepoints: int = 100,
    n_components: int = 32,
    seed: int = 42,
) -> np.ndarray:
    """
    Generate synthetic ABIDE dual-regression time series data.

    Creates realistic-ish data with:
    - 32 ICA components (columns)
    - Specified number of timepoints (rows)
    - Some correlated component pairs (simulating RSN connectivity)

    Args:
        n_timepoints: Number of time points (TRs)
        n_components: Number of ICA components (should be 32 for ABIDE)
        seed: Random seed for reproducibility

    Returns:
        ndarray [n_timepoints x n_components]
    """
    rng = np.random.default_rng(seed)

    # Base random data
    data = rng.standard_normal((n_timepoints, n_components))

    # Add correlations within known RSN component pairs
    # DMN components (indices 0 and 5 in 0-indexed = components 1 and 6)
    dmn_signal = rng.standard_normal(n_timepoints)
    data[:, 0] += 0.6 * dmn_signal
    data[:, 5] += 0.6 * dmn_signal

    # Visual components (indices 1, 12, 26 = components 2, 13, 27)
    vis_signal = rng.standard_normal(n_timepoints)
    data[:, 1] += 0.5 * vis_signal
    data[:, 12] += 0.5 * vis_signal
    data[:, 26] += 0.5 * vis_signal

    # Frontoparietal (indices 8, 11 = components 9, 12)
    fpn_signal = rng.standard_normal(n_timepoints)
    data[:, 8] += 0.4 * fpn_signal
    data[:, 11] += 0.4 * fpn_signal

    # Scale to realistic BOLD-like values
    data = data * 50 + 100

    return data


@pytest.fixture
def test_client(sample_abide_structure: Path) -> Generator[TestClient, None, None]:
    """
    Create a test client with mocked DATA_DIR and PHENOTYPICS_FILE_PATH pointing to temp directory.
    """
    # Remove cached module to force reimport with patched paths
    modules_to_remove = [k for k in sys.modules if k.startswith("app.")]
    for mod in modules_to_remove:
        del sys.modules[mod]

    # Patch at import time by modifying the module before importing app
    import app.main as main_module
    import app.abide_processing as processing_module

    original_data_dir = main_module.DATA_DIR
    original_phenotypics_path = processing_module.PHENOTYPICS_FILE_PATH

    main_module.DATA_DIR = sample_abide_structure
    processing_module.PHENOTYPICS_FILE_PATH = sample_abide_structure / "phenotypics.csv"

    from app.main import app
    client = TestClient(app)

    yield client

    # Restore originals
    main_module.DATA_DIR = original_data_dir
    processing_module.PHENOTYPICS_FILE_PATH = original_phenotypics_path


@pytest.fixture
def test_client_empty_data(temp_data_dir: Path) -> Generator[TestClient, None, None]:
    """
    Create a test client with empty data directory.
    """
    # Create an empty phenotypics.csv
    create_test_phenotypics(temp_data_dir, [])

    # Remove cached module to force reimport with patched paths
    modules_to_remove = [k for k in sys.modules if k.startswith("app.")]
    for mod in modules_to_remove:
        del sys.modules[mod]

    import app.main as main_module
    import app.abide_processing as processing_module

    original_data_dir = main_module.DATA_DIR
    original_phenotypics_path = processing_module.PHENOTYPICS_FILE_PATH

    main_module.DATA_DIR = temp_data_dir
    processing_module.PHENOTYPICS_FILE_PATH = temp_data_dir / "phenotypics.csv"

    from app.main import app
    client = TestClient(app)

    yield client

    # Restore originals
    main_module.DATA_DIR = original_data_dir
    processing_module.PHENOTYPICS_FILE_PATH = original_phenotypics_path
