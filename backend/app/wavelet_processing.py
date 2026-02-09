from pathlib import Path
from typing import List

import h5py
import numpy as np

from app.rsn_constants import NUM_RSNS, CorrelationParams, RSN_NAME_TO_POSITION

WAVELET_HDF5_PATH = Path(__file__).parent.parent.parent / "data" / "wavelet.h5"

# Phase enum values (from MATLAB: angle_color = 2*phase + 1*lead - 1*lag - 2*anti)
PHASE_NONE = 0
PHASE_LEAD = 1
PHASE_LAG = -1


def allowed_scales(periods: np.array, lower_period: float, upper_period: float):
    mask = (periods >= lower_period) & (periods <= upper_period)
    if not np.any(mask):
        raise ValueError("No scales fall within the given period range.")

    return np.where(mask)[0]


def compute_wavelet_matrices(
    filepath: Path, params: CorrelationParams
) -> List[np.ndarray]:
    subject_id = int(filepath.stem.replace("dr_stage1_subject", ""))

    if not WAVELET_HDF5_PATH.exists():
        raise FileNotFoundError(f"Wavelet data not found: {WAVELET_HDF5_PATH}")

    with h5py.File(WAVELET_HDF5_PATH, "r") as f:
        subjects = f["wavelet_subjects"][:]
        matches = np.where(subjects == subject_id)[0]
        if len(matches) == 0:
            raise ValueError(f"Subject {subject_id} not found in wavelet data")
        subj_idx = int(matches[0])
        period_mapping = f["period_per_subject"][:, subj_idx]
        filter_scales = allowed_scales(
            period_mapping, lower_period=10.0, upper_period=100.0
        )

        pairs = list(f["pairs"].keys())

        first_pair = f["pairs"][pairs[0]]["angle_maps"]
        n_timepoints = first_pair.shape[1]

        window_size = (
            params.window_size if params.window_size is not None else n_timepoints
        )
        step = params.step if params.step is not None else 1

        n_frames = (n_timepoints - window_size) // step + 1
        if n_frames <= 0:
            raise ValueError(
                f"Window size {window_size} too large for {n_timepoints} timepoints"
            )

        # Initialize with 0 (both directions populated from HDF5)
        matrices = [np.zeros((NUM_RSNS, NUM_RSNS)) for _ in range(n_frames)]

        # Process each pair from HDF5 (both A_B and B_A exist)
        for pair_key in pairs:
            rsn1, rsn2 = pair_key.split("_")
            complementary_pair_key = f"{rsn2}_{rsn1}"
            i = RSN_NAME_TO_POSITION.get(rsn1)
            j = RSN_NAME_TO_POSITION.get(rsn2)
            if i is None:
                raise ValueError(f"invalid RSN name {rsn1}")
            if j is None:
                raise ValueError(f"invalid RSN name {rsn2}")

            phase_data = f["pairs"][pair_key]["angle_maps"][subj_idx, :, :]
            complementary_phase_data = f["pairs"][pair_key]["angle_maps"][
                subj_idx, :, :
            ]
            binary_mask = (phase_data != PHASE_NONE) & (
                complementary_phase_data != PHASE_NONE
            )
            filtered_phase_data = np.where(binary_mask, phase_data, PHASE_NONE)

            for frame_idx in range(n_frames):
                start = frame_idx * step
                end = start + window_size
                window = filtered_phase_data[start:end, filter_scales]

                n_lead = np.count_nonzero(window == PHASE_LEAD)
                n_all = window.size
                ratio = n_lead / n_all if n_all > 0 else 0

                matrices[frame_idx][i, j] = ratio

    return matrices
