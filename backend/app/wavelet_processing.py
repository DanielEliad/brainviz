"""
Wavelet coherence data loading from precomputed HDF5 file.

Data format (from convert_wavelet_to_subject_files.py):
  /wavelet_subjects - array of subject IDs
  /pairs/{network_a}_{network_b}/angle_maps - [n_subjects, n_timepoints, n_scales]

Angle values: 0=NONE, 1=LEAD, -1=LAG, -2=ANTI, 2=IN_PHASE
"""

from pathlib import Path

import h5py
import numpy as np

from app.abide_processing import RSN_NAME_TO_POSITION


WAVELET_HDF5_PATH = Path(__file__).parent.parent.parent / "data" / "wavelet_coherence.h5"

# Phase enum values (from MATLAB: angle_color = 2*phase + 1*lead - 1*lag - 2*anti)
PHASE_LEAD = 1
PHASE_LAG = -1


def get_subject_id(file_path: str) -> int:
    """Extract subject ID from ABIDE file path."""
    return int(Path(file_path).stem.replace("dr_stage1_subject", ""))


def get_coherence_matrices(
    subject_id: int,
    window_size: int = 30,
    step: int = 1,
) -> list[np.ndarray]:
    """
    Build 14x14 edge matrices for each time window.

    Edge values = leading ratio [0-1]:
      1.0 = RSN_i always leads RSN_j
      0.0 = RSN_i always lags RSN_j
      0.5 = balanced or no lead/lag relationship
    """
    if not WAVELET_HDF5_PATH.exists():
        raise FileNotFoundError(f"Wavelet data not found: {WAVELET_HDF5_PATH}")

    with h5py.File(WAVELET_HDF5_PATH, "r") as f:
        # Find subject index
        subjects = f["wavelet_subjects"][:]
        matches = np.where(subjects == subject_id)[0]
        if len(matches) == 0:
            raise ValueError(f"Subject {subject_id} not found in wavelet data")
        subj_idx = int(matches[0])

        pairs = list(f["pairs"].keys())
        if len(pairs) < 91:
            raise ValueError(f"Only {len(pairs)} of 91 RSN pairs available")

        # Get n_timepoints from first pair
        first_pair = f["pairs"][pairs[0]]["angle_maps"]
        n_timepoints = first_pair.shape[1]

        n_frames = (n_timepoints - window_size) // step + 1
        if n_frames <= 0:
            raise ValueError(f"Window size {window_size} too large for {n_timepoints} timepoints")

        # Initialize matrices with 0.5 (neutral), diagonal 1.0
        matrices = [np.full((14, 14), 0.5) for _ in range(n_frames)]
        for m in matrices:
            np.fill_diagonal(m, 1.0)

        # Fill matrices from each pair
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
                n_lag = np.sum(window == PHASE_LAG)
                ratio = n_lead / (n_lead + n_lag) if (n_lead + n_lag) > 0 else 0.5

                matrices[frame_idx][i, j] = ratio
                matrices[frame_idx][j, i] = 1.0 - ratio

    return matrices
