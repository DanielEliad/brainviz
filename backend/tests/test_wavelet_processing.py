from pathlib import Path
from unittest.mock import patch

import h5py
import numpy as np
import pytest

import app.wavelet_processing as wavelet_module
from app.rsn_constants import CorrelationParams, CorrelationMethod, RSN_NAME_TO_POSITION
from app.wavelet_processing import PHASE_LAG, PHASE_LEAD, PHASE_NONE, compute_wavelet_matrices

SUBJECT_ID = 50649
N_TIMEPOINTS = 10
N_SCALES = 3


@pytest.fixture
def wavelet_file(tmp_path: Path) -> Path:
    path = tmp_path / "wavelet.h5"
    a_leads_b = np.full((1, N_TIMEPOINTS, N_SCALES), PHASE_LEAD)
    b_lags_a = np.full((1, N_TIMEPOINTS, N_SCALES), PHASE_LAG)
    b_lags_a[:, : N_TIMEPOINTS // 2, :] = PHASE_NONE

    with h5py.File(path, "w") as f:
        f.create_dataset("wavelet_subjects", data=[SUBJECT_ID])
        f.create_dataset("period_per_subject", data=[[20.0], [40.0], [60.0]])
        f.create_dataset("pairs/DMNa_AUDI/angle_maps", data=a_leads_b)
        f.create_dataset("pairs/AUDI_DMNa/angle_maps", data=b_lags_a)
    return path


def test_wavelet_ratio_only_counts_points_significant_in_both_directions(wavelet_file: Path):
    params = CorrelationParams(method=CorrelationMethod.WAVELET)
    with patch.object(wavelet_module, "WAVELET_HDF5_PATH", wavelet_file):
        matrices = compute_wavelet_matrices(Path(f"dr_stage1_subject00{SUBJECT_ID}.txt"), params)

    a = RSN_NAME_TO_POSITION["DMNa"]
    b = RSN_NAME_TO_POSITION["AUDI"]
    assert len(matrices) == 1
    assert matrices[0][a, b] == pytest.approx(0.5)
    assert matrices[0][b, a] == 0


def test_wavelet_unknown_subject_raises(wavelet_file: Path):
    params = CorrelationParams(method=CorrelationMethod.WAVELET)
    with patch.object(wavelet_module, "WAVELET_HDF5_PATH", wavelet_file):
        with pytest.raises(ValueError):
            compute_wavelet_matrices(Path("dr_stage1_subject0000001.txt"), params)
