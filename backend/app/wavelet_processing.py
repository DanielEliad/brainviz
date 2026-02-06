from pathlib import Path
from typing import List

import h5py
import numpy as np

from app.rsn_constants import CorrelationParams, RSN_NAME_TO_POSITION

WAVELET_HDF5_PATH = Path(__file__).parent.parent.parent / "data" / "wavelet.h5"

# Phase enum values (from MATLAB: angle_color = 2*phase + 1*lead - 1*lag - 2*anti)
PHASE_LEAD = 1
PHASE_LAG = -1


def compute_wavelet_matrices(
    filepath: Path, params: CorrelationParams
) -> List[np.ndarray]:
    """Edge values = leading ratio [0-1]: 1.0 = always leads, 0.0 = always lags."""
    subject_id = int(filepath.stem.replace("dr_stage1_subject", ""))
    window_size = params.window_size
    step = params.step

    if not WAVELET_HDF5_PATH.exists():
        raise FileNotFoundError(f"Wavelet data not found: {WAVELET_HDF5_PATH}")

    with h5py.File(WAVELET_HDF5_PATH, "r") as f:
        subjects = f["wavelet_subjects"][:]
        matches = np.where(subjects == subject_id)[0]
        if len(matches) == 0:
            raise ValueError(f"Subject {subject_id} not found in wavelet data")
        subj_idx = int(matches[0])

        pairs = list(f["pairs"].keys())

        first_pair = f["pairs"][pairs[0]]["angle_maps"]
        n_timepoints = first_pair.shape[1]

        n_frames = (n_timepoints - window_size) // step + 1
        if n_frames <= 0:
            raise ValueError(
                f"Window size {window_size} too large for {n_timepoints} timepoints"
            )

        # Initialize with 0 (both directions populated from HDF5)
        matrices = [np.zeros((14, 14)) for _ in range(n_frames)]

        # Process each pair from HDF5 (both A_B and B_A exist)
        for pair_key in pairs:
            rsn1, rsn2 = pair_key.split("_")
            i = RSN_NAME_TO_POSITION.get(rsn1)
            j = RSN_NAME_TO_POSITION.get(rsn2)
            if i is None or j is None:
                continue

            phase_data = f["pairs"][pair_key]["angle_maps"][subj_idx, :, :]

            for frame_idx in range(n_frames):
                start = frame_idx * step
                end = start + window_size
                window = phase_data[start:end, :]

                n_lead = np.sum(window == PHASE_LEAD)
                n_all = window.size
                ratio = n_lead / n_all if n_all > 0 else 0

                matrices[frame_idx][i, j] = ratio

    return matrices
