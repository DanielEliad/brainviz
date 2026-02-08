import shutil
import tempfile
from pathlib import Path
from typing import Generator
from unittest.mock import patch

import numpy as np
import pytest
from fastapi.testclient import TestClient

import app.abide_processing as processing_module
import app.main as main_module
from app.main import app
from tests.utils import generate_abide_timeseries


def create_test_phenotypics(data_dir: Path, subjects: list[tuple[int, str]]) -> Path:
    phenotypics_path = data_dir / "phenotypics.csv"
    with open(phenotypics_path, "w") as f:
        f.write("partnum,diagnosis\n")
        for subject_id, diagnosis in subjects:
            f.write(f"{subject_id},{diagnosis}\n")
    return phenotypics_path


@pytest.fixture(autouse=True)
def mock_data_paths(tmp_path: Path) -> Generator[None, None, None]:
    """Mocks DATA_DIR and PHENOTYPICS_FILE_PATH to temp directories."""
    phenotypics_path = tmp_path / "phenotypics.csv"
    phenotypics_path.write_text("partnum,diagnosis\n")

    # Create empty data dir
    data_dir = tmp_path / "data"
    data_dir.mkdir()

    with patch.object(processing_module, "PHENOTYPICS_FILE_PATH", phenotypics_path), \
         patch.object(main_module, "DATA_DIR", data_dir):
        yield


@pytest.fixture
def temp_data_dir() -> Generator[Path, None, None]:
    temp_dir = Path(tempfile.mkdtemp())
    yield temp_dir
    shutil.rmtree(temp_dir)


@pytest.fixture
def sample_abide_structure(temp_data_dir: Path) -> Path:
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
    phenotypics_path = processing_module.PHENOTYPICS_FILE_PATH
    phenotypics_path.write_text("partnum,diagnosis\n50001,ASD\n")

    filepath = temp_data_dir / "dr_stage1_subject0050001.txt"
    data = generate_abide_timeseries(n_timepoints=100, seed=42)
    np.savetxt(filepath, data, fmt="%.8f")
    return filepath


@pytest.fixture
def test_client(sample_abide_structure: Path) -> Generator[TestClient, None, None]:
    phenotypics_path = sample_abide_structure / "phenotypics.csv"

    with patch.object(main_module, "DATA_DIR", sample_abide_structure), \
         patch.object(processing_module, "PHENOTYPICS_FILE_PATH", phenotypics_path):
        yield TestClient(app)


@pytest.fixture
def test_client_empty_data(temp_data_dir: Path) -> Generator[TestClient, None, None]:
    phenotypics_path = create_test_phenotypics(temp_data_dir, [])

    with patch.object(main_module, "DATA_DIR", temp_data_dir), \
         patch.object(processing_module, "PHENOTYPICS_FILE_PATH", phenotypics_path):
        yield TestClient(app)
